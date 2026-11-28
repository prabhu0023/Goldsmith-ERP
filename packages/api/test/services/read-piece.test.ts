/** readPiece (EP-08, FU-013): a permission-checked read of one piece by tag number. */
import { createLiveEntityCache, type LiveEnvelope } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, describeDb, newShop } from '../db/db-test-helpers.js';
import { type LiveHarness, startLiveHarness } from '../live/live-test-helpers.js';

const TAG = 'TAG-8841';

describeDb('readPiece (EP-08, FU-013)', () => {
  let h: LiveHarness;
  let rajesh: string;
  let sanjay: string;
  let lakshmi: string;
  beforeAll(async () => {
    h = await startLiveHarness({ start: false });
    rajesh = (await h.user('Rajesh Verma', 'staff')).token;
    sanjay = (await h.user('Sanjay Seth', 'owner')).token;
    lakshmi = (await h.user('Lakshmi Devi', 'karigar')).token;
    await h.pool.query(
      `insert into pieces (shop_id, location_id, tag_no, name, kind, collection, style, purity, huid, gross_units,
                           stone_units, stone_count, size, status, in_stock_at, note)
       values ($1, $2, $3, 'Test piece', 'Chain', 'Temple', 'Rope', '22K', 'AB1234', 486500, 70600, 3, '18 in',
               'in_stock', '2026-11-20T04:30:00.000Z', 'Clasp checked')`,
      [h.shop.shopId, h.shop.locationId, TAG],
    );
  });
  afterAll(async () => {
    await h?.close();
  });

  it('answers the piece for staff and owner, with weights as strings and no price', async () => {
    const expected = {
      ok: true,
      piece: {
        tagNo: TAG,
        name: 'Test piece',
        kind: 'Chain',
        collection: 'Temple',
        style: 'Rope',
        purity: '22K',
        huid: 'AB1234',
        grossG: '48.6500',
        stoneG: '7.0600',
        stoneCount: 3,
        size: '18 in',
        status: 'in_stock',
        version: 1,
        inStockAt: '2026-11-20T04:30:00.000Z',
        soldAt: null,
        note: 'Clasp checked',
      },
    };
    expect(await h.call('readPiece', { tagNo: TAG }, rajesh)).toEqual({ status: 200, body: expected });
    expect(await h.call('readPiece', { tagNo: TAG }, sanjay)).toEqual({ status: 200, body: expected });
  });

  it('answers not_found for an unknown tag and for another shop\'s tag', async () => {
    const other = await newShop(h.pool, 'Another shop');
    await addPiece(h.pool, other, 'TAG-OTHER-1');
    for (const tagNo of ['TAG-0000', 'TAG-OTHER-1']) {
      const res = await h.call('readPiece', { tagNo }, rajesh);
      expect(res.status, tagNo).toBe(404);
      expect(res.body.code).toBe('not_found');
    }
  });

  it('refuses a karigar with the shop-floor sentence', async () => {
    expect(await h.call('readPiece', { tagNo: TAG }, lakshmi)).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'A karigar can only work on their own jobs.' },
    });
  });

  it('shows a billed piece as billed with its new version, and the cache fed through it drops it from stock (EP-07-S11 AC4)', async () => {
    await addPiece(h.pool, h.shop, 'TAG-8852');
    const read = async (_type: string, id: string) => {
      const res = await h.call('readPiece', { tagNo: id }, rajesh);
      const piece = (res.body as { piece?: { tagNo: string; version: number; status: string } }).piece;
      return piece ?? null;
    };
    const cache = createLiveEntityCache({ fetchEntity: read });
    cache.put('piece', 'TAG-8852', { tagNo: 'TAG-8852', version: 1, status: 'in_stock' });
    const inStock = () => cache.values('piece').filter((p) => p.status === 'in_stock').map((p) => p.tagNo);
    expect(inStock()).toEqual(['TAG-8852']);

    await h.pool.query(`update pieces set status = 'billed' where shop_id = $1 and tag_no = $2`, [h.shop.shopId, 'TAG-8852']);
    const billed = await h.call('readPiece', { tagNo: 'TAG-8852' }, rajesh);
    expect(billed.body).toMatchObject({ ok: true, piece: { tagNo: 'TAG-8852', status: 'billed', version: 2 } });

    const event = { entityType: 'piece', entityId: 'TAG-8852', entityVersion: 2 } as LiveEnvelope;
    expect(await cache.apply(event)).toBe(true);
    expect(inStock()).toEqual([]);
  });
});
