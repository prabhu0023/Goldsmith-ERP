import { randomUUID } from 'node:crypto';
import { gramsToUnits } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('leads, items and fields (EP-02-S7)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addLead = (shopId: string, values: { source?: string; state?: string } = {}) =>
    pool.query<{ id: string }>(
      `insert into leads (shop_id, code, title, source, state) values ($1, 'LD-2026-208', 'Bridal set', $2, $3) returning id`,
      [shopId, values.source ?? 'whatsapp', values.state ?? 'needs_glance'],
    );
  const addItem = (
    shopId: string,
    leadId: string,
    position: number,
    values: { weightUnits?: number | null; kind?: string | null; pieceId?: string | null; jobId?: string | null } = {},
  ) =>
    pool.query<{ id: string }>(
      `insert into lead_items (shop_id, lead_id, position, name, qty, approx_weight_units, route_kind, route_piece_id, route_job_id)
       values ($1, $2, $3, 'Haram', 1, $4, $5, $6, $7) returning id`,
      [
        shopId,
        leadId,
        position,
        values.weightUnits ?? null,
        values.kind ?? null,
        values.pieceId ?? null,
        values.jobId ?? null,
      ],
    );

  it('rejects an unknown source and state', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(addLead(shopId, { source: 'phone' }), '23514');
    await expectPgError(addLead(shopId, { state: 'closed' }), '23514');
  });

  it('stores the approximate weight in units and keeps null as null', async () => {
    const { shopId } = await newShop(pool);
    const lead = (await addLead(shopId)).rows[0].id;
    const parsed = gramsToUnits('45.5');
    if (!parsed.ok) throw new Error(parsed.error);
    await addItem(shopId, lead, 0, { weightUnits: parsed.units });
    await addItem(shopId, lead, 1);
    const { rows } = await pool.query(
      'select approx_weight_units from lead_items where lead_id = $1 order by position',
      [lead],
    );
    expect(rows.map((r) => r.approx_weight_units)).toEqual([455000, null]);
  });

  it('requires a route to name exactly its target', async () => {
    const shop = await newShop(pool);
    const lead = (await addLead(shop.shopId)).rows[0].id;
    await expectPgError(addItem(shop.shopId, lead, 0, { kind: 'stock' }), '23514');
    await expectPgError(addItem(shop.shopId, lead, 0, { kind: 'stock', pieceId: randomUUID() }), '23503');
    const pieceId = await addPiece(pool, shop, 'TAG-8802');
    await expectPgError(addItem(shop.shopId, lead, 0, { kind: 'make', pieceId }), '23514');
    await addItem(shop.shopId, lead, 0, { kind: 'stock', pieceId });
  });

  it('reads parsed fields back in order', async () => {
    const { shopId } = await newShop(pool);
    const lead = (await addLead(shopId)).rows[0].id;
    const keys = ['name', 'phone', 'item', 'weight', 'date'];
    for (const [i, key] of [...keys.entries()].reverse()) {
      await pool.query(
        `insert into lead_fields (shop_id, lead_id, position, field_key, label, value, flagged)
         values ($1, $2, $3, $4, $4, 'x', $5)`,
        [shopId, lead, i, key, key === 'weight'],
      );
    }
    const { rows } = await pool.query('select field_key from lead_fields where lead_id = $1 order by position', [
      lead,
    ]);
    expect(rows.map((r) => r.field_key)).toEqual(keys);
  });

  it('versions leads and items and has no hold column', async () => {
    const leads = await columnsOf(pool, 'leads');
    const items = await columnsOf(pool, 'lead_items');
    expect(leads.version).toMatchObject({ type: 'integer', nullable: false });
    expect(items.version).toMatchObject({ type: 'integer', nullable: false });
    for (const cols of [leads, items, await columnsOf(pool, 'pieces')]) {
      expect(Object.keys(cols).filter((c) => c.includes('held') || c.includes('hold'))).toEqual([]);
    }
    const { shopId } = await newShop(pool);
    const lead = (await addLead(shopId)).rows[0].id;
    await pool.query(`update leads set state = 'opened' where id = $1`, [lead]);
    const { rows } = await pool.query('select version from leads where id = $1', [lead]);
    expect(rows[0].version).toBe(2);
  });
});
