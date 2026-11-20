import { randomUUID } from 'node:crypto';
import { gramsToUnits, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

const units = (g: string) => {
  const r = gramsToUnits(g);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};

describeDb('pieces, photos and edits (EP-02-S5)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addEdit = (
    shopId: string,
    pieceId: string,
    values: { field?: string; status?: string; beforeUnits?: number | null; afterUnits?: number | null } & {
      beforeText?: string | null;
      afterText?: string | null;
    },
  ) =>
    pool.query<{ id: string }>(
      `insert into piece_edits (shop_id, code, piece_id, field, before_units, after_units, before_text, after_text, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [
        shopId,
        `ED-${randomUUID().slice(0, 8)}`,
        pieceId,
        values.field ?? 'grossG',
        values.beforeUnits ?? null,
        values.afterUnits ?? null,
        values.beforeText ?? null,
        values.afterText ?? null,
        values.status ?? 'proposed',
      ],
    );

  it('rejects an unknown status and prev_status', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-1');
    await expectPgError(pool.query(`update pieces set status = 'sold' where id = $1`, [id]), '23514');
    await expectPgError(pool.query(`update pieces set prev_status = 'sold' where id = $1`, [id]), '23514');
  });

  it('stores TAG-8841 weights as integer units', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-8841', { grossUnits: units('48.65'), stoneUnits: units('7.06') });
    const { rows } = await pool.query('select gross_units, stone_units from pieces where id = $1', [id]);
    expect(rows[0]).toEqual({ gross_units: 486500, stone_units: 70600 });
    expect(unitsToGrams(rows[0].gross_units)).toBe('48.6500');
  });

  it('raises the version on every update, whatever the statement sets', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-2');
    const version = async () => (await pool.query('select version from pieces where id = $1', [id])).rows[0].version;
    expect(await version()).toBe(1);
    await pool.query(`update pieces set note = 'checked', version = 99 where id = $1`, [id]);
    expect(await version()).toBe(2);
  });

  it('keeps value_inr nullable without a default and has no hold column', async () => {
    const cols = await columnsOf(pool, 'pieces');
    expect(cols.value_inr).toMatchObject({ type: 'numeric', nullable: true, default: null });
    expect(cols).not.toHaveProperty('held_for_lead_id');
    expect(cols).not.toHaveProperty('net_units');
    expect((await columnsOf(pool, 'piece_edits')).version).toBeDefined();
  });

  it('rejects an unknown edit status, field or piece', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-3');
    await expectPgError(addEdit(shop.shopId, id, { status: 'pending', beforeUnits: 1, afterUnits: 2 }), '23514');
    await expectPgError(addEdit(shop.shopId, id, { field: 'size', beforeText: 'a', afterText: 'b' }), '23514');
    await expectPgError(addEdit(shop.shopId, randomUUID(), { beforeUnits: 1, afterUnits: 2 }), '23503');
  });

  it('stores a weight edit in units and a text edit in text, never mixed', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-4');
    const edit = await addEdit(shop.shopId, id, { beforeUnits: units('48.61'), afterUnits: units('48.65') });
    const { rows } = await pool.query('select before_units, after_units, version from piece_edits where id = $1', [
      edit.rows[0].id,
    ]);
    expect(rows[0]).toEqual({ before_units: 486100, after_units: 486500, version: 1 });
    await addEdit(shop.shopId, id, { field: 'stoneCount', beforeText: '4', afterText: '5' });
    await expectPgError(addEdit(shop.shopId, id, { field: 'grossG', beforeText: '1', afterText: '2' }), '23514');
    await expectPgError(addEdit(shop.shopId, id, { field: 'huid', beforeUnits: 1, afterUnits: 2 }), '23514');
  });

  it('reads photos back in position order', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-5');
    await pool.query(
      `insert into piece_photos (shop_id, piece_id, position, storage_key)
       values ($1, $2, 2, 'c.jpg'), ($1, $2, 0, 'a.jpg'), ($1, $2, 1, 'b.jpg')`,
      [shop.shopId, id],
    );
    const { rows } = await pool.query('select storage_key from piece_photos where piece_id = $1 order by position', [
      id,
    ]);
    expect(rows.map((r) => r.storage_key)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('keeps tag numbers and HUIDs unique per shop', async () => {
    const a = await newShop(pool);
    const b = await newShop(pool);
    await addPiece(pool, a, 'TAG-8841', { huid: 'HU1234' });
    await expectPgError(addPiece(pool, a, 'TAG-8841'), '23505');
    await addPiece(pool, b, 'TAG-8841', { huid: 'HU1234' });
    await expectPgError(addPiece(pool, a, 'TAG-9000', { huid: 'HU1234' }), '23505');
    await addPiece(pool, a, 'TAG-9001');
    await addPiece(pool, a, 'TAG-9002');
  });
});
