import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { insertScoped, loadShopContext } from '../../src/db/shop-context.js';
import { describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('shop-scoped inserts (EP-02-S14, D7)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('loads the shop and its Main shop location', async () => {
    const shop = await newShop(pool);
    const ctx = await loadShopContext(pool, shop.shopId);
    expect(ctx).toEqual(shop);
    const { rows } = await pool.query('select name from locations where id = $1', [ctx.locationId]);
    expect(rows[0].name).toBe('Main shop');
  });

  it('stores the context shop and location, ignoring the ones in the input', async () => {
    const mine = await newShop(pool, 'Mine');
    const other = await newShop(pool, 'Other');
    const ctx = await loadShopContext(pool, mine.shopId);
    const row = await insertScoped<{ id: string; shop_id: string; location_id: string }>(pool, ctx, 'pieces', {
      tag_no: 'TAG-8841',
      name: 'Antique Kundan Choker',
      gross_units: 486500,
      stone_units: 70600,
      status: 'draft',
      shop_id: other.shopId,
      location_id: other.locationId,
    });
    expect(row).toMatchObject({ shop_id: mine.shopId, location_id: mine.locationId });
    const { rows } = await pool.query(
      'select p.shop_id, l.name from pieces p join locations l on l.id = p.location_id where p.id = $1',
      [row.id],
    );
    expect(rows[0]).toEqual({ shop_id: mine.shopId, name: 'Main shop' });

    const karigar = await insertScoped<Record<string, unknown>>(pool, ctx, 'karigars', {
      code: 'KG-01',
      name: 'Lakshmi Devi',
      shop_id: other.shopId,
    });
    expect(karigar.shop_id).toBe(mine.shopId);
    expect(karigar).not.toHaveProperty('location_id');
  });

  it('rejects a raw gold-record insert without a location', async () => {
    const shop = await newShop(pool);
    await expectPgError(
      pool.query(
        `insert into pieces (shop_id, tag_no, name, gross_units, stone_units, status)
         values ($1, 'TAG-1', 'x', 1, 0, 'draft')`,
        [shop.shopId],
      ),
      '23502',
    );
  });

  it('refuses table and column names that are not plain identifiers', async () => {
    const shop = await newShop(pool);
    await expect(insertScoped(pool, shop, 'pieces; drop table pieces', {})).rejects.toThrow(/Invalid table/);
    await expect(insertScoped(pool, shop, 'karigars', { 'name) values (1); --': 'x' })).rejects.toThrow(
      /Invalid table or column/,
    );
  });
});
