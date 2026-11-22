/**
 * Retry Job Run (EP-10-S13 AC3, AC5): the Owner puts a failed run back in the queue for one more
 * attempt. The occurrence keeps its idempotency key, so a run whose effect already happened does
 * not happen twice. The retry is audited with the Owner as actor.
 */
import { type contract, DomainError } from '@goldsmith/shared';
import { writeUserAudit } from '../jobs/job-audit.js';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';

export const retryJobRun: Handler<typeof contract.retryJobRun> = async (tx, ctx, input) => {
  const { rows } = await tx.client.query<{ id: string; code: string; job_name: string; result: string | null }>(
    'select id, code, job_name, result from job_runs where shop_id = $1 and code = $2 for update',
    [ctx.shop.shopId, input.runId],
  );
  const run = rows[0];
  if (!run) throw new NotFoundError('Job run', input.runId);
  if (run.result !== 'failed') throw new DomainError('Only a failed run can be retried.');
  await tx.client.query(
    `update pending_jobs
        set status = 'pending', next_attempt_at = $3, max_attempts = attempts + 1, locked_by = null, locked_until = null
      where shop_id = $1 and run_id = $2`,
    [ctx.shop.shopId, run.id, ctx.at],
  );
  await tx.client.query(`update job_runs set result = 'retrying', finished_at = null where shop_id = $1 and id = $2`, [
    ctx.shop.shopId,
    run.id,
  ]);
  await writeUserAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'job_run_retried',
    at: ctx.at,
    summary: `Retried ${run.job_name} run ${run.code}`,
    reference: run.code,
  });
  return { ok: true };
};
