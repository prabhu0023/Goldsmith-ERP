/**
 * Helpers for the EP-18 pool tests: a fresh shop with a pool holding a known balance, an
 * operation context for its owner, and `inTransaction`, which runs work the way an operation does.
 */
import type pg from 'pg';
import { withTransaction } from '../../src/db/transaction.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import type { OperationCtx } from '../../src/pipeline/registry.js';
import { newShop } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';

export const POOL_AT = new Date('2026-11-28T09:30:00.000Z');

export interface PoolShop {
  ctx: OperationCtx;
  userId: string;
}

/**
 * A new shop with an owner and a metal pool of `balanceUnits` (one opening entry PL-001 when above
 * zero, so the ledger sum equals the balance).
 */
export async function newPoolShop(pool: pg.Pool, balanceUnits: number): Promise<PoolShop> {
  const shop = await newShop(pool, 'Pool test shop');
  const userId = await newUser(pool, shop, { name: 'Sanjay Seth', role: 'owner' });
  const row = await pool.query<{ id: string }>('insert into metal_pools (shop_id, balance_units) values ($1, $2) returning id', [
    shop.shopId,
    balanceUnits,
  ]);
  if (balanceUnits > 0) {
    await pool.query(
      `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units, note, actor_name)
       values ($1, $2, $3, 'PL-001', $4, 'opening', $5, 'Opening balance', 'Seed')`,
      [shop.shopId, shop.locationId, row.rows[0].id, POOL_AT, balanceUnits],
    );
  }
  return { ctx: { by: { id: userId, name: 'Sanjay Seth', role: 'owner' }, at: POOL_AT, shop }, userId };
}

/** Run `fn` in one transaction like an operation does: commit on return, roll back on a throw. */
export function inTransaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTransaction(pool, (client) => fn({ client, afterCommit: () => {} }));
}

export async function balanceOf(pool: pg.Pool, shopId: string): Promise<number> {
  return (await pool.query<{ balance_units: number }>('select balance_units from metal_pools where shop_id = $1', [shopId]))
    .rows[0].balance_units;
}

export async function entryCount(pool: pg.Pool, shopId: string): Promise<number> {
  return Number((await pool.query('select count(*) from pool_entries where shop_id = $1', [shopId])).rows[0].count);
}
