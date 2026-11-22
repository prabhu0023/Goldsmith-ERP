/**
 * Audit entries for sign-in events (EP-04-S14). They are written inside the operation's
 * transaction, so a rolled-back operation leaves no entry. No password, token, link, secret or
 * code ever reaches an entry: such keys are removed from the detail at any depth, and phones and
 * emails are masked.
 */
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { maskEmail, maskPhone } from './mask.js';
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
const SECRET_KEY = /password|token|link|secret|code/i;
const PHONE_KEY = /phone/i;
const EMAIL_KEY = /email/i;
/** A copy of `value` without secret-like keys at any depth, with phones and emails masked. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof child === 'string' && PHONE_KEY.test(key)) out[key] = maskPhone(child);
    else if (typeof child === 'string' && EMAIL_KEY.test(key)) out[key] = maskEmail(child);
    else out[key] = redactSecrets(child);
  }
  return out;
}
const ACTOR_COLUMNS = {
  system: { id: null, name: 'System', role: 'system' },
  setup: { id: null, name: 'Setup', role: 'setup' },
} as const;
export async function writeAuthAudit(client: Queryable, entry: AuthAuditEntry): Promise<void> {
  const actor = entry.actor.kind === 'user' ? entry.actor : ACTOR_COLUMNS[entry.actor.kind];
  await client.query(
    `insert into audit_entries (shop_id, at, actor_id, actor_name, actor_role, kind, summary, detail)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.shopId,
      entry.at,
      actor.id,
      actor.name,
      actor.role,
      entry.action,
      entry.summary,
      JSON.stringify(redactSecrets(entry.detail)),
    ],
  );
}
