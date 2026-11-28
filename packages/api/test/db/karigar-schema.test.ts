import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { nextCode } from '../../src/db/codes.js';
import { loadShopContext } from '../../src/db/shop-context.js';
import { addKarigar, columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('karigar schema (EP-16-S1)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  const insertKarigar = (shopId: string, code: string, wastageBp: number, extra: { phone?: string | null; language?: string } = {}) =>
    pool.query(
      `insert into karigars (shop_id, code, name, email, wastage_bp, phone, language)
       values ($1, $2, 'Ravi Achari', $3, $4, $5, coalesce($6, 'English'))`,
      [shopId, code, `${code.toLowerCase()}@example.test`, wastageBp, extra.phone ?? null, extra.language ?? null],
    );

  it('has the new columns and none of the seeded scorecard columns (AC1)', async () => {
    const columns = await columnsOf(pool, 'karigars');
    for (const name of ['email', 'workshop_location', 'wastage_bp', 'status', 'deactivated_at', 'version', 'language']) {
      expect(columns, name).toHaveProperty(name);
    }
    for (const name of ['specialty', 'wastage_pct', 'metal_loss_pct', 'late_days', 'rating', 'finished_jobs']) {
      expect(columns, name).not.toHaveProperty(name);
    }
    expect(columns.email.nullable).toBe(false);
    expect(columns.wastage_bp.nullable).toBe(false);
    const gone = await pool.query(`select to_regclass('karigar_gap_history') as t`);
    expect(gone.rows[0].t).toBeNull();
  });

  it('defaults a new karigar to active, version 1 and English, and raises the version on update', async () => {
    const { shopId } = await newShop(pool);
    await insertKarigar(shopId, 'KG-05', 90);
    const { rows } = await pool.query('select status, version, language from karigars where shop_id = $1', [shopId]);
    expect(rows[0]).toEqual({ status: 'active', version: 1, language: 'English' });
    await pool.query(`update karigars set workshop_location = 'Anna Nagar' where shop_id = $1`, [shopId]);
    expect((await pool.query('select version from karigars where shop_id = $1', [shopId])).rows[0].version).toBe(2);
  });

  it('keeps the wastage allowance between 60 and 120 basis points (AC2)', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(insertKarigar(shopId, 'KG-01', 59), '23514');
    await expectPgError(insertKarigar(shopId, 'KG-01', 121), '23514');
    await insertKarigar(shopId, 'KG-01', 60);
    await insertKarigar(shopId, 'KG-02', 120);
    // 0.7 is not a whole number of basis points: the integer column refuses it.
    await expectPgError(insertKarigar(shopId, 'KG-03', 0.7), '22P02');
  });

  it('refuses an unknown language, a blank name and a second karigar on the same phone', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(insertKarigar(shopId, 'KG-01', 70, { language: 'French' }), '23514');
    await expectPgError(
      pool.query(
        `insert into karigars (shop_id, code, name, email, wastage_bp) values ($1, 'KG-01', '  ', 'a@example.test', 70)`,
        [shopId],
      ),
      '23514',
    );
    await insertKarigar(shopId, 'KG-01', 70, { phone: '+919840010101' });
    await expectPgError(insertKarigar(shopId, 'KG-02', 70, { phone: '+919840010101' }), '23505');
    await insertKarigar(shopId, 'KG-03', 70, { phone: null });
    await insertKarigar(shopId, 'KG-04', 70, { phone: null });
    const other = await newShop(pool);
    await insertKarigar(other.shopId, 'KG-01', 70, { phone: '+919840010101' });
  });

  it('stores one specialty row per karigar and name (AC3)', async () => {
    const shop = await newShop(pool);
    const karigarId = await addKarigar(pool, shop, 'KG-01');
    const add = (specialty: string, position: number) =>
      pool.query(
        'insert into karigar_specialties (shop_id, karigar_id, specialty, position) values ($1, $2, $3, $4)',
        [shop.shopId, karigarId, specialty, position],
      );
    await add('Kundan', 0);
    await add('Polki', 1);
    await expectPgError(add('Kundan', 2), '23505');
    await expectPgError(add('  ', 2), '23514');
    const other = await newShop(pool);
    await expectPgError(
      pool.query('insert into karigar_specialties (shop_id, karigar_id, specialty, position) values ($1, $2, $3, 0)', [
        other.shopId,
        karigarId,
        'Temple',
      ]),
      '23503',
    );
    const { rows } = await pool.query('select specialty from karigar_specialties where karigar_id = $1 order by position', [karigarId]);
    expect(rows.map((r) => r.specialty)).toEqual(['Kundan', 'Polki']);
  });

  it('gives the next code after the highest existing one (AC5)', async () => {
    const shop = await newShop(pool);
    for (const code of ['KG-01', 'KG-02', 'KG-03', 'KG-04']) await addKarigar(pool, shop, code);
    const ctx = await loadShopContext(pool, shop.shopId);
    expect(await nextCode(pool, ctx, { table: 'karigars', prefix: 'KG', pad: 2 })).toBe('KG-05');
    expect(await nextCode(pool, ctx, { table: 'karigars', prefix: 'KG', pad: 2 })).toBe('KG-06');
  });

  it('gives 20 concurrent creates 20 different codes (AC6)', async () => {
    const shop = await newShop(pool);
    const ctx = await loadShopContext(pool, shop.shopId);
    const codes = await Promise.all(
      Array.from({ length: 20 }, () => nextCode(pool, ctx, { table: 'karigars', prefix: 'KG', pad: 2 })),
    );
    expect(new Set(codes).size).toBe(20);
  });
});
