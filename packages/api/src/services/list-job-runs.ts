/**
 * List Job Runs (EP-10-S13): the Owner's view of recent runs, newest first, optionally only one
 * result or one job. Owner only, by the central permission check (EP-05-S2).
 */
import type { contract } from '@goldsmith/shared';
import { listRuns } from '../jobs/run-history.js';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';

export const listJobRuns: Handler<typeof contract.listJobRuns> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const page = await listRuns(tx.client, ctx.shop, {
    cursor: input.cursor,
    pageSize,
    result: input.result,
    jobName: input.jobName,
  });
  return { ok: true, items: page.items, nextCursor: page.nextCursor, pageSize };
};
