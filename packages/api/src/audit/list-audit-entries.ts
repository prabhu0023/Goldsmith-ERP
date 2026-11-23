/**
 * List Audit Entries (EP-06-S9, S10): the owner's security log, newest first, filtered by group,
 * entity, actor and shop dates. Owner only, by the central permission check (S12).
 */
import type { contract } from '@goldsmith/shared';
import { ValidationError } from '../pipeline/api-errors.js';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { listEntries } from './audit-reads.js';
export const listAuditEntries: Handler<typeof contract.listAuditEntries> = async (tx, ctx, input) => {
  // ISO dates compare as text.
  if (input.from !== undefined && input.to !== undefined && input.to < input.from) {
    throw new ValidationError('to', 'The end date must be on or after the start date.');
  }
  const pageSize = clampPageSize(input.pageSize);
  const page = await listEntries(tx.client, ctx.shop, {
    cursor: input.cursor,
    pageSize,
    group: input.group,
    entity: input.entity,
    actorId: input.actorId,
    actorRole: input.actorRole,
    from: input.from,
    to: input.to,
  });
  return { ok: true, items: page.items, nextCursor: page.nextCursor, pageSize };
};
