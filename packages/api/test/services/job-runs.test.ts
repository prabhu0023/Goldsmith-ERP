/**
 * listJobRuns and retryJobRun (EP-10-S13; S1 AC4; S2 AC5), served by the production app wiring
 * (shared contract + production handlers + cookie session resolver) on the shared test database.
 * Each test uses its own shop with an Owner, a Staff member and a Karigar.
 */
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { contract } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { wishesJob } from '../../src/jobs/handlers/wishes-9am.js';
import type { JobDefinition } from '../../src/jobs/job-definition.js';
import { handlers } from '../../src/services/index.js';
import { addKarigar, describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { makeScheduler, manualClock, newJobsShop, runsOf } from '../jobs/job-test-helpers.js';
import { newSession, newUser, sessionCookie } from '../support/api-harness.js';

/** 09:00 Asia/Kolkata on 21 November 2026. */
const NINE_IST = '2026-11-21T03:30:00.000Z';
const SESSION_EXPIRES = new Date('2026-11-30T00:00:00Z');

interface ShopUsers {
  shop: TestShop;
  owner: string;
  staff: string;
  karigar: string;
}

describeDb('job runs for the Owner (EP-10-S13)', () => {
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  const clock = manualClock(NINE_IST);
  const logged: unknown[] = [];

  beforeAll(async () => {
    pool = testPool(10);
    const config = loadConfig({
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
      API_PORT: '0',
    });
    const app = createApp(config, {
      pool,
      sessions: createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes }),
      clock,
      contract,
      handlers,
      log: (message, err) => logged.push({ message, err }),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  async function shopWithUsers(): Promise<ShopUsers> {
    const shop = await newJobsShop(pool);
    const session = (userId: string) => newSession(pool, shop, userId, { expiresAt: SESSION_EXPIRES });
    const ownerId = await newUser(pool, shop, { name: 'Sanjay Seth', role: 'owner' });
    const staffId = await newUser(pool, shop, { name: 'Rajesh Verma', role: 'staff' });
    const karigarRowId = await addKarigar(pool, shop, 'KG-LD');
    const phone = `8${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
    const karigarId = (
      await pool.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role, karigar_id, status)
         values ($1, 'Lakshmi Devi', $2, $3, 'karigar', $4, 'active') returning id`,
        [shop.shopId, phone, `${phone}@example.test`, karigarRowId],
      )
    ).rows[0].id;
    return { shop, owner: await session(ownerId), staff: await session(staffId), karigar: await session(karigarId) };
  }

  const call = async (op: string, body: unknown, session: string) => {
    const res = await fetch(`${base}/api/ops/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie(session) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  /** 55 finished runs, one per minute from 20 Nov 10:00Z; every 5th failed. */
  async function addRuns(shop: TestShop): Promise<void> {
    for (let i = 1; i <= 55; i++) {
      const started = new Date(Date.parse('2026-11-20T10:00:00Z') + i * 60_000);
      const failed = i % 5 === 0;
      await pool.query(
        `insert into job_runs (shop_id, code, job_name, scheduled_at, started_at, finished_at, attempts, result, error_text)
         values ($1, $2, 'lead-sla-timers', $3, $3, $4, $5, $6, $7)`,
        [
          shop.shopId,
          `RUN-2026-${String(i).padStart(5, '0')}`,
          started,
          new Date(started.getTime() + 1000),
          failed ? 3 : 1,
          failed ? 'failed' : 'ok',
          failed ? 'Boom' : null,
        ],
      );
    }
  }

  type Item = Record<string, unknown>;

  it('S13 AC1 / S2 AC5: the Owner gets the newest 50 runs with UTC and Asia/Kolkata times, then the rest by cursor', async () => {
    const u = await shopWithUsers();
    await addRuns(u.shop);
    const first = await call('listJobRuns', {}, u.owner);
    expect(first.status).toBe(200);
    const items = first.body.items as Item[];
    expect(first.body.pageSize).toBe(50);
    expect(items).toHaveLength(50);
    expect(items.map((r) => r.id)).toEqual(
      Array.from({ length: 50 }, (_, k) => `RUN-2026-${String(55 - k).padStart(5, '0')}`),
    );
    expect(items[0]).toEqual({
      id: 'RUN-2026-00055',
      jobName: 'lead-sla-timers',
      scheduledAt: '2026-11-20T10:55:00.000Z',
      scheduledAtLocal: '2026-11-20T16:25:00.000+05:30',
      startedAt: '2026-11-20T10:55:00.000Z',
      startedAtLocal: '2026-11-20T16:25:00.000+05:30',
      finishedAt: '2026-11-20T10:55:01.000Z',
      finishedAtLocal: '2026-11-20T16:25:01.000+05:30',
      attempts: 3,
      result: 'failed',
      errorText: 'Boom',
    });
    for (const r of items) {
      expect(r.startedAtLocal).toMatch(/\+05:30$/);
      expect(r.scheduledAtLocal).toMatch(/\+05:30$/);
    }
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await call('listJobRuns', { cursor: first.body.nextCursor }, u.owner);
    expect(second.status).toBe(200);
    expect((second.body.items as Item[]).map((r) => r.id)).toEqual([
      'RUN-2026-00005',
      'RUN-2026-00004',
      'RUN-2026-00003',
      'RUN-2026-00002',
      'RUN-2026-00001',
    ]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('S13 AC2: filtering by result failed returns only failed runs', async () => {
    const u = await shopWithUsers();
    await addRuns(u.shop);
    const res = await call('listJobRuns', { result: 'failed' }, u.owner);
    expect(res.status).toBe(200);
    const items = res.body.items as Item[];
    expect(items).toHaveLength(11);
    expect(items.every((r) => r.result === 'failed')).toBe(true);
    expect(res.body.nextCursor).toBeNull();
  });

  it('S13 AC3 / AC5: retrying a wishes run that failed 3 times runs it once more under the same key, audited with the Owner', async () => {
    const u = await shopWithUsers();
    await pool.query('update settings set auto_send_wishes = true where shop_id = $1', [u.shop.shopId]);
    let failing = true;
    const flakyWishes: JobDefinition = {
      ...wishesJob,
      async handler(tx, ctx) {
        if (failing) throw new Error('Queue service unavailable');
        return wishesJob.handler(tx, ctx);
      },
    };
    clock.set(NINE_IST);
    const scheduler = makeScheduler(pool, clock, u.shop, [flakyWishes]);
    await scheduler.tick();
    clock.advance(30_000);
    await scheduler.tick();
    clock.advance(60_000);
    await scheduler.tick();
    const [failedRun] = await runsOf(pool, u.shop, 'wishes-9am');
    expect(failedRun).toMatchObject({ attempts: 3, result: 'failed' });

    const listed = await call('listJobRuns', { result: 'failed' }, u.owner);
    expect((listed.body.items as Item[]).map((r) => r.id)).toEqual([failedRun.code]);

    expect(await call('retryJobRun', { runId: failedRun.code }, u.owner)).toEqual({ status: 200, body: { ok: true } });
    expect((await runsOf(pool, u.shop, 'wishes-9am'))[0]).toMatchObject({ result: 'retrying', finished_at: null });

    failing = false;
    await scheduler.tick();
    const runs = await runsOf(pool, u.shop, 'wishes-9am');
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ code: failedRun.code, attempts: 4, result: 'ok' });
    const key = await pool.query<{ idempotency_key: string }>(
      'select idempotency_key from job_runs where shop_id = $1 and code = $2',
      [u.shop.shopId, failedRun.code],
    );
    expect(key.rows[0].idempotency_key).toBe('wishes:2026-11-21');
    await scheduler.tick();
    const outbox = await pool.query(
      `select payload from outbox_events where shop_id = $1 and topic = 'wishes.run_requested'`,
      [u.shop.shopId],
    );
    expect(outbox.rows).toHaveLength(1);

    // A run that is now ok cannot be retried.
    expect(await call('retryJobRun', { runId: failedRun.code }, u.owner)).toEqual({
      status: 422,
      body: { code: 'rule_refused', message: 'Only a failed run can be retried.' },
    });

    const audit = await pool.query(
      `select actor_id is not null as has_actor_id, actor_name, actor_role, reference from audit_entries
        where shop_id = $1 and kind = 'job_run_retried'`,
      [u.shop.shopId],
    );
    expect(audit.rows).toEqual([
      { has_actor_id: true, actor_name: 'Sanjay Seth', actor_role: 'owner', reference: failedRun.code },
    ]);
  });

  it('S13: filtering by job name finds the 9 am wishes runs among the every-minute sweeps', async () => {
    const u = await shopWithUsers();
    await addRuns(u.shop);
    await pool.query(
      `insert into job_runs (shop_id, code, job_name, scheduled_at, started_at, finished_at, attempts, result)
       values ($1, 'RUN-2026-00100', 'wishes-9am', $2, $2, $2, 1, 'ok')`,
      [u.shop.shopId, new Date('2026-11-20T03:30:00Z')],
    );
    const res = await call('listJobRuns', { jobName: 'wishes-9am' }, u.owner);
    expect(res.status).toBe(200);
    expect((res.body.items as Item[]).map((r) => [r.id, r.jobName])).toEqual([['RUN-2026-00100', 'wishes-9am']]);
    const failedSweeps = await call('listJobRuns', { jobName: 'lead-sla-timers', result: 'failed' }, u.owner);
    expect((failedSweeps.body.items as Item[]).map((r) => r.jobName)).toEqual(Array(11).fill('lead-sla-timers'));
    expect((await call('listJobRuns', { jobName: 'no-such-job' }, u.owner)).body.items).toEqual([]);
  });

  it('S13 AC3: retrying a wishes run that failed on an earlier shop day runs it the next day under its own date', async () => {
    const u = await shopWithUsers();
    await pool.query('update settings set auto_send_wishes = true where shop_id = $1', [u.shop.shopId]);
    let failing = true;
    const flakyWishes: JobDefinition = {
      ...wishesJob,
      async handler(tx, ctx) {
        if (failing) throw new Error('Queue service unavailable');
        return wishesJob.handler(tx, ctx);
      },
    };
    clock.set(NINE_IST);
    const scheduler = makeScheduler(pool, clock, u.shop, [flakyWishes]);
    await scheduler.tick();
    clock.advance(30_000);
    await scheduler.tick();
    clock.advance(60_000);
    await scheduler.tick();
    const [failedRun] = await runsOf(pool, u.shop, 'wishes-9am');
    expect(failedRun).toMatchObject({ attempts: 3, result: 'failed' });

    // The Owner sees it at 08:00 Asia/Kolkata the next day (22 Nov) and retries it.
    clock.set('2026-11-22T02:30:00.000Z');
    failing = false;
    expect(await call('retryJobRun', { runId: failedRun.code }, u.owner)).toEqual({ status: 200, body: { ok: true } });
    await scheduler.tick();
    const retried = (await runsOf(pool, u.shop, 'wishes-9am')).find((r) => r.code === failedRun.code);
    expect(retried).toMatchObject({ attempts: 4, result: 'ok', finished_at: new Date('2026-11-22T02:30:00.000Z') });
    const keys = async () =>
      (
        await pool.query<{ date: string }>(
          `select payload->>'date' as date from outbox_events
            where shop_id = $1 and topic = 'wishes.run_requested' order by created_at`,
          [u.shop.shopId],
        )
      ).rows.map((r) => r.date);
    expect(await keys()).toEqual(['2026-11-21']);

    // 22 Nov's own 9 am run still happens once.
    clock.set('2026-11-22T03:30:00.000Z');
    await scheduler.tick();
    await scheduler.tick();
    expect(await keys()).toEqual(['2026-11-21', '2026-11-22']);
    const runs = await runsOf(pool, u.shop, 'wishes-9am');
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.result === 'ok' && r.finished_at !== null)).toBe(true);
  });

  it('S13 AC4: Staff and Karigar get forbidden for both operations', async () => {
    const u = await shopWithUsers();
    await addRuns(u.shop);
    for (const session of [u.staff, u.karigar]) {
      for (const [op, body] of [
        ['listJobRuns', {}],
        ['retryJobRun', { runId: 'RUN-2026-00005' }],
      ] as const) {
        const res = await call(op, body, session);
        expect(res.status, op).toBe(403);
        expect(res.body.code, op).toBe('forbidden');
      }
    }
    const run = await pool.query<{ result: string }>('select result from job_runs where shop_id = $1 and code = $2', [
      u.shop.shopId,
      'RUN-2026-00005',
    ]);
    expect(run.rows[0].result).toBe('failed');
  });

  it('answers not_found for a run code that does not exist', async () => {
    const u = await shopWithUsers();
    expect(await call('retryJobRun', { runId: 'RUN-2026-99999' }, u.owner)).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Job run RUN-2026-99999 was not found.' },
    });
  });

  it('S1 AC4: no browser session can Schedule, Cancel or Run a job', async () => {
    const u = await shopWithUsers();
    const body = { jobName: 'wishes-9am', runKey: '2026-11-21', dueAt: NINE_IST };
    for (const session of [u.owner, u.staff, u.karigar]) {
      for (const op of ['scheduleJob', 'cancelJob', 'runJob']) {
        const res = await call(op, body, session);
        expect(res.status, op).toBe(404);
        expect(res.body.code, op).toBe('not_found');
      }
    }
    const rows = await pool.query('select 1 from pending_jobs where shop_id = $1', [u.shop.shopId]);
    expect(rows.rows).toEqual([]);
  });

  it('logged no unexpected errors', () => {
    expect(logged).toEqual([]);
  });
});
