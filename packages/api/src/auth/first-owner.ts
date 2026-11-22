/**
 * Create First owner (EP-04-S1): called by the first-run setup wizard (EP-45) without a session.
 * It runs only while the shop has no owner, no first-owner marker and setup is not complete.
 * The shop row is locked (`for update`) for the check and the insert, so two parallel calls
 * create one owner; the shop_first_owners primary key backs that up. The owner is
 * `pending_activation` with no password and gets an activation link (S10).
 */
import { AUTH_MESSAGES, DomainError } from '@goldsmith/shared';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { AccountMailer } from './account-mail.js';
import { issueActivationLink } from './activation.js';
import { writeAuthAudit } from './auth-audit.js';

export interface FirstOwnerRequest {
  shopId: string;
  name: string;
  /** E.164 */
  phone: string;
  email: string;
  at: Date;
}

export async function createFirstOwner(
  tx: Tx,
  deps: { mailer: AccountMailer; appUrl: string; log?: ErrorLog },
  { shopId, name, phone, email, at }: FirstOwnerRequest,
): Promise<void> {
  const { client } = tx;
  const shop = await client.query<{ setup_completed_at: Date | null }>(
    'select setup_completed_at from shops where id = $1 for update',
    [shopId],
  );
  if (shop.rows.length !== 1) throw new Error(`No shop ${shopId}`);
  const { rows: taken } = await client.query(
    `select 1 from shop_first_owners where shop_id = $1
     union all
     select 1 from users where shop_id = $1 and role = 'owner'
     limit 1`,
    [shopId],
  );
  if (taken.length > 0 || shop.rows[0].setup_completed_at !== null) {
    throw new DomainError(AUTH_MESSAGES.firstOwnerExists);
  }
  const { rows } = await client.query<{ id: string }>(
    `insert into users (shop_id, name, phone, email, role, status, created_at)
     values ($1, $2, $3, $4, 'owner', 'pending_activation', $5) returning id`,
    [shopId, name, phone, email, at],
  );
  const userId = rows[0].id;
  await client.query('insert into shop_first_owners (shop_id, user_id, created_at) values ($1, $2, $3)', [
    shopId,
    userId,
    at,
  ]);
  await writeAuthAudit(client, {
    shopId,
    at,
    actor: { kind: 'setup' },
    action: 'first_owner_created',
    summary: `${name} was created as the first owner`,
    detail: { entity: 'user', entityId: userId, name, role: 'owner', phone, email },
  });
  await issueActivationLink(tx, { shopId, userId, actor: { kind: 'setup' }, at, mailer: deps.mailer, appUrl: deps.appUrl, log: deps.log });
}
