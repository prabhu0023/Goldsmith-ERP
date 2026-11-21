/**
 * What a background job is (EP-10-S1): a unique name, a label for the System actor, a schedule,
 * how many attempts a run gets, and a handler that runs inside one transaction.
 */
import type { ShopContext } from '../db/shop-context.js';
import type { Tx } from '../pipeline/operation-transaction.js';

/**
 * `delay`: rows are scheduled by service code (scheduleJob). `every`: one run per N-minute slot
 * since the epoch (UTC). `daily`: once a day at a wall time in Asia/Kolkata.
 */
export type JobSchedule =
  | { kind: 'delay' }
  | { kind: 'every'; minutes: number }
  | { kind: 'daily'; hour: number; minute: number };

export interface JobCtx {
  shop: ShopContext;
  /** Server time when the run was claimed. */
  now: Date;
  /** When this occurrence was due. */
  dueAt: Date;
  jobName: string;
  /** The JobRun code, e.g. RUN-2026-00042. */
  runCode: string;
  /** 1 on the first try. */
  attempt: number;
  payload: Record<string, unknown>;
  /** "System (<label>)": the audit actor name for this job. */
  actorName: string;
  /** Claim an idempotency key in this run's transaction; false when already claimed (do nothing). */
  claimKey(key: string): Promise<boolean>;
}

export interface JobDefinition {
  name: string;
  label: string;
  schedule: JobSchedule;
  maxAttempts: number;
  handler(tx: Tx, ctx: JobCtx): Promise<void>;
  /** For every/daily jobs: the idempotency key of the occurrence with this run key. */
  runIdempotencyKey?: (runKey: string) => string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The text stored in job_definitions.schedule: `delay`, `every 1 minute`, `daily 09:00 Asia/Kolkata`. */
export function scheduleText(schedule: JobSchedule): string {
  switch (schedule.kind) {
    case 'delay':
      return 'delay';
    case 'every':
      return `every ${schedule.minutes} minute${schedule.minutes === 1 ? '' : 's'}`;
    case 'daily':
      return `daily ${pad(schedule.hour)}:${pad(schedule.minute)} Asia/Kolkata`;
  }
}

/** Index the jobs by name; a second job with the same name is refused. */
export function createJobRegistry(jobs: readonly JobDefinition[]): ReadonlyMap<string, JobDefinition> {
  const registry = new Map<string, JobDefinition>();
  for (const job of jobs) {
    if (registry.has(job.name)) throw new Error(`Job name ${JSON.stringify(job.name)} is used twice`);
    registry.set(job.name, job);
  }
  return registry;
}
