/**
 * The background job scheduler (EP-10-S1 to S4, S11): a small runner on the api's own pg pool
 * (D1-backend-approach: jobs run inside the Node api, no managed platform).
 *
 * Each tick, per shop:
 *  1. ensureRecurring: record the job definitions; put the current occurrence of every
 *     `every`/`daily` job in pending_jobs when it has none open. A pending daily occurrence of an
 *     earlier Asia/Kolkata day that never started is skipped, so after downtime today's runs once
 *     and old days are not replayed (S11). An occurrence that already has a JobRun (a backoff
 *     retry, or a failed run the Owner re-queued, S13) is never skipped: it runs to an outcome.
 *     A run whose lease expired on its last attempt is marked failed, not attempted again (S3).
 *  2. Claim and run due rows one at a time. The claim transaction picks a row with
 *     `for update skip locked`, so two api processes never take the same row, sets a lease
 *     (locked_by, locked_until) and opens or updates the JobRun; it commits before the handler, so
 *     an in-progress run is visible (S2). The handler runs in one transaction that also claims the
 *     occurrence's idempotency key and marks the row done only while this worker still holds the
 *     lease (S4). A failure is recorded in its own transaction: retry with backoff, or failed (S3).
 *
 * Every time comes from the injected Clock and is passed to SQL as a parameter (tests move time).
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { addShopDays, shopDate } from '@goldsmith/shared';
import type pg from 'pg';
import { nextCode } from '../db/codes.js';
import { loadShopContext, type ShopContext } from '../db/shop-context.js';
import { withTransaction } from '../db/transaction.js';
import { runInTransaction } from '../pipeline/operation-transaction.js';
import type { Clock } from '../pipeline/server-clock.js';
import { backoffDelayMs } from './backoff.js';
import { systemActorName } from './job-audit.js';
import { createJobRegistry, type JobCtx, type JobDefinition, scheduleText } from './job-definition.js';
import { claimJobKey } from './job-store.js';
import { dailyOccurrence, everySlot } from './occurrences.js';
import { redactErrorText } from './redact-error-text.js';

export const DEFAULT_POLL_MS = 15_000;
/** How long a claimed run may take before another worker may take it over. */
export const DEFAULT_LEASE_MS = 2 * 60_000;
const MAX_RUNS_PER_TICK = 500;
const MIN_MS = 60_000;

/** A run that used its last attempt (handed to EP-37's alerting later). */
export interface JobFailure {
  shopId: string;
  jobName: string;
  runCode: string;
  attempts: number;
  errorText: string;
}

export type SchedulerLog = (message: string, err?: unknown) => void;

export interface SchedulerOptions {
  pool: pg.Pool;
  clock: Clock;
  jobs: readonly JobDefinition[];
  /** Unique per process; defaults to host:pid:random. */
  workerId?: string;
  /** Only these shops (tests); default every shop. */
  shopIds?: readonly string[];
  pollMs?: number;
  leaseMs?: number;
  log?: SchedulerLog;
  onJobFailed?: (failure: JobFailure) => void | Promise<void>;
}

export interface Scheduler {
  /** One pass: ensure recurring occurrences, then run every due row. Resolves to the runs attempted. */
  tick(): Promise<number>;
  /** Tick now and then `pollMs` after each tick finishes, until stop(). */
  start(): void;
  /** Stop polling and wait for a tick in progress. */
  stop(): Promise<void>;
}

/** The run's lease passed to another worker before this one finished; its changes were rolled back. */
export class LeaseLostError extends Error {
  constructor(jobName: string, runCode: string) {
    super(`Job ${jobName} run ${runCode} lost its lease before finishing`);
    this.name = 'LeaseLostError';
  }
}

interface PendingRow {
  id: string;
  job_name: string;
  run_key: string;
  due_at: Date;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  attempts: number;
  max_attempts: number;
  run_id: string | null;
}

interface ClaimedRun {
  id: string;
  job: JobDefinition;
  dueAt: Date;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  runId: string;
  runCode: string;
  now: Date;
}

const defaultLog: SchedulerLog = (message, err) => {
  if (err === undefined) console.log(message);
  else console.error(`${message}: ${redactErrorText(err)}`);
};

export function createScheduler(options: SchedulerOptions): Scheduler {
  const { pool, clock } = options;
  const registry = createJobRegistry(options.jobs);
  const jobNames = [...registry.keys()];
  const workerId = options.workerId ?? `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const log = options.log ?? defaultLog;
  const onJobFailed =
    options.onJobFailed ??
    ((f: JobFailure) => log(`[jobs] ${f.jobName} run ${f.runCode} failed after ${f.attempts} attempts`, f.errorText));
  const shopContexts = new Map<string, ShopContext>();

  async function listShops(): Promise<ShopContext[]> {
    const ids = options.shopIds ?? (await pool.query<{ id: string }>('select id from shops order by id')).rows.map((r) => r.id);
    const shops: ShopContext[] = [];
    for (const id of ids) {
      let shop = shopContexts.get(id);
      if (!shop) {
        shop = await loadShopContext(pool, id);
        shopContexts.set(id, shop);
      }
      shops.push(shop);
    }
    return shops;
  }

  async function ensureRecurring(client: pg.PoolClient, shop: ShopContext, now: Date): Promise<void> {
    const today = shopDate(now.getTime());
    for (const job of registry.values()) {
      await client.query(
        `insert into job_definitions (shop_id, name, label, schedule_kind, schedule, max_attempts, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (shop_id, name) do update
           set label = excluded.label, schedule_kind = excluded.schedule_kind, schedule = excluded.schedule,
               max_attempts = excluded.max_attempts, updated_at = excluded.updated_at
         where (job_definitions.label, job_definitions.schedule_kind, job_definitions.schedule, job_definitions.max_attempts)
               is distinct from (excluded.label, excluded.schedule_kind, excluded.schedule, excluded.max_attempts)`,
        [shop.shopId, job.name, job.label, job.schedule.kind, scheduleText(job.schedule), job.maxAttempts, now],
      );
      const schedule = job.schedule;
      if (schedule.kind === 'delay') continue;
      if (schedule.kind === 'daily') {
        // Run keys of daily jobs are Asia/Kolkata dates (YYYY-MM-DD), which sort as text. Only
        // occurrences that never started (no JobRun) are skipped, so no JobRun is left open.
        await client.query(
          `update pending_jobs set status = 'skipped'
            where shop_id = $1 and job_name = $2 and status = 'pending' and run_key < $3
              and attempts = 0 and run_id is null`,
          [shop.shopId, job.name, today],
        );
      }
      const open = await client.query(
        `select 1 from pending_jobs where shop_id = $1 and job_name = $2 and status in ('pending', 'running') limit 1`,
        [shop.shopId, job.name],
      );
      if (open.rows.length > 0) continue;
      let candidates: Array<{ runKey: string; dueAt: number }>;
      if (schedule.kind === 'every') {
        const slot = everySlot(now.getTime(), schedule.minutes);
        const next = slot + schedule.minutes * MIN_MS;
        candidates = [
          { runKey: new Date(slot).toISOString(), dueAt: slot },
          { runKey: new Date(next).toISOString(), dueAt: next },
        ];
      } else {
        const tomorrow = addShopDays(today, 1);
        candidates = [
          { runKey: today, dueAt: dailyOccurrence(today, schedule.hour, schedule.minute) },
          { runKey: tomorrow, dueAt: dailyOccurrence(tomorrow, schedule.hour, schedule.minute) },
        ];
      }
      for (const c of candidates) {
        const inserted = await client.query(
          `insert into pending_jobs (shop_id, job_name, run_key, due_at, idempotency_key, max_attempts, created_at)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (shop_id, job_name, run_key) do nothing returning id`,
          [shop.shopId, job.name, c.runKey, new Date(c.dueAt), job.runIdempotencyKey?.(c.runKey) ?? null, job.maxAttempts, now],
        );
        if (inserted.rows.length > 0) break;
      }
    }
  }

  function claimNext(shop: ShopContext): Promise<ClaimedRun | undefined> {
    const now = clock.now();
    return withTransaction(pool, async (client) => {
      const { rows } = await client.query<PendingRow>(
        `select id, job_name, run_key, due_at, payload, idempotency_key, attempts, max_attempts, run_id
           from pending_jobs
          where shop_id = $1 and job_name = any($2::text[])
            and ((status = 'pending' and coalesce(next_attempt_at, due_at) <= $3)
              or (status = 'running' and locked_until <= $3 and attempts < max_attempts))
          order by coalesce(next_attempt_at, due_at), id
          limit 1
          for update skip locked`,
        [shop.shopId, jobNames, now],
      );
      const row = rows[0];
      const job = row ? registry.get(row.job_name) : undefined;
      if (!row || !job) return undefined;
      const attempts = row.attempts + 1;
      let runId: string;
      let runCode: string;
      if (row.run_id === null) {
        runCode = await nextCode(client, shop, { table: 'job_runs', prefix: `RUN-${now.getUTCFullYear()}`, pad: 5 });
        const inserted = await client.query<{ id: string }>(
          `insert into job_runs (shop_id, code, job_name, idempotency_key, scheduled_at, started_at, attempts)
           values ($1, $2, $3, $4, $5, $6, $7) returning id`,
          [shop.shopId, runCode, row.job_name, row.idempotency_key, row.due_at, now, attempts],
        );
        runId = inserted.rows[0].id;
      } else {
        const updated = await client.query<{ code: string }>(
          'update job_runs set attempts = $3 where shop_id = $1 and id = $2 returning code',
          [shop.shopId, row.run_id, attempts],
        );
        runId = row.run_id;
        runCode = updated.rows[0].code;
      }
      await client.query(
        `update pending_jobs
            set status = 'running', attempts = $2, locked_by = $3, locked_until = $4, run_id = $5
          where id = $1`,
        [row.id, attempts, workerId, new Date(now.getTime() + leaseMs), runId],
      );
      return {
        id: row.id,
        job,
        dueAt: row.due_at,
        payload: row.payload,
        idempotencyKey: row.idempotency_key,
        attempts,
        maxAttempts: row.max_attempts,
        runId,
        runCode,
        now,
      };
    });
  }

  async function runClaimed(shop: ShopContext, run: ClaimedRun): Promise<void> {
    const { job } = run;
    try {
      await runInTransaction(
        pool,
        async (tx) => {
          const ctx: JobCtx = {
            shop,
            now: run.now,
            dueAt: run.dueAt,
            jobName: job.name,
            runCode: run.runCode,
            attempt: run.attempts,
            payload: run.payload,
            actorName: systemActorName(job.label),
            claimKey: (key) => claimJobKey(tx.client, shop, key, job.name, run.now),
          };
          const act =
            run.idempotencyKey === null || (await claimJobKey(tx.client, shop, run.idempotencyKey, job.name, run.now));
          if (act) await job.handler(tx, ctx);
          const done = await tx.client.query(
            `update pending_jobs set status = 'done', locked_by = null, locked_until = null, next_attempt_at = null
              where id = $1 and status = 'running' and locked_by = $2 and attempts = $3`,
            [run.id, workerId, run.attempts],
          );
          if (done.rowCount !== 1) throw new LeaseLostError(job.name, run.runCode);
          await tx.client.query(
            `update job_runs set finished_at = $3, result = 'ok', error_text = null where shop_id = $1 and id = $2`,
            [shop.shopId, run.runId, clock.now()],
          );
        },
        log,
      );
    } catch (err) {
      if (err instanceof LeaseLostError) {
        log(`[jobs] ${err.message}; its changes were rolled back`);
        return;
      }
      await recordFailure(shop, run, err);
    }
  }

  async function recordFailure(shop: ShopContext, run: ClaimedRun, err: unknown): Promise<void> {
    const errorText = redactErrorText(err);
    const now = clock.now();
    const retry = run.attempts < run.maxAttempts;
    const failed = await withTransaction(pool, async (client) => {
      const released = retry
        ? await client.query(
            `update pending_jobs set status = 'pending', next_attempt_at = $4, locked_by = null, locked_until = null
              where id = $1 and status = 'running' and locked_by = $2 and attempts = $3`,
            [run.id, workerId, run.attempts, new Date(now.getTime() + backoffDelayMs(run.attempts))],
          )
        : await client.query(
            `update pending_jobs set status = 'failed', locked_by = null, locked_until = null
              where id = $1 and status = 'running' and locked_by = $2 and attempts = $3`,
            [run.id, workerId, run.attempts],
          );
      // Another worker took the run over: it records the outcome.
      if (released.rowCount !== 1) return false;
      if (retry) {
        await client.query(`update job_runs set result = 'retrying', error_text = $3 where shop_id = $1 and id = $2`, [
          shop.shopId,
          run.runId,
          errorText,
        ]);
      } else {
        await client.query(
          `update job_runs set result = 'failed', finished_at = $3, error_text = $4 where shop_id = $1 and id = $2`,
          [shop.shopId, run.runId, now, errorText],
        );
      }
      return !retry;
    });
    if (!failed) return;
    try {
      await onJobFailed({ shopId: shop.shopId, jobName: run.job.name, runCode: run.runCode, attempts: run.attempts, errorText });
    } catch (hookErr) {
      log('[jobs] failure hook failed', hookErr);
    }
  }

  /**
   * A worker that stopped during a run's last attempt leaves it `running` with an expired lease.
   * It gets no extra attempt: the row and its JobRun are marked failed and handed to onJobFailed.
   */
  async function failExhaustedLeases(shop: ShopContext): Promise<void> {
    const now = clock.now();
    const errorText = 'The run stopped on its last attempt before finishing (lease expired).';
    const failures = await withTransaction(pool, async (client) => {
      const { rows } = await client.query<{ job_name: string; attempts: number; code: string }>(
        `with exhausted as (
           update pending_jobs set status = 'failed', locked_by = null, locked_until = null
            where shop_id = $1 and job_name = any($2::text[]) and status = 'running'
              and locked_until <= $3 and attempts >= max_attempts
            returning run_id, job_name, attempts
         )
         update job_runs r set result = 'failed', finished_at = $3, error_text = $4
           from exhausted e
          where r.shop_id = $1 and r.id = e.run_id
         returning e.job_name, e.attempts, r.code`,
        [shop.shopId, jobNames, now, errorText],
      );
      return rows;
    });
    for (const f of failures) {
      try {
        await onJobFailed({ shopId: shop.shopId, jobName: f.job_name, runCode: f.code, attempts: f.attempts, errorText });
      } catch (hookErr) {
        log('[jobs] failure hook failed', hookErr);
      }
    }
  }

  async function tick(): Promise<number> {
    let ran = 0;
    for (const shop of await listShops()) {
      await withTransaction(pool, (client) => ensureRecurring(client, shop, clock.now()));
      await failExhaustedLeases(shop);
      while (ran < MAX_RUNS_PER_TICK) {
        const run = await claimNext(shop);
        if (!run) break;
        await runClaimed(shop, run);
        ran++;
      }
    }
    return ran;
  }

  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  let running = false;

  function loop(): void {
    inFlight = tick()
      .then(
        () => undefined,
        (err: unknown) => log('[jobs] tick failed', err),
      )
      .finally(() => {
        inFlight = undefined;
        if (running) timer = setTimeout(loop, pollMs);
      });
  }

  return {
    tick,
    start() {
      if (running) return;
      running = true;
      loop();
    },
    async stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await inFlight;
    },
  };
}
