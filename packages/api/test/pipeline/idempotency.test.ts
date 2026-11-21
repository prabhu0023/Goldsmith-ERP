import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { deleteExpiredIdempotencyRecords } from '../../src/pipeline/idempotency.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, SERVER_NOW, startHarness } from '../support/api-harness.js';

describeDb('idempotent creates (EP-03-S8)', () => {
  let h: Harness;
  let deepakSession: string;

  beforeAll(async () => {
    h = await startHarness({ poolSize: 25 });
    const deepak = await newUser(h.pool, h.shop, { name: 'Deepak Rao', role: 'staff' });
    deepakSession = await newSession(h.pool, h.shop, deepak);
    await addKarigar(h.pool, h.shop, 'KG-04');
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(() => {
    h.captured.length = 0;
  });

  const lead = (customerName: string) => ({ customerName, items: [{ name: 'Chain', qty: 1 }] });
  const leadsNamed = async (customerName: string) =>
    (
      await h.pool.query<{ code: string }>('select code from leads where shop_id = $1 and customer_name = $2', [
        h.shop.shopId,
        customerName,
      ])
    ).rows.map((r) => r.code);
  const recordsFor = async (key: string) =>
    (
      await h.pool.query<{ operation: string; user_id: string; result_id: string | null; expires_at: Date }>(
        'select operation, user_id, result_id, expires_at from idempotency_records where shop_id = $1 and key = $2 order by operation, user_id',
        [h.shop.shopId, key],
      )
    ).rows;

  it('AC1: the same request twice with key k-123 creates one lead and both answers carry its id', async () => {
    const first = await h.call('createLead', lead('Twice'), { session: h.session, idempotencyKey: 'k-123' });
    const second = await h.call('createLead', lead('Twice'), { session: h.session, idempotencyKey: 'k-123' });
    expect(first.status).toBe(200);
    expect(second).toEqual(first);
    expect(await leadsNamed('Twice')).toEqual([first.body.id]);
    // The replay never reached the service function.
    expect(h.captured).toHaveLength(1);
    const records = await recordsFor('k-123');
    expect(records).toEqual([
      {
        operation: 'createLead',
        user_id: h.userId,
        result_id: first.body.id,
        expires_at: new Date(SERVER_NOW.getTime() + 24 * 3600_000),
      },
    ]);
  });

  it.each([2, 10])('AC2: %i parallel requests with one key create one lead and all answer the same id', async (n) => {
    const key = `k-parallel-${n}`;
    const name = `Parallel ${n}`;
    const results = await Promise.all(
      Array.from({ length: n }, () => h.call('createLead', lead(name), { session: h.session, idempotencyKey: key })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(n).fill(200));
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(1);
    expect(await leadsNamed(name)).toEqual([...ids]);
  });

  it('AC3: the key is scoped by caller and operation', async () => {
    const rajesh = await h.call('createLead', lead('Scoped'), { session: h.session, idempotencyKey: 'k-scope' });
    const deepak = await h.call('createLead', lead('Scoped'), { session: deepakSession, idempotencyKey: 'k-scope' });
    expect(rajesh.status).toBe(200);
    expect(deepak.status).toBe(200);
    expect(deepak.body.id).not.toBe(rajesh.body.id);
    expect((await leadsNamed('Scoped')).sort()).toEqual([rajesh.body.id, deepak.body.id].sort());

    const parcel = await h.call('recordParcelArrival', { karigarCode: 'KG-04' }, { session: h.session, idempotencyKey: 'k-scope' });
    expect(parcel.status).toBe(200);
    expect(parcel.body.id).toMatch(/^BATCH-2026-\d{3}$/);
    const { rows } = await h.pool.query('select 1 from parcels where shop_id = $1 and code = $2', [h.shop.shopId, parcel.body.id]);
    expect(rows).toHaveLength(1);
    expect((await recordsFor('k-scope')).map((r) => r.operation).sort()).toEqual(['createLead', 'createLead', 'recordParcelArrival']);
  });

  it('AC4: a refused first request stores nothing, so a retry with the same key runs again', async () => {
    const refused = await h.call('createLead', { customerName: 'Retry', items: [] }, { session: h.session, idempotencyKey: 'k-retry' });
    expect(refused).toEqual({ status: 422, body: { code: 'rule_refused', message: 'Add at least one item.' } });
    expect(await recordsFor('k-retry')).toEqual([]);

    const again = await h.call('createLead', { customerName: 'Retry', items: [] }, { session: h.session, idempotencyKey: 'k-retry' });
    expect(again.status).toBe(422);
    expect(h.captured).toHaveLength(2);

    const corrected = await h.call('createLead', lead('Retry'), { session: h.session, idempotencyKey: 'k-retry' });
    expect(corrected.status).toBe(200);
    expect(h.captured).toHaveLength(3);
    expect(await leadsNamed('Retry')).toEqual([corrected.body.id]);
    expect((await recordsFor('k-retry')).map((r) => r.result_id)).toEqual([corrected.body.id]);
  });

  it('AC5: cleanup removes expired records and keeps live ones', async () => {
    const insert = (key: string, expiresAt: Date) =>
      h.pool.query(
        `insert into idempotency_records (shop_id, key, operation, user_id, result_id, created_at, expires_at)
         values ($1, $2, 'createLead', $3, 'LD-2026-900', $4, $5)`,
        [h.shop.shopId, key, h.userId, new Date(expiresAt.getTime() - 24 * 3600_000), expiresAt],
      );
    await insert('k-expired', new Date(SERVER_NOW.getTime() - 60_000));
    await insert('k-fresh', new Date(SERVER_NOW.getTime() + 60_000));
    expect(await deleteExpiredIdempotencyRecords(h.pool, SERVER_NOW)).toBeGreaterThanOrEqual(1);
    expect(await recordsFor('k-expired')).toEqual([]);
    expect(await recordsFor('k-fresh')).toHaveLength(1);
  });

  it.each(['', 'x'.repeat(201), 'tab\there'])('refuses an invalid Idempotency-Key %j as validation', async (key) => {
    const res = await h.call('createLead', lead('Bad key'), { session: h.session, idempotencyKey: key });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field: 'Idempotency-Key' });
    expect(h.captured).toHaveLength(0);
    expect(await leadsNamed('Bad key')).toEqual([]);
  });

  it('ignores the header on an operation that is not a create', async () => {
    const res = await h.call('readParcel', { parcelId: 'BATCH-2026-404' }, { session: h.session, idempotencyKey: '' });
    expect(res.status).toBe(404);
  });
});
