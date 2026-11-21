/**
 * Forgotten password (EP-04-S7).
 *   * requestPasswordReset mails a reset link only to an active user with that phone, at the
 *     address on the account; the caller answers `{ ok: true }` whatever happened, so the
 *     response never reveals whether the phone is registered. Audits `password_reset_requested`
 *     for known users only.
 *   * resetPassword checks the policy, consumes the link, stores the new hash and ends every open
 *     session of the user with reason `password_reset`, in one transaction. Audits
 *     `password_reset` with the number of sessions ended.
 * A reset does not clear an active lockout (open question in the stories).
 */
import { AUTH_MESSAGES, DomainError, type RoleId } from '@goldsmith/shared';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { AccountMailer } from './account-mail.js';
import { writeAuthAudit } from './auth-audit.js';
import { assertPasswordPolicy, type PasswordHasher } from './password-hash.js';
import { consumeLink, issuePasswordLink } from './password-links.js';
import { endUserSessions } from './session-store.js';

interface UserRow {
  id: string;
  name: string;
  role: RoleId;
  email: string;
  status: string;
}

export async function requestPasswordReset(
  tx: Tx,
  deps: { mailer: AccountMailer; appUrl: string; log?: ErrorLog },
  { shopId, phone, at }: { shopId: string; /** E.164 */ phone: string; at: Date },
): Promise<void> {
  const { rows } = await tx.client.query<UserRow>(
    `select id, name, role, email, status from users
      where shop_id = $1 and phone_e164 = $2 and status = 'active'`,
    [shopId, phone],
  );
  const user = rows[0];
  if (!user) return;
  const link = await issuePasswordLink(tx, {
    shopId,
    userId: user.id,
    purpose: 'reset',
    at,
    mailer: deps.mailer,
    appUrl: deps.appUrl,
    to: user.email,
    log: deps.log,
  });
  await writeAuthAudit(tx.client, {
    shopId,
    at,
    actor: { kind: 'user', id: user.id, name: user.name, role: user.role },
    action: 'password_reset_requested',
    summary: `${user.name} asked for a password reset`,
    detail: { entity: 'user', entityId: user.id, expiresAt: link.expiresAt.toISOString() },
  });
}

export async function resetPassword(
  tx: Tx,
  deps: { passwords: PasswordHasher },
  { shopId, token, password, at }: { shopId: string; token: string; password: string; at: Date },
): Promise<void> {
  assertPasswordPolicy(password);
  const { userId } = await consumeLink(tx.client, { shopId, token, purpose: 'reset', at });
  const { rows } = await tx.client.query<UserRow>(
    'select id, name, role, email, status from users where shop_id = $1 and id = $2 for update',
    [shopId, userId],
  );
  const user = rows.at(0);
  if (user?.status !== 'active') throw new DomainError(AUTH_MESSAGES.resetLinkExpired);
  await tx.client.query('update users set password_hash = $3, password_set_at = $4 where shop_id = $1 and id = $2', [
    shopId,
    userId,
    await deps.passwords.hash(password),
    at,
  ]);
  const sessionsEnded = await endUserSessions(tx.client, { shopId, userId, reason: 'password_reset', at });
  await writeAuthAudit(tx.client, {
    shopId,
    at,
    actor: { kind: 'user', id: userId, name: user.name, role: user.role },
    action: 'password_reset',
    summary: `${user.name} reset their password`,
    detail: { entity: 'user', entityId: userId, sessionsEnded },
  });
}
