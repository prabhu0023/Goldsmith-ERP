import { DAY } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { backoffDelayMs } from '../../src/jobs/backoff.js';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { describeDb, testPool } from '../db/db-test-helpers.js';
import { makeScheduler, manualClock, newJobsShop, pendingStatus, runsOf, testJob } from './job-test-helpers.js';

describe('backoffDelayMs (EP-10-S3)', () => {
  it('grows from 30 s, doubling, and stops at 15 minutes', () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8].map(backoffDelayMs);
    expect(delays).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 900_000, 900_000]);
    for (let i = 1; i < 6; i++) expect(delays[i]).toBeGreaterThan(delays[i - 1]);
  });
});

/** EP-10-S3: a failed run is retried with a growing delay, then marked failed. */
describeDb('retries with backoff (EP-10-S3)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const nextAttemptAt = async (shopId: string): Promise<Date | null> =>
    (await pool.query<{ next_attempt_at: Date | null }>('select next_attempt_at from pending_jobs where shop_id = $1', [shopId]))
      .rows[0].next_attempt_at;

  it('S3 AC1, AC2, AC4, AC5: retries after a growing delay, fails after 3 attempts, then is left alone', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T10:00:00Z');
    let calls = 0;
    const onJobFailed = vi.fn();
    const scheduler = makeScheduler(
      pool,
      clock,
      shop,
      [
        testJob('always-fails', async () => {
          calls++;
          throw new Error(`boom ${calls}`);
        }),
      ],
      { onJobFailed },
    );
    await scheduleJob(pool, shop, { jobName: 'always-fails', runKey: 'a', dueAt: clock.now(), maxAttempts: 3, now: clock.now() });

    await scheduler.tick();
    expect(calls).toBe(1);
    expect((await runsOf(pool, shop))[0]).toMatchObject({ attempts: 1, result: 'retrying', error_text: 'boom 1', finished_at: null });
    expect(await nextAttemptAt(shop.shopId)).toEqual(new Date('2026-11-01T10:00:30Z'));

    // AC1: not retried before the delay has passed, retried once it has.
    clock.set('2026-11-01T10:00:29Z');
    await scheduler.tick();
    expect(calls).toBe(1);
    clock.set('2026-11-01T10:00:30Z');
    await scheduler.tick();
    expect(calls).toBe(2);
    expect((await runsOf(pool, shop))[0]).toMatchObject({ attempts: 2, result: 'retrying', error_text: 'boom 2' });
    // The second delay is longer than the first.
    expect(await nextAttemptAt(shop.shopId)).toEqual(new Date('2026-11-01T10:01:30Z'));
    expect(onJobFailed).not.toHaveBeenCalled();

    // AC2: the third failure marks the run failed with the last error.
    clock.set('2026-11-01T10:01:30Z');
    await scheduler.tick();
    expect(calls).toBe(3);
    const [run] = await runsOf(pool, shop);
    expect(run).toMatchObject({
      attempts: 3,
      result: 'failed',
      error_text: 'boom 3',
      finished_at: new Date('2026-11-01T10:01:30Z'),
    });
    expect(await pendingStatus(pool, shop, 'always-fails', 'a')).toBe('failed');

    // AC5: handed to the failure hook (EP-37) once.
    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(onJobFailed).toHaveBeenCalledWith({
      shopId: shop.shopId,
      jobName: 'always-fails',
      runCode: run.code,
      attempts: 3,
      errorText: 'boom 3',
    });

    // AC4: a failed run is not retried by the scheduler.
    clock.advance(DAY);
    await scheduler.tick();
    expect(calls).toBe(3);
    expect(onJobFailed).toHaveBeenCalledTimes(1);
    expect(await runsOf(pool, shop)).toHaveLength(1);
  });

  it('S3 AC3: a run that fails once and then succeeds ends ok with 2 attempts', async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T10:00:00Z');
    let calls = 0;
    const scheduler = makeScheduler(pool, clock, shop, [
      testJob('fails-once', async () => {
        calls++;
        if (calls === 1) throw new Error('database busy');
      }),
    ]);
    await scheduleJob(pool, shop, { jobName: 'fails-once', runKey: 'a', dueAt: clock.now(), maxAttempts: 3, now: clock.now() });
    await scheduler.tick();
    clock.advance(30_000);
    await scheduler.tick();
    expect(calls).toBe(2);
    expect(await runsOf(pool, shop)).toEqual([
      expect.objectContaining({ attempts: 2, result: 'ok', finished_at: new Date('2026-11-01T10:00:30Z') }),
    ]);
    expect(await pendingStatus(pool, shop, 'fails-once', 'a')).toBe('done');
  });
});
