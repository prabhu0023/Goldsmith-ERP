import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('broadcasts, wishes and settings (EP-02-S12)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addCustomer = async (shopId: string, n: number) =>
    (
      await pool.query<{ id: string }>(
        `insert into customers (shop_id, code, name, phone, customer_group) values ($1, $2, 'C', $3, 'VIP Bridal') returning id`,
        [shopId, `CU-0${n}`, `+91 98400 0000${n}`],
      )
    ).rows[0].id;
  const addBroadcast = (shopId: string, audience: string) =>
    pool.query<{ id: string }>(
      `insert into broadcasts (shop_id, code, at, audience, message) values ($1, 'BC-1', now(), $2, 'New bridal sets') returning id`,
      [shopId, audience],
    );
  const addWish = (shopId: string, customerId: string, kind: string) =>
    pool.query(
      `insert into wishes (shop_id, code, at, customer_id, kind) values ($1, $2, now(), $3, $4)`,
      [shopId, `WS-${randomUUID().slice(0, 8)}`, customerId, kind],
    );

  it('stores a broadcast with its pieces in order and its recipients', async () => {
    const shop = await newShop(pool);
    const pieces = [await addPiece(pool, shop, 'TAG-8841'), await addPiece(pool, shop, 'TAG-8802')];
    const customers = [await addCustomer(shop.shopId, 1), await addCustomer(shop.shopId, 2), await addCustomer(shop.shopId, 3)];
    const id = (await addBroadcast(shop.shopId, 'VIP Bridal')).rows[0].id;
    for (const [i, pieceId] of pieces.entries()) {
      await pool.query('insert into broadcast_pieces (shop_id, broadcast_id, piece_id, position) values ($1, $2, $3, $4)', [
        shop.shopId,
        id,
        pieceId,
        i,
      ]);
    }
    for (const customerId of customers) {
      await pool.query('insert into broadcast_recipients (shop_id, broadcast_id, customer_id) values ($1, $2, $3)', [
        shop.shopId,
        id,
        customerId,
      ]);
    }
    await expectPgError(
      pool.query('insert into broadcast_recipients (shop_id, broadcast_id, customer_id) values ($1, $2, $3)', [
        shop.shopId,
        id,
        customers[0],
      ]),
      '23505',
    );
    const tags = await pool.query(
      `select p.tag_no from broadcast_pieces bp join pieces p on p.id = bp.piece_id where bp.broadcast_id = $1 order by bp.position`,
      [id],
    );
    expect(tags.rows.map((r) => r.tag_no)).toEqual(['TAG-8841', 'TAG-8802']);
    const count = await pool.query('select count(*)::int as n from broadcast_recipients where broadcast_id = $1', [id]);
    expect(count.rows[0].n).toBe(3);
  });

  it('rejects an unknown audience', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(addBroadcast(shopId, 'Gold'), '23514');
    await addBroadcast(shopId, 'All');
  });

  it('rejects an unknown wish kind and an unknown customer', async () => {
    const { shopId } = await newShop(pool);
    const customerId = await addCustomer(shopId, 1);
    await expectPgError(addWish(shopId, customerId, 'festival'), '23514');
    await expectPgError(addWish(shopId, randomUUID(), 'birthday'), '23503');
    await addWish(shopId, customerId, 'anniversary');
  });

  it('gives a new shop exactly one settings row with the prototype defaults', async () => {
    const { shopId } = await newShop(pool);
    const { rows } = await pool.query(
      `select pricing_enabled, lead_sla_hours, require_edit_token, notify_whatsapp, notify_app, notify_email,
              late_lead_audience, auto_send_wishes
         from settings where shop_id = $1`,
      [shopId],
    );
    expect(rows).toEqual([
      {
        pricing_enabled: false,
        lead_sla_hours: 8,
        require_edit_token: true,
        notify_whatsapp: true,
        notify_app: true,
        notify_email: false,
        late_lead_audience: 'staff_then_owner',
        auto_send_wishes: false,
      },
    ]);
    await expectPgError(pool.query('insert into settings (shop_id) values ($1)', [shopId]), '23505');
  });

  it('rejects an unknown late-lead audience and a zero SLA', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(
      pool.query(`update settings set late_lead_audience = 'everyone' where shop_id = $1`, [shopId]),
      '23514',
    );
    await expectPgError(pool.query('update settings set lead_sla_hours = 0 where shop_id = $1', [shopId]), '23514');
  });
});
