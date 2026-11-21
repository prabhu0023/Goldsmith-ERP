/**
 * Scheduling, cancelling and idempotency keys (EP-10-S1, S4). Internal functions for service
 * code, never contract operations: a browser cannot schedule, cancel or run a job.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';

type Queryable = pg.Pool | pg.PoolClient;

export interface ScheduleJobInput {
  jobName: string;
  /** One row per occurrence: the same (job, run key) is updated, not added twice. */
  runKey: string;
  dueAt: Date;
  maxAttempts: number;
  now: Date;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

/**
 * Schedule an occurrence, or move a pending one to the new due time. A cancelled occurrence is
 * scheduled afresh; a running or finished one is left as it is. True when the row is pending.
 */
export async function scheduleJob(client: Queryable, shop: ShopContext, input: ScheduleJobInput): Promise<boolean> {
  const res = await client.query(
    `insert into pending_jobs (shop_id, job_name, run_key, due_at, payload, idempotency_key, max_attempts, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (shop_id, job_name, run_key) do update
       set due_at = excluded.due_at, payload = excluded.payload,
           idempotency_key = excluded.idempotency_key, max_attempts = excluded.max_attempts,
           status = 'pending',
           attempts = case when pending_jobs.status = 'cancelled' then 0 else pending_jobs.attempts end,
           next_attempt_at = case when pending_jobs.status = 'cancelled' then null else pending_jobs.next_attempt_at end,
           run_id = case when pending_jobs.status = 'cancelled' then null else pending_jobs.run_id end
     where pending_jobs.status in ('pending', 'cancelled')`,
    [
      shop.shopId,
      input.jobName,
      input.runKey,
      input.dueAt,
      JSON.stringify(input.payload ?? {}),
      input.idempotencyKey ?? null,
      input.maxAttempts,
      input.now,
    ],
  );
  return res.rowCount === 1;
}

/** Cancel a pending occurrence; true when one was cancelled. Running or finished rows are unchanged. */
export async function cancelJob(client: Queryable, shop: ShopContext, jobName: string, runKey: string): Promise<boolean> {
  const res = await client.query(
    `update pending_jobs set status = 'cancelled'
      where shop_id = $1 and job_name = $2 and run_key = $3 and status = 'pending'`,
    [shop.shopId, jobName, runKey],
  );
  return res.rowCount === 1;
}

/**
 * Claim an idempotency key in the caller's transaction. False when it is already claimed (by a
 * committed run, or by a concurrent one that then commits). A rollback frees the key again.
 */
export async function claimJobKey(
  client: Queryable,
  shop: ShopContext,
  key: string,
  jobName: string,
  now: Date,
): Promise<boolean> {
  const res = await client.query(
    `insert into job_keys (shop_id, idempotency_key, job_name, claimed_at) values ($1, $2, $3, $4)
     on conflict (shop_id, idempotency_key) do nothing returning id`,
    [shop.shopId, key, jobName, now],
  );
  return res.rows.length === 1;
}
