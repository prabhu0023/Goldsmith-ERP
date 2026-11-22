/**
 * Audit entries for user lifecycle changes (EP-05-S14): add, edit, role change, deactivate,
 * reactivate and karigar link. Written in the operation's transaction, so a refused or
 * rolled-back change leaves no entry. Before and after values go through redactSecrets, so
 * phones and emails are masked; value keys must not contain "code", "token", "link",
 * "password" or "secret", because redactSecrets drops those keys (use `karigarId`).
 */
import type { Actor } from '@goldsmith/shared';
import type pg from 'pg';
import { redactSecrets } from '../auth/auth-audit.js';
import type { ShopContext } from '../db/shop-context.js';

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

const json = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(redactSecrets(value)));

export async function writeUserLifecycleAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  actor: Actor,
  { kind, at, userId, summary, before, after, reason }: UserAuditEntry,
): Promise<void> {
  const detail = { entity: 'user', entityId: userId, ...(reason ? { reason } : {}) };
  await client.query(
    `insert into audit_entries
       (shop_id, at, actor_id, actor_name, actor_role, kind, summary, detail, reference, before_value, after_value)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      shop.shopId,
      at,
      actor.id,
      actor.name,
      actor.role,
      kind,
      summary,
      JSON.stringify(detail),
      null,
      json(before),
      json(after),
    ],
  );
}
