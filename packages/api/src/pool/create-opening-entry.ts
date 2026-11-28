/**
 * Create Opening Entry (EP-18-S2): the owner records the pool's starting balance, once. It is
 * allowed only while the shop's ledger has no entry at all; after that the owner uses an
 * adjustment. The pool lock is taken first, so two opening entries cannot both pass the check.
 */
import { type contract, METAL_POOL_ENTITY_ID, POOL_MESSAGES, unitsToGrams } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { ApiError, ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { lockPool } from './lock-pool.js';
import { postPoolEntry } from './post-pool-entry.js';
export const createOpeningEntry: Handler<typeof contract.createOpeningEntry> = async (tx, ctx, input) => {
  const amountUnits = input.amountG;
  if (amountUnits <= 0) throw new ValidationError('amountG', 'The opening balance must be a weight above zero.');
  const pool = await lockPool(tx, ctx.shop);
  const { rows } = await tx.client.query('select 1 from pool_entries where shop_id = $1 limit 1', [ctx.shop.shopId]);
  if (rows.length > 0) throw new ApiError('opening_exists', POOL_MESSAGES.openingExists);
  const note = input.note || null;
  const posted = await postPoolEntry(tx, ctx, {
    kind: 'opening',
    deltaUnits: amountUnits,
    note: note ?? 'Opening balance',
  });
  await auditChange(tx, ctx, {
    kind: 'pool_opening_recorded',
    entityType: 'metal_pool',
    entityId: METAL_POOL_ENTITY_ID,
    ref: posted.code,
    summary: `Opening balance of ${unitsToGrams(amountUnits)} g recorded in the metal pool (${posted.code})`,
    reason: note,
    before: { balanceG: pool.balanceUnits },
    after: { balanceG: posted.balanceUnits, deltaG: amountUnits },
  });
  return { ok: true, id: posted.code };
};
