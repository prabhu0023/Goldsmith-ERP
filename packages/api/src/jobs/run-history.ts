/**
 * The Owner's list of recent JobRuns (EP-10-S13, S2 AC5): newest first by start time, keyset
 * paged on (started_at desc, id desc) with the shared cursor format. Times go out as UTC ISO and
 * as Asia/Kolkata ISO with offset; the id is the run code, never the uuid.
 */
import { formatShopTime, type OperationResult } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { ValidationError } from '../pipeline/api-errors.js';
import { decodeCursor, encodeCursor, INVALID_CURSOR_MESSAGE } from '../pipeline/paging.js';

export type JobRunResult = 'ok' | 'retrying' | 'failed';
export type JobRunItem = OperationResult<'listJobRuns'>['items'][number];

export interface ListRunsQuery {
  cursor?: string;
  /** Already clamped (clampPageSize). */
  pageSize: number;
  result?: JobRunResult;
  /** Only runs of this job (e.g. lead-sla-breach, wishes-9am). */
  jobName?: string;
}

interface RunListRow {
  id: string;
  code: string;
  job_name: string;
  scheduled_at: Date;
  started_at: Date;
  finished_at: Date | null;
  attempts: number;
  result: JobRunResult | null;
  error_text: string | null;
  page_sort: string;
}

const toItem = (row: RunListRow): JobRunItem => ({
  id: row.code,
  jobName: row.job_name,
  scheduledAt: row.scheduled_at.toISOString(),
  scheduledAtLocal: formatShopTime(row.scheduled_at.getTime()),
  startedAt: row.started_at.toISOString(),
  startedAtLocal: formatShopTime(row.started_at.getTime()),
  finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  finishedAtLocal: row.finished_at ? formatShopTime(row.finished_at.getTime()) : null,
  attempts: row.attempts,
  result: row.result,
  errorText: row.error_text,
});

export async function listRuns(
  client: pg.Pool | pg.PoolClient,
  shop: ShopContext,
  { cursor, pageSize, result, jobName }: ListRunsQuery,
): Promise<{ items: JobRunItem[]; nextCursor: string | null }> {
  const params: unknown[] = [shop.shopId];
  let where = 'where shop_id = $1';
  if (result !== undefined) {
    params.push(result);
    where += ` and result = $${params.length}`;
  }
  if (jobName !== undefined) {
    params.push(jobName);
    where += ` and job_name = $${params.length}`;
  }
  if (cursor !== undefined) {
    const [sortText, id] = decodeCursor(cursor);
    params.push(sortText, id);
    where += ` and (started_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(pageSize + 1);
  const rows = await client
    .query<RunListRow>(
      `select id, code, job_name, scheduled_at, started_at, finished_at, attempts, result, error_text,
              started_at::text as page_sort
         from job_runs
        ${where}
        order by started_at desc, id desc
        limit $${params.length}`,
      params,
    )
    .then(
      (res) => res.rows,
      (err: unknown) => {
        // A well-formed cursor whose time PostgreSQL cannot read: data exception.
        if (cursor !== undefined && String((err as { code?: unknown }).code ?? '').startsWith('22')) {
          throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
        }
        throw err;
      },
    );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeCursor([last.page_sort, last.id]) : null;
  return { items: page.map(toItem), nextCursor };
}
