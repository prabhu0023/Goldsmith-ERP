/**
 * Helpers for the EP-10 job tests: a clock the test moves, rows the jobs act on, and a scheduler
 * scoped to the test's own shop (test files run in parallel on one database).
 */
import type pg from 'pg';
import type { JobDefinition } from '../../src/jobs/job-definition.js';
import { createScheduler, type Scheduler, type SchedulerOptions } from '../../src/jobs/scheduler.js';
import type { Clock } from '../../src/pipeline/server-clock.js';
import { addKarigar, addPiece, newShop, type TestShop } from '../db/db-test-helpers.js';

type Queryable = pg.Pool | pg.PoolClient;

export interface ManualClock extends Clock {
  set(at: Date | string): void;
  advance(ms: number): void;
}

/** A clock that stands still until the test sets or advances it. */
export function manualClock(start: Date | string): ManualClock {
  let ms = new Date(start).getTime();
  return {
    now: () => new Date(ms),
    set: (at) => {
      ms = new Date(at).getTime();
    },
    advance: (delta) => {
      ms += delta;
    },
  };
}

/** A fresh shop (with its settings row) for one test. */
export const newJobsShop = (pool: Queryable): Promise<TestShop> => newShop(pool, 'Jobs test shop');

/** A scheduler on `pool` that sees only `shop` and logs nothing. */
export function makeScheduler(
  pool: pg.Pool,
  clock: Clock,
  shop: TestShop,
  jobs: readonly JobDefinition[],
  opts: Partial<Omit<SchedulerOptions, 'pool' | 'clock' | 'jobs'>> = {},
): Scheduler {
  return createScheduler({ pool, clock, jobs, shopIds: [shop.shopId], log: () => {}, ...opts });
}

/** Insert a lead; returns its id. */
export async function addLead(
  client: Queryable,
  shop: TestShop,
  values: { code: string; state?: string; arrivedAt: Date | string | null },
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `insert into leads (shop_id, code, source, state, arrived_at, customer_name, phone)
     values ($1, $2, 'whatsapp', $3, $4, 'Test customer', '+91 90000 00001') returning id`,
    [shop.shopId, values.code, values.state ?? 'needs_glance', values.arrivedAt === null ? null : new Date(values.arrivedAt)],
  );
  return res.rows[0].id;
}

/** Insert a karigar job (and its karigar); returns the job id. */
export async function addKarigarJob(
  client: Queryable,
  shop: TestShop,
  values: { code: string; status?: string; dueDate: Date | string; confirmedDate?: Date | string | null; karigarCode?: string },
): Promise<string> {
  const karigarId = await addKarigar(client, shop, values.karigarCode ?? `KG-${values.code}`);
  const res = await client.query<{ id: string }>(
    `insert into karigar_jobs (shop_id, code, karigar_id, status, sent_at, due_date, confirmed_date,
                               target_gross_units, target_net_units, tolerance_units, gold_issued_units)
     values ($1, $2, $3, $4, $5, $5, $6, 100000, 90000, 1000, 95000) returning id`,
    [
      shop.shopId,
      values.code,
      karigarId,
      values.status ?? 'on_bench',
      new Date(values.dueDate),
      values.confirmedDate ? new Date(values.confirmedDate) : null,
    ],
  );
  return res.rows[0].id;
}

/** Insert a piece and an edit proposal on its name, by default with a token sent; returns the edit id. */
export async function addPieceEdit(
  client: Queryable,
  shop: TestShop,
  values: { code: string; status?: string; tokenRef?: string | null; tokenIssuedAt?: Date | string | null; tagNo?: string },
): Promise<string> {
  const pieceId = await addPiece(client, shop, values.tagNo ?? `TAG-${values.code}`);
  const res = await client.query<{ id: string }>(
    `insert into piece_edits (shop_id, code, piece_id, field, before_text, after_text, reason, status,
                              token_ref, token_issued_at, proposed_by_name, proposed_at)
     values ($1, $2, $3, 'name', 'Old name', 'New name', 'Typo', $4, $5, $6, 'Rajesh Verma', $6) returning id`,
    [
      shop.shopId,
      values.code,
      pieceId,
      values.status ?? 'token_sent',
      values.tokenRef === undefined ? `tok-${values.code}` : values.tokenRef,
      values.tokenIssuedAt ? new Date(values.tokenIssuedAt) : null,
    ],
  );
  return res.rows[0].id;
}

/** Insert a customer; returns its id. */
export async function addCustomer(
  client: Queryable,
  shop: TestShop,
  values: { code: string; name?: string; phone: string; dob?: string | null; anniversary?: string | null; optedIn?: boolean },
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `insert into customers (shop_id, code, name, phone, customer_group, dob, anniversary, opted_in)
     values ($1, $2, $3, $4, 'Regular', $5, $6, $7) returning id`,
    [
      shop.shopId,
      values.code,
      values.name ?? 'Test customer',
      values.phone,
      values.dob ?? null,
      values.anniversary ?? null,
      values.optedIn ?? true,
    ],
  );
  return res.rows[0].id;
}

/** A test job named `name` running `handler` (delay schedule, 3 attempts unless overridden). */
export function testJob(
  name: string,
  handler: JobDefinition['handler'],
  overrides: Partial<Omit<JobDefinition, 'name' | 'handler'>> = {},
): JobDefinition {
  return { name, label: `${name} job`, schedule: { kind: 'delay' }, maxAttempts: 3, handler, ...overrides };
}

export interface RunRow {
  code: string;
  job_name: string;
  scheduled_at: Date;
  started_at: Date;
  finished_at: Date | null;
  attempts: number;
  result: string | null;
  error_text: string | null;
}

/** The shop's JobRuns, oldest first. */
export async function runsOf(client: Queryable, shop: TestShop, jobName?: string): Promise<RunRow[]> {
  const res = await client.query<RunRow>(
    `select code, job_name, scheduled_at, started_at, finished_at, attempts, result, error_text
       from job_runs where shop_id = $1 and ($2::text is null or job_name = $2) order by started_at, code`,
    [shop.shopId, jobName ?? null],
  );
  return res.rows;
}

/** The status of the shop's pending row for (job, run key). */
export async function pendingStatus(client: Queryable, shop: TestShop, jobName: string, runKey: string): Promise<string | undefined> {
  const res = await client.query<{ status: string }>(
    'select status from pending_jobs where shop_id = $1 and job_name = $2 and run_key = $3',
    [shop.shopId, jobName, runKey],
  );
  return res.rows[0]?.status;
}
