/**
 * Create Adjustment Entry (EP-18-S8): the owner corrects the pool by a signed amount with a
 * written reason (a recount, a found loss). Zero is refused; an adjustment that would take the
 * balance below zero is refused by the posting check, like any other entry.
 */
import { type contract, METAL_POOL_ENTITY_ID, unitsToGrams } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { lockPool } from './lock-pool.js';
import { postPoolEntry } from './post-pool-entry.js';
export const createAdjustmentEntry: Handler<typeof contract.createAdjustmentEntry> = async (tx, ctx, input) => {
  const deltaUnits = input.adjustmentDeltaG;
  if (deltaUnits === 0) throw new ValidationError('adjustmentDeltaG', 'The adjustment must not be zero.');
  const pool = await lockPool(tx, ctx.shop);
  const posted = await postPoolEntry(tx, ctx, { kind: 'adjustment', deltaUnits, note: input.reason });
  await auditChange(tx, ctx, {
    kind: 'pool_adjusted',
    entityType: 'metal_pool',
    entityId: METAL_POOL_ENTITY_ID,
    ref: posted.code,
    summary: `Metal pool adjusted by ${unitsToGrams(deltaUnits)} g (${posted.code})`,
    reason: input.reason,
    before: { balanceG: pool.balanceUnits },
    after: { balanceG: posted.balanceUnits, deltaG: deltaUnits },
  });
  return { ok: true, id: posted.code };
};
