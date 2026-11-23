/**
 * Read Audit Entry (EP-06-S11): one entry of the owner's security log with its before and after
 * values, reason, token reference and the entry it corrects. Owner only (S12).
 */
import type { contract } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';
import { readEntry } from './audit-reads.js';
export const readAuditEntry: Handler<typeof contract.readAuditEntry> = async (tx, ctx, input) => ({
  ok: true,
  entry: await readEntry(tx.client, ctx.shop, input.id),
});
