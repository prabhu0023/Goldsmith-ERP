/**
 * Run Retention (EP-09-S12): files past the keep period of their class are removed with their
 * three objects and attachments; others stay; a failed object delete is retried next run; every
 * run logs its counts. Runs against the files harness (memory storage, test DB) with a short PO
 * period and the manual trigger, plus one run through the scheduler.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { type FileRetentionDeps, fileRetentionJob, runFileRetention } from '../../src/files/file-retention.js';
import type { MemoryStorage } from '../../src/files/memory-storage.js';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { makeScheduler, manualClock, runsOf } from '../jobs/job-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { type FilesHarness, startFilesHarness } from './files-harness.js';
import { jpeg } from './test-images.js';

const DAY = 24 * 60 * 60 * 1000;
const after = (days: number): Date => new Date(SERVER_NOW.getTime() + days * DAY);

describeDb('Run Retention (EP-09-S12)', () => {
  let h: FilesHarness;
  let storage: MemoryStorage;
  let deps: FileRetentionDeps;
  beforeAll(async () => {
    h = await startFilesHarness();
    storage = h.storage as MemoryStorage;
    deps = { storage, retention: { poDays: 30 }, log: (l) => h.lines.push(l) };
    await h.addLead('LD-2026-401');
    await addPiece(h.pool, h.shop, 'TAG-9401');
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });

  const upload = async (name: string, query: Record<string, string>): Promise<string> => {
    const res = await h.upload(await jpeg(800, 600), { name, ...query }, { session: h.staff.session });
    expect(res.status).toBe(200);
    return res.body.id as string;
  };
  const uploadPo = (name: string) => upload(name, { purpose: 'po', ownerType: 'lead', ownerId: 'LD-2026-401', role: 'po' });
  const fileRow = async (code: string) =>
    (
      await h.pool.query<{ storage_key: string; thumbnail_key: string; display_key: string; removed_at: Date | null }>(
        'select storage_key, thumbnail_key, display_key, removed_at from stored_files where shop_id = $1 and code = $2',
        [h.shop.shopId, code],
      )
    ).rows[0];
  const keysOf = async (code: string): Promise<string[]> => {
    const r = await fileRow(code);
    return [r.storage_key, r.thumbnail_key, r.display_key];
  };
  const attachmentCount = async (code: string): Promise<number> =>
    (
      await h.pool.query<{ n: number }>(
        `select count(*)::int as n from attachments a join stored_files f on f.id = a.file_id
          where f.shop_id = $1 and f.code = $2`,
        [h.shop.shopId, code],
      )
    ).rows[0].n;
  const retentionAudit = async (code: string) =>
    (
      await h.pool.query(
        `select actor_id, actor_name, actor_role, summary, reference, before_value, after_value, at
           from audit_entries where shop_id = $1 and kind = 'file_removed_by_retention' and summary like '%' || $2 || ' %'`,
        [h.shop.shopId, code],
      )
    ).rows;

  let poFile: string;
  let photo: string;

  it('AC1, AC2, AC5: a PO file past its period is removed with its objects and attachments; a piece photo stays', async () => {
    poFile = await uploadPo('PO-Sharma.jpg');
    photo = await upload('choker.jpg', { ownerType: 'piece', ownerId: 'TAG-9401', role: 'photo' });
    const poKeys = await keysOf(poFile);
    const photoKeys = await keysOf(photo);
    expect(poKeys.every((k) => storage.objects.has(k))).toBe(true);
    h.lines.length = 0;

    // 29 days in: nothing is due yet.
    expect(await runFileRetention(h.pool, h.shop, deps, after(29))).toEqual({ po: 0, standard: 0, failed: 0 });
    expect((await fileRow(poFile)).removed_at).toBeNull();

    const at = after(31);
    expect(await runFileRetention(h.pool, h.shop, deps, at)).toEqual({ po: 1, standard: 0, failed: 0 });
    expect(poKeys.filter((k) => storage.objects.has(k))).toEqual([]);
    expect((await fileRow(poFile)).removed_at).toEqual(at);
    expect(await attachmentCount(poFile)).toBe(0);
    expect(await retentionAudit(poFile)).toEqual([
      {
        actor_id: null,
        actor_name: 'System (retention run)',
        actor_role: 'system',
        summary: `PO attachment ${poFile} removed by retention from lead LD-2026-401`,
        reference: 'LD-2026-401',
        before_value: { po: [poFile] },
        after_value: { po: [] },
        at,
      },
    ]);

    // AC2: the standard photo is kept forever by default.
    expect(photoKeys.every((k) => storage.objects.has(k))).toBe(true);
    expect((await fileRow(photo)).removed_at).toBeNull();
    expect(await attachmentCount(photo)).toBe(1);

    // AC5: each run logs its counts per class.
    expect(h.lines).toEqual([
      '[jobs] file-retention removed po=0 standard=0 failed=0',
      '[jobs] file-retention removed po=1 standard=0 failed=0',
    ]);
  });

  it('AC3: a file removed by retention answers not_found when anyone asks for its link', async () => {
    for (const user of [h.staff, h.owner]) {
      const res = await h.call('readFileLinks', { files: [{ fileId: poFile, size: 'original' }] }, user.session);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'not_found', message: `File ${poFile} was not found.` });
    }
  });

  it('AC4: when one object delete fails the file is kept, not counted as removed, and removed on the next run', async () => {
    const file = await uploadPo('PO-Iyer.jpg');
    const keys = await keysOf(file);
    storage.failKeys.add(keys[2]);
    h.lines.length = 0;
    try {
      expect(await runFileRetention(h.pool, h.shop, deps, after(31))).toEqual({ po: 0, standard: 0, failed: 1 });
    } finally {
      storage.failKeys.clear();
    }
    expect((await fileRow(file)).removed_at).toBeNull();
    expect(await attachmentCount(file)).toBe(1);
    expect(await retentionAudit(file)).toEqual([]);
    expect(h.lines).toEqual([
      `[files] retention could not delete an object of ${file} (memory storage: delete failed (failKeys))`,
      '[jobs] file-retention removed po=0 standard=0 failed=1',
    ]);

    expect(await runFileRetention(h.pool, h.shop, deps, after(32))).toEqual({ po: 1, standard: 0, failed: 0 });
    expect(keys.filter((k) => storage.objects.has(k))).toEqual([]);
    expect((await fileRow(file)).removed_at).toEqual(after(32));
    expect(await attachmentCount(file)).toBe(0);
  });

  it('removes standard files too when FILE_RETENTION_STANDARD_DAYS is set', async () => {
    const withStandard: FileRetentionDeps = { ...deps, retention: { poDays: 30, standardDays: 60 } };
    expect(await runFileRetention(h.pool, h.shop, withStandard, after(59))).toEqual({ po: 0, standard: 0, failed: 0 });
    expect(await runFileRetention(h.pool, h.shop, withStandard, after(61))).toEqual({ po: 0, standard: 1, failed: 0 });
    expect((await keysOf(photo)).filter((k) => storage.objects.has(k))).toEqual([]);
    expect((await retentionAudit(photo)).map((r) => r.summary)).toEqual([
      `Photo ${photo} removed by retention from piece TAG-9401`,
    ]);
  });

  it('runs as the daily file-retention job of the scheduler, logging its counts', async () => {
    const file = await uploadPo('PO-Khan.jpg');
    h.lines.length = 0;
    const job = fileRetentionJob(deps);
    expect(job).toMatchObject({ name: 'file-retention', label: 'retention run', schedule: { kind: 'daily', hour: 3, minute: 0 } });
    // 10:00 UTC is 15:30 in Asia/Kolkata, after the 03:00 run time.
    await makeScheduler(h.pool, manualClock(after(40)), h.shop, [job]).tick();
    expect((await fileRow(file)).removed_at).toEqual(after(40));
    expect(h.lines).toEqual(['[jobs] file-retention removed po=1 standard=0 failed=0']);
    expect((await runsOf(h.pool, h.shop, 'file-retention')).map((r) => r.result)).toEqual(['ok']);
  });

  const classOf = async (code: string): Promise<string> =>
    (
      await h.pool.query<{ retention_class: string }>(
        'select retention_class from stored_files where shop_id = $1 and code = $2',
        [h.shop.shopId, code],
      )
    ).rows[0].retention_class;

  it('BR-09-3: a file uploaded onto a lead as a PO, or attached later as one, is a PO file without purpose=po', async () => {
    const direct = await upload('PO-Rao.jpg', { ownerType: 'lead', ownerId: 'LD-2026-401', role: 'po' });
    const later = await upload('PO-Das.jpg', {});
    expect(await classOf(direct)).toBe('po');
    expect(await classOf(later)).toBe('standard');
    const res = await h.call(
      'createAttachment',
      { fileId: later, ownerType: 'lead', ownerId: 'LD-2026-401', role: 'po' },
      h.staff.session,
    );
    expect(res.status).toBe(200);
    expect(await classOf(later)).toBe('po');

    expect(await runFileRetention(h.pool, h.shop, deps, after(41))).toEqual({ po: 2, standard: 0, failed: 0 });
    expect((await fileRow(direct)).removed_at).toEqual(after(41));
    expect((await fileRow(later)).removed_at).toEqual(after(41));
  });

  it('removes at most batchSize files in one run; the next run removes the rest', async () => {
    const first = await uploadPo('PO-Batch-1.jpg');
    const second = await uploadPo('PO-Batch-2.jpg');
    const batched: FileRetentionDeps = { ...deps, batchSize: 1 };
    expect(await runFileRetention(h.pool, h.shop, batched, after(42))).toEqual({ po: 1, standard: 0, failed: 0 });
    expect((await fileRow(first)).removed_at).toEqual(after(42));
    expect((await fileRow(second)).removed_at).toBeNull();
    expect(await runFileRetention(h.pool, h.shop, batched, after(43))).toEqual({ po: 1, standard: 0, failed: 0 });
    expect((await fileRow(second)).removed_at).toEqual(after(43));
    expect(await runFileRetention(h.pool, h.shop, batched, after(44))).toEqual({ po: 0, standard: 0, failed: 0 });
  });

  it('is not an operation any session can call', async () => {
    for (const user of [h.owner, h.staff]) {
      const res = await h.call('runFileRetention', {}, user.session);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('not_found');
    }
  });
});
