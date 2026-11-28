import { gramsToUnits } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, type TestShop, testPool } from './db-test-helpers.js';

const units = (g: string) => {
  const r = gramsToUnits(g);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};

describeDb('metal pool and ledger (EP-02-S9)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addPool = async (shopId: string) =>
    (await pool.query<{ id: string }>('insert into metal_pools (shop_id) values ($1) returning id', [shopId])).rows[0]
      .id;
  const addEntry = (shop: TestShop, poolId: string, code: string, kind: string, deltaUnits: number) =>
    pool.query(
      `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units)
       values ($1, $2, $3, $4, now(), $5, $6)`,
      [shop.shopId, shop.locationId, poolId, code, kind, deltaUnits],
    );

  it('rejects an unknown entry kind', async () => {
    const shop = await newShop(pool);
    await expectPgError(addEntry(shop, await addPool(shop.shopId), 'AU-1', 'melted', 1), '23514');
  });

  it('stores signed deltas as integer units', async () => {
    const shop = await newShop(pool);
    const poolId = await addPool(shop.shopId);
    await addEntry(shop, poolId, 'AU-001', 'opening', units('500'));
    await addEntry(shop, poolId, 'AU-002', 'issued', units('-80'));
    await addEntry(shop, poolId, 'AU-003', 'recovered', units('79.6'));
    const { rows } = await pool.query('select delta_units from pool_entries where metal_pool_id = $1 order by code', [
      poolId,
    ]);
    expect(rows.map((r) => r.delta_units)).toEqual([5000000, -800000, 796000]);
    const balance = await pool.query('select balance_units, version from metal_pools where id = $1', [poolId]);
    expect(balance.rows[0]).toEqual({ balance_units: 0, version: 1 });
  });

  it('allows one pool per shop', async () => {
    const { shopId } = await newShop(pool);
    await addPool(shopId);
    await expectPgError(addPool(shopId), '23505');
  });

  it('requires location_id on entries', async () => {
    expect((await columnsOf(pool, 'pool_entries')).location_id).toMatchObject({ nullable: false, default: null });
  });
});
