import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { appendRun, dumpFileName, listBackups, manifestFileName } from '../../src/ops/backup-records.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { backupFiles, type ListableStorage, objectFileName, openFileStores } from '../../src/ops/files-backup.js';
import { pruneBackups } from '../../src/ops/retention.js';
import { type BackupFolder, backupFolder, opsEnv, recordingNotifier, TEST_KEY } from './ops-test-helpers.js';
const NOW = new Date('2026-06-30T12:00:00Z');
const folders: BackupFolder[] = [];
afterAll(() => {
  for (const f of folders) f.cleanup();
});
const ids = { old: 'db-20260501T010000Z-aaaa', edge: 'db-20260531T120000Z-bbbb', recent: 'db-20260629T010000Z-cccc' };
async function setup() {
  const folder = backupFolder();
  folders.push(folder);
  for (const [key, id] of Object.entries(ids)) {
    const day = `${id.slice(3, 7)}-${id.slice(7, 9)}-${id.slice(9, 11)}T${id.slice(12, 14)}:00:00.000Z`;
    await folder.store.writeText(dumpFileName(id), 'x');
    await folder.store.writeText(manifestFileName(id), '{}');
    await appendRun(folder.store, {
      id,
      kind: 'daily full',
      status: 'complete',
      environment: 'development',
      startedAt: day,
      finishedAt: day,
      sizeBytes: key.length,
    });
  }
  await folder.store.writeText('notes.txt', 'keep me');
  await folder.store.writeText('db-notmine.dump.enc', 'keep me too');
  const outside = join(folder.dir, '..', 'outside.dump.enc');
  writeFileSync(outside, 'not in the lane folder');
  return { folder, outside };
}
describe('pruneBackups', () => {
  it('deletes only backups older than the period and records `deleted`', async () => {
    const { folder, outside } = await setup();
    const result = await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW });
    expect(result.expired.map((r) => r.id)).toEqual([ids.old]);
    expect(result.kept).toBe(2);
    expect(existsSync(folder.store.locate(dumpFileName(ids.old)))).toBe(false);
    expect(existsSync(folder.store.locate(manifestFileName(ids.old)))).toBe(false);
    for (const id of [ids.edge, ids.recent]) {
      expect(existsSync(folder.store.locate(dumpFileName(id)))).toBe(true);
      expect(existsSync(folder.store.locate(manifestFileName(id)))).toBe(true);
    }
    expect(existsSync(folder.store.locate('notes.txt'))).toBe(true);
    expect(existsSync(folder.store.locate('db-notmine.dump.enc'))).toBe(true);
    expect(existsSync(outside)).toBe(true);
    const list = await listBackups(folder.store);
    expect(list.find((r) => r.id === ids.old)).toMatchObject({ status: 'deleted', deletedAt: NOW.toISOString(), sizeBytes: 3 });
    expect(list.filter((r) => r.status === 'complete').map((r) => r.id)).toEqual([ids.edge, ids.recent]);
  });
  it('lists nothing complete older than the period afterwards, and a second run deletes nothing', async () => {
    const { folder } = await setup();
    await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW });
    const complete = await listBackups(folder.store, { status: 'complete' });
    expect(complete.every((r) => Date.parse(r.finishedAt as string) >= NOW.getTime() - 30 * 86_400_000)).toBe(true);
    expect((await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW })).expired).toEqual([]);
  });
  it('a dry run reports what it would delete and deletes nothing', async () => {
    const { folder } = await setup();
    const result = await pruneBackups({ store: folder.store, retentionDays: 2, now: NOW, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.expired.map((r) => r.id)).toEqual([ids.old, ids.edge]);
    expect(existsSync(folder.store.locate(dumpFileName(ids.old)))).toBe(true);
    expect((await listBackups(folder.store, { status: 'complete' })).length).toBe(3);
  });
  it('honours a shorter period', async () => {
    const { folder } = await setup();
    const result = await pruneBackups({ store: folder.store, retentionDays: 2, now: NOW });
    expect(result.expired.map((r) => r.id)).toEqual([ids.old, ids.edge]);
    expect((await listBackups(folder.store, { status: 'complete' })).map((r) => r.id)).toEqual([ids.recent]);
  });
  it('never deletes a run whose id is not this tool\'s', async () => {
    const folder = backupFolder();
    folders.push(folder);
    await folder.store.writeText('notes.txt', 'keep');
    await appendRun(folder.store, {
      id: 'notes',
      kind: 'daily full',
      status: 'complete',
      environment: 'development',
      startedAt: '2020-01-01T00:00:00.000Z',
    });
    const result = await pruneBackups({ store: folder.store, retentionDays: 2, now: NOW });
    expect(result.expired).toEqual([]);
    expect(existsSync(folder.store.locate('notes.txt'))).toBe(true);
  });
});

class ListableMemory extends MemoryStorage implements ListableStorage {
  async listKeys(): Promise<string[]> {
    return this.keys();
  }
}

describe('pruneBackups, file storage runs (EP-38-S10 AC4)', () => {
  const sha = (text: string): string => createHash('sha256').update(Buffer.from(text)).digest('hex');
  // Three runs: June 1 (a, b), June 20 (a, c; b was deleted live), June 29 (a, c, d).
  async function fileRuns() {
    const folder = backupFolder();
    folders.push(folder);
    const files = openFileStores(folder.dir);
    const live = new ListableMemory();
    const run = async (at: string) =>
      backupFiles({
        env: opsEnv('postgres://localapp:localapp@localhost:5432/unused', folder.dir),
        store: folder.store,
        files,
        storage: live,
        bucket: 'goldsmith-files-c',
        notifier: recordingNotifier(),
        getKey: () => TEST_KEY,
        now: () => new Date(at),
      });
    await live.put('files/a', Buffer.from('A'), 'image/jpeg');
    await live.put('files/b', Buffer.from('B'), 'image/jpeg');
    const old = await run('2026-06-01T10:00:00Z');
    await live.delete('files/b');
    await live.put('files/c', Buffer.from('C'), 'image/jpeg');
    const middle = await run('2026-06-20T10:00:00Z');
    await live.put('files/d', Buffer.from('D'), 'image/jpeg');
    const recent = await run('2026-06-29T10:00:00Z');
    return { folder, files, live, old, middle, recent };
  }
  const objectNames = async (folder: BackupFolder): Promise<string[]> => (await openFileStores(folder.dir).objects.list()).sort();

  it('expires the old run and removes only the objects no retained run lists', async () => {
    const { folder, files, live, old, middle, recent } = await fileRuns();
    const liveBefore = JSON.stringify([...live.objects.entries()]);
    expect(await objectNames(folder)).toEqual(['A', 'B', 'C', 'D'].map((t) => objectFileName(sha(t))).sort());

    const result = await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW, files });
    // 30 days before June 30 is May 31: nothing is old enough yet.
    expect(result.expiredFileRuns).toEqual([]);
    expect(result.removedObjects).toBe(0);

    const short = await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files });
    expect(short.expiredFileRuns.map((r) => r.id)).toEqual([old.record.id]);
    expect(short.keptFileRuns).toBe(2);
    expect(short.removedObjects).toBe(1);
    // B was only in the old run; A, C, D are listed by retained runs.
    expect(await objectNames(folder)).toEqual(['A', 'C', 'D'].map((t) => objectFileName(sha(t))).sort());
    expect(existsSync(files.manifests.locate(`${old.record.id}.manifest.json`))).toBe(false);
    for (const r of [middle, recent]) expect(existsSync(files.manifests.locate(`${r.record.id}.manifest.json`))).toBe(true);
    const list = await listBackups(folder.store, { kind: 'file storage' });
    expect(list.find((r) => r.id === old.record.id)).toMatchObject({ status: 'deleted', deletedAt: NOW.toISOString() });
    expect(list.filter((r) => r.status === 'complete').map((r) => r.id)).toEqual([middle.record.id, recent.record.id]);
    // The live bucket is never touched.
    expect(JSON.stringify([...live.objects.entries()])).toBe(liveBefore);
  });

  it('keeps an object a retained run still lists even when the expired run lists it too', async () => {
    const { folder, files, old } = await fileRuns();
    await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files });
    expect(old.manifest.objects.map((o) => o.key)).toEqual(['files/a', 'files/b']);
    expect(await objectNames(folder)).toContain(objectFileName(sha('A')));
  });

  it('a dry run reports the runs and objects but deletes nothing', async () => {
    const { folder, files, old } = await fileRuns();
    const before = await objectNames(folder);
    const result = await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files, dryRun: true });
    expect(result.expiredFileRuns.map((r) => r.id)).toEqual([old.record.id]);
    expect(result.removedObjects).toBe(1);
    expect(await objectNames(folder)).toEqual(before);
    expect(existsSync(files.manifests.locate(`${old.record.id}.manifest.json`))).toBe(true);
    expect((await listBackups(folder.store, { kind: 'file storage', status: 'complete' })).length).toBe(3);
  });

  it('a second prune finds nothing more to delete', async () => {
    const { folder, files } = await fileRuns();
    await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files });
    const again = await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files });
    expect(again.expiredFileRuns).toEqual([]);
    expect(again.removedObjects).toBe(0);
  });

  it('removes objects of a failed run once no manifest lists them, but not while a recent run is still going', async () => {
    const { folder, files } = await fileRuns();
    // An object left behind by a run that failed after writing it.
    await files.objects.writeText(objectFileName('f'.repeat(64)), 'orphan');
    await appendRun(folder.store, {
      id: 'files-20260630T110000Z-abcd',
      kind: 'file storage',
      status: 'started',
      environment: 'development',
      startedAt: '2026-06-30T11:00:00.000Z',
    });
    const busy = await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW, files });
    expect(busy.removedObjects).toBe(0);
    expect(existsSync(files.objects.locate(objectFileName('f'.repeat(64))))).toBe(true);
    await appendRun(folder.store, { id: 'files-20260630T110000Z-abcd', kind: 'file storage', status: 'failed', environment: 'development', startedAt: '2026-06-30T11:00:00.000Z' });
    const idle = await pruneBackups({ store: folder.store, retentionDays: 30, now: NOW, files });
    expect(idle.removedObjects).toBe(1);
    expect(existsSync(files.objects.locate(objectFileName('f'.repeat(64))))).toBe(false);
    expect((await objectNames(folder)).length).toBe(4);
  });

  it('removes nothing when a manifest cannot be read, and leaves other files alone', async () => {
    const { folder, files } = await fileRuns();
    await files.manifests.writeText('files-20260610T100000Z-0000.manifest.json', 'not json');
    await files.manifests.writeText('notes.txt', 'keep');
    const before = await objectNames(folder);
    await expect(pruneBackups({ store: folder.store, retentionDays: 20, now: NOW, files })).rejects.toThrow('not readable');
    expect(await objectNames(folder)).toEqual(before);
    expect(existsSync(files.manifests.locate('notes.txt'))).toBe(true);
  });

  it('does not touch file runs when no file stores are given', async () => {
    const { folder, old } = await fileRuns();
    const result = await pruneBackups({ store: folder.store, retentionDays: 20, now: NOW });
    expect(result.expiredFileRuns).toEqual([]);
    expect(existsSync(openFileStores(folder.dir).manifests.locate(`${old.record.id}.manifest.json`))).toBe(true);
  });
});
