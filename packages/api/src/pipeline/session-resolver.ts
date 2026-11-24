/**
 * Who is calling (EP-03-S3). The pipeline asks a SessionResolver for the request's session; the
 * actor and shop come only from it, never from the request body.
 *
 * Sessions come from the `gs_session` cookie set by sign-in (EP-04, src/auth/session-store.ts),
 * in every environment. Inside each operation's transaction the router calls `confirm`, which
 * extends the session and row-locks it, so a concurrent revoke either commits first (the request
 * is refused) or waits for the operation (EP-04-S13).
 */
import type { RoleId } from '@goldsmith/shared';
import type { Request } from 'express';
import type pg from 'pg';
import { createSessionResolver } from '../auth/session-store.js';
import type { Config } from '../config.js';
import type { Clock } from './server-clock.js';

export interface Session {
  sessionId: string;
  userId: string;
  shopId: string;
  name: string;
  role: RoleId;
}

export interface SessionResolver {
  /** The request's live session, or null when there is none (or it ended or expired). */
  resolve(req: Request): Promise<Session | null>;
  /**
   * Inside the operation's transaction: extend the session and lock its row. False when it ended
   * or expired since `resolve`; the operation is then refused as unauthenticated. With
   * `extend: false` (an operation with `extendsSession: false`) the row is checked and locked but
   * its expiry is left as it is.
   */
  confirm?(client: pg.PoolClient, session: Session, at: Date, opts?: { extend?: boolean }): Promise<boolean>;
}

/** Nobody is signed in (no database). */
export const noSessionResolver: SessionResolver = { resolve: async () => null };

/** The cookie resolver whenever there is a database, in every environment; none otherwise. */
export function sessionResolverFor(config: Config, pool: pg.Pool | undefined, clock: Clock): SessionResolver {
  if (!pool) return noSessionResolver;
  return createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes });
}
