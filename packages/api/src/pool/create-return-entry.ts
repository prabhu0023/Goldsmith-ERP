/**
 * Create Return Entry (EP-18-S7): the owner records gold a karigar gave back for a job. The pool
 * lock is taken before the job and its earlier returns are read (lock order: pool, then job), so
 * two returns cannot both fit in the same room. The amount may not exceed the job's issued gold
 * less what was already returned; any existing job qualifies, whatever its status.
 */
import { type contract, DomainError, METAL_POOL_ENTITY_ID, POOL_MESSAGES, returnRoomUnits, unitsToGrams } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { lockPool } from './lock-pool.js';
import { postPoolEntry } from './post-pool-entry.js';
export const createReturnEntry: Handler<typeof contract.createReturnEntry> = async (tx, ctx, input) => {
  const amountUnits = input.amountG;
  if (amountUnits <= 0) throw new ValidationError('amountG', 'The returned gold must be a weight above zero.');
  const pool = await lockPool(tx, ctx.shop);
  const job = await tx.client.query<{ code: string; gold_issued_units: number }>(
    'select code, gold_issued_units from karigar_jobs where shop_id = $1 and code = $2',
    [ctx.shop.shopId, input.jobId],
  );
  if (!job.rows[0]) throw new NotFoundError('Job', input.jobId);
  const { code, gold_issued_units: issuedUnits } = job.rows[0];
  const returned = await tx.client.query<{ returned_units: number }>(
    `select coalesce(sum(delta_units), 0)::bigint as returned_units from pool_entries
      where shop_id = $1 and kind = 'returned' and ref_type = 'job' and ref_id = $2`,
    [ctx.shop.shopId, code],
  );
  if (amountUnits > returnRoomUnits(issuedUnits, returned.rows[0].returned_units)) {
    throw new DomainError(POOL_MESSAGES.returnTooMuch);
  }
  const note = input.note || null;
  const posted = await postPoolEntry(tx, ctx, {
    kind: 'returned',
    deltaUnits: amountUnits,
    note: note ?? `Returned from job ${code}`,
    ref: { type: 'job', id: code },
  });
  await auditChange(tx, ctx, {
    kind: 'pool_return_recorded',
    entityType: 'metal_pool',
    entityId: METAL_POOL_ENTITY_ID,
    ref: code,
    summary: `${unitsToGrams(amountUnits)} g returned to the metal pool from job ${code} (${posted.code})`,
    reason: note,
    before: { balanceG: pool.balanceUnits },
    after: { balanceG: posted.balanceUnits, deltaG: amountUnits },
  });
  return { ok: true, id: posted.code };
};
