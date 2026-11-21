import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { karigarOverdueJob } from '../../src/jobs/handlers/karigar-overdue.js';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { addKarigarJob, makeScheduler, manualClock, newJobsShop, runsOf } from './job-test-helpers.js';

/** 00:05 Asia/Kolkata on 2 and 3 November 2026. */
const RUN_2_NOV = '2026-11-01T18:35:00Z';
const RUN_3_NOV = '2026-11-02T18:35:00Z';
/** Agreed dates at noon Asia/Kolkata. */
const noonIst = (date: string): string => `${date}T12:00:00+05:30`;

interface JobRow {
  overdue_since: Date | null;
  last_reminder_at: Date | null;
}

/** EP-10-S7: mark karigar jobs overdue and remind once a day. */
describeDb('karigar overdue job (EP-10-S7)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const jobRow = async (shop: TestShop, id: string): Promise<JobRow> =>
    (
      await pool.query<JobRow>('select overdue_since, last_reminder_at from karigar_jobs where shop_id = $1 and id = $2', [
        shop.shopId,
        id,
      ])
    ).rows[0];
  const events = async (shop: TestShop, topic: string) =>
    (
      await pool.query<{ payload: Record<string, unknown> }>(
        'select payload from outbox_events where shop_id = $1 and topic = $2 order by created_at, id',
        [shop.shopId, topic],
      )
    ).rows.map((r) => r.payload);
  const reminders = (shop: TestShop) => events(shop, 'notify.karigar_job_overdue_reminder');

  it('S7 AC1: MO-2026-118 agreed for 1 Nov is overdue on 2 Nov, with one reminder', async () => {
    const shop = await newJobsShop(pool);
    const id = await addKarigarJob(pool, shop, { code: 'MO-2026-118', dueDate: noonIst('2026-11-01'), karigarCode: 'KG-07' });
    const clock = manualClock(RUN_2_NOV);
    await makeScheduler(pool, clock, shop, [karigarOverdueJob]).tick();
    expect(await jobRow(shop, id)).toEqual({
      // Midnight Asia/Kolkata after the agreed date: the moment it became overdue.
      overdue_since: new Date('2026-11-01T18:30:00Z'),
      last_reminder_at: new Date(RUN_2_NOV),
    });
    expect(await reminders(shop)).toEqual([{ jobId: 'MO-2026-118', karigarId: 'KG-07', overdueDays: 1, date: '2026-11-02' }]);
    expect(await runsOf(pool, shop, 'karigar-overdue')).toEqual([expect.objectContaining({ attempts: 1, result: 'ok' })]);
  });

  it('S7 AC2: the confirmed date wins over the due date', async () => {
    const shop = await newJobsShop(pool);
    const id = await addKarigarJob(pool, shop, {
      code: 'MO-2026-119',
      dueDate: noonIst('2026-11-01'),
      confirmedDate: noonIst('2026-11-05'),
    });
    await makeScheduler(pool, manualClock(RUN_2_NOV), shop, [karigarOverdueJob]).tick();
    expect(await jobRow(shop, id)).toEqual({ overdue_since: null, last_reminder_at: null });
    expect(await reminders(shop)).toEqual([]);
  });

  it('S7 AC3: a handed-over job is never overdue', async () => {
    const shop = await newJobsShop(pool);
    const id = await addKarigarJob(pool, shop, { code: 'MO-2026-120', status: 'handed_over', dueDate: noonIst('2026-11-01') });
    await makeScheduler(pool, manualClock(RUN_2_NOV), shop, [karigarOverdueJob]).tick();
    expect(await jobRow(shop, id)).toEqual({ overdue_since: null, last_reminder_at: null });
    expect(await reminders(shop)).toEqual([]);
  });

  it('S7 AC4 / S4 AC3: a second run on the same day sends no second reminder', async () => {
    const shop = await newJobsShop(pool);
    const id = await addKarigarJob(pool, shop, { code: 'MO-2026-121', dueDate: noonIst('2026-10-30') });
    const clock = manualClock(RUN_2_NOV);
    const scheduler = makeScheduler(pool, clock, shop, [karigarOverdueJob]);
    await scheduler.tick();
    const first = await jobRow(shop, id);
    clock.set('2026-11-02T05:00:00Z');
    await scheduleJob(pool, shop, {
      jobName: 'karigar-overdue',
      runKey: '2026-11-02-again',
      dueAt: clock.now(),
      maxAttempts: 3,
      now: clock.now(),
    });
    await scheduler.tick();
    expect(await runsOf(pool, shop, 'karigar-overdue')).toEqual([
      expect.objectContaining({ result: 'ok' }),
      expect.objectContaining({ result: 'ok' }),
    ]);
    expect(await reminders(shop)).toEqual([{ jobId: 'MO-2026-121', karigarId: 'KG-MO-2026-121', overdueDays: 3, date: '2026-11-02' }]);
    expect(await jobRow(shop, id)).toEqual(first);
  });

  it('S7 AC5: "passed its agreed date" is published on the first day only; the next day reminds again', async () => {
    const shop = await newJobsShop(pool);
    const id = await addKarigarJob(pool, shop, { code: 'MO-2026-122', dueDate: noonIst('2026-11-01') });
    const clock = manualClock(RUN_2_NOV);
    const scheduler = makeScheduler(pool, clock, shop, [karigarOverdueJob]);
    await scheduler.tick();
    clock.set(RUN_3_NOV);
    await scheduler.tick();
    expect(await events(shop, 'karigar_job.overdue')).toEqual([
      { jobId: 'MO-2026-122', overdueSince: '2026-11-01T18:30:00.000Z' },
    ]);
    expect((await reminders(shop)).map((r) => [r.date, r.overdueDays])).toEqual([
      ['2026-11-02', 1],
      ['2026-11-03', 2],
    ]);
    expect(await jobRow(shop, id)).toEqual({
      overdue_since: new Date('2026-11-01T18:30:00Z'),
      last_reminder_at: new Date(RUN_3_NOV),
    });
    const audits = await pool.query<{ kind: string }>(
      `select kind from audit_entries where shop_id = $1 and reference = 'MO-2026-122' order by at`,
      [shop.shopId],
    );
    expect(audits.rows.map((r) => r.kind)).toEqual(['job_marked_overdue', 'job_reminder_sent']);
  });
});
