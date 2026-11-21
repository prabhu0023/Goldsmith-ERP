import { readFile } from 'node:fs/promises';
import { leadSlaDueAt, MIN } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import {
  leadSlaBreachJob,
  leadSlaTimerAfterTransition,
  leadSlaTimersJob,
  scheduleLeadSlaTimer,
} from '../../src/jobs/handlers/lead-sla.js';
import { productionJobs } from '../../src/jobs/production-jobs.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { markLeadLost } from '../../src/services/mark-lead-lost.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { addLead, makeScheduler, manualClock, newJobsShop, pendingStatus, runsOf } from './job-test-helpers.js';

const leadJobs = [leadSlaTimersJob, leadSlaBreachJob];
const BREACH = 'lead-sla-breach';

interface LeadSlaRow {
  state: string;
  sla_breached_at: Date | null;
  sla_breach_notified: boolean;
}

/** EP-10-S5 (mark a lead late when its SLA passes) and S6 (cancel the timer when it is worked). */
describeDb('lead SLA timers (EP-10-S5, S6)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const leadRow = async (shop: TestShop, id: string): Promise<LeadSlaRow> =>
    (
      await pool.query<LeadSlaRow>(
        'select state, sla_breached_at, sla_breach_notified from leads where shop_id = $1 and id = $2',
        [shop.shopId, id],
      )
    ).rows[0];
  const lateEvents = async (shop: TestShop) =>
    (
      await pool.query<{ payload: Record<string, unknown>; created_at: Date }>(
        `select payload, created_at from outbox_events where shop_id = $1 and topic = 'lead.sla_passed' order by created_at`,
        [shop.shopId],
      )
    ).rows;
  /** Change the lead's state the way a service does: in one transaction with the timer call. */
  const transition = (shop: TestShop, id: string, state: 'opened' | 'being_worked', fail = false) =>
    withTransaction(pool, async (client) => {
      await client.query('update leads set state = $3 where shop_id = $1 and id = $2', [shop.shopId, id, state]);
      await leadSlaTimerAfterTransition(client, shop, { leadId: id, state });
      if (fail) throw new Error('the transition failed after the cancel');
    });

  it('lists the five production jobs', () => {
    expect(productionJobs.map((j) => j.name)).toEqual([
      'lead-sla-timers',
      'lead-sla-breach',
      'karigar-overdue',
      'edit-token-expiry',
      'wishes-9am',
    ]);
  });

  it('S5 AC1 / S2 AC1: a needs_glance lead from 09:00 is marked late at 17:00, once, with one event', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-901', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('pending');
    clock.set('2026-11-01T16:59:00Z');
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toBeNull();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    clock.set('2026-11-01T17:01:00Z');
    await scheduler.tick();
    expect(await leadRow(shop, id)).toEqual({
      state: 'needs_glance',
      sla_breached_at: new Date('2026-11-01T17:00:00Z'),
      sla_breach_notified: true,
    });
    const events = await lateEvents(shop);
    expect(events.map((e) => e.payload)).toEqual([{ leadId: 'LD-2026-901', slaBreachedAt: '2026-11-01T17:00:00.000Z' }]);
    const runs = await runsOf(pool, shop, BREACH);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ attempts: 1, result: 'ok', scheduled_at: new Date('2026-11-01T17:00:00Z') });
    expect(runs[0].finished_at).not.toBeNull();
  });

  it('S5 AC2: an opened lead is marked late too', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-902', state: 'opened', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toEqual(new Date('2026-11-01T17:00:00Z'));
    expect(await lateEvents(shop)).toHaveLength(1);
  });

  it('S5 AC3: lowering the SLA from 8 to 6 hours marks a 7-hour-old lead late within a minute', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T16:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-903', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toBeNull();
    await pool.query('update settings set lead_sla_hours = 6 where shop_id = $1', [shop.shopId]);
    clock.advance(MIN);
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toEqual(new Date('2026-11-01T15:00:00Z'));
    expect(await lateEvents(shop)).toHaveLength(1);
  });

  it('S5 AC4: polling every 15 s, the event is written within a minute of the due time', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T16:58:10Z');
    await addLead(pool, shop, { code: 'LD-2026-904', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    for (let i = 0; i < 16; i++) {
      await scheduler.tick();
      clock.advance(15_000);
    }
    const events = await lateEvents(shop);
    expect(events).toHaveLength(1);
    const lag = events[0].created_at.getTime() - Date.parse('2026-11-01T17:00:00Z');
    expect(lag).toBeGreaterThanOrEqual(0);
    expect(lag).toBeLessThan(MIN);
  });

  it('S5 AC5: the breach time is the one leadSlaDueAt computes from the settings', async () => {
    const shop = await newJobsShop(pool);
    await pool.query('update settings set lead_sla_hours = 5 where shop_id = $1', [shop.shopId]);
    const arrivedAt = '2026-11-01T09:13:00Z';
    const id = await addLead(pool, shop, { code: 'LD-2026-905', arrivedAt });
    const clock = manualClock('2026-11-01T09:13:00Z');
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    clock.set('2026-11-01T15:00:00Z');
    await scheduler.tick();
    const expected = leadSlaDueAt(Date.parse(arrivedAt), { leadSlaHours: 5, leadSlaCounting: 'clock_hours' });
    expect((await leadRow(shop, id)).sla_breached_at?.getTime()).toBe(expected);
    // The handler has no due-time arithmetic of its own.
    const source = await readFile(new URL('../../src/jobs/handlers/lead-sla.ts', import.meta.url), 'utf8');
    expect(source).toContain('leadSlaDueAt(');
    expect(source).not.toMatch(/HOUR/);
  });

  it('S6 AC1: a lead worked at 12:00 is not marked late and no event is written', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-906', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    clock.set('2026-11-01T12:00:00Z');
    await transition(shop, id, 'being_worked');
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('cancelled');
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toBeNull();
    expect(await lateEvents(shop)).toEqual([]);
    expect(await runsOf(pool, shop, BREACH)).toEqual([]);
  });

  it('S6 AC2: a breach run that finds the lead already worked makes no change', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-907', arrivedAt: '2026-11-01T09:00:00Z' });
    await scheduleLeadSlaTimer(pool, shop, id, clock.now());
    // The state changes but the cancel never happens (it raced the pick-up).
    await pool.query(`update leads set state = 'being_worked' where id = $1`, [id]);
    clock.set('2026-11-01T17:00:00Z');
    await makeScheduler(pool, clock, shop, [leadSlaBreachJob]).tick();
    expect(await runsOf(pool, shop, BREACH)).toEqual([expect.objectContaining({ attempts: 1, result: 'ok' })]);
    expect(await leadRow(shop, id)).toMatchObject({ sla_breached_at: null, sla_breach_notified: false });
    expect(await lateEvents(shop)).toEqual([]);
  });

  it('S6 AC3: needs_glance -> opened keeps the timer', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-908', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    await transition(shop, id, 'opened');
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('pending');
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toEqual(new Date('2026-11-01T17:00:00Z'));
  });

  it('S6 AC4: a transition that rolls back leaves the timer pending', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-909', arrivedAt: '2026-11-01T09:00:00Z' });
    await makeScheduler(pool, clock, shop, leadJobs).tick();
    await expect(transition(shop, id, 'being_worked', true)).rejects.toThrow('the transition failed');
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('pending');
    expect((await leadRow(shop, id)).state).toBe('needs_glance');
  });

  it('S6 AC5: a lead already late keeps its breach time when it is worked', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-910', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    clock.set('2026-11-01T18:00:00Z');
    await transition(shop, id, 'being_worked');
    clock.advance(MIN);
    await scheduler.tick();
    expect(await leadRow(shop, id)).toEqual({
      state: 'being_worked',
      sla_breached_at: new Date('2026-11-01T17:00:00Z'),
      sla_breach_notified: true,
    });
    expect(await lateEvents(shop)).toHaveLength(1);
  });

  it('S6: markLeadLost cancels the timer', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-911', arrivedAt: '2026-11-01T09:00:00Z' });
    await makeScheduler(pool, clock, shop, leadJobs).tick();
    await runInTransaction(
      pool,
      (tx) =>
        markLeadLost(
          tx,
          { by: { id: 'u-1', name: 'Rajesh Verma', role: 'staff' }, at: clock.now(), shop },
          { leadId: 'LD-2026-911', reason: 'Bought elsewhere' },
        ),
      () => {},
    );
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('cancelled');
  });

  it('a timer that ran early (SLA raised just before) is set again and fires at the new time', async () => {
    const shop = await newJobsShop(pool);
    await pool.query('update settings set lead_sla_hours = 6 where shop_id = $1', [shop.shopId]);
    const clock = manualClock('2026-11-01T09:00:00Z');
    const id = await addLead(pool, shop, { code: 'LD-2026-912', arrivedAt: '2026-11-01T09:00:00Z' });
    const scheduler = makeScheduler(pool, clock, shop, leadJobs);
    await scheduler.tick();
    // Raised to 8 h just before the 15:00 timer runs, with no timers pass in between.
    await pool.query('update settings set lead_sla_hours = 8 where shop_id = $1', [shop.shopId]);
    clock.set('2026-11-01T15:00:00Z');
    await makeScheduler(pool, clock, shop, [leadSlaBreachJob]).tick();
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('done');
    expect((await leadRow(shop, id)).sla_breached_at).toBeNull();
    clock.set('2026-11-01T15:01:00Z');
    await scheduler.tick();
    expect(await pendingStatus(pool, shop, BREACH, id)).toBe('pending');
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    expect((await leadRow(shop, id)).sla_breached_at).toEqual(new Date('2026-11-01T17:00:00Z'));
    expect(await lateEvents(shop)).toHaveLength(1);
  });

  it('S4 AC1: two schedulers ticking the same due lead mark it late once, with one event', async () => {
    const poolB = testPool(3);
    try {
      const shop = await newJobsShop(pool);
      const clock = manualClock('2026-11-01T09:00:00Z');
      const id = await addLead(pool, shop, { code: 'LD-2026-913', arrivedAt: '2026-11-01T09:00:00Z' });
      const a = makeScheduler(pool, clock, shop, leadJobs, { workerId: 'worker-a' });
      const b = makeScheduler(poolB, clock, shop, leadJobs, { workerId: 'worker-b' });
      await a.tick();
      clock.set('2026-11-01T17:00:00Z');
      await Promise.all([a.tick(), b.tick()]);
      expect((await leadRow(shop, id)).sla_breached_at).toEqual(new Date('2026-11-01T17:00:00Z'));
      expect(await lateEvents(shop)).toHaveLength(1);
      const audits = await pool.query(`select 1 from audit_entries where shop_id = $1 and kind = 'lead_marked_late'`, [
        shop.shopId,
      ]);
      expect(audits.rows).toHaveLength(1);
    } finally {
      await poolB.end();
    }
  });
});
