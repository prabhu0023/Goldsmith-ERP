import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import {
  appendRun,
  dumpFileName,
  foldRuns,
  isRunId,
  listBackups,
  newRunId,
  type RunRecord,
} from '../../src/ops/backup-records.js';
import { LocalFolderStore } from '../../src/ops/backup-store.js';
const root = mkdtempSync(join(tmpdir(), 'gs-records-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const rec = (id: string, extra: Partial<RunRecord> = {}): RunRecord => ({
  id,
  kind: 'daily full',
  status: 'started',
  environment: 'development',
  startedAt: '2026-05-18T01:00:00.000Z',
  ...extra,
});
describe('run ids', () => {
  it('has the shape the retention step accepts', () => {
    const id = newRunId('daily full', new Date('2026-05-18T10:15:30.123Z'));
    expect(id).toMatch(/^db-20260518T101530Z-[0-9a-f]{4}$/);
    expect(isRunId(id)).toBe(true);
    expect(isRunId('../etc/passwd')).toBe(false);
    expect(dumpFileName(id)).toBe(`${id}.dump.enc`);
    expect(newRunId('file storage', new Date()).startsWith('files-')).toBe(true);
  });
});
describe('runs.jsonl', () => {
  it('folds lines by id, the last one winning field by field', async () => {
    const store = new LocalFolderStore(join(root, 'fold'));
    await appendRun(store, rec('db-1', { location: '/x/db-1.dump.enc' }));
    await appendRun(store, rec('db-2', { startedAt: '2026-05-17T01:00:00.000Z' }));
    await appendRun(store, rec('db-1', { status: 'complete', sizeBytes: 12, finishedAt: '2026-05-18T01:00:05.000Z' }));
    await appendRun(store, { id: 'db-2', kind: 'daily full', environment: 'development', startedAt: '2026-05-17T01:00:00.000Z', status: 'deleted' });
    const list = await listBackups(store);
    expect(list.map((r) => [r.id, r.status])).toEqual([
      ['db-2', 'deleted'],
      ['db-1', 'complete'],
    ]);
    expect(list[1]).toMatchObject({ sizeBytes: 12, location: '/x/db-1.dump.enc', finishedAt: '2026-05-18T01:00:05.000Z' });
    expect(await listBackups(store, { status: 'complete' })).toHaveLength(1);
    expect(await listBackups(store, { environment: 'staging' })).toHaveLength(0);
  });
  it('lists nothing for a folder that does not exist and skips a torn line', async () => {
    const store = new LocalFolderStore(join(root, 'torn'));
    expect(await listBackups(store)).toEqual([]);
    await appendRun(store, rec('db-1'));
    writeFileSync(store.locate('runs.jsonl'), `${JSON.stringify(rec('db-1'))}\n{"id":"db-2","sta`, { flag: 'w' });
    expect((await listBackups(store)).map((r) => r.id)).toEqual(['db-1']);
  });
  it('foldRuns keeps the first start time order', () => {
    expect(foldRuns([rec('b', { startedAt: '2026-05-02T00:00:00Z' }), rec('a', { startedAt: '2026-05-01T00:00:00Z' })]).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
describe('LocalFolderStore', () => {
  it('creates the folder 0700 and files 0600', async () => {
    const dir = join(root, 'modes', 'c');
    const store = new LocalFolderStore(dir);
    await store.writeStream('x.dump.enc', Readable.from([Buffer.from('abc')]));
    await store.writeText('x.manifest.json', '{}');
    await store.appendLine('runs.jsonl', '{}');
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    for (const name of ['x.dump.enc', 'x.manifest.json', 'runs.jsonl']) {
      expect(statSync(store.locate(name)).mode & 0o777).toBe(0o600);
    }
  });
  it('leaves no file behind when the stream fails', async () => {
    const store = new LocalFolderStore(join(root, 'fail'));
    const source = new Readable({
      read() {
        this.destroy(new Error('boom'));
      },
    });
    await expect(store.writeStream('y.dump.enc', source)).rejects.toThrow('boom');
    expect(await store.list()).toEqual([]);
  });
  it('accepts only plain file names', async () => {
    const store = new LocalFolderStore(join(root, 'names'));
    for (const bad of ['../x', 'a/b', '.hidden', '', 'a..b']) {
      expect(() => store.locate(bad)).toThrow('Invalid backup file name');
    }
    expect(await store.remove('missing.dump.enc')).toBe(false);
  });
});
