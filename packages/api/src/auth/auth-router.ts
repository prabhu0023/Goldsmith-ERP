/**
 * Sign-in operations (EP-04): `POST /api/auth/:operation` with a JSON body. A router of its own,
 * because these calls may run without a session and set or clear the session cookie. It reuses
 * the EP-03 pieces: parseInput, runInTransaction (one transaction per operation), the rate-limit
 * hook, ApiError and the same `{ code, message, field? }` error body.
 *
 *   (a) look up the operation         -> not_found (server-only functions such as
 *       revokeAllSessions, unlockAccount and issueActivationLink have no route)
 *   (b) resolve the session (may be none)
 *   (c) rate-limit hook               -> rate_limited
 *   (d) validate the input            -> validation, field named
 *   (e) per phone and device limits for signIn and requestPasswordReset (EP-04-S9)
 *                                     -> rate_limited, before any lookup
 *   (f) the operation, in one transaction
 * The shop of a public call is the installation's shop, never the client's.
 */
import { AUTH_MESSAGES, type AuthOperationName, authContract, DomainError, LANDING_ROUTES } from '@goldsmith/shared';
import express, { type Request, type Response, type Router } from 'express';
import type pg from 'pg';
import { ApiError, type ErrorLog, RateLimitedError, UnauthenticatedError } from '../pipeline/api-errors.js';
import type { RateLimiter } from '../pipeline/hooks.js';
import { clientAddressOf } from '../pipeline/operation-router.js';
import { runInTransaction } from '../pipeline/operation-transaction.js';
import type { Clock } from '../pipeline/server-clock.js';
import type { Session, SessionResolver } from '../pipeline/session-resolver.js';
import { parseInput } from '../pipeline/validate-input.js';
import type { AccountMailer } from './account-mail.js';
import { activateAccount } from './activation.js';
import { writeAuthAudit } from './auth-audit.js';
import { type AuthLimits, checkAuthLimits, phoneKey } from './auth-rate-limits.js';
import { createFirstOwner } from './first-owner.js';
import { type InstallationShop, SHOP_NOT_SET_UP } from './installation-shop.js';
import { kolkataTime } from './lockout.js';
import type { PasswordHasher } from './password-hash.js';
import { type LinkPurpose, linkState } from './password-links.js';
import { requestPasswordReset, resetPassword } from './password-reset.js';
import { signIn } from './sign-in.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';
import { endSession } from './session-store.js';

export interface AuthDeps {
  installationShop: InstallationShop;
  passwords: PasswordHasher;
  mailer: AccountMailer;
  limits: AuthLimits;
  /** Minutes of no accepted operation after which a session ends. */
  idleMinutes: number;
  appUrl: string;
  /** Adds `Secure` to the session cookie (every environment but development). */
  secureCookies: boolean;
  /** HMAC key for phone and device hashes (SESSION_SECRET). */
  phoneSecret: string;
}

export interface AuthRouterDeps {
  pool?: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  rateLimiter: RateLimiter;
  log: ErrorLog;
  maxBodyBytes: number;
  auth: AuthDeps;
}

interface AuthCall {
  req: Request;
  res: Response;
  pool: pg.Pool;
  session: Session | null;
  input: unknown;
  at: Date;
}

const DEVICE_LABEL_MAX = 80;

function deviceLabelOf(req: Request, typed: string | undefined): string {
  if (typed) return typed;
  const agent = req.get('user-agent')?.trim().slice(0, DEVICE_LABEL_MAX);
  return agent || 'unknown device';
}

const sessionResultFor = (user: Pick<Session, 'userId' | 'name' | 'role'>) => ({
  ok: true as const,
  user: { userId: user.userId, name: user.name, role: user.role },
  landingRoute: LANDING_ROUTES[user.role],
});

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { pool, sessions, clock, rateLimiter, log, maxBodyBytes, auth } = deps;

  const requireSession = (session: Session | null): Session => {
    if (!session) throw new UnauthenticatedError();
    return session;
  };

  const shopOf = async (pool: pg.Pool): Promise<string> => {
    const shopId = await auth.installationShop(pool);
    if (shopId === null) throw new DomainError(SHOP_NOT_SET_UP);
    return shopId;
  };
  const handlers: Partial<Record<AuthOperationName, (call: AuthCall) => Promise<void>>> = {
    async signIn({ req, res, pool, input, at }) {
      const { phone, password, deviceLabel } = input as { phone: string; password: string; deviceLabel?: string };
      const shopId = await shopOf(pool);
      const phoneHash = phoneKey(auth.phoneSecret, phone);
      await checkAuthLimits(pool, {
        shopId,
        kind: 'sign_in',
        phoneHash,
        deviceHash: phoneKey(auth.phoneSecret, clientAddressOf(req)),
        now: at,
        limits: auth.limits,
      });
      const outcome = await runInTransaction(
        pool,
        (tx) =>
          signIn(
            tx,
            { passwords: auth.passwords, idleMinutes: auth.idleMinutes },
            { shopId, phone, phoneHash, password, deviceLabel: deviceLabelOf(req, deviceLabel), at },
          ),
        log,
      );
      if (outcome.kind === 'wrong') throw new ApiError('unauthenticated', AUTH_MESSAGES.wrongPassword);
      if (outcome.kind === 'locked') {
        throw new DomainError(`${AUTH_MESSAGES.lockedPrefix}${kolkataTime(outcome.lockedUntil)}.`);
      }
      setSessionCookie(res, outcome.token, { secure: auth.secureCookies });
      res.json(sessionResultFor(outcome.user));
    },

    async readCurrentSession({ res, pool, session, at }) {
      const current = requireSession(session);
      const live = await runInTransaction(
        pool,
        async (tx) => (sessions.confirm ? sessions.confirm(tx.client, current, at) : true),
        log,
      );
      if (!live) throw new UnauthenticatedError();
      res.json(sessionResultFor(current));
    },

    async signOut({ res, pool, session, at }) {
      const current = requireSession(session);
      await runInTransaction(
        pool,
        async (tx) => {
          const { rows } = await tx.client.query<{ device_label: string | null }>(
            'select device_label from sessions where id = $1 for update',
            [current.sessionId],
          );
          if (!(await endSession(tx.client, { sessionId: current.sessionId, reason: 'sign_out', at }))) return;
          await writeAuthAudit(tx.client, {
            shopId: current.shopId,
            at,
            actor: { kind: 'user', id: current.userId, name: current.name, role: current.role },
            action: 'signed_out',
            summary: `${current.name} signed out`,
            detail: { entity: 'session', entityId: current.sessionId, deviceLabel: rows[0]?.device_label ?? null },
          });
        },
        log,
      );
      clearSessionCookie(res, { secure: auth.secureCookies });
      res.json({ ok: true });
    },
    // The answer is `{ ok: true }` for known, unknown and deactivated phones alike (EP-04-S7).
    async requestPasswordReset({ req, res, pool, input, at }) {
      const { phone } = input as { phone: string };
      const shopId = await shopOf(pool);
      await checkAuthLimits(pool, {
        shopId,
        kind: 'reset',
        phoneHash: phoneKey(auth.phoneSecret, phone),
        deviceHash: phoneKey(auth.phoneSecret, clientAddressOf(req)),
        now: at,
        limits: auth.limits,
      });
      await runInTransaction(
        pool,
        (tx) => requestPasswordReset(tx, { mailer: auth.mailer, appUrl: auth.appUrl, log }, { shopId, phone, at }),
        log,
      );
      res.json({ ok: true });
    },
    async checkPasswordLink({ res, pool, input, at }) {
      const { token, purpose } = input as { token: string; purpose: LinkPurpose };
      const shopId = await shopOf(pool);
      res.json({ ok: true, state: await linkState(pool, { shopId, token, purpose, at }) });
    },
    async activateAccount({ res, pool, input, at }) {
      const { token, password } = input as { token: string; password: string };
      const shopId = await shopOf(pool);
      await runInTransaction(
        pool,
        (tx) => activateAccount(tx, { passwords: auth.passwords }, { shopId, token, password, at }),
        log,
      );
      res.json({ ok: true });
    },
    async resetPassword({ res, pool, input, at }) {
      const { token, password } = input as { token: string; password: string };
      const shopId = await shopOf(pool);
      await runInTransaction(
        pool,
        (tx) => resetPassword(tx, { passwords: auth.passwords }, { shopId, token, password, at }),
        log,
      );
      res.json({ ok: true });
    },
    async createFirstOwner({ res, pool, input, at }) {
      const { name, phone, email } = input as { name: string; phone: string; email: string };
      const shopId = await shopOf(pool);
      await runInTransaction(
        pool,
        (tx) => createFirstOwner(tx, { mailer: auth.mailer, appUrl: auth.appUrl, log }, { shopId, name, phone, email, at }),
        log,
      );
      res.json({ ok: true });
    },
  };

  const router = express.Router();
  router.use('/api/auth', express.json({ limit: maxBodyBytes }));
  router.post('/api/auth/:operation', async (req, res, next) => {
    try {
      const name = req.params.operation;
      // (a)
      const handler = Object.hasOwn(handlers, name) ? handlers[name as AuthOperationName] : undefined;
      if (!handler) throw new ApiError('not_found', `There is no operation named ${name}.`);
      // (b)
      const session = await sessions.resolve(req);
      // (c)
      const limit = await rateLimiter({
        operation: name,
        userId: session?.userId ?? null,
        clientAddress: clientAddressOf(req),
      });
      if (!limit.allowed) throw new RateLimitedError();
      // (d)
      const input = parseInput(authContract[name as AuthOperationName].input, req.body);
      // (e), (f)
      if (!pool) throw new Error('No database is configured (DATABASE_URL is not set)');
      await handler({ req, res, pool, session, input, at: clock.now() });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
