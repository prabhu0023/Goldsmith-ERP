import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { wishesJob } from '../../src/jobs/handlers/wishes-9am.js';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { addCustomer, makeScheduler, manualClock, newJobsShop, runsOf } from './job-test-helpers.js';

/** 09:00 Asia/Kolkata on 1 November 2026. */
const NINE_IST = '2026-11-01T03:30:00Z';

/** EP-10-S9: start the 9 am wishes run when auto-send is on. */
describeDb('9 am wishes run (EP-10-S9)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const autoSend = (shop: TestShop, on: boolean) =>
    pool.query('update settings set auto_send_wishes = $2 where shop_id = $1', [shop.shopId, on]);
  const handOvers = async (shop: TestShop) =>
    (
      await pool.query<{ payload: { date: string; items: Array<{ customerId: string; kind: string }> } }>(
        `select payload from outbox_events where shop_id = $1 and topic = 'wishes.run_requested' order by created_at`,
        [shop.shopId],
      )
    ).rows.map((r) => r.payload);
  const addPriya = (shop: TestShop) =>
    addCustomer(pool, shop, { code: 'CU-901', name: 'Priya Malhotra', phone: '+91 98100 00901', dob: '1990-11-01' });

  it("S9 AC1: at 09:00 Asia/Kolkata (03:30 UTC) the day's queue, with Priya's birthday, is handed over once", async () => {
    const shop = await newJobsShop(pool);
    await autoSend(shop, true);
    await addPriya(shop);
    await addCustomer(pool, shop, { code: 'CU-902', phone: '+91 98100 00902', anniversary: '2015-11-01' });
    await addCustomer(pool, shop, { code: 'CU-903', phone: '+91 98100 00903', dob: '1988-11-02' });
    const clock = manualClock('2026-11-01T03:29:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [wishesJob]);
    await scheduler.tick();
    expect(await handOvers(shop)).toEqual([]);
    clock.set(NINE_IST);
    await scheduler.tick();
    clock.set('2026-11-01T04:00:00Z');
    await scheduler.tick();
    expect(await handOvers(shop)).toEqual([
      {
        date: '2026-11-01',
        items: [
          { customerId: 'CU-901', kind: 'birthday' },
          { customerId: 'CU-902', kind: 'anniversary' },
        ],
      },
    ]);
  });

  it('S9 AC2: with auto-send off the run is ok and nothing is handed over', async () => {
    const shop = await newJobsShop(pool);
    await addPriya(shop);
    await makeScheduler(pool, manualClock(NINE_IST), shop, [wishesJob]).tick();
    expect(await runsOf(pool, shop, 'wishes-9am')).toEqual([expect.objectContaining({ attempts: 1, result: 'ok' })]);
    expect(await handOvers(shop)).toEqual([]);
  });

  it('S9 AC3: two runs on the same day hand the queue over once (key wishes:<date>)', async () => {
    const poolB = testPool(3);
    try {
      const shop = await newJobsShop(pool);
      await autoSend(shop, true);
      await addPriya(shop);
      const clock = manualClock(NINE_IST);
      const a = makeScheduler(pool, clock, shop, [wishesJob], { workerId: 'worker-a' });
      const b = makeScheduler(poolB, clock, shop, [wishesJob], { workerId: 'worker-b' });
      await Promise.all([a.tick(), b.tick()]);
      // A forced second occurrence carrying the same key.
      await scheduleJob(pool, shop, {
        jobName: 'wishes-9am',
        runKey: '2026-11-01-again',
        dueAt: clock.now(),
        maxAttempts: 3,
        idempotencyKey: 'wishes:2026-11-01',
        now: clock.now(),
      });
      await a.tick();
      expect(await runsOf(pool, shop, 'wishes-9am')).toHaveLength(2);
      expect(await handOvers(shop)).toHaveLength(1);
    } finally {
      await poolB.end();
    }
  });

  it('S9 AC4: on a UTC machine the run still fires at 09:00 Asia/Kolkata, not 09:00 UTC', async () => {
    const savedTz = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const shop = await newJobsShop(pool);
      await autoSend(shop, true);
      await addPriya(shop);
      const clock = manualClock('2026-11-01T03:29:59Z');
      const scheduler = makeScheduler(pool, clock, shop, [wishesJob]);
      await scheduler.tick();
      expect(await runsOf(pool, shop, 'wishes-9am')).toEqual([]);
      clock.set(NINE_IST);
      await scheduler.tick();
      clock.set('2026-11-01T09:00:00Z');
      await scheduler.tick();
      const runs = await runsOf(pool, shop, 'wishes-9am');
      expect(runs).toHaveLength(1);
      expect(runs[0].scheduled_at).toEqual(new Date(NINE_IST));
      expect(await handOvers(shop)).toHaveLength(1);
    } finally {
      if (savedTz === undefined) delete process.env.TZ;
      else process.env.TZ = savedTz;
    }
  });

  it('S9 AC5: consent is not applied here: Ravi Shankar, not opted in, is still in the queue', async () => {
    const shop = await newJobsShop(pool);
    await autoSend(shop, true);
    await addCustomer(pool, shop, {
      code: 'CU-904',
      name: 'Ravi Shankar',
      phone: '+91 98100 00904',
      dob: '1979-11-01',
      optedIn: false,
    });
    await makeScheduler(pool, manualClock(NINE_IST), shop, [wishesJob]).tick();
    expect(await handOvers(shop)).toEqual([{ date: '2026-11-01', items: [{ customerId: 'CU-904', kind: 'birthday' }] }]);
  });
});
