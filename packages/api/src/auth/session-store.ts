/**
 * Sessions (EP-04-S5, S11, S12, S13). A session token is 32 random bytes (base64url) sent in the
 * `gs_session` cookie; only its sha256 is stored, in sessions.token_hash. A 256-bit random value
 * needs no salt or pepper.
 *
 * Expiry is sliding: expires_at = last accepted operation + idle minutes. An expired session is
 * never revived; the first time one is refused it is ended with end_reason 'expiry'.
 * A session is accepted only when it is not ended, not expired, its user is active and the user's
 * role is still the role the session was issued for (S13 second guard).
 */
import { createHash, randomBytes } from 'node:crypto';
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import type { Clock } from '../pipeline/server-clock.js';
import type { Session, SessionResolver } from '../pipeline/session-resolver.js';
import { type AuditActor, writeAuthAudit } from './auth-audit.js';
import { readCookie, SESSION_COOKIE } from './session-cookie.js';

export { SESSION_COOKIE } from './session-cookie.js';

type Queryable = pg.Pool | pg.PoolClient;

export type SessionEndReason = 'sign_out' | 'expiry' | 'deactivated' | 'role_changed' | 'password_reset';

/** 32 random bytes, base64url: session tokens and link secrets. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex: the only form in which a token or link secret is stored. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

const minutesAfter = (at: Date, minutes: number) => new Date(at.getTime() + minutes * 60_000);

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export async function issueSession(
  client: Queryable,
  {
    shopId,
    userId,
    role,
    deviceLabel,
    now,
    idleMinutes,
  }: { shopId: string; userId: string; role: RoleId; deviceLabel: string | null; now: Date; idleMinutes: number },
): Promise<IssuedSession> {
  const token = generateSecret();
  const expiresAt = minutesAfter(now, idleMinutes);
  const { rows } = await client.query<{ id: string }>(
    `insert into sessions (shop_id, user_id, created_at, expires_at, token_hash, role_at_issue, device_label)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [shopId, userId, now, expiresAt, hashSecret(token), role, deviceLabel],
  );
  return { token, sessionId: rows[0].id, expiresAt };
}

/** End one open session; false when it had already ended. */
export async function endSession(
  client: Queryable,
  { sessionId, reason, at }: { sessionId: string; reason: SessionEndReason; at: Date },
): Promise<boolean> {
  const { rowCount } = await client.query(
    'update sessions set ended_at = $2, end_reason = $3 where id = $1 and ended_at is null',
    [sessionId, at, reason],
  );
  return rowCount === 1;
}

/** End every open session of a user; returns how many ended. Writes no audit entry. */
export async function endUserSessions(
  client: Queryable,
  { shopId, userId, reason, at }: { shopId: string; userId: string; reason: SessionEndReason; at: Date },
): Promise<number> {
  const { rowCount } = await client.query(
    `update sessions set ended_at = $3, end_reason = $4
      where shop_id = $1 and user_id = $2 and ended_at is null`,
    [shopId, userId, at, reason],
  );
  return rowCount ?? 0;
}

/**
 * Delete All sessions of a user (EP-04-S13): server-only, called by EP-05 in the same transaction
 * as a deactivation or role change. Ends every open session and audits `sessions_ended`.
 */
export async function revokeAllSessions(
  client: Queryable,
  {
    shopId,
    userId,
    reason,
    actor,
    at,
  }: { shopId: string; userId: string; reason: 'deactivated' | 'role_changed'; actor: AuditActor; at: Date },
): Promise<number> {
  const count = await endUserSessions(client, { shopId, userId, reason, at });
  const { rows } = await client.query<{ name: string }>('select name from users where shop_id = $1 and id = $2', [
    shopId,
    userId,
  ]);
  const name = rows[0]?.name ?? 'A user';
  await writeAuthAudit(client, {
    shopId,
    at,
    actor,
    action: 'sessions_ended',
    summary: `${count} ${count === 1 ? 'session' : 'sessions'} of ${name} ended`,
    detail: { entity: 'user', entityId: userId, reason, count },
  });
  return count;
}

interface SessionRow {
  id: string;
  shop_id: string;
  user_id: string;
  expires_at: Date;
  ended_at: Date | null;
  role_at_issue: RoleId | null;
  name: string;
  role: RoleId;
  status: string;
}

/** Resolves the `gs_session` cookie; `confirm` extends and row-locks the session in a transaction. */
export function createSessionResolver({
  pool,
  clock,
  idleMinutes,
}: {
  pool: pg.Pool;
  clock: Clock;
  idleMinutes: number;
}): SessionResolver {
  return {
    async resolve(req) {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) return null;
      const { rows } = await pool.query<SessionRow>(
        `select s.id, s.shop_id, s.user_id, s.expires_at, s.ended_at, s.role_at_issue, u.name, u.role, u.status
           from sessions s join users u on u.shop_id = s.shop_id and u.id = s.user_id
          where s.token_hash = $1`,
        [hashSecret(token)],
      );
      const row = rows[0];
      if (!row || row.ended_at !== null) return null;
      const now = clock.now();
      if (row.expires_at.getTime() <= now.getTime()) {
        await endSession(pool, { sessionId: row.id, reason: 'expiry', at: now });
        return null;
      }
      if (row.status !== 'active' || row.role !== row.role_at_issue) return null;
      return { sessionId: row.id, userId: row.user_id, shopId: row.shop_id, name: row.name, role: row.role };
    },
    async confirm(client: pg.PoolClient, session: Session, at: Date, opts: { extend?: boolean } = {}) {
      const { rowCount } = await client.query(
        `update sessions set expires_at = case when $4 then $2 else expires_at end
          where id = $1 and ended_at is null and expires_at > $3`,
        [session.sessionId, minutesAfter(at, idleMinutes), at, opts.extend !== false],
      );
      return rowCount === 1;
    },
  };
}
