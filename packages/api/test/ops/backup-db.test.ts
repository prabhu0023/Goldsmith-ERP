import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { PassThrough, type Readable } from 'node:stream';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { createDecryptStream } from '../../src/ops/backup-crypto.js';
import { type DatabaseManifest, runDatabaseBackup } from '../../src/ops/backup-db.js';
import { listBackups } from '../../src/ops/backup-records.js';
import { createPgTools, type PgTools } from '../../src/ops/pg-tools.js';
import { readDbStats } from '../../src/ops/table-stats.js';
import { createTempDatabase, describeDb } from '../db/db-test-helpers.js';
import {
  type BackupFolder,
  backupFolder,
  opsEnv,
  recordingNotifier,
  type SourceDatabase,
  seededSource,
  TEST_KEY,
} from './ops-test-helpers.js';
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
async function firstBytes(stream: Readable, n: number): Promise<string> {
  let text = '';
  for await (const chunk of stream) {
    text += (chunk as Buffer).toString('latin1');
    if (text.length >= n) break;
  }
  return text.slice(0, n);
}
describeDb('runDatabaseBackup', () => {
  let source: SourceDatabase;
  const folders: BackupFolder[] = [];
  const tools = createPgTools();
  beforeAll(async () => {
    source = await seededSource();
  }, 120000);
  afterAll(async () => {
    for (const f of folders) f.cleanup();
    await source.drop();
  });
  const fresh = (): BackupFolder => {
    const f = backupFolder();
    folders.push(f);
    return f;
  };
  const deps = (folder: BackupFolder, over: { tools?: PgTools; now?: () => Date } = {}) => ({
    env: opsEnv(source.url, folder.dir),
    store: folder.store,
    tools: over.tools ?? tools,
    notifier: recordingNotifier(),
    getKey: () => TEST_KEY,
    ...(over.now && { now: over.now }),
  });
  it('writes an encrypted, non-empty backup whose sha256 equals the manifest, and a complete record', async () => {
    const folder = fresh();
    const result = await runDatabaseBackup(deps(folder));
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    const { record, manifest } = result;
    const file = folder.store.locate(manifest.file);
    expect(statSync(file).size).toBeGreaterThan(1000);
    expect(manifest.sizeBytes).toBe(statSync(file).size);
    expect(manifest.sha256).toBe(sha256(file));
    expect(readFileSync(file).includes(Buffer.from('PGDMP'))).toBe(false);
    // The decrypted bytes are a pg_dump custom archive.
    expect(await firstBytes(await createDecryptStream(file, TEST_KEY), 5)).toBe('PGDMP');
    const [listed] = await listBackups(folder.store);
    expect(listed).toMatchObject({
      id: record.id,
      kind: 'daily full',
      status: 'complete',
      environment: 'development',
      encrypted: true,
      location: file,
      sizeBytes: manifest.sizeBytes,
    });
    expect(Date.parse(listed.startedAt)).toBeLessThanOrEqual(Date.parse(listed.finishedAt as string));
    expect(listed.durationMs).toBeGreaterThanOrEqual(0);
    // The manifest on disk is the one returned, and its statistics match the live data.
    const onDisk = JSON.parse(readFileSync(folder.store.locate(`${record.id}.manifest.json`), 'utf8')) as DatabaseManifest;
    expect(onDisk).toEqual(manifest);
    const pool = createPool(source.url, 1);
    try {
      expect(manifest.stats).toEqual(await readDbStats(pool));
    } finally {
      await pool.end();
    }
    expect(manifest.stats.tables.pieces.rows).toBeGreaterThan(0);
    expect(manifest.stats.audit.count).toBeGreaterThan(0);
    expect(manifest.stats.audit.entries).toHaveLength(manifest.stats.audit.count);
  }, 60000);
  it('uses a 0700 folder and 0600 files', async () => {
    const folder = fresh();
    const result = await runDatabaseBackup(deps(folder));
    expect(statSync(folder.dir).mode & 0o777).toBe(0o700);
    for (const name of await folder.store.list()) expect(statSync(folder.store.locate(name)).mode & 0o777).toBe(0o600);
    expect(result.status).toBe('complete');
  }, 60000);
  it('--if-not-done-today skips a second run on the same UTC day and runs again the next day', async () => {
    const folder = fresh();
    const at = (iso: string) => ({ now: () => new Date(iso) });
    const first = await runDatabaseBackup(deps(folder, at('2026-05-18T01:00:00Z')), { ifNotDoneToday: true });
    const second = await runDatabaseBackup(deps(folder, at('2026-05-18T20:00:00Z')), { ifNotDoneToday: true });
    const third = await runDatabaseBackup(deps(folder, at('2026-05-19T01:00:00Z')), { ifNotDoneToday: true });
    expect([first.status, second.status, third.status]).toEqual(['complete', 'skipped', 'complete']);
    expect(second.record.id).toBe(first.record.id);
    expect((await listBackups(folder.store, { status: 'complete' })).length).toBe(2);
  }, 90000);
  it('does not delay a write during a slowed backup, and the write is absent from the backup', async () => {
    const folder = fresh();
    let dumpRequested: () => void = () => {};
    const snapshotTaken = new Promise<void>((resolve) => {
      dumpRequested = resolve;
    });
    const slow: PgTools = {
      ...tools,
      dump(options) {
        dumpRequested();
        const out = new PassThrough();
        setTimeout(() => tools.dump(options).on('error', (e) => out.destroy(e)).pipe(out), 1500);
        return out;
      },
    };
    const running = runDatabaseBackup(deps(folder, { tools: slow }));
    // dump() is called after the snapshot is exported; write while the dump is delayed.
    await snapshotTaken;
    const pool = createPool(source.url, 1);
    let shopId: string | undefined;
    try {
      const t0 = Date.now();
      const inserted = await pool.query<{ id: string }>(
        `insert into shops (name) values ('Written during the backup') returning id`,
      );
      shopId = inserted.rows[0].id;
      const writeMs = Date.now() - t0;
      const result = await running;
      expect(writeMs).toBeLessThan(1000);
      if (result.status !== 'complete') throw new Error('expected complete');
      const before = result.manifest.stats.tables.shops.rows;
      expect((await readDbStats(pool)).tables.shops.rows).toBe(before + 1);
      // Restore the dump into a scratch database: it holds the shops of the snapshot, not the new one.
      const scratch = await createTempDatabase();
      try {
        const file = folder.store.locate(result.manifest.file);
        await tools.restore({ databaseUrl: scratch.url, input: await createDecryptStream(file, TEST_KEY) });
        const restored = createPool(scratch.url, 1);
        try {
          expect((await restored.query('select count(*)::int as n from shops')).rows[0].n).toBe(before);
          expect((await restored.query(`select 1 from shops where name = 'Written during the backup'`)).rowCount).toBe(0);
        } finally {
          await restored.end();
        }
      } finally {
        await scratch.drop();
      }
    } finally {
      if (shopId) {
        await pool.query('delete from settings where shop_id = $1', [shopId]);
        await pool.query('delete from locations where shop_id = $1', [shopId]);
        await pool.query('delete from shops where id = $1', [shopId]);
      }
      await pool.end();
    }
  }, 60000);
  it('a failing dump records failed, alerts, removes the partial file and rethrows', async () => {
    const folder = fresh();
    const failing: PgTools = {
      ...tools,
      dump() {
        const out = new PassThrough();
        setTimeout(() => out.destroy(new Error('pg_dump failed (exit 1): connection to postgres://u:secret@h/db refused')), 50);
        return out;
      },
    };
    const d = deps(folder, { tools: failing });
    await expect(runDatabaseBackup(d)).rejects.toThrow('pg_dump failed');
    const [run] = await listBackups(folder.store);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('pg_dump failed');
    expect(run.error).not.toContain('secret');
    expect(run.error).not.toContain('postgres://');
    expect((await folder.store.list()).filter((n) => n.endsWith('.enc') || n.endsWith('.partial') || n.endsWith('.manifest.json'))).toEqual([]);
    expect(d.notifier.alerts).toHaveLength(1);
    expect(d.notifier.alerts[0]).toMatchObject({ environment: 'development', kind: 'daily full' });
  }, 30000);
  it('a missing key is a failed, alerted backup too', async () => {
    const folder = fresh();
    const d = { ...deps(folder), getKey: () => { throw new Error('BACKUP_ENCRYPTION_KEY is required but missing or empty'); } };
    await expect(runDatabaseBackup(d)).rejects.toThrow('BACKUP_ENCRYPTION_KEY');
    expect((await listBackups(folder.store))[0].status).toBe('failed');
    expect(d.notifier.alerts).toHaveLength(1);
  });
  it('a nonexistent container fails the real dump with a clear error', async () => {
    const folder = fresh();
    const d = deps(folder, { tools: createPgTools({ container: 'gs-no-such-container' }) });
    await expect(runDatabaseBackup(d)).rejects.toThrow(/pg_dump failed/);
  }, 30000);
});
describeDb('PgTools databases', () => {
  it('createDatabase refuses an existing database; dropDatabase removes one and tolerates a missing one', async () => {
    const existing = await createTempDatabase();
    const tools = createPgTools();
    const name = new URL(existing.url).pathname.slice(1);
    try {
      await expect(tools.createDatabase(existing.url, name)).rejects.toThrow('never overwrites');
      await tools.createDatabase(existing.url, `${name}_copy`);
      await tools.dropDatabase(existing.url, `${name}_copy`);
      await tools.dropDatabase(existing.url, `${name}_copy`);
    } finally {
      await existing.drop();
    }
  });
});
