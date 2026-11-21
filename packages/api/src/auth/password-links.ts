/**
 * Password links (EP-04-S7, S10): activation and reset. The secret is 32 random bytes (base64url)
 * and only its sha256 is stored, in password_links.token_hash; the plain link exists only in
 * memory between issue and delivery, and in the account email. created_at is "issued at".
 *   * activation links expire 24 hours after issue, reset links after 1 hour, judged on the
 *     server clock (`expires_at > now`, so a link is expired at exactly expires_at);
 *   * issuing a link replaces the user's earlier unused link of the same purpose;
 *   * consuming a link locks its row and marks it used in the caller's transaction, so it
 *     succeeds at most once and only together with the password change.
 * The email is sent after the commit, so a rolled-back link is never mailed.
 */
import { AUTH_MESSAGES, DomainError } from '@goldsmith/shared';
import type pg from 'pg';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { AccountMailer } from './account-mail.js';
import { maskEmail } from './mask.js';
import { generateSecret, hashSecret } from './session-store.js';

type Queryable = pg.Pool | pg.PoolClient;
export const ACTIVATION_HOURS = 24;
export const RESET_HOURS = 1;
export type LinkPurpose = 'activation' | 'reset';
export type LinkState = 'valid' | 'used' | 'expired';
const HOURS: Record<LinkPurpose, number> = { activation: ACTIVATION_HOURS, reset: RESET_HOURS };
const PATHS: Record<LinkPurpose, string> = { activation: '/activate', reset: '/reset-password' };

const SUBJECTS: Record<LinkPurpose, string> = {
  activation: 'Set your JGD password',
  reset: 'Reset your JGD password',
};

const TEXTS: Record<LinkPurpose, (link: string) => string> = {
  activation: (link) => `Open this link within 24 hours to set your JGD password: ${link}`,
  reset: (link) => `Open this link within 1 hour to choose a new JGD password: ${link}. If you did not ask for it, ignore this email.`,
};

export interface IssueLinkRequest {
  shopId: string;
  userId: string;
  purpose: LinkPurpose;
  at: Date;
  mailer: AccountMailer;
  appUrl: string;
  /** The address on the user record. */
  to: string;
}

export interface IssuedLink {
  linkId: string;
  expiresAt: Date;
}

/** Replace earlier open links, store the new hash and mail the link once the transaction commits. */
export async function issuePasswordLink(tx: Tx, req: IssueLinkRequest): Promise<IssuedLink> {
  const { shopId, userId, purpose, at } = req;
  await tx.client.query(
    `update password_links set replaced_at = $4
      where shop_id = $1 and user_id = $2 and purpose = $3 and used_at is null and replaced_at is null`,
    [shopId, userId, purpose, at],
  );
  const token = generateSecret();
  const expiresAt = new Date(at.getTime() + HOURS[purpose] * 3600_000);
  const { rows } = await tx.client.query<{ id: string }>(
    `insert into password_links (shop_id, user_id, purpose, token_hash, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [shopId, userId, purpose, hashSecret(token), at, expiresAt],
  );
  // The token travels in the fragment, which browsers never send to a server or proxy log.
  const link = `${req.appUrl.replace(/\/+$/, '')}${PATHS[purpose]}#token=${token}`;
  const { mailer, to } = req;
  tx.afterCommit(() =>
    mailer.send({ to, toMasked: maskEmail(to), subject: SUBJECTS[purpose], text: TEXTS[purpose](link), link, at }),
  );
  return { linkId: rows[0].id, expiresAt };
}

interface LinkRow {
  id: string;
  user_id: string;
  expires_at: Date;
  used_at: Date | null;
  replaced_at: Date | null;
}

function stateOf(row: LinkRow | undefined, at: Date): LinkState {
  if (!row) return 'expired';
  if (row.used_at !== null) return 'used';
  if (row.replaced_at !== null || row.expires_at.getTime() <= at.getTime()) return 'expired';
  return 'valid';
}

const findLink = (client: Queryable, shopId: string, token: string, purpose: LinkPurpose, lock: boolean) =>
  client.query<LinkRow>(
    `select id, user_id, expires_at, used_at, replaced_at from password_links
      where shop_id = $1 and token_hash = $2 and purpose = $3${lock ? ' for update' : ''}`,
    [shopId, hashSecret(token), purpose],
  );

/** What opening the link would do. Unknown, replaced and expired links are all `expired`. */
export async function linkState(
  client: Queryable,
  { shopId, token, purpose, at }: { shopId: string; token: string; purpose: LinkPurpose; at: Date },
): Promise<LinkState> {
  const { rows } = await findLink(client, shopId, token, purpose, false);
  return stateOf(rows[0], at);
}

/** The refusal sentence for a link that cannot be used. */
export function linkRefusal(purpose: LinkPurpose, state: Exclude<LinkState, 'valid'>): string {
  if (purpose === 'reset') return AUTH_MESSAGES.resetLinkExpired;
  return state === 'used' ? AUTH_MESSAGES.activationLinkUsed : AUTH_MESSAGES.activationLinkExpired;
}

/** Lock the link, refuse it unless valid, and mark it used; returns the link's user. */
export async function consumeLink(
  client: pg.PoolClient,
  { shopId, token, purpose, at }: { shopId: string; token: string; purpose: LinkPurpose; at: Date },
): Promise<{ linkId: string; userId: string }> {
  const { rows } = await findLink(client, shopId, token, purpose, true);
  const row = rows[0];
  const state = stateOf(row, at);
  if (state !== 'valid') throw new DomainError(linkRefusal(purpose, state));
  await client.query('update password_links set used_at = $2 where id = $1', [row.id, at]);
  return { linkId: row.id, userId: row.user_id };
}
