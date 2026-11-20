/**
 * Helpers for tests that need PostgreSQL. They run only when TEST_DATABASE_URL is set
 * (see global-setup.ts); otherwise describeDb skips the whole block.
 */
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { describe, expect } from 'vitest';
import { createPool } from '../../src/db/connection.js';

const testUrl = process.env.TEST_DATABASE_URL?.trim() ?? '';

export const dbEnabled = testUrl !== '';

/** `describe` when the test database is configured, `describe.skip` otherwise. */
export const describeDb = dbEnabled ? describe : describe.skip;

type Queryable = pg.Pool | pg.PoolClient;

/** A pool on the shared test database (already migrated by global-setup). End it in afterAll. */
export function testPool(max = 5): pg.Pool {
  if (!dbEnabled) throw new Error('TEST_DATABASE_URL is not set');
  return createPool(testUrl, max);
}

/** A fresh, empty database next to the test database, for tests that need a clean slate. */
export async function createTempDatabase(): Promise<{ url: string; drop(): Promise<void> }> {
  const name = `gs_tmp_${randomBytes(6).toString('hex')}`;
  const admin = testPool(1);
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(testUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const pool = testPool(1);
      try {
        await pool.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await pool.end();
      }
    },
  };
}

/** Insert a shop (its "Main shop" location is created by a trigger) and return both ids. */
export async function newShop(client: Queryable, name = 'Test shop'): Promise<{ shopId: string; locationId: string }> {
  const shop = await client.query<{ id: string }>('insert into shops (name) values ($1) returning id', [name]);
  const shopId = shop.rows[0].id;
  const loc = await client.query<{ id: string }>('select id from locations where shop_id = $1', [shopId]);
  return { shopId, locationId: loc.rows[0].id };
}

export interface ColumnInfo {
  type: string;
  nullable: boolean;
  default: string | null;
}

/** Columns of a table in schema public, keyed by name (from information_schema). */
export async function columnsOf(client: Queryable, table: string): Promise<Record<string, ColumnInfo>> {
  const res = await client.query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
    `select column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [table],
  );
  const cols: Record<string, ColumnInfo> = {};
  for (const r of res.rows) {
    cols[r.column_name] = { type: r.data_type, nullable: r.is_nullable === 'YES', default: r.column_default };
  }
  return cols;
}

/**
 * Expect the promise to fail with the given PostgreSQL error code: 23514 check, 23503 foreign
 * key, 23505 unique, 23502 not null, P0001 raised exception.
 */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}
