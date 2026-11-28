/**
 * Read Gold With Karigar (EP-18-S11): the gold one karigar holds on open jobs. The owner names
 * the karigar by code. A karigar sees only their own figure: no code means their own, and another
 * karigar's code, or a user not linked to a karigar record, answers not_found as if it did not
 * exist (the karigar scope of EP-05-S3). No money, nothing of any other karigar.
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import { callerKarigarId } from '../auth/karigar-scope.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { openJobGold } from './open-job-gold.js';
export const readGoldWithKarigar: Handler<typeof contract.readGoldWithKarigar> = async (tx, ctx, input) => {
  const karigarCode = input.karigarId;
  let own: string | null = null;
  if (ctx.by.role === 'karigar') {
    own = await callerKarigarId(tx, ctx);
    if (own === null) throw new NotFoundError('Karigar', karigarCode ?? 'record');
  } else if (karigarCode === undefined) {
    throw new ValidationError('karigarId', 'Say which karigar to show.');
  }
  const found = await tx.client.query<{ id: string; code: string; name: string }>(
    karigarCode === undefined
      ? 'select id, code, name from karigars where shop_id = $1 and id = $2'
      : 'select id, code, name from karigars where shop_id = $1 and code = $2',
    [ctx.shop.shopId, karigarCode ?? own],
  );
  const karigar = found.rows[0];
  if (!karigar || (own !== null && karigar.id !== own)) throw new NotFoundError('Karigar', karigarCode ?? 'record');
  const jobs = await openJobGold(tx.client, ctx.shop, karigar.id);
  return {
    ok: true,
    karigarId: karigar.code,
    karigarName: karigar.name,
    goldG: unitsToGrams(jobs.reduce((sum, job) => sum + job.withKarigarUnits, 0)),
    openJobs: jobs.length,
    jobs: jobs.map((job) => ({
      jobId: job.jobCode,
      issuedG: unitsToGrams(job.issuedUnits),
      returnedG: unitsToGrams(job.returnedUnits),
      withKarigarG: unitsToGrams(job.withKarigarUnits),
    })),
  };
};
