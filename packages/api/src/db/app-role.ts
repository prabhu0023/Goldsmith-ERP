/**
 * The application role (FU-001, EP-06-S1). The migration 20261122T1732_ep06_audit_log creates
 * goldsmith_app NOLOGIN with DML on every table but only SELECT and INSERT on audit_entries. The api
 * connects as it (APP_DATABASE_URL); migrations, seed and reset keep the owner (DATABASE_URL).
 * Locally, `npm run db:create` and the test setup give it LOGIN with LOCAL_APP_ROLE_PASSWORD, a
 * local-only value of low entropy (the secret scan, .gitleaks.toml, flags real-looking passwords).
 */
import type pg from 'pg';
import { assertIdentifier } from './shop-context.js';

export const APP_ROLE = 'goldsmith_app';

/** Local development and tests only; a deployed environment keeps its own in the secret store (FU-008). */
export const LOCAL_APP_ROLE_PASSWORD = 'localapp';

export interface RoleCredentials {
  user: string;
  password: string;
}

/** The user and password in a connection URL, or the local defaults when it has none. */
export function credentialsOf(url: string | undefined): RoleCredentials {
  const u = url && URL.canParse(url) ? new URL(url) : undefined;
  return {
    user: u?.username ? decodeURIComponent(u.username) : APP_ROLE,
    password: u?.password ? decodeURIComponent(u.password) : LOCAL_APP_ROLE_PASSWORD,
  };
}

const literal = (text: string): string => `'${text.replaceAll("'", "''")}'`;

/**
 * Make the role exist with LOGIN and this password (create it, or alter the one a migration made
 * NOLOGIN). Run on an owner or superuser connection. Roles are cluster-wide, so a parallel run
 * may create it first: that is tolerated.
 */
export async function ensureAppLoginRole(admin: pg.Pool | pg.PoolClient, { user, password }: RoleCredentials): Promise<void> {
  assertIdentifier(user);
  const exists = await admin.query('select 1 from pg_roles where rolname = $1', [user]);
  if (exists.rowCount === 0) {
    try {
      await admin.query(`create role "${user}" login password ${literal(password)}`);
      return;
    } catch (e) {
      // 42710 duplicate_object, 23505 unique_violation: another process made it in the meantime.
      const code = (e as { code?: string }).code;
      if (code !== '42710' && code !== '23505') throw e;
    }
  }
  await admin.query(`alter role "${user}" login password ${literal(password)}`);
}

/** `ownerUrl` with the role's user and password instead of the owner's. */
export function appRoleUrl(ownerUrl: string, { user, password }: RoleCredentials): string {
  const u = new URL(ownerUrl);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  return u.toString();
}

/**
 * True when the pool's connection could change or remove audit entries: it owns audit_entries,
 * or holds UPDATE, DELETE or TRUNCATE on it. The api refuses to start like that in staging and
 * production.
 */
export async function auditGrantProblems(pool: pg.Pool): Promise<boolean> {
  const { rows } = await pool.query<{ problem: boolean }>(
    `select pg_has_role(current_user, c.relowner, 'USAGE')
         or has_table_privilege(current_user, c.oid, 'UPDATE')
         or has_table_privilege(current_user, c.oid, 'DELETE')
         or has_table_privilege(current_user, c.oid, 'TRUNCATE') as problem
       from pg_class c
      where c.oid = to_regclass('audit_entries')`,
  );
  return rows[0]?.problem ?? false;
}
