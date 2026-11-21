import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('scales, karigars, staff and customers (EP-02-S4)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addCustomer = (shopId: string, values: { code?: string; phone?: string; group?: string } = {}) =>
    pool.query<{ id: string }>(
      'insert into customers (shop_id, code, name, phone, customer_group) values ($1, $2, $3, $4, $5) returning id',
      [shopId, values.code ?? 'CU-01', 'Meena Iyer', values.phone ?? '+91 98400 55555', values.group ?? 'Regular'],
    );

  it('stores scale readability and capacity as integer units', async () => {
    const { shopId, locationId } = await newShop(pool);
    await pool.query(
      `insert into scales (shop_id, location_id, code, name, readability_units, capacity_units)
       values ($1, $2, 'SC-BENCH', 'Bench balance', 1, 6000000), ($1, $2, 'SC-PLAT', 'Platform', 100, 300000000)`,
      [shopId, locationId],
    );
    const rows = await pool.query(
      'select code, readability_units, capacity_units from scales where shop_id = $1 order by code',
      [shopId],
    );
    expect(rows.rows).toEqual([
      { code: 'SC-BENCH', readability_units: 1, capacity_units: 6000000 },
      { code: 'SC-PLAT', readability_units: 100, capacity_units: 300000000 },
    ]);
  });

  it('rejects a scale without a location', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(
      pool.query(
        `insert into scales (shop_id, code, name, readability_units, capacity_units) values ($1, 'SC-X', 'X', 1, 1)`,
        [shopId],
      ),
      '23502',
    );
  });

  it('rejects an unknown customer group and keeps money sockets nullable without defaults', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(addCustomer(shopId, { group: 'Gold' }), '23514');
    const cols = await columnsOf(pool, 'customers');
    for (const c of ['budget_inr', 'spent_inr']) {
      expect(cols[c]).toMatchObject({ type: 'numeric', nullable: true, default: null });
    }
    const { rows } = await addCustomer(shopId);
    const saved = await pool.query('select budget_inr, spent_inr from customers where id = $1', [rows[0].id]);
    expect(saved.rows[0]).toEqual({ budget_inr: null, spent_inr: null });
  });

  it('rejects history for an unknown customer', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(
      pool.query('insert into customer_history (shop_id, customer_id, position) values ($1, $2, 0)', [
        shopId,
        randomUUID(),
      ]),
      '23503',
    );
  });

  it('links karigar users to a karigar record and only them', async () => {
    const { shopId } = await newShop(pool);
    const addUser = (role: string, karigarId: string | null) =>
      pool.query(
        `insert into users (shop_id, name, phone, email, role, karigar_id) values ($1, 'U', $2, 'u@example.com', $3, $4)`,
        [shopId, `+91 9${Math.floor(Math.random() * 1e9)}`, role, karigarId],
      );
    await expectPgError(addUser('karigar', randomUUID()), '23503');
    const kg = await pool.query<{ id: string }>(
      `insert into karigars (shop_id, code, name) values ($1, 'KG-01', 'Lakshmi Devi') returning id`,
      [shopId],
    );
    await expectPgError(addUser('staff', kg.rows[0].id), '23514');
    await expectPgError(addUser('karigar', null), '23514');
    await addUser('karigar', kg.rows[0].id);
  });

  it('keeps a customer phone unique per shop', async () => {
    const a = await newShop(pool);
    const b = await newShop(pool);
    await addCustomer(a.shopId, { code: 'CU-01', phone: '+91 98400 12345' });
    await expectPgError(addCustomer(a.shopId, { code: 'CU-02', phone: '+91 98400 12345' }), '23505');
    await addCustomer(b.shopId, { code: 'CU-01', phone: '+91 98400 12345' });
  });
});
