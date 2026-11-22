/**
 * Shared set-up for the user operation tests (EP-05-S4 to S14): the production contract,
 * handlers and permission check, the owner Sanjay Seth with a session, and readers for the
 * rows the operations write.
 */
import { expect } from 'vitest';
import {
  type Harness,
  type HarnessOptions,
  newSession,
  newUserWithPassword,
  startHarness,
  tokenFrom,
} from '../support/api-harness.js';

export const PASSWORD = 'gold2026!';
export const OWNER_ONLY = { code: 'forbidden', message: 'Only the owner can add staff or change a role.' };
export const UNAUTHENTICATED = { status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } };
export const WRONG_PASSWORD = { status: 401, body: { code: 'unauthenticated', message: 'Phone number or password is wrong.' } };

/** A rule_refused answer with `message`. */
export const refused = (message: string) => ({ status: 422, body: { code: 'rule_refused', message } });

export interface UsersHarness extends Harness {
  ownerId: string;
  /** Sanjay Seth's session token. */
  owner: string;
  /** Call an operation as the owner. */
  asOwner(op: string, body: unknown, idempotencyKey?: string): ReturnType<Harness['call']>;
}

export async function startUsersHarness(options: HarnessOptions = {}): Promise<UsersHarness> {
  const h = await startHarness({ production: true, poolSize: 12, ...options });
  const ownerId = await newUserWithPassword(h.pool, h.shop, {
    name: 'Sanjay Seth',
    role: 'owner',
    phone: '+91 98410 33333',
    email: 'sanjay.seth@example.com',
    password: PASSWORD,
  });
  const owner = await newSession(h.pool, h.shop, ownerId);
  return Object.assign(h, {
    ownerId,
    owner,
    asOwner: (op: string, body: unknown, idempotencyKey?: string) => h.call(op, body, { session: owner, idempotencyKey }),
  });
}

export interface UserRowView {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
  status: string;
  karigar_id: string | null;
  version: number;
  deactivated_at: Date | null;
  created_at: Date;
}

export async function userRow(h: Harness, userId: string): Promise<UserRowView> {
  const { rows } = await h.pool.query<UserRowView>(
    `select id, name, phone, email, role, status, karigar_id, version, deactivated_at, created_at
       from users where shop_id = $1 and id = $2`,
    [h.shop.shopId, userId],
  );
  return rows[0];
}

/** The `user.access_changed` outbox rows about `userId`. */
export async function accessEvents(h: Harness, userId: string): Promise<Array<Record<string, unknown>>> {
  const { rows } = await h.pool.query<{ payload: Record<string, unknown> }>(
    `select payload from outbox_events
      where shop_id = $1 and topic = 'user.access_changed' and payload->>'userId' = $2
      order by created_at, id`,
    [h.shop.shopId, userId],
  );
  return rows.map((r) => r.payload);
}

/** The audit entries of `kind` about `userId`. */
export async function auditOf(h: Harness, kind: string, userId: string): Promise<Array<Record<string, unknown>>> {
  const { rows } = await h.pool.query(
    `select at, actor_id, actor_name, actor_role, kind, summary, detail::jsonb as detail, before_value, after_value
       from audit_entries
      where shop_id = $1 and kind = $2 and detail::jsonb->>'entityId' = $3
      order by at, id`,
    [h.shop.shopId, kind, userId],
  );
  return rows;
}

/** The token in the newest activation email to `to`. */
export function activationToken(h: Harness, to: string): string {
  const mail = h.mailer
    .messages()
    .filter((m) => m.to === to)
    .at(-1);
  expect(mail, `an email to ${to}`).toBeDefined();
  return (mail?.link ?? '').split('#token=')[1] ?? '';
}

/** Sign in with the test password; returns the status, body and session token. */
export async function signIn(h: Harness, phone: string, password = PASSWORD) {
  const res = await h.auth('signIn', { phone, password });
  return { status: res.status, body: res.body, token: tokenFrom(res.setCookie) };
}

/** True while the session token is accepted. */
export async function sessionLive(h: Harness, token: string): Promise<boolean> {
  return (await h.auth('readCurrentSession', {}, { token })).status === 200;
}
