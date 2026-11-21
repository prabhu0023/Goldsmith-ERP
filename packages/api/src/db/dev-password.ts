/**
 * `db:dev-password` (EP-04): sets a seeded user's password and makes the user active, so a
 * developer can sign in by curl or in the web app without the activation email. Development only.
 * The password follows the policy (EP-04-S2) and is stored only as its scrypt hash.
 */
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { assertPasswordPolicy, type PasswordHasher, passwordHasher } from '../auth/password-hash.js';
import type { AppEnv } from '../config.js';

export interface DevPasswordOptions {
  appEnv: AppEnv;
  /** The user's exact name, e.g. "Rajesh Verma". */
  userName: string;
  password: string;
  now?: Date;
  passwords?: PasswordHasher;
}

export async function setDevPassword(
  pool: pg.Pool,
  { appEnv, userName, password, now = new Date(), passwords = passwordHasher }: DevPasswordOptions,
): Promise<{ name: string; role: RoleId; phone: string }> {
  if (appEnv !== 'development') throw new Error(`db:dev-password is refused when APP_ENV=${appEnv}`);
  assertPasswordPolicy(password);
  const users = await pool.query<{ id: string; name: string; role: RoleId; phone: string }>(
    'select id, name, role, phone from users where name = $1',
    [userName],
  );
  if (users.rows.length !== 1) {
    throw new Error(`Expected one user named "${userName}", found ${users.rows.length}`);
  }
  const user = users.rows[0];
  await pool.query(
    `update users set password_hash = $2, password_set_at = $3, status = 'active' where id = $1`,
    [user.id, await passwords.hash(password), now],
  );
  return { name: user.name, role: user.role, phone: user.phone };
}
