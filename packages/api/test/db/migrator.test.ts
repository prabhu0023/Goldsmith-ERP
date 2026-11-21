import { execFile } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type pg from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import {
  listMigrationFiles,
  MigrationChecksumError,
  MigrationMissingError,
  migrate,
  migrationStatus,
  newMigrationFile,
  prefixOf,
  timestampPrefix,
} from '../../src/db/migrator.js';
import { createTempDatabase, describeDb } from './db-test-helpers.js';

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../', import.meta.url));

describe('migration names (parallel lanes)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gs-migration-names-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('orders legacy NNNN names before YYYYMMDDTHHMM names, then by name', () => {
    for (const f of ['20261121T1030_b.sql', '0015_last_legacy.sql', '20260105T0900_a.sql', '0001_first.sql']) {
      writeFileSync(join(dir, f), '');
    }
    writeFileSync(join(dir, '2026-11-21_wrong.sql'), '');
    writeFileSync(join(dir, '20261121_no_time.sql'), '');
    const files = listMigrationFiles(dir);
    expect(files.map((f) => f.file)).toEqual([
      '0001_first.sql',
      '0015_last_legacy.sql',
      '20260105T0900_a.sql',
      '20261121T1030_b.sql',
    ]);
    expect(files.map((f) => [f.version, f.prefix, f.name])).toEqual([
      [1, '0001', 'first'],
      [15, '0015', 'last_legacy'],
      [202601050900, '20260105T0900', 'a'],
      [202611211030, '20261121T1030', 'b'],
    ]);
    expect(prefixOf(15)).toBe('0015');
    expect(prefixOf(202611211030)).toBe('20261121T1030');
  });

  it('refuses two files with the same timestamp', () => {
    writeFileSync(join(dir, '20261121T1030_a.sql'), '');
    writeFileSync(join(dir, '20261121T1030_b.sql'), '');
    expect(() => listMigrationFiles(dir)).toThrow('Two migrations share number 20261121T1030');
  });

  it('keeps the real migrations: 0001 to 0015 first, every other file timestamp-named', () => {
    const files = listMigrationFiles(new URL('../../migrations/', import.meta.url));
    expect(files.slice(0, 15).map((f) => f.version)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    for (const f of files.slice(15)) expect(f.prefix).toMatch(/^\d{8}T\d{4}$/);
  });

  it('db:new creates an empty YYYYMMDDTHHMM_name.sql in UTC and refuses bad names and a taken minute', () => {
    const now = new Date('2026-11-21T10:30:59.999Z');
    expect(timestampPrefix(now)).toBe('20261121T1030');
    expect(newMigrationFile(dir, 'metal_pool_ledger', now)).toBe('20261121T1030_metal_pool_ledger.sql');
    expect(readdirSync(dir)).toEqual(['20261121T1030_metal_pool_ledger.sql']);
    expect(readFileSync(join(dir, '20261121T1030_metal_pool_ledger.sql'), 'utf8')).toMatch(/^-- [^\n]*\n$/);
    expect(() => newMigrationFile(dir, 'other', now)).toThrow('already uses 20261121T1030');
    expect(() => newMigrationFile(dir, 'Metal-Pool', new Date('2026-11-21T10:31:00Z'))).toThrow('a-z, 0-9 and _');
  });

  it('CLI db:new prints the created file and needs a name', async () => {
    const args = ['--conditions=@goldsmith/source', '--import', 'tsx', 'src/db/cli.ts', 'new'];
    const err = await run(process.execPath, args, { cwd: apiDir, env: {} }).catch(
      (e: unknown) => e as { code: number; stderr: string },
    );
    expect(err).toMatchObject({ code: 1 });
    expect((err as { stderr: string }).stderr).toContain('Name the migration');
  }, 30000);
});

describeDb('migration runner (EP-02-S1)', () => {
  let db: { url: string; drop(): Promise<void> };
  let pool: pg.Pool;
  let dir: string;
  const write = (file: string, sql: string) => writeFileSync(join(dir, file), sql);
  const history = async () =>
    (await pool.query<{ version: number }>('select version from schema_migrations order by version')).rows.map(
      (r) => r.version,
    );
  const tableExists = async (name: string) =>
    (await pool.query<{ t: string | null }>('select to_regclass($1) as t', [name])).rows[0].t !== null;

  beforeEach(async () => {
    db = await createTempDatabase();
    pool = createPool(db.url, 2);
    dir = mkdtempSync(join(tmpdir(), 'gs-migrations-'));
  });
  afterEach(async () => {
    await pool.end();
    await db.drop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies files in number order and records each one', async () => {
    write('0002_b.sql', 'create table t2 (id integer references t1(id));');
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    const { applied } = await migrate(pool, dir);
    expect(applied.map((m) => m.file)).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(await history()).toEqual([1, 2]);
  });

  it('applies nothing on a second run', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    await migrate(pool, dir);
    const { applied } = await migrate(pool, dir);
    expect(applied).toEqual([]);
    expect(await history()).toEqual([1]);
  });

  it('reports number, name, UTC time and checksum', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    write('0002_b.sql', 'create table t2 (id integer);');
    await migrate(pool, dir);
    write('0003_c.sql', 'create table t3 (id integer);');
    const rows = await migrationStatus(pool, dir);
    expect(rows.map((r) => [r.version, r.name, r.state])).toEqual([
      [1, 'a', 'applied'],
      [2, 'b', 'applied'],
      [3, 'c', 'pending'],
    ]);
    expect(rows[0].appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(rows[2].appliedAt).toBeNull();
    for (const r of rows) expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stops with an error naming an edited applied file and applies nothing', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    await migrate(pool, dir);
    write('0001_a.sql', 'create table t1 (id integer primary key, extra text);');
    write('0003_c.sql', 'create table t3 (id integer);');
    const err = await migrate(pool, dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationChecksumError);
    expect((err as Error).message).toContain('0001_a.sql');
    expect((err as Error).message).toContain('Nothing was applied');
    expect(await tableExists('t3')).toBe(false);
    expect(await history()).toEqual([1]);
    expect((await migrationStatus(pool, dir))[0].state).toBe('changed');
  });

  it('reports an applied migration whose file was deleted as missing', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    write('0002_b.sql', 'create table t2 (id integer);');
    await migrate(pool, dir);
    rmSync(join(dir, '0001_a.sql'));
    write('0003_c.sql', 'create table t3 (id integer);');
    const rows = await migrationStatus(pool, dir);
    expect(rows.map((r) => [r.version, r.name, r.state])).toEqual([
      [1, 'a', 'missing'],
      [2, 'b', 'applied'],
      [3, 'c', 'pending'],
    ]);
    expect(rows[0].appliedAt).not.toBeNull();
    expect(rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });
  it('stops migrate with an error naming a deleted applied file and applies nothing', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    await migrate(pool, dir);
    rmSync(join(dir, '0001_a.sql'));
    write('0002_b.sql', 'create table t2 (id integer);');
    const err = await migrate(pool, dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationMissingError);
    expect((err as Error).message).toContain('0001_a.sql');
    expect((err as Error).message).toContain('Nothing was applied');
    expect(await tableExists('t2')).toBe(false);
    expect(await history()).toEqual([1]);
  });
  it('leaves no partial schema and no history row when a file fails', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    write('0002_b.sql', 'create table t2(); select 1/0;');
    await expect(migrate(pool, dir)).rejects.toThrow('0002_b.sql');
    expect(await tableExists('t1')).toBe(true);
    expect(await tableExists('t2')).toBe(false);
    expect(await history()).toEqual([1]);
  });

  it('applies a file whose timestamp sorts before an already applied one, and shows it pending until then', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    write('20261121T1200_lane_b.sql', 'create table tb (id integer);');
    await migrate(pool, dir);
    // Lane a's branch merges second, with an earlier timestamp.
    write('20261121T1030_lane_a.sql', 'create table ta (id integer);');
    expect((await migrationStatus(pool, dir)).map((r) => [r.prefix, r.name, r.state])).toEqual([
      ['0001', 'a', 'applied'],
      ['20261121T1030', 'lane_a', 'pending'],
      ['20261121T1200', 'lane_b', 'applied'],
    ]);
    const { applied } = await migrate(pool, dir);
    expect(applied.map((m) => m.file)).toEqual(['20261121T1030_lane_a.sql']);
    expect(await tableExists('ta')).toBe(true);
    expect(await history()).toEqual([1, 202611211030, 202611211200]);
    expect((await migrationStatus(pool, dir)).map((r) => r.state)).toEqual(['applied', 'applied', 'applied']);
  });

  it('shows applied, pending and missing across legacy and timestamp names, and migrate stops on the missing one', async () => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    write('20261121T1030_x.sql', 'create table tx (id integer);');
    await migrate(pool, dir);
    rmSync(join(dir, '20261121T1030_x.sql'));
    write('20261121T1100_y.sql', 'create table ty (id integer);');
    expect((await migrationStatus(pool, dir)).map((r) => [r.prefix, r.name, r.state])).toEqual([
      ['0001', 'a', 'applied'],
      ['20261121T1030', 'x', 'missing'],
      ['20261121T1100', 'y', 'pending'],
    ]);
    const err = await migrate(pool, dir).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationMissingError);
    expect((err as Error).message).toContain('20261121T1030_x.sql');
    expect(await tableExists('ty')).toBe(false);
  });

  it('widens a history table made with version integer and keeps its rows', async () => {
    await pool.query(`create table schema_migrations (
      version integer primary key, name text not null, checksum text not null,
      applied_at timestamptz not null default now())`);
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    const legacy = listMigrationFiles(dir)[0];
    await pool.query(`create table t1 (id integer primary key)`);
    await pool.query('insert into schema_migrations (version, name, checksum) values (1, $1, $2)', [
      legacy.name,
      legacy.checksum,
    ]);
    write('20261121T1030_b.sql', 'create table tb (id integer);');
    const { applied } = await migrate(pool, dir);
    expect(applied.map((m) => m.file)).toEqual(['20261121T1030_b.sql']);
    expect(await history()).toEqual([1, 202611211030]);
  });

  it('applies a db:new file after the real legacy migrations', async () => {
    const real = new URL('../../migrations/', import.meta.url);
    for (const f of listMigrationFiles(real)) write(f.file, f.sql);
    const file = newMigrationFile(dir, 'lane_check');
    writeFileSync(join(dir, file), 'create table lane_check (id integer);', { flag: 'a' });
    const { applied } = await migrate(pool, dir);
    expect(applied.at(-1)?.file).toBe(file);
    expect(applied.slice(0, 15).map((m) => m.prefix)).toEqual(
      Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(4, '0')),
    );
    expect(await tableExists('lane_check')).toBe(true);
  }, 30000);

  it('CLI migrate exits 0 and says up to date on the second run', async () => {
    const args = ['--conditions=@goldsmith/source', '--import', 'tsx', 'src/db/cli.ts', 'migrate'];
    const env = { DATABASE_URL: db.url, APP_ENV: 'development' };
    await run(process.execPath, args, { cwd: apiDir, env });
    const second = await run(process.execPath, args, { cwd: apiDir, env });
    expect(second.stdout).toContain('up to date');
  }, 30000);
  it.each(['staging', 'production'])('CLI reset exits 1 with APP_ENV=%s and drops nothing', async (appEnv) => {
    write('0001_a.sql', 'create table t1 (id integer primary key);');
    await migrate(pool, dir);
    const args = ['--conditions=@goldsmith/source', '--import', 'tsx', 'src/db/cli.ts', 'reset'];
    const err = await run(process.execPath, args, { cwd: apiDir, env: { DATABASE_URL: db.url, APP_ENV: appEnv } }).catch(
      (e: unknown) => e as { code: number; stderr: string },
    );
    expect(err).toMatchObject({ code: 1 });
    expect((err as { stderr: string }).stderr).toContain(`db:reset is refused when APP_ENV=${appEnv}`);
    expect(await tableExists('t1')).toBe(true);
  }, 30000);
});
