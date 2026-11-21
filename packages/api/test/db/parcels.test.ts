import { randomUUID } from 'node:crypto';
import { gramsToUnits, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  addKarigar,
  addPiece,
  columnsOf,
  describeDb,
  expectPgError,
  newShop,
  type TestShop,
  testPool,
} from './db-test-helpers.js';

describeDb('parcels, weighings, manifest and QC ticks (EP-02-S6)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addParcel = async (shop: TestShop, set: Record<string, string> = {}) => {
    const karigarId = await addKarigar(pool, shop);
    const cols = Object.keys(set);
    const res = await pool.query<{ id: string }>(
      `insert into parcels (shop_id, location_id, code, karigar_id${cols.map((c) => `, ${c}`).join('')})
       values ($1, $2, 'BATCH-2026-044', $3${cols.map((_, i) => `, $${i + 4}`).join('')}) returning id`,
      [shop.shopId, shop.locationId, karigarId, ...Object.values(set)],
    );
    return res.rows[0].id;
  };
  const addWeighing = (shop: TestShop, parcelId: string, position: number, grossUnits: number) =>
    pool.query(
      `insert into parcel_weighings (shop_id, location_id, parcel_id, position, label, gross_units, stone_units)
       values ($1, $2, $3, $4, $5, $6, 0)`,
      [shop.shopId, shop.locationId, parcelId, position, `Tray ${position + 1}`, grossUnits],
    );

  it('round-trips a weighing of 12.3456 g exactly', async () => {
    const shop = await newShop(pool);
    const parcelId = await addParcel(shop);
    const parsed = gramsToUnits('12.3456');
    if (!parsed.ok) throw new Error(parsed.error);
    await addWeighing(shop, parcelId, 0, parsed.units);
    const { rows } = await pool.query('select gross_units from parcel_weighings where parcel_id = $1', [parcelId]);
    expect(rows[0].gross_units).toBe(123456);
    expect(unitsToGrams(rows[0].gross_units)).toBe('12.3456');
  });

  it('reads trays back in position order', async () => {
    const shop = await newShop(pool);
    const parcelId = await addParcel(shop);
    await addWeighing(shop, parcelId, 2, 300);
    await addWeighing(shop, parcelId, 0, 100);
    await addWeighing(shop, parcelId, 1, 200);
    const { rows } = await pool.query(
      'select label, gross_units from parcel_weighings where parcel_id = $1 order by position',
      [parcelId],
    );
    expect(rows).toEqual([
      { label: 'Tray 1', gross_units: 100 },
      { label: 'Tray 2', gross_units: 200 },
      { label: 'Tray 3', gross_units: 300 },
    ]);
  });

  it('rejects an unknown stage, status, verdict and resolution', async () => {
    await expectPgError(addParcel(await newShop(pool), { stage: '4' }), '23514');
    await expectPgError(addParcel(await newShop(pool), { status: 'closed' }), '23514');
    await expectPgError(addParcel(await newShop(pool), { verdict: 'close' }), '23514');
    await expectPgError(addParcel(await newShop(pool), { resolution: 'returned' }), '23514');
  });

  it('rejects a manifest row with no items', async () => {
    const shop = await newShop(pool);
    const parcelId = await addParcel(shop);
    await expectPgError(
      pool.query(
        `insert into parcel_manifest_rows (shop_id, parcel_id, position, kind, item_count) values ($1, $2, 0, 'Haram', 0)`,
        [shop.shopId, parcelId],
      ),
      '23514',
    );
  });

  it('ticks a piece once per parcel', async () => {
    const shop = await newShop(pool);
    const parcelId = await addParcel(shop);
    const pieceId = await addPiece(pool, shop, 'TAG-8841');
    const tick = (position: number) =>
      pool.query('insert into parcel_qc_ticks (shop_id, parcel_id, piece_id, position) values ($1, $2, $3, $4)', [
        shop.shopId,
        parcelId,
        pieceId,
        position,
      ]);
    await tick(0);
    await expectPgError(tick(1), '23505');
  });

  it('requires location_id on parcels and weighings', async () => {
    expect((await columnsOf(pool, 'parcels')).location_id).toMatchObject({ nullable: false, default: null });
    expect((await columnsOf(pool, 'parcel_weighings')).location_id).toMatchObject({ nullable: false, default: null });
  });

  it('rejects a piece pointing at an unknown parcel', async () => {
    const shop = await newShop(pool);
    const pieceId = await addPiece(pool, shop, 'TAG-1');
    await expectPgError(pool.query('update pieces set parcel_id = $1 where id = $2', [randomUUID(), pieceId]), '23503');
  });
});
