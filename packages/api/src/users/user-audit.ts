/**
 * Audit entries for user lifecycle changes (EP-05-S14): add, edit, role change, deactivate,
 * reactivate and karigar link. Written in the operation's transaction, so a refused or
 * rolled-back change leaves no entry. Before and after values go through redactSecrets, so
 * phones and emails are masked, and so are any phones or emails typed into the reason; value keys must not contain "code", "token", "link",
 * "password" or "secret", because redactSecrets drops those keys (use `karigarId`).
 */
import type { Actor } from '@goldsmith/shared';
import type pg from 'pg';
import { appendAudit } from '../audit/audit-writer.js';
import { maskContactsInText } from '../auth/mask.js';
import type { ShopContext } from '../db/shop-context.js';

/** Audit kinds use only a-z and _: the order-safe kind-check widening keeps no other kind (docs/setup/parallel-lanes.md). */
export type UserAuditKind =
  | 'user_added'
  | 'user_edited'
  | 'role_changed'
  | 'user_deactivated'
  | 'user_reactivated'
  | 'karigar_linked';

export interface UserAuditEntry {
  kind: UserAuditKind;
  at: Date;
  /** The user the change is about. */
  userId: string;
  /** A short sentence with no phone or email, e.g. "Deepak Rao added as staff". */
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

export async function writeUserLifecycleAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  actor: Actor,
  { kind, at, userId, summary, before, after, reason }: UserAuditEntry,
): Promise<void> {
  const detail = { entity: 'user', entityId: userId, ...(reason ? { reason: maskContactsInText(reason) } : {}) };
  await appendAudit(client, {
    shopId: shop.shopId,
    at,
    actor: { kind: 'user', ...actor },
    kind,
    entityType: 'user',
    entityId: userId,
    summary,
    detail: JSON.stringify(detail),
    reason: reason ?? null,
    before,
    after,
  });
}
