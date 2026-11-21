import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type pg from 'pg';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { MigrationChecksumError, MigrationMissingError, migrate, migrationStatus } from '../../src/db/migrator.js';
import { createTempDatabase, describeDb } from './db-test-helpers.js';

const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../', import.meta.url));

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

  it('CLI migrate exits 0 and says up to date on the second run', async () => {
    const args = ['--conditions=@goldsmith/source', '--import', 'tsx', 'src/db/cli.ts', 'migrate'];
    const env = { DATABASE_URL: db.url, APP_ENV: 'development' };
    await run(process.execPath, args, { cwd: apiDir, env });
    const second = await run(process.execPath, args, { cwd: apiDir, env });
    expect(second.stdout).toContain('up to date');
  }, 30000);
});
