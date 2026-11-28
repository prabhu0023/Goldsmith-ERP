import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { appendRun, dumpFileName, listBackups, manifestFileName } from '../../src/ops/backup-records.js';
import { pruneBackups } from '../../src/ops/retention.js';
import { type BackupFolder, backupFolder } from './ops-test-helpers.js';
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
