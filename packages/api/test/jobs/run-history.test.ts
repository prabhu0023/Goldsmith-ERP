import { MIN } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { type ManualClock, makeScheduler, manualClock, newJobsShop, runsOf, testJob } from './job-test-helpers.js';

/** EP-10-S2: every run leaves a JobRun row. */
describeDb('run history (EP-10-S2)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const schedule = (shop: TestShop, clock: ManualClock, jobName: string, runKey: string, maxAttempts = 3) =>
    scheduleJob(pool, shop, { jobName, runKey, dueAt: clock.now(), maxAttempts, now: clock.now() });

  it('S2 AC1: records a successful run with start, finish, 1 attempt and result ok', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T11:30:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [testJob('ok-job', async () => {})]);
    await schedule(shop, clock, 'ok-job', 'a');
    await scheduler.tick();
    const [run] = await runsOf(pool, shop);
    expect(run).toMatchObject({
      job_name: 'ok-job',
      scheduled_at: new Date('2026-11-01T11:30:00Z'),
      started_at: new Date('2026-11-01T11:30:00Z'),
      finished_at: new Date('2026-11-01T11:30:00Z'),
      attempts: 1,
      result: 'ok',
      error_text: null,
    });
    expect(run.code).toMatch(/^RUN-2026-\d{5}$/);
  });

  it('S2 AC2: keeps a short error text without personal data or secrets', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T11:30:00Z');
    const message =
      'Send to +91 98401 55502 (priya@example.com) failed at https://graph.example.com/v1/messages?key=abc ' +
      `password=hunter2 token=tk_live_xxxxxxxxxxxxxxxx code 480913 9840155502 ${'x'.repeat(1000)}`;
    const scheduler = makeScheduler(pool, clock, shop, [
      testJob(
        'bad-job',
        async () => {
          throw new Error(message);
        },
        { maxAttempts: 1 },
      ),
    ]);
    await schedule(shop, clock, 'bad-job', 'a', 1);
    await scheduler.tick();
    const [run] = await runsOf(pool, shop);
    expect(run.result).toBe('failed');
    const text = run.error_text ?? '';
    expect(text).toContain('Send to [phone]');
    for (const secret of ['+91 98401 55502', '98401', 'priya@', 'https://', 'graph.example.com', 'hunter2', '480913', 'tk_live', '9840155502']) {
      expect(text).not.toContain(secret);
    }
    expect(text.length).toBeLessThanOrEqual(500);
  });

  it('S2 AC3: shows a run in progress with a start time and no finish time', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T11:30:00Z');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const inHandler = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const scheduler = makeScheduler(pool, clock, shop, [
      testJob('slow-job', async () => {
        entered();
        await gate;
      }),
    ]);
    await schedule(shop, clock, 'slow-job', 'a');
    const ticking = scheduler.tick();
    await inHandler;
    const [during] = await runsOf(pool, shop);
    expect(during).toMatchObject({ started_at: new Date('2026-11-01T11:30:00Z'), finished_at: null, result: null, attempts: 1 });
    release();
    await ticking;
    const [after] = await runsOf(pool, shop);
    expect(after).toMatchObject({ result: 'ok', finished_at: new Date('2026-11-01T11:30:00Z') });
  });

  it('S2 AC4: a run retried twice shows 3 attempts and its original scheduled time', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T11:30:00Z');
    let calls = 0;
    const scheduler = makeScheduler(pool, clock, shop, [
      testJob('flaky-job', async () => {
        calls++;
        if (calls < 3) throw new Error(`attempt ${calls} failed`);
      }),
    ]);
    await schedule(shop, clock, 'flaky-job', 'a');
    await scheduler.tick();
    clock.advance(30_000);
    await scheduler.tick();
    clock.advance(60_000);
    await scheduler.tick();
    expect(calls).toBe(3);
    const runs = await runsOf(pool, shop);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      attempts: 3,
      result: 'ok',
      scheduled_at: new Date('2026-11-01T11:30:00Z'),
      finished_at: new Date('2026-11-01T11:31:30Z'),
    });
  });

  it('S2 AC5: lists runs newest first', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T11:00:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [testJob('ok-job', async () => {})]);
    const codes: string[] = [];
    for (const key of ['first', 'second', 'third']) {
      await schedule(shop, clock, 'ok-job', key);
      await scheduler.tick();
      const runs = await runsOf(pool, shop);
      codes.push(runs[runs.length - 1].code);
      clock.advance(5 * MIN);
    }
    const listed = await pool.query<{ code: string }>(
      'select code from job_runs where shop_id = $1 order by started_at desc, id desc',
      [shop.shopId],
    );
    expect(listed.rows.map((r) => r.code)).toEqual([...codes].reverse());
  });
});
