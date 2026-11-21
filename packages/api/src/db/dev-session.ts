/**
 * `db:dev-session` (EP-03-S3, EP-04): opens a real session for a seeded user, so a developer can
 * call the api locally with the `gs_session` cookie without signing in. Development only.
 */
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { issueSession } from '../auth/session-store.js';
import type { AppEnv } from '../config.js';

export interface DevSessionOptions {
  appEnv: AppEnv;
  /** The user's exact name, e.g. "Rajesh Verma". */
  userName: string;
  now?: Date;
  hours?: number;
}

export interface DevSession {
  /** Send as the cookie `gs_session=<token>`. */
  token: string;
  sessionId: string;
  name: string;
  role: string;
  expiresAt: Date;
}

export async function createDevSession(
  pool: pg.Pool,
  { appEnv, userName, now = new Date(), hours = 12 }: DevSessionOptions,
): Promise<DevSession> {
  if (appEnv !== 'development') throw new Error(`db:dev-session is refused when APP_ENV=${appEnv}`);
  const users = await pool.query<{ id: string; shop_id: string; name: string; role: RoleId; status: string }>(
    'select id, shop_id, name, role, status from users where name = $1',
    [userName],
  );
  if (users.rows.length !== 1) {
    throw new Error(`Expected one user named "${userName}", found ${users.rows.length}`);
  }
  const user = users.rows[0];
  // Sessions of users who are not active are refused (EP-04-S3), so the token would not work.
  if (user.status !== 'active') {
    throw new Error(`${user.name} is ${user.status}, not active: set a password first (npm run db:dev-password)`);
  }
  const session = await issueSession(pool, {
    shopId: user.shop_id,
    userId: user.id,
    role: user.role,
    deviceLabel: 'db:dev-session',
    now,
    idleMinutes: hours * 60,
  });
  return {
    token: session.token,
    sessionId: session.sessionId,
    name: user.name,
    role: user.role,
    expiresAt: session.expiresAt,
  };
}
