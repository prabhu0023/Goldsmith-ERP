import { randomUUID } from 'node:crypto';
import { gramsToUnits } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  addKarigar,
  addPiece,
  addStoredFile,
  describeDb,
  expectPgError,
  newShop,
  type TestShop,
  testPool,
} from './db-test-helpers.js';

const units = (g: string) => {
  const r = gramsToUnits(g);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};

describeDb('order copies and karigar jobs (EP-02-S8)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addJob = async (shop: TestShop, status = 'sent') => {
    const karigarId = await addKarigar(pool, shop);
    const res = await pool.query<{ id: string }>(
      `insert into karigar_jobs (shop_id, code, karigar_id, status, target_gross_units, target_net_units,
         tolerance_units, gold_issued_units)
       values ($1, 'MO-2026-118', $2, $3, $4, $5, $6, $7) returning id`,
      [shop.shopId, karigarId, status, units('84.5'), units('78.4'), units('0.5'), units('80.0')],
    );
    return { jobId: res.rows[0].id, karigarId };
  };

  it('rejects an unknown job status', async () => {
    await expectPgError(addJob(await newShop(pool), 'done'), '23514');
  });

  it('stores job targets and issued gold as integer units', async () => {
    const shop = await newShop(pool);
    const { jobId } = await addJob(shop);
    const { rows } = await pool.query(
      `select target_gross_units, target_net_units, tolerance_units, gold_issued_units, version
         from karigar_jobs where id = $1`,
      [jobId],
    );
    expect(rows[0]).toEqual({
      target_gross_units: 845000,
      target_net_units: 784000,
      tolerance_units: 5000,
      gold_issued_units: 800000,
      version: 1,
    });
  });

  it('links an order copy to its job, karigar, lead and lead item, with reference attachments in order', async () => {
    const shop = await newShop(pool);
    const { jobId, karigarId } = await addJob(shop);
    const lead = await pool.query<{ id: string }>(
      `insert into leads (shop_id, code, source) values ($1, 'LD-1', 'counter') returning id`,
      [shop.shopId],
    );
    const item = await pool.query<{ id: string }>(
      `insert into lead_items (shop_id, lead_id, position, route_kind, route_job_id) values ($1, $2, 0, 'make', $3) returning id`,
      [shop.shopId, lead.rows[0].id, jobId],
    );
    const insertCopy = (leadId: string | null, leadItemId: string | null, code: string) =>
      pool.query<{ id: string }>(
        `insert into order_copies (shop_id, code, lead_id, lead_item_id, job_id, karigar_id, target_gross_units,
           target_net_units, tolerance_units, gold_issued_units)
         values ($1, $2, $3, $4, $5, $6, 845000, 784000, 5000, 800000) returning id`,
        [shop.shopId, code, leadId, leadItemId, jobId, karigarId],
      );
    const copy = (await insertCopy(lead.rows[0].id, item.rows[0].id, 'OC-1')).rows[0].id;
    await insertCopy(null, null, 'OC-2');
    await expectPgError(insertCopy(randomUUID(), null, 'OC-3'), '23503');
    await pool.query('update karigar_jobs set order_copy_id = $1 where id = $2', [copy, jobId]);
    const [a, b] = [await addStoredFile(pool, shop, 'FILE-2026-00001'), await addStoredFile(pool, shop, 'FILE-2026-00002')];
    await pool.query(
      `insert into attachments (shop_id, code, file_id, owner_type, order_copy_id, role, position, attached_by_name, attached_at)
       values ($1, 'AT-2026-00001', $3, 'order_copy', $2, 'reference', 2, 'Test', now()),
              ($1, 'AT-2026-00002', $4, 'order_copy', $2, 'reference', 1, 'Test', now())`,
      [shop.shopId, copy, b, a],
    );
    const { rows } = await pool.query(
      `select f.code from attachments t join stored_files f on f.id = t.file_id
        where t.order_copy_id = $1 order by t.position`,
      [copy],
    );
    expect(rows.map((r) => r.code)).toEqual(['FILE-2026-00001', 'FILE-2026-00002']);
  });

  it('rejects a parcel, piece or make route pointing at an unknown job', async () => {
    const shop = await newShop(pool);
    const karigarId = await addKarigar(pool, shop);
    await expectPgError(
      pool.query(
        `insert into parcels (shop_id, location_id, code, karigar_id, job_id) values ($1, $2, 'B-1', $3, $4)`,
        [shop.shopId, shop.locationId, karigarId, randomUUID()],
      ),
      '23503',
    );
    const pieceId = await addPiece(pool, shop, 'TAG-1');
    await expectPgError(pool.query('update pieces set job_id = $1 where id = $2', [randomUUID(), pieceId]), '23503');
    const lead = await pool.query<{ id: string }>(
      `insert into leads (shop_id, code, source) values ($1, 'LD-1', 'counter') returning id`,
      [shop.shopId],
    );
    await expectPgError(
      pool.query(
        `insert into lead_items (shop_id, lead_id, position, route_kind, route_job_id) values ($1, $2, 0, 'make', $3)`,
        [shop.shopId, lead.rows[0].id, randomUUID()],
      ),
      '23503',
    );
  });
});
