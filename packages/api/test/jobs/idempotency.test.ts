import { setTimeout as sleep } from 'node:timers/promises';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { JobDefinition } from '../../src/jobs/job-definition.js';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { emitOutboxEvent } from '../../src/jobs/outbox.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { type ManualClock, makeScheduler, manualClock, newJobsShop, pendingStatus, runsOf, testJob } from './job-test-helpers.js';

/** EP-10-S4 and "no duplicate execution when two api processes run". */
describeDb('one effect per occurrence (EP-10-S4)', () => {
  let poolA: pg.Pool;
  let poolB: pg.Pool;
  beforeAll(() => {
    poolA = testPool(3);
    poolB = testPool(3);
  });
  afterAll(async () => {
    await poolA.end();
    await poolB.end();
  });

  const schedule = (shop: TestShop, clock: ManualClock, runKey: string, idempotencyKey: string | null = null) =>
    scheduleJob(poolA, shop, { jobName: 'effect', runKey, dueAt: clock.now(), maxAttempts: 3, idempotencyKey, now: clock.now() });
  /** A job whose effect is one outbox row carrying the run key. */
  const effectJob = (onRun: (attempt: number) => Promise<void> | void = () => {}): JobDefinition =>
    testJob('effect', async (tx, ctx) => {
      await emitOutboxEvent(tx.client, ctx.shop, 'lead.sla_passed', { runCode: ctx.runCode }, ctx.now);
      await onRun(ctx.attempt);
    });
  const effects = async (shop: TestShop): Promise<number> =>
    (await poolA.query('select 1 from outbox_events where shop_id = $1', [shop.shopId])).rows.length;
  const twoWorkers = (shop: TestShop, clock: ManualClock, job: JobDefinition) => [
    makeScheduler(poolA, clock, shop, [job], { workerId: 'worker-a' }),
    makeScheduler(poolB, clock, shop, [job], { workerId: 'worker-b' }),
  ];

  it('runs each pending row once when two runner instances tick together', async () => {
    const shop = await newJobsShop(poolA);
    const clock = manualClock('2026-11-01T11:30:00Z');
    const seen: string[] = [];
    const job = effectJob(async () => {
      await sleep(30);
    });
    const counting: JobDefinition = {
      ...job,
      handler: async (tx, ctx) => {
        seen.push(ctx.runCode);
        await job.handler(tx, ctx);
      },
    };
    for (const key of ['r1', 'r2', 'r3', 'r4', 'r5']) await schedule(shop, clock, key);
    const [a, b] = twoWorkers(shop, clock, counting);
    await Promise.all([a.tick(), b.tick()]);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    const runs = await runsOf(poolA, shop);
    expect(runs).toHaveLength(5);
    expect(runs.every((r) => r.attempts === 1 && r.result === 'ok')).toBe(true);
    expect(await effects(shop)).toBe(5);
  });

  it('S4 AC1: two workers acting on the same idempotency key make the change once', async () => {
    const shop = await newJobsShop(poolA);
    const clock = manualClock('2026-11-01T17:00:00Z');
    await schedule(shop, clock, 'first', 'LD-2026-214:sla-breach');
    await schedule(shop, clock, 'second', 'LD-2026-214:sla-breach');
    const [a, b] = twoWorkers(
      shop,
      clock,
      effectJob(async () => {
        await sleep(30);
      }),
    );
    await Promise.all([a.tick(), b.tick()]);
    expect(await effects(shop)).toBe(1);
    const runs = await runsOf(poolA, shop);
    expect(runs.map((r) => r.result)).toEqual(['ok', 'ok']);
  });

  it('S4 AC2: a run that committed its change and then crashed makes no second change on retry', async () => {
    const shop = await newJobsShop(poolA);
    const clock = manualClock('2026-11-01T17:00:00Z');
    const key = 'LD-2026-214:sla-breach';
    await schedule(shop, clock, 'crashed', key);
    // The first attempt committed its change and its key, then the process died before it
    // could mark the run done: the row is still 'running' under the dead worker's lease.
    const run = await poolA.query<{ id: string }>(
      `insert into job_runs (shop_id, code, job_name, idempotency_key, scheduled_at, started_at, attempts)
       values ($1, 'RUN-2026-90001', 'effect', $2, $3, $3, 1) returning id`,
      [shop.shopId, key, clock.now()],
    );
    await poolA.query(
      `update pending_jobs set status = 'running', attempts = 1, locked_by = 'dead-worker', locked_until = $2, run_id = $3
        where shop_id = $1`,
      [shop.shopId, new Date(clock.now().getTime() + 120_000), run.rows[0].id],
    );
    await poolA.query(`insert into job_keys (shop_id, idempotency_key, job_name, claimed_at) values ($1, $2, 'effect', $3)`, [
      shop.shopId,
      key,
      clock.now(),
    ]);
    await poolA.query(
      `insert into outbox_events (shop_id, topic, payload, created_at) values ($1, 'lead.sla_passed', '{}', $2)`,
      [shop.shopId, clock.now()],
    );

    let handlerCalls = 0;
    const scheduler = makeScheduler(
      poolA,
      clock,
      shop,
      [
        effectJob(() => {
          handlerCalls++;
        }),
      ],
      { workerId: 'worker-a' },
    );
    // Before the lease runs out nobody takes the run over.
    clock.advance(60_000);
    await scheduler.tick();
    expect(await pendingStatus(poolA, shop, 'effect', 'crashed')).toBe('running');
    clock.advance(60_000);
    await scheduler.tick();
    expect(handlerCalls).toBe(0);
    expect(await effects(shop)).toBe(1);
    expect(await runsOf(poolA, shop)).toEqual([
      expect.objectContaining({ code: 'RUN-2026-90001', attempts: 2, result: 'ok' }),
    ]);
    expect(await pendingStatus(poolA, shop, 'effect', 'crashed')).toBe('done');
  });

  it('S4 AC4: a different key is not blocked', async () => {
    const shop = await newJobsShop(poolA);
    const clock = manualClock('2026-11-01T17:00:00Z');
    await schedule(shop, clock, 'lead-214', 'LD-2026-214:sla-breach');
    await schedule(shop, clock, 'lead-215', 'LD-2026-215:sla-breach');
    const [a, b] = twoWorkers(shop, clock, effectJob());
    await Promise.all([a.tick(), b.tick()]);
    expect(await effects(shop)).toBe(2);
  });

  it('S4 AC5: a rolled-back attempt leaves the key free, and the retry makes the change', async () => {
    const shop = await newJobsShop(poolA);
    const clock = manualClock('2026-11-01T17:00:00Z');
    const key = 'LD-2026-214:sla-breach';
    await schedule(shop, clock, 'rolls-back', key);
    const scheduler = makeScheduler(poolA, clock, shop, [
      effectJob((attempt) => {
        if (attempt === 1) throw new Error('connection reset');
      }),
    ]);
    await scheduler.tick();
    expect(await effects(shop)).toBe(0);
    const keys = await poolA.query('select 1 from job_keys where shop_id = $1', [shop.shopId]);
    expect(keys.rows).toEqual([]);
    clock.advance(30_000);
    await scheduler.tick();
    expect(await effects(shop)).toBe(1);
    expect(await runsOf(poolA, shop)).toEqual([expect.objectContaining({ attempts: 2, result: 'ok' })]);
  });
});
