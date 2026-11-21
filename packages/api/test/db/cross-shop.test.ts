import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, addPiece, describeDb, expectPgError, newShop, type TestShop, testPool } from './db-test-helpers.js';

/** Composite (shop_id, x_id) foreign keys from migration 0011 (review finding 1, D7). */
describeDb('references stay inside one shop', () => {
  let pool: pg.Pool;
  let a: TestShop;
  let b: TestShop;
  beforeAll(async () => {
    pool = testPool();
    a = await newShop(pool, 'Shop A');
    b = await newShop(pool, 'Shop B');
  });
  afterAll(async () => {
    await pool.end();
  });

  const addScale = async (shop: TestShop, code: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into scales (shop_id, location_id, code, name, readability_units, capacity_units)
         values ($1, $2, $3, 'Bench balance', 1, 6000000) returning id`,
        [shop.shopId, shop.locationId, code],
      )
    ).rows[0].id;
  const addParcel = async (shop: TestShop, code: string) => {
    const karigarId = await addKarigar(pool, shop, `KG-${code}`);
    return (
      await pool.query<{ id: string }>(
        `insert into parcels (shop_id, location_id, code, karigar_id) values ($1, $2, $3, $4) returning id`,
        [shop.shopId, shop.locationId, code, karigarId],
      )
    ).rows[0].id;
  };
  const addJob = async (shop: TestShop, code: string, orderCopyId: string | null = null) => {
    const karigarId = await addKarigar(pool, shop, `KG-${code}`);
    const job = await pool.query<{ id: string }>(
      `insert into karigar_jobs (shop_id, code, karigar_id, order_copy_id, status, target_gross_units,
         target_net_units, tolerance_units, gold_issued_units)
       values ($1, $2, $3, $4, 'sent', 845000, 784000, 5000, 800000) returning id`,
      [shop.shopId, code, karigarId, orderCopyId],
    );
    return { jobId: job.rows[0].id, karigarId };
  };

  it('accepts references inside the same shop', async () => {
    const scaleId = await addScale(a, 'SC-OK');
    const parcelId = await addParcel(a, 'B-OK');
    const pieceId = await addPiece(pool, a, 'TAG-OK');
    await pool.query('update pieces set scale_id = $2, parcel_id = $3 where id = $1', [pieceId, scaleId, parcelId]);
    const { rows } = await pool.query('select shop_id from pieces where id = $1', [pieceId]);
    expect(rows[0].shop_id).toBe(a.shopId);
  });

  it("rejects a piece at another shop's location", async () => {
    await expectPgError(addPiece(pool, { shopId: b.shopId, locationId: a.locationId }, 'TAG-X1'), '23503');
  });

  it("rejects a piece or a parcel weighing on another shop's scale", async () => {
    const scaleA = await addScale(a, 'SC-A');
    const pieceB = await addPiece(pool, b, 'TAG-X2');
    await expectPgError(pool.query('update pieces set scale_id = $2 where id = $1', [pieceB, scaleA]), '23503');
    const parcelB = await addParcel(b, 'B-X2');
    await expectPgError(
      pool.query(
        `insert into parcel_weighings (shop_id, location_id, parcel_id, scale_id, position, label, gross_units, stone_units)
         values ($1, $2, $3, $4, 0, 'Tray 1', 100000, 0)`,
        [b.shopId, b.locationId, parcelB, scaleA],
      ),
      '23503',
    );
  });

  it("rejects a child row under another shop's parcel", async () => {
    const parcelA = await addParcel(a, 'B-X3');
    await expectPgError(
      pool.query(
        `insert into parcel_manifest_rows (shop_id, parcel_id, position, kind, item_count) values ($1, $2, 0, 'Haram', 1)`,
        [b.shopId, parcelA],
      ),
      '23503',
    );
    const pieceB = await addPiece(pool, b, 'TAG-X3');
    await expectPgError(pool.query('update pieces set parcel_id = $2 where id = $1', [pieceB, parcelA]), '23503');
  });

  it("rejects a karigar job pointing at another shop's order copy", async () => {
    const { jobId, karigarId } = await addJob(a, 'MO-A');
    const copy = await pool.query<{ id: string }>(
      `insert into order_copies (shop_id, code, job_id, karigar_id, target_gross_units, target_net_units,
         tolerance_units, gold_issued_units)
       values ($1, 'OC-A', $2, $3, 845000, 784000, 5000, 800000) returning id`,
      [a.shopId, jobId, karigarId],
    );
    await expectPgError(addJob(b, 'MO-B', copy.rows[0].id), '23503');
  });
});
