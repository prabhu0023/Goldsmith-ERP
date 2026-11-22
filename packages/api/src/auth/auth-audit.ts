/**
 * Audit entries for sign-in events (EP-04-S14). They are written inside the operation's
 * transaction, so a rolled-back operation leaves no entry. No password, token, link, secret or
 * code ever reaches an entry: such keys are removed from the detail at any depth, and phones and
 * emails are masked.
 */
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { appendAudit } from '../audit/audit-writer.js';
import { redactSecrets } from '../audit/redact.js';
/** Moved to audit/redact.ts (EP-06); re-exported so existing imports keep working. */
export { redactSecrets } from '../audit/redact.js';
type Queryable = pg.Pool | pg.PoolClient;
/** Who acted: a signed-in user, the system (expiry, server-only calls) or first-time setup. */
export type AuditActor = { kind: 'user'; id: string; name: string; role: RoleId } | { kind: 'system' } | { kind: 'setup' };
export const AUTH_AUDIT_ACTIONS = [
  'first_owner_created',
  'activation_link_sent',
  'password_set',
  'signed_in',
  'sign_in_failed',
  'sign_in_locked',
  'account_unlocked',
  'signed_out',
  'sessions_ended',
  'password_reset_requested',
  'password_reset',
] as const;
export type AuthAuditAction = (typeof AUTH_AUDIT_ACTIONS)[number];
/** The entry's detail: always the entity it concerns, plus any facts of the event. */
export interface AuthAuditDetail {
  entity: 'user' | 'session';
  entityId: string;
  [key: string]: unknown;
}
export interface AuthAuditEntry {
  shopId: string;
  at: Date;
  actor: AuditActor;
  action: AuthAuditAction;
  /** A short sentence, e.g. "Rajesh Verma signed in". */
  summary: string;
  detail: AuthAuditDetail;
}
const WRITER_ACTORS = {
  system: { kind: 'system', name: 'System' },
  setup: { kind: 'setup' },
} as const;
export async function writeAuthAudit(client: Queryable, entry: AuthAuditEntry): Promise<void> {
  await appendAudit(client, {
    shopId: entry.shopId,
    at: entry.at,
    actor: entry.actor.kind === 'user' ? entry.actor : WRITER_ACTORS[entry.actor.kind],
    kind: entry.action,
    entityType: entry.detail.entity,
    entityId: entry.detail.entityId,
    summary: entry.summary,
    detail: JSON.stringify(redactSecrets(entry.detail)),
  });
}
