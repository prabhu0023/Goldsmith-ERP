/**
 * Sign in with phone and password (EP-04-S3, S5, S8). In one transaction:
 *   look up the live user by normalised phone -> lock the lockout row (user, or hashed phone)
 *   -> refuse while locked, before any password compare -> clear a lock that has run out
 *   -> verify (against a fixed dummy hash for an unknown, pending or password-less user, so the
 *   time is the same) -> on success reset the count, issue the session and audit `signed_in`;
 *   on a wrong password count it, lock at the 5th and audit (known users only).
 * The outcome is returned, never thrown, so counts and audit entries commit; the router maps a
 * refusal to its error after the commit.
 */
import type { RoleId } from '@goldsmith/shared';
import type { Tx } from '../pipeline/operation-transaction.js';
import { writeAuthAudit } from './auth-audit.js';
import { lockRow, recordFailure, resetFailures } from './lockout.js';
import type { PasswordHasher } from './password-hash.js';
import { issueSession } from './session-store.js';

export interface SignInDeps {
  passwords: PasswordHasher;
  idleMinutes: number;
}

export interface SignInRequest {
  shopId: string;
  /** E.164, from the contract's phone field. */
  phone: string;
  /** HMAC of the phone (lockout key for a phone with no live user). */
  phoneHash: string;
  password: string;
  deviceLabel: string;
  at: Date;
}

export type SignInOutcome =
  | {
      kind: 'signed_in';
      token: string;
      sessionId: string;
      user: { userId: string; name: string; role: RoleId };
    }
  | { kind: 'wrong' }
  | { kind: 'locked'; lockedUntil: Date };

interface UserRow {
  id: string;
  name: string;
  role: RoleId;
  status: 'pending_activation' | 'active';
  password_hash: string | null;
}

export async function signIn(tx: Tx, deps: SignInDeps, req: SignInRequest): Promise<SignInOutcome> {
  const { client } = tx;
  const { shopId, at, deviceLabel } = req;
  const { rows } = await client.query<UserRow>(
    `select id, name, role, status, password_hash from users
      where shop_id = $1 and phone_e164 = $2 and status <> 'deactivated'`,
    [shopId, req.phone],
  );
  const user = rows[0];
  const lock = await lockRow(client, user ? { shopId, userId: user.id } : { shopId, phoneHash: req.phoneHash });
  if (lock.lockedUntil && lock.lockedUntil.getTime() > at.getTime()) {
    return { kind: 'locked', lockedUntil: lock.lockedUntil };
  }
  if (lock.lockedUntil) await resetFailures(client, { lockId: lock.id });

  let verdict: 'ok' | 'wrong' = 'wrong';
  if (user?.status === 'active' && user.password_hash !== null) {
    verdict = await deps.passwords.verify(req.password, user.password_hash);
  } else {
    await deps.passwords.verify(req.password, await deps.passwords.dummyHash());
  }

  if (verdict === 'ok' && user) {
    await resetFailures(client, { lockId: lock.id });
    const session = await issueSession(client, {
      shopId,
      userId: user.id,
      role: user.role,
      deviceLabel,
      now: at,
      idleMinutes: deps.idleMinutes,
    });
    await writeAuthAudit(client, {
      shopId,
      at,
      actor: { kind: 'user', id: user.id, name: user.name, role: user.role },
      action: 'signed_in',
      summary: `${user.name} signed in`,
      detail: { entity: 'session', entityId: session.sessionId, role: user.role, deviceLabel },
    });
    return {
      kind: 'signed_in',
      token: session.token,
      sessionId: session.sessionId,
      user: { userId: user.id, name: user.name, role: user.role },
    };
  }

  const failure = await recordFailure(client, { lockId: lock.id, at });
  if (user) {
    const actor = { kind: 'user', id: user.id, name: user.name, role: user.role } as const;
    await writeAuthAudit(client, {
      shopId,
      at,
      actor,
      action: 'sign_in_failed',
      summary: `Sign-in failed for ${user.name}`,
      detail: { entity: 'user', entityId: user.id, reason: 'wrong_password', deviceLabel },
    });
    if (failure.locked && failure.lockedUntil) {
      await writeAuthAudit(client, {
        shopId,
        at,
        actor,
        action: 'sign_in_locked',
        summary: `${user.name} was locked out after too many wrong passwords`,
        detail: { entity: 'user', entityId: user.id, lockedUntil: failure.lockedUntil.toISOString(), deviceLabel },
      });
    }
  }
  if (failure.locked && failure.lockedUntil) return { kind: 'locked', lockedUntil: failure.lockedUntil };
  return { kind: 'wrong' };
}
