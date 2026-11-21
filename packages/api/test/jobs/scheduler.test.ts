import { MIN, shopDateTime } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createJobRegistry } from '../../src/jobs/job-definition.js';
import { cancelJob, scheduleJob } from '../../src/jobs/job-store.js';
import { createScheduler } from '../../src/jobs/scheduler.js';
import { describeDb, testPool } from '../db/db-test-helpers.js';
import { makeScheduler, manualClock, newJobsShop, pendingStatus, runsOf, testJob } from './job-test-helpers.js';

const POLL = 15_000;

/** EP-10-S1: run a job at a set time, on a repeat, or after a delay. */
describeDb('scheduler (EP-10-S1)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('S1 AC1: runs a 5-minute delayed job once, within a minute of its due time', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T10:00:00Z');
    const calls: Date[] = [];
    const scheduler = makeScheduler(pool, clock, shop, [testJob('remind', async (_tx, ctx) => void calls.push(ctx.now))]);
    const dueAt = new Date(clock.now().getTime() + 5 * MIN);
    await scheduleJob(pool, shop, { jobName: 'remind', runKey: 'r-1', dueAt, maxAttempts: 3, now: clock.now() });

    // Poll every 15 s for 7 minutes, as the api does.
    for (let t = 0; t <= 28; t++) {
      clock.set(new Date(Date.parse('2026-11-01T10:00:00Z') + t * POLL));
      await scheduler.tick();
      if (clock.now() < dueAt) expect(calls).toHaveLength(0);
    }
    expect(calls).toHaveLength(1);
    const runs = await runsOf(pool, shop);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ job_name: 'remind', attempts: 1, result: 'ok', scheduled_at: dueAt });
    expect(runs[0].started_at.getTime() - runs[0].scheduled_at.getTime()).toBeLessThan(MIN);
    expect(await pendingStatus(pool, shop, 'remind', 'r-1')).toBe('done');
  });

  it('S1 AC2: runs an every-minute job 10 times in 10 minutes, each within a minute of its slot', async () => {
    const shop = await newJobsShop(pool);
    const start = Date.parse('2026-11-01T10:00:00Z');
    const clock = manualClock(new Date(start));
    let calls = 0;
    const job = testJob('heartbeat', async () => void calls++, { schedule: { kind: 'every', minutes: 1 } });
    const scheduler = makeScheduler(pool, clock, shop, [job]);
    for (let t = 0; t < 40; t++) {
      clock.set(new Date(start + t * POLL));
      await scheduler.tick();
    }
    expect(calls).toBe(10);
    const runs = await runsOf(pool, shop, 'heartbeat');
    expect(runs.map((r) => r.scheduled_at.toISOString())).toEqual(
      Array.from({ length: 10 }, (_, i) => new Date(start + i * MIN).toISOString()),
    );
    for (const r of runs) {
      expect(r.result).toBe('ok');
      expect(r.started_at.getTime() - r.scheduled_at.getTime()).toBeLessThan(MIN);
    }
    const def = await pool.query('select schedule_kind, schedule, max_attempts from job_definitions where shop_id = $1', [
      shop.shopId,
    ]);
    expect(def.rows).toEqual([{ schedule_kind: 'every', schedule: 'every 1 minute', max_attempts: 3 }]);
  });

  it.each(['America/New_York', 'Asia/Tokyo'])('S1 AC3: runs at the set UTC time when the machine zone is %s', async (tz) => {
    const originalTz = process.env.TZ;
    process.env.TZ = tz;
    try {
      const shop = await newJobsShop(pool);
      const clock = manualClock('2026-11-01T10:04:00Z');
      let calls = 0;
      const scheduler = makeScheduler(pool, clock, shop, [testJob('at-time', async () => void calls++)]);
      const dueAt = new Date('2026-11-01T10:05:00Z');
      await scheduleJob(pool, shop, { jobName: 'at-time', runKey: 'once', dueAt, maxAttempts: 3, now: clock.now() });
      clock.set('2026-11-01T10:04:59Z');
      await scheduler.tick();
      expect(calls).toBe(0);
      clock.set('2026-11-01T10:05:00Z');
      await scheduler.tick();
      expect(calls).toBe(1);
      const [run] = await runsOf(pool, shop);
      expect(run.scheduled_at.toISOString()).toBe('2026-11-01T10:05:00.000Z');
      expect(run.started_at.toISOString()).toBe('2026-11-01T10:05:00.000Z');
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it('S1 AC5: never runs a cancelled delayed job and records no JobRun', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T10:00:00Z');
    let calls = 0;
    const scheduler = makeScheduler(pool, clock, shop, [testJob('remind', async () => void calls++)]);
    const dueAt = new Date('2026-11-01T10:05:00Z');
    await scheduleJob(pool, shop, { jobName: 'remind', runKey: 'r-1', dueAt, maxAttempts: 3, now: clock.now() });
    expect(await cancelJob(pool, shop, 'remind', 'r-1')).toBe(true);
    clock.set('2026-11-01T10:10:00Z');
    await scheduler.tick();
    expect(calls).toBe(0);
    expect(await runsOf(pool, shop)).toEqual([]);
    expect(await pendingStatus(pool, shop, 'remind', 'r-1')).toBe('cancelled');
    expect(await cancelJob(pool, shop, 'remind', 'r-1')).toBe(false);
  });

  it('refuses two jobs with the same name', () => {
    const a = testJob('same-name', async () => {});
    expect(() => createJobRegistry([a, { ...a }])).toThrow('Job name "same-name" is used twice');
    expect(() => createScheduler({ pool, clock: manualClock('2026-11-01T10:00:00Z'), jobs: [a, a] })).toThrow(
      'used twice',
    );
  });

  it("skips a daily occurrence left from an earlier Asia/Kolkata day and runs today's once", async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T02:00:00Z');
    let calls = 0;
    const job = testJob('morning', async () => void calls++, { schedule: { kind: 'daily', hour: 9, minute: 0 } });
    await scheduleJob(pool, shop, {
      jobName: 'morning',
      runKey: '2026-11-01',
      dueAt: new Date(shopDateTime('2026-11-01', 9, 0)),
      maxAttempts: 3,
      now: clock.now(),
    });
    // The server was down from before 09:00 on 1 November until 10:30 on 3 November (Asia/Kolkata).
    clock.set('2026-11-03T05:00:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [job]);
    await scheduler.tick();
    await scheduler.tick();
    expect(calls).toBe(1);
    expect(await pendingStatus(pool, shop, 'morning', '2026-11-01')).toBe('skipped');
    expect(await pendingStatus(pool, shop, 'morning', '2026-11-03')).toBe('done');
    expect(await pendingStatus(pool, shop, 'morning', '2026-11-04')).toBe('pending');
    const runs = await runsOf(pool, shop);
    expect(runs.map((r) => r.scheduled_at.toISOString())).toEqual(['2026-11-03T03:30:00.000Z']);
    const def = await pool.query('select schedule from job_definitions where shop_id = $1', [shop.shopId]);
    expect(def.rows).toEqual([{ schedule: 'daily 09:00 Asia/Kolkata' }]);
  });
});
