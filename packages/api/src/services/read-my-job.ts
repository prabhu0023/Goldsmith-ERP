/**
 * Read My Job (EP-05-S3 AC1, AC3): one of the karigar's own jobs by its code. Another karigar's
 * job, or any job for a caller without a karigar record, answers not_found, as if it did not
 * exist.
 */
import type { contract } from '@goldsmith/shared';
import { callerKarigarId } from '../auth/karigar-scope.js';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { MY_JOB_COLUMNS, type MyJobRow, toMyJob } from './my-job-row.js';

export const readMyJob: Handler<typeof contract.readMyJob> = async (tx, ctx, input) => {
  const karigarId = await callerKarigarId(tx, ctx);
  if (karigarId === null) throw new NotFoundError('Job', input.jobId);
  const { rows } = await tx.client.query<MyJobRow>(
    `select ${MY_JOB_COLUMNS} from karigar_jobs where shop_id = $1 and code = $2 and karigar_id = $3`,
    [ctx.shop.shopId, input.jobId, karigarId],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Job', input.jobId);
  return { ok: true, job: toMyJob(row) };
};
