/**
 * Activation (EP-04-S10): a new user sets their first password from an emailed link.
 *   * issueActivationLink is server-only (no HTTP route): EP-05 calls it when a user is added or
 *     the activation is resent, EP-45 through createFirstOwner. Audits `activation_link_sent`.
 *   * activateAccount checks the password policy before the link, so a short password leaves
 *     the link unused; then it consumes the link, stores the hash and makes a pending user
 *     active. Audits `password_set` with the user as actor.
 */
import { AUTH_MESSAGES, DomainError, type RoleId } from '@goldsmith/shared';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { AccountMailer } from './account-mail.js';
import { type AuditActor, writeAuthAudit } from './auth-audit.js';
import { assertPasswordPolicy, type PasswordHasher } from './password-hash.js';
import { consumeLink, issuePasswordLink } from './password-links.js';

export interface ActivationLinkRequest {
  shopId: string;
  userId: string;
  /** The owner who caused it, the system, or first-time setup. */
  actor: AuditActor;
  at: Date;
  mailer: AccountMailer;
  appUrl: string;
}

/** Issue (or reissue) a user's activation link and mail it to the address on the user record. */
export async function issueActivationLink(tx: Tx, req: ActivationLinkRequest): Promise<void> {
  const { shopId, userId, at } = req;
  const { rows } = await tx.client.query<{ name: string; email: string }>(
    `select name, email from users where shop_id = $1 and id = $2 and status <> 'deactivated'`,
    [shopId, userId],
  );
  const user = rows[0];
  if (!user) throw new Error(`No live user ${userId} in shop ${shopId}`);
  const link = await issuePasswordLink(tx, {
    shopId,
    userId,
    purpose: 'activation',
    at,
    mailer: req.mailer,
    appUrl: req.appUrl,
    to: user.email,
  });
  await writeAuthAudit(tx.client, {
    shopId,
    at,
    actor: req.actor,
    action: 'activation_link_sent',
    summary: `Activation link sent to ${user.name}`,
    detail: { entity: 'user', entityId: userId, email: user.email, expiresAt: link.expiresAt.toISOString() },
  });
}

export interface ActivateRequest {
  shopId: string;
  token: string;
  password: string;
  at: Date;
}

export async function activateAccount(
  tx: Tx,
  deps: { passwords: PasswordHasher },
  { shopId, token, password, at }: ActivateRequest,
): Promise<void> {
  assertPasswordPolicy(password);
  const { userId } = await consumeLink(tx.client, { shopId, token, purpose: 'activation', at });
  const { rows } = await tx.client.query<{ name: string; role: RoleId; status: string }>(
    'select name, role, status from users where shop_id = $1 and id = $2 for update',
    [shopId, userId],
  );
  const user = rows[0];
  if (!user || user.status === 'deactivated') throw new DomainError(AUTH_MESSAGES.activationLinkExpired);
  await tx.client.query(
    `update users
        set password_hash = $3, password_set_at = $4,
            status = case when status = 'pending_activation' then 'active' else status end
      where shop_id = $1 and id = $2`,
    [shopId, userId, await deps.passwords.hash(password), at],
  );
  await writeAuthAudit(tx.client, {
    shopId,
    at,
    actor: { kind: 'user', id: userId, name: user.name, role: user.role },
    action: 'password_set',
    summary: `${user.name} set their password`,
    detail: { entity: 'user', entityId: userId },
  });
}
