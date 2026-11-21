import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, leaksIn, startHarness } from '../support/api-harness.js';

describeDb('request validation at the trust boundary (EP-03-S2, S5 AC3)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ maxBodyBytes: 1024 });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    h.captured.length = 0;
  });

  const leadCount = async () =>
    Number((await h.pool.query('select count(*) from leads where shop_id = $1', [h.shop.shopId])).rows[0].count);
  const grossOf = async (tag: string) =>
    (await h.pool.query('select gross_units, version from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, tag]))
      .rows[0];

  it('AC1: createLead without customerName answers validation naming the field and writes no lead', async () => {
    const before = await leadCount();
    const res = await h.call('createLead', { items: [{ name: 'Ring', qty: 1 }] }, { session: h.session });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'validation', field: 'customerName', message: 'customerName is required.' });
    expect(h.captured).toEqual([]);
    expect(await leadCount()).toBe(before);
  });

  it('names a nested field by its path', async () => {
    const res = await h.call(
      'createLead',
      { customerName: 'Meena', items: [{ name: 'Ring', qty: 0 }] },
      { session: h.session },
    );
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('items.0.qty');
    expect(String(res.body.message)).toMatch(/^items\.0\.qty is not valid: /);
  });

  it.each(['12.34567', '12,3a'])('AC2: grossG "%s" is refused, never rounded, and the piece is unchanged', async (grossG) => {
    await addPiece(h.pool, h.shop, `TAG-V-${grossG}`, { grossUnits: 486500 });
    const res = await h.call('setPieceGross', { pieceId: `TAG-V-${grossG}`, grossG, version: 1 }, { session: h.session });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'validation',
      field: 'grossG',
      message: 'grossG is not valid: Enter grams with up to four decimals, e.g. 12.3456',
    });
    expect(h.captured).toEqual([]);
    expect(await grossOf(`TAG-V-${grossG}`)).toEqual({ gross_units: 486500, version: 1 });
  });

  it('AC2: a negative grossG is refused naming the field, and the piece is unchanged', async () => {
    await addPiece(h.pool, h.shop, 'TAG-V-NEG', { grossUnits: 486500 });
    const res = await h.call('setPieceGross', { pieceId: 'TAG-V-NEG', grossG: '-1.0000', version: 1 }, { session: h.session });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'validation', field: 'grossG', message: 'grossG is not valid: Weight cannot be negative' });
    expect(h.captured).toEqual([]);
    expect(await grossOf('TAG-V-NEG')).toEqual({ gross_units: 486500, version: 1 });
  });
  it('AC2: grossG "0" is accepted as zero units', async () => {
    await addPiece(h.pool, h.shop, 'TAG-V-ZERO');
    const res = await h.call('setPieceGross', { pieceId: 'TAG-V-ZERO', grossG: '0', version: 1 }, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await grossOf('TAG-V-ZERO')).toEqual({ gross_units: 0, version: 2 });
  });
  it('AC2: grossG sent as a JSON number is refused', async () => {
    await addPiece(h.pool, h.shop, 'TAG-V-NUM');
    const res = await h.call('setPieceGross', { pieceId: 'TAG-V-NUM', grossG: 12.34, version: 1 }, { session: h.session });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('grossG');
  });

  it('AC2: grossG "12.3456" is stored as 123456 units', async () => {
    await addPiece(h.pool, h.shop, 'TAG-V-OK');
    const res = await h.call('setPieceGross', { pieceId: 'TAG-V-OK', grossG: '12.3456', version: 1 }, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(h.captured[0].input).toEqual({ pieceId: 'TAG-V-OK', grossG: 123456, version: 1 });
    expect(await grossOf('TAG-V-OK')).toEqual({ gross_units: 123456, version: 2 });
  });

  it('AC3: fields not in the contract (by, status) never reach the service function', async () => {
    await addPiece(h.pool, h.shop, 'TAG-V-EXTRA');
    const res = await h.call(
      'updatePieceNote',
      { pieceId: 'TAG-V-EXTRA', version: 1, note: 'hi', by: 'Sanjay Seth', status: 'billed', shopId: 'x' },
      { session: h.session },
    );
    expect(res.status).toBe(200);
    expect(h.captured[0].input).toEqual({ pieceId: 'TAG-V-EXTRA', version: 1, note: 'hi' });
    const row = (await h.pool.query('select status from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, 'TAG-V-EXTRA']))
      .rows[0];
    expect(row.status).toBe('in_stock');
  });

  it('AC4: a body larger than the maximum is refused before parsing; the service function is not called', async () => {
    const big = JSON.stringify({ customerName: 'x'.repeat(2000), items: [{ name: 'Ring', qty: 1 }] });
    const res = await h.call('createLead', big, { session: h.session });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ code: 'validation', field: 'body', message: 'The request is too large.' });
    expect(h.captured).toEqual([]);
  });

  it('refuses a body that is not valid JSON', async () => {
    const res = await h.call('createLead', '{"customerName": ', { session: h.session });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'validation', field: 'body', message: 'The request body is not valid JSON.' });
    expect(leaksIn(res.body)).toEqual([]);
  });

  it.each(['rememberScale', 'deleteEverything', 'toString', '__proto__'])(
    'AC5: operation %s is not in the contract: not_found, no code runs',
    async (name) => {
      const res = await h.call(name, {}, { session: h.session });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'not_found', message: `There is no operation named ${name}.` });
      expect(h.captured).toEqual([]);
    },
  );
});
