/**
 * EP-18-S12: every pool posting records `metal_pool.changed` in its own transaction. After the
 * commit the owner and staff streams receive "Metal pool changed" (entity id metal-pool, the
 * pool's version, no weight); a karigar stream receives nothing; a posting that rolls back emits
 * nothing. Same harness as user-list-changed.test.ts.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadShopContext } from '../../src/db/shop-context.js';
import { postIssue } from '../../src/pool/post-issue.js';
import { describeDb } from '../db/db-test-helpers.js';
import { inTransaction, type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from '../live/live-test-helpers.js';
import { addPoolJob } from './pool-api-helpers.js';
const NAME = 'Metal pool changed';
type Person = { id: string; token: string };
describeDb('EP-18-S12 metal_pool.changed reaches the shop floor, not the karigar', () => {
  let h: LiveHarness;
  let sanjay: Person;
  let rajesh: Person;
  let lakshmi: Person;
  let ownerStream: LiveTestClient;
  let staffStream: LiveTestClient;
  let karigarStream: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    sanjay = await h.user('Sanjay Seth', 'owner');
    rajesh = await h.user('Rajesh Verma', 'staff');
    lakshmi = await h.user('Lakshmi Devi', 'karigar');
    ownerStream = await h.connect(sanjay.token);
    staffStream = await h.connect(rajesh.token);
    karigarStream = await h.connect(lakshmi.token);
  });
  afterAll(async () => {
    await h?.close();
  });
  const poolEvents = (c: LiveTestClient) => c.events().filter((e) => e.name === NAME);
  const poolVersion = async () =>
    (await h.pool.query<{ version: number }>('select version from metal_pools where shop_id = $1', [h.shop.shopId])).rows[0].version;
  const outboxCount = async () =>
    Number(
      (await h.pool.query('select count(*) from outbox_events where shop_id = $1 and topic = $2', [h.shop.shopId, 'metal_pool.changed']))
        .rows[0].count,
    );
  const reached = (c: LiveTestClient, version: number) =>
    c.waitFor((m) => m.type === 'event' && m.event.name === NAME && m.event.entityVersion === version, 2_000);
  it('AC1: after an opening entry commits, owner and staff streams get the event with the pool version; the karigar gets nothing', async () => {
    const res = await h.call('createOpeningEntry', { amountG: '812.5800' }, sanjay.token);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const version = await poolVersion();
    await reached(ownerStream, version);
    await reached(staffStream, version);
    for (const stream of [ownerStream, staffStream]) {
      expect(poolEvents(stream).at(-1)).toMatchObject({ entityType: 'metal_pool', entityId: 'metal-pool', entityVersion: version });
    }
    expect(JSON.stringify(poolEvents(ownerStream))).not.toMatch(/812|8125800/);
    await sleep(200);
    expect(karigarStream.events().filter((e) => e.entityType === 'metal_pool')).toEqual([]);
    expect(await outboxCount()).toBe(1);
  });
  it('AC2: a return and an adjustment each emit one event with the next version', async () => {
    const karigarId = (await h.pool.query<{ karigar_id: string }>('select karigar_id from users where id = $1', [lakshmi.id])).rows[0].karigar_id;
    await addPoolJob(h.pool, h.shop, { code: 'MO-2026-118', karigarId, issuedUnits: 340000 });
    const before = await outboxCount();
    expect((await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, sanjay.token)).status).toBe(200);
    await reached(staffStream, await poolVersion());
    expect((await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-0.4000', reason: 'Safe recount 2 Nov' }, sanjay.token)).status).toBe(200);
    const version = await poolVersion();
    await reached(ownerStream, version);
    await reached(staffStream, version);
    expect(await outboxCount()).toBe(before + 2);
    await sleep(200);
    expect(karigarStream.events().filter((e) => e.entityType === 'metal_pool')).toEqual([]);
  });
  it('AC3: a posting that is refused rolls back and emits nothing', async () => {
    const before = await outboxCount();
    const seen = poolEvents(ownerStream).length;
    const version = await poolVersion();
    const second = await h.call('createOpeningEntry', { amountG: '5.0000' }, sanjay.token);
    expect(second).toMatchObject({ status: 422, body: { code: 'opening_exists' } });
    const tooMuch = await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-9999.0000', reason: 'Too much' }, sanjay.token);
    expect(tooMuch).toMatchObject({ status: 422, body: { code: 'pool_insufficient' } });
    await sleep(300);
    expect(await outboxCount()).toBe(before);
    expect(await poolVersion()).toBe(version);
    expect(poolEvents(ownerStream)).toHaveLength(seen);
    expect(poolEvents(staffStream).map((e) => e.entityVersion)).not.toContain(version + 1);
  });
  it('AC5: a posting through postIssue in a test transaction reaches owner and staff, not the karigar', async () => {
    const before = await outboxCount();
    const ctx = await loadShopContext(h.pool, h.shop.shopId);
    await inTransaction(h.pool, (tx) =>
      postIssue(tx, { by: { id: sanjay.id, name: 'Sanjay Seth', role: 'owner' }, at: h.clock.now(), shop: ctx }, { jobCode: 'MO-2026-122', amountUnits: 1624000 }),
    );
    const version = await poolVersion();
    await reached(ownerStream, version);
    await reached(staffStream, version);
    expect(await outboxCount()).toBe(before + 1);
    await sleep(200);
    expect(karigarStream.events().filter((e) => e.entityType === 'metal_pool')).toEqual([]);
  });
  it('AC5: a transaction that throws after postIssue leaves no event and no entry', async () => {
    const before = await outboxCount();
    const entries = Number((await h.pool.query('select count(*) from pool_entries where shop_id = $1', [h.shop.shopId])).rows[0].count);
    const ctx = await loadShopContext(h.pool, h.shop.shopId);
    await expect(
      inTransaction(h.pool, async (tx) => {
        await postIssue(tx, { by: { id: sanjay.id, name: 'Sanjay Seth', role: 'owner' }, at: h.clock.now(), shop: ctx }, { jobCode: 'MO-2026-123', amountUnits: 10000 });
        throw new Error('rolled back on purpose');
      }),
    ).rejects.toThrow('rolled back on purpose');
    await sleep(300);
    expect(await outboxCount()).toBe(before);
    expect(Number((await h.pool.query('select count(*) from pool_entries where shop_id = $1', [h.shop.shopId])).rows[0].count)).toBe(entries);
  });
});
