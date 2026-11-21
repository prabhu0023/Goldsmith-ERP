/**
 * Who is calling (EP-03-S3). The pipeline asks a SessionResolver for the request's session; the
 * actor and shop come only from it, never from the request body.
 *
 * Sign-in is EP-04. Until then development and tests use the stub below, which reads a session
 * id from the `x-dev-session` header and looks it up in `sessions`. The stub is refused when
 * APP_ENV is staging or production; there every operation is `unauthenticated` until EP-04
 * replaces the resolver.
 */
import type { RoleId } from '@goldsmith/shared';
import type { Request } from 'express';
import type pg from 'pg';
import type { AppEnv, Config } from '../config.js';
import type { Clock } from './server-clock.js';

export interface Session {
  userId: string;
  shopId: string;
  name: string;
  role: RoleId;
}

export interface SessionResolver {
  /** The request's live session, or null when there is none (or it ended or expired). */
  resolve(req: Request): Promise<Session | null>;
}

/** Nobody is signed in (staging and production until EP-04). */
export const noSessionResolver: SessionResolver = { resolve: async () => null };

export const DEV_SESSION_HEADER = 'x-dev-session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Development/test-only stub: `x-dev-session: <sessions.id>`. Throws for staging and production. */
export function createDevSessionResolver({
  appEnv,
  pool,
  clock,
}: {
  appEnv: AppEnv;
  pool: pg.Pool;
  clock: Clock;
}): SessionResolver {
  if (appEnv === 'staging' || appEnv === 'production') {
    throw new Error(`The development session stub is refused when APP_ENV=${appEnv}`);
  }
  return {
    async resolve(req) {
      const id = req.get(DEV_SESSION_HEADER)?.trim();
      if (!id || !UUID.test(id)) return null;
      const { rows } = await pool.query<{ user_id: string; shop_id: string; name: string; role: RoleId }>(
        `select u.id as user_id, u.shop_id, u.name, u.role
           from sessions s join users u on u.shop_id = s.shop_id and u.id = s.user_id
          where s.id = $1 and s.ended_at is null and s.expires_at > $2`,
        [id, clock.now()],
      );
      const row = rows[0];
      return row ? { userId: row.user_id, shopId: row.shop_id, name: row.name, role: row.role } : null;
    },
  };
}

/** The resolver for this environment: the stub in development (with a database), none otherwise. */
export function sessionResolverFor(config: Config, pool: pg.Pool | undefined, clock: Clock): SessionResolver {
  if (config.appEnv !== 'development' || !pool) return noSessionResolver;
  return createDevSessionResolver({ appEnv: config.appEnv, pool, clock });
}
