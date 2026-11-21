/**
 * `db:dev-session` (EP-03-S3): opens a session for a seeded user, so a developer can call the
 * api locally with the `x-dev-session` header until sign-in (EP-04) exists. Development only.
 */
import type pg from 'pg';
import type { AppEnv } from '../config.js';

export interface DevSessionOptions {
  appEnv: AppEnv;
  /** The user's exact name, e.g. "Rajesh Verma". */
  userName: string;
  now?: Date;
  hours?: number;
}

export interface DevSession {
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
  const users = await pool.query<{ id: string; shop_id: string; name: string; role: string }>(
    'select id, shop_id, name, role from users where name = $1',
    [userName],
  );
  if (users.rows.length !== 1) {
    throw new Error(`Expected one user named "${userName}", found ${users.rows.length}`);
  }
  const user = users.rows[0];
  const expiresAt = new Date(now.getTime() + hours * 3600_000);
  const { rows } = await pool.query<{ id: string }>(
    'insert into sessions (shop_id, user_id, expires_at) values ($1, $2, $3) returning id',
    [user.shop_id, user.id, expiresAt],
  );
  return { sessionId: rows[0].id, name: user.name, role: user.role, expiresAt };
}
