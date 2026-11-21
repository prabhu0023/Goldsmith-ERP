import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { productionJobs } from '../../src/jobs/production-jobs.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { addCustomer, addKarigarJob, addLead, makeScheduler, manualClock, newJobsShop, runsOf } from './job-test-helpers.js';

/** EP-10-S11: after downtime, missed runs happen on start, and old days are not replayed. */
describeDb('catch-up after downtime (EP-10-S11)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  /** A fresh api process: a new scheduler instance running the production jobs. */
  const startApi = (shop: TestShop, clock: ReturnType<typeof manualClock>) =>
    makeScheduler(pool, clock, shop, productionJobs);
  const outbox = async (shop: TestShop, topic: string) =>
    (
      await pool.query<{ payload: Record<string, unknown> }>(
        'select payload from outbox_events where shop_id = $1 and topic = $2 order by created_at, id',
        [shop.shopId, topic],
      )
    ).rows.map((r) => r.payload);
  const breachedAt = async (shop: TestShop, id: string): Promise<Date | null> =>
    (await pool.query<{ sla_breached_at: Date | null }>('select sla_breached_at from leads where shop_id = $1 and id = $2', [
      shop.shopId,
      id,
    ])).rows[0].sla_breached_at;
  const autoSend = (shop: TestShop) => pool.query('update settings set auto_send_wishes = true where shop_id = $1', [shop.shopId]);

  it('S11 AC1: down 16:30-17:20, the lead is marked late on start with the breach time 17:00', async () => {
    const shop = await newJobsShop(pool);
    const id = await addLead(pool, shop, { code: 'LD-2026-921', arrivedAt: '2026-11-01T09:00:00Z' });
    const clock = manualClock('2026-11-01T16:30:00Z');
    await startApi(shop, clock).tick();
    expect(await breachedAt(shop, id)).toBeNull();
    clock.set('2026-11-01T17:20:00Z');
    await startApi(shop, clock).tick();
    expect(await breachedAt(shop, id)).toEqual(new Date('2026-11-01T17:00:00Z'));
    expect(await outbox(shop, 'lead.sla_passed')).toHaveLength(1);
  });

  it('S11 AC2: down 08:50-09:40 Asia/Kolkata, the wishes run happens once on start', async () => {
    const shop = await newJobsShop(pool);
    await autoSend(shop);
    await addCustomer(pool, shop, { code: 'CU-921', name: 'Priya Malhotra', phone: '+91 98100 00921', dob: '1990-11-01' });
    const clock = manualClock('2026-11-01T03:20:00Z');
    await startApi(shop, clock).tick();
    expect(await outbox(shop, 'wishes.run_requested')).toEqual([]);
    clock.set('2026-11-01T04:10:00Z');
    const api = startApi(shop, clock);
    await api.tick();
    clock.advance(60_000);
    await api.tick();
    expect(await outbox(shop, 'wishes.run_requested')).toEqual([
      { date: '2026-11-01', items: [{ customerId: 'CU-921', kind: 'birthday' }] },
    ]);
  });

  it('S11 AC3: down from 31 Oct to 3 Nov 10:00, only the 3 Nov wishes run happens', async () => {
    const shop = await newJobsShop(pool);
    await autoSend(shop);
    const clock = manualClock('2026-10-31T03:30:00Z');
    const before = startApi(shop, clock);
    await before.tick();
    clock.set('2026-10-31T04:00:00Z');
    await before.tick();
    clock.set('2026-11-03T04:30:00Z');
    await startApi(shop, clock).tick();
    const rows = await pool.query<{ run_key: string; status: string }>(
      `select run_key, status from pending_jobs where shop_id = $1 and job_name = 'wishes-9am' order by run_key`,
      [shop.shopId],
    );
    expect(rows.rows).toEqual([
      { run_key: '2026-10-31', status: 'done' },
      { run_key: '2026-11-01', status: 'skipped' },
      { run_key: '2026-11-03', status: 'done' },
    ]);
    const runs = await runsOf(pool, shop, 'wishes-9am');
    expect(runs.map((r) => r.scheduled_at)).toEqual([new Date('2026-10-31T03:30:00Z'), new Date('2026-11-03T03:30:00Z')]);
    expect((await outbox(shop, 'wishes.run_requested')).map((p) => p.date)).toEqual(['2026-10-31', '2026-11-03']);
  });

  it("S11 AC4: a missed 00:05 overdue run happens once on start, for today", async () => {
    const shop = await newJobsShop(pool);
    await addKarigarJob(pool, shop, { code: 'MO-2026-118', dueDate: '2026-10-30T12:00:00+05:30', karigarCode: 'KG-07' });
    // Last seen at 23:00 Asia/Kolkata on 1 Nov; back at 10:00 on 2 Nov.
    const clock = manualClock('2026-11-01T17:30:00Z');
    const before = startApi(shop, clock);
    await before.tick();
    clock.advance(60_000);
    await before.tick();
    clock.set('2026-11-02T04:30:00Z');
    const api = startApi(shop, clock);
    await api.tick();
    clock.advance(60_000);
    await api.tick();
    const reminders = await outbox(shop, 'notify.karigar_job_overdue_reminder');
    expect(reminders.filter((r) => r.date === '2026-11-02')).toHaveLength(1);
    const runs = await runsOf(pool, shop, 'karigar-overdue');
    expect(runs.map((r) => r.scheduled_at)).toEqual([new Date('2026-10-31T18:35:00Z'), new Date('2026-11-01T18:35:00Z')]);
  });

  it('S11 AC5: a lead worked during the downtime is not marked late', async () => {
    const shop = await newJobsShop(pool);
    const id = await addLead(pool, shop, { code: 'LD-2026-922', arrivedAt: '2026-11-01T09:00:00Z' });
    const clock = manualClock('2026-11-01T16:30:00Z');
    await startApi(shop, clock).tick();
    await pool.query(`update leads set state = 'being_worked' where id = $1`, [id]);
    clock.set('2026-11-01T17:20:00Z');
    await startApi(shop, clock).tick();
    expect(await breachedAt(shop, id)).toBeNull();
    expect(await outbox(shop, 'lead.sla_passed')).toEqual([]);
  });
});
