import { readFileSync } from 'node:fs';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { listMigrationFiles } from '../../src/db/migrator.js';
import { describeDb, testPool } from './db-test-helpers.js';

const migrationsDir = new URL('../../migrations/', import.meta.url);

/** Rules every migration follows (plan "Schema conventions"), checked against the live schema. */
describeDb('schema conventions (EP-02-S3, D7)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(1);
  });
  afterAll(async () => {
    await pool.end();
  });

  const columns = async () =>
    (
      await pool.query<{ table_name: string; column_name: string; data_type: string }>(
        `select c.table_name, c.column_name, c.data_type
           from information_schema.columns c
           join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and t.table_type = 'BASE TABLE'`,
      )
    ).rows;

  it('gives every business table a not-null shop_id with a foreign key to shops', async () => {
    const tables = (
      await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'
            and table_name not in ('shops', 'schema_migrations')`,
      )
    ).rows.map((r) => r.table_name);
    expect(tables.length).toBeGreaterThan(0);
    const notNull = new Set(
      (
        await pool.query<{ table_name: string }>(
          `select table_name from information_schema.columns
            where table_schema = 'public' and column_name = 'shop_id' and is_nullable = 'NO'`,
        )
      ).rows.map((r) => r.table_name),
    );
    const withFk = new Set(
      (
        await pool.query<{ tbl: string }>(
          `select c.conrelid::regclass::text as tbl
             from pg_constraint c
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
            where c.contype = 'f' and c.confrelid = 'public.shops'::regclass and a.attname = 'shop_id'`,
        )
      ).rows.map((r) => r.tbl),
    );
    expect(tables.filter((t) => !notNull.has(t))).toEqual([]);
    expect(tables.filter((t) => !withFk.has(t))).toEqual([]);
  });

  it('has no floating-point column', async () => {
    const floats = (await columns()).filter((c) => c.data_type === 'real' || c.data_type === 'double precision');
    expect(floats).toEqual([]);
  });

  it('stores every *_units column as bigint', async () => {
    const units = (await columns()).filter((c) => c.column_name.endsWith('_units'));
    expect(units.filter((c) => c.data_type !== 'bigint')).toEqual([]);
  });

  it('stores every timestamp with a time zone', async () => {
    const times = (await columns()).filter((c) => c.data_type.startsWith('timestamp') || c.data_type.startsWith('time '));
    expect(times.filter((c) => c.data_type !== 'timestamp with time zone')).toEqual([]);
  });

  it('keeps no plain-text secret: text columns named like password/token/secret end _hash or _ref', async () => {
    // Timestamps and flags (token_issued_at, require_edit_token) cannot hold a secret value.
    const textual = new Set(['text', 'character varying', 'character', 'bytea']);
    const secretLike = (await columns()).filter(
      (c) => /password|token|secret/.test(c.column_name) && textual.has(c.data_type),
    );
    expect(secretLike.filter((c) => !/_(hash|ref)$/.test(c.column_name))).toEqual([]);
  });

  it('makes every foreign key deferrable', async () => {
    const fixed = (
      await pool.query<{ conname: string }>(
        `select conname from pg_constraint
          where contype = 'f' and connamespace = 'public'::regnamespace and not condeferrable`,
      )
    ).rows;
    expect(fixed).toEqual([]);
  });

  it('records D7 in the first migration', () => {
    const [first] = listMigrationFiles(migrationsDir);
    expect(first.version).toBe(1);
    expect(readFileSync(new URL(first.file, migrationsDir), 'utf8')).toContain('D7');
  });
});
