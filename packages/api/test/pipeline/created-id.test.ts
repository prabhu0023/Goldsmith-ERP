import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, SERVER_NOW, startHarness } from '../support/api-harness.js';

describeDb('created ids (EP-03-S7)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ poolSize: 25 });
    await h.pool.query(
      `insert into leads (shop_id, code, source, state, customer_name) values ($1, 'LD-2026-213', 'counter', 'opened', 'Older lead')`,
      [h.shop.shopId],
    );
    await addKarigar(h.pool, h.shop, 'KG-04');
  });

  afterAll(async () => {
    await h.close();
  });

  const lead = { customerName: 'Meera Iyer', items: [{ name: 'Bangle', qty: 2, approxWeightG: '24.5' }] };

  it('AC1: createLead answers exactly {ok: true, id} with the next database-generated code', async () => {
    const res = await h.call('createLead', lead, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'LD-2026-214' } });
    const { rows } = await h.pool.query('select customer_name from leads where shop_id = $1 and code = $2', [
      h.shop.shopId,
      'LD-2026-214',
    ]);
    expect(rows).toEqual([{ customer_name: 'Meera Iyer' }]);
  });

  it('AC2: recordParcelArrival answers the new parcel id, and a read of that id returns the parcel', async () => {
    const res = await h.call('recordParcelArrival', { karigarCode: 'KG-04', poRef: 'PO-77' }, { session: h.session });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: `BATCH-${SERVER_NOW.getUTCFullYear()}-001` });
    const read = await h.call('readParcel', { parcelId: res.body.id }, { session: h.session });
    expect(read).toEqual({
      status: 200,
      body: { ok: true, parcel: { id: res.body.id, poRef: 'PO-77', arrivedAt: SERVER_NOW.toISOString() } },
    });
  });

  it('AC3: 20 parallel creates get 20 distinct ids', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => h.call('createLead', { ...lead, customerName: `Parallel ${i}` }, { session: h.session })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(200));
    const ids = results.map((r) => r.body.id as string);
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toMatch(/^LD-2026-\d{3}$/);
  });

  it('AC4: an operation that is not a create answers {ok: true} with no id', async () => {
    await addPiece(h.pool, h.shop, 'TAG-ID-1');
    const res = await h.call('updatePieceNote', { pieceId: 'TAG-ID-1', version: 1, note: 'Polished' }, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });
});
