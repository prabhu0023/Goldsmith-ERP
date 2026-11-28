import { readFileSync, writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { BackupKeyError } from '../../src/ops/backup-crypto.js';
import { type DatabaseManifest, runDatabaseBackup } from '../../src/ops/backup-db.js';
import { dropRestored } from '../../src/ops/drop-restored.js';
import { OpsGuardError } from '../../src/ops/ops-guards.js';
import { createPgTools, type PgTools } from '../../src/ops/pg-tools.js';
import {
  databaseExists,
  RESTORES_FILE,
  RestoreMismatchError,
  type RestoreRecord,
  restoreDatabase,
  urlForDatabase,
} from '../../src/ops/restore-db.js';
import { readDbStats } from '../../src/ops/table-stats.js';
import { describeDb } from '../db/db-test-helpers.js';
import {
  type BackupFolder,
  backupFolder,
  opsEnv,
  recordingNotifier,
  restoreTargetName,
  type SourceDatabase,
  seededSource,
  TEST_KEY,
} from './ops-test-helpers.js';
const OTHER_KEY = Buffer.alloc(32, 0x11);
/** A server that cannot be reached, and tools that fail when touched: a guard refusal must use neither. */
const UNREACHABLE = 'postgres://postgres:postgres@127.0.0.1:1/gs_unreachable';
const untouchable: PgTools = {
  dump: () => {
    throw new Error('tools used');
  },
  restore: () => Promise.reject(new Error('tools used')),
  createDatabase: () => Promise.reject(new Error('tools used')),
  dropDatabase: () => Promise.reject(new Error('tools used')),
};
describeDb('restoreDatabase', () => {
  let source: SourceDatabase;
  let manifest: DatabaseManifest;
  const folders: BackupFolder[] = [];
  const targets: string[] = [];
  const tools = createPgTools();
  const fresh = (): BackupFolder => {
    const f = backupFolder();
    folders.push(f);
    return f;
  };
  let folder: BackupFolder;
  const deps = (over: { tools?: PgTools; getKey?: () => Buffer; folder?: BackupFolder } = {}) => {
    const f = over.folder ?? folder;
    return {
      env: opsEnv(source.url, f.dir),
      store: f.store,
      tools: over.tools ?? tools,
      getKey: over.getKey ?? (() => TEST_KEY),
      runBy: 'test-user',
    };
  };
  const target = (): string => {
    const name = restoreTargetName();
    targets.push(name);
    return name;
  };
  const records = async (f: BackupFolder = folder): Promise<RestoreRecord[]> =>
    ((await f.store.readText(RESTORES_FILE)) ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RestoreRecord);
  async function backupInto(f: BackupFolder): Promise<DatabaseManifest> {
    const result = await runDatabaseBackup({
      env: opsEnv(source.url, f.dir),
      store: f.store,
      tools,
      notifier: recordingNotifier(),
      getKey: () => TEST_KEY,
    });
    if (result.status !== 'complete') throw new Error('expected a complete backup');
    return result.manifest;
  }
  beforeAll(async () => {
    source = await seededSource();
    folder = fresh();
    manifest = await backupInto(folder);
  }, 120000);
  afterAll(async () => {
    for (const name of targets) await tools.dropDatabase(source.url, name);
    for (const f of folders) f.cleanup();
    await source.drop();
  });
  it('reproduces every table row count and checksum, weights as identical integers and null money as null', async () => {
    const name = target();
    const result = await restoreDatabase(deps(), { backup: 'latest', target: name });
    expect(result).toMatchObject({ backup: manifest.id, target: name });
    expect(result.tables).toBe(Object.keys(manifest.stats.tables).length);
    const restoredUrl = urlForDatabase(source.url, name);
    const restored = createPool(restoredUrl, 1);
    const live = createPool(source.url, 1);
    try {
      const stats = await readDbStats(restored);
      expect(stats).toEqual(manifest.stats);
      expect(stats.tables.pieces.rows).toBeGreaterThan(0);
      const weights = 'select tag_no, gross_units, stone_units from pieces order by tag_no';
      const [fromRestore, fromSource] = [await restored.query(weights), await live.query(weights)];
      expect(fromRestore.rows).toEqual(fromSource.rows);
      expect(typeof fromRestore.rows[0].gross_units).toBe('number');
      // stock_outs.amount_inr is a money socket: it stays NULL, not 0.
      const money = await restored.query<{ n: number; with_amount: number }>(
        'select count(*)::int as n, count(amount_inr)::int as with_amount from stock_outs',
      );
      expect(money.rows[0].n).toBeGreaterThan(0);
      expect(money.rows[0].with_amount).toBe(0);
    } finally {
      await restored.end();
      await live.end();
    }
    const [record] = await records();
    expect(record).toMatchObject({
      backup: manifest.id,
      target: name,
      environment: 'development',
      runBy: 'test-user',
      result: 'ok',
      tables: result.tables,
      auditEntries: manifest.stats.audit.count,
    });
    expect(Date.parse(record.startedAt)).toBeLessThanOrEqual(Date.parse(record.finishedAt));
  }, 60000);
  it('restores a named backup id as well as latest', async () => {
    const name = target();
    const result = await restoreDatabase(deps(), { backup: manifest.id, target: name });
    expect(result.backup).toBe(manifest.id);
  }, 60000);
  it('a wrong key is refused, no target database is left and the failure is recorded', async () => {
    const f = fresh();
    await backupInto(f);
    const name = target();
    await expect(restoreDatabase(deps({ folder: f, getKey: () => OTHER_KEY }), { backup: 'latest', target: name })).rejects.toThrow(
      BackupKeyError,
    );
    expect(await databaseExists(source.url, name)).toBe(false);
    const [record] = await records(f);
    expect(record).toMatchObject({ target: name, result: 'failed' });
  }, 60000);
  it('a damaged backup file is refused before any database is created', async () => {
    const f = fresh();
    const damaged = await backupInto(f);
    const file = f.store.locate(damaged.file);
    const bytes = readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    writeFileSync(file, bytes);
    const name = target();
    await expect(restoreDatabase(deps({ folder: f }), { backup: damaged.id, target: name })).rejects.toThrow('sha256');
    expect(await databaseExists(source.url, name)).toBe(false);
  }, 60000);
  it('an unknown backup id and an empty folder are refused with no database created', async () => {
    const name = target();
    await expect(restoreDatabase(deps(), { backup: 'db-20200101T000000Z-0000', target: name })).rejects.toThrow('no manifest');
    await expect(restoreDatabase(deps(), { backup: '../../etc/passwd', target: name })).rejects.toThrow('not a database backup id');
    await expect(restoreDatabase(deps({ folder: fresh() }), { backup: 'latest', target: name })).rejects.toThrow(
      'No complete database backup',
    );
    expect(await databaseExists(source.url, name)).toBe(false);
  }, 60000);
  describe('guards run before any connection', () => {
    const attempt = (over: Partial<{ target: string; appEnv: 'production' | 'staging' | 'development'; lane: string | undefined }>) => {
      const f = fresh();
      const d = {
        env: { ...opsEnv(UNREACHABLE, f.dir), ...(over.appEnv && { appEnv: over.appEnv }), ...('lane' in over && { lane: over.lane }) },
        store: f.store,
        tools: untouchable,
        getKey: () => {
          throw new Error('key read');
        },
      };
      return { f, run: () => restoreDatabase(d, { backup: 'latest', target: over.target ?? 'goldsmith_restore_c_ab12cd' }) };
    };
    it.each([
      ['production', { appEnv: 'production' as const }, 'production'],
      ['staging without the flag', { appEnv: 'staging' as const }, '--allow-staging'],
      ['the lane database', { target: 'goldsmith_dev_c' }, 'not a throwaway'],
      ['the default database', { target: 'goldsmith_dev' }, 'not a throwaway'],
      ['postgres', { target: 'postgres' }, 'not a throwaway'],
      ['another lane', { target: 'goldsmith_restore_a' }, 'does not belong to lane c'],
      ['a name without the lane segment', { target: 'goldsmith_restore' }, 'does not belong to lane c'],
      ['a lane substring', { target: 'goldsmith_restore_cab' }, 'does not belong to lane c'],
    ])('refuses %s', async (_label, over, message) => {
      const { f, run } = attempt(over);
      await expect(run()).rejects.toThrow(OpsGuardError);
      await expect(run()).rejects.toThrow(message);
      expect(await f.store.list()).toEqual([]);
    });
    it('refuses the live database name', async () => {
      const f = fresh();
      const env = { ...opsEnv(urlForDatabase(UNREACHABLE, 'goldsmith_restore_c'), f.dir) };
      await expect(
        restoreDatabase({ env, store: f.store, tools: untouchable, getKey: () => TEST_KEY }, { backup: 'latest', target: 'goldsmith_restore_c' }),
      ).rejects.toThrow('DATABASE_URL names');
    });
  });
  it('an existing target is refused and left untouched', async () => {
    const name = target();
    await tools.createDatabase(source.url, name);
    const pool = createPool(urlForDatabase(source.url, name), 1);
    try {
      await pool.query('create table keep_me (n int)');
      await pool.query('insert into keep_me values (42)');
      await expect(restoreDatabase(deps(), { backup: 'latest', target: name })).rejects.toThrow('already exists');
      expect((await pool.query('select n from keep_me')).rows).toEqual([{ n: 42 }]);
    } finally {
      await pool.end();
    }
    expect(await databaseExists(source.url, name)).toBe(true);
  }, 60000);
  it('drops the target when pg_restore fails', async () => {
    const name = target();
    const failing: PgTools = {
      ...tools,
      restore: async ({ input }) => {
        input.resume();
        throw new Error('pg_restore failed (exit 1): boom');
      },
    };
    await expect(restoreDatabase(deps({ tools: failing }), { backup: 'latest', target: name })).rejects.toThrow('pg_restore failed');
    expect(await databaseExists(source.url, name)).toBe(false);
    expect((await records()).at(-1)).toMatchObject({ target: name, result: 'failed' });
  }, 60000);
  it('drops the target and names the table when the restored data differs from the manifest', async () => {
    const name = target();
    const tampering: PgTools = {
      ...tools,
      restore: async (options) => {
        await tools.restore(options);
        const pool = createPool(options.databaseUrl, 1);
        try {
          await pool.query(`update pieces set name = name || ' changed' where id = (select id from pieces limit 1)`);
        } finally {
          await pool.end();
        }
      },
    };
    const error = await restoreDatabase(deps({ tools: tampering }), { backup: 'latest', target: name }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RestoreMismatchError);
    expect((error as RestoreMismatchError).problems).toEqual(['table pieces has the same row count but different content']);
    expect(await databaseExists(source.url, name)).toBe(false);
  }, 60000);
  describe('dropRestored', () => {
    it('drops a restored database, and tolerates one that is gone', async () => {
      const name = target();
      await restoreDatabase(deps(), { backup: 'latest', target: name });
      const d = { env: opsEnv(source.url, folder.dir), tools };
      expect(await dropRestored(d, { name })).toEqual({ dropped: true });
      expect(await databaseExists(source.url, name)).toBe(false);
      expect(await dropRestored(d, { name })).toEqual({ dropped: false });
    }, 60000);
    it('refuses the live database, other lanes, production and staging without the flag', async () => {
      const d = { env: opsEnv(source.url, folder.dir), tools: untouchable };
      await expect(dropRestored(d, { name: 'goldsmith_dev_c' })).rejects.toThrow(OpsGuardError);
      await expect(dropRestored(d, { name: 'gs_tmp_abc' })).rejects.toThrow(OpsGuardError);
      await expect(dropRestored(d, { name: 'goldsmith_restore_a' })).rejects.toThrow('lane c');
      await expect(dropRestored({ ...d, env: { ...d.env, appEnv: 'production' } }, { name: 'goldsmith_restore_c' })).rejects.toThrow(
        'production',
      );
      await expect(dropRestored({ ...d, env: { ...d.env, appEnv: 'staging' } }, { name: 'goldsmith_restore_c' })).rejects.toThrow(
        '--allow-staging',
      );
    });
  });
});
