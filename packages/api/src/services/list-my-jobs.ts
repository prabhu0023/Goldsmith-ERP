/**
 * List My Jobs (EP-05-S3 AC2): the karigar's own jobs, by job code. Filtered in SQL by the
 * karigar record on the caller's user row; a caller without one gets an empty page.
 */
import type { contract } from '@goldsmith/shared';
import { callerKarigarId } from '../auth/karigar-scope.js';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { decodeTextCursor, encodeTextCursor } from '../users/text-cursor.js';
import { MY_JOB_COLUMNS, type MyJobRow, toMyJob } from './my-job-row.js';

export const listMyJobs: Handler<typeof contract.listMyJobs> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const after = input.cursor === undefined ? undefined : decodeTextCursor(input.cursor);
  const karigarId = await callerKarigarId(tx, ctx);
  if (karigarId === null) return { ok: true, items: [], nextCursor: null, pageSize };
  const params: unknown[] = [ctx.shop.shopId, karigarId];
  let afterSql = '';
  if (after) {
    params.push(after[0], after[1]);
    afterSql = ' and (code, id) > ($3, $4::uuid)';
  }
  params.push(pageSize + 1);
  const { rows } = await tx.client.query<MyJobRow>(
    `select ${MY_JOB_COLUMNS} from karigar_jobs
      where shop_id = $1 and karigar_id = $2${afterSql}
      order by code, id
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeTextCursor([last.code, last.id]) : null;
  return { ok: true, items: page.map(toMyJob), nextCursor, pageSize };
};
