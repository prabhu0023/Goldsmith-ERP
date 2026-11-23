import {
  type Contract,
  computeCeiling,
  contract as sharedContract,
  OPERATION_AUDIT_KINDS,
  type Scale,
} from '@goldsmith/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
import type pg from 'pg';
import { createAccountMailer, StubMailer } from './auth/account-mail.js';
import { type AuthDeps, createAuthRouter } from './auth/auth-router.js';
import { createDevMailboxRouter } from './auth/dev-mailbox.js';
import { installationShop } from './auth/installation-shop.js';
import { passwordHasher } from './auth/password-hash.js';
import { matrixPermissionCheck } from './auth/permission-check.js';
import type { Config } from './config.js';
import { createFileHandlers } from './files/file-handlers.js';
import { createFilesRouter, type FilesDeps } from './files/files-router.js';
import { checkDatabase, withTimeout } from './health-check.js';
import { ApiError, type ErrorLog, RateLimitedError, toErrorResponse } from './pipeline/api-errors.js';
import { allowAllRateLimiter, type PermissionCheck, type RateLimiter } from './pipeline/hooks.js';
import { clientAddressOf, createOperationRouter } from './pipeline/operation-router.js';
import { type AuditKindMap, createOperationRegistry, type HandlerMap } from './pipeline/registry.js';
import { type Clock, systemClock } from './pipeline/server-clock.js';
import { noSessionResolver, type SessionResolver } from './pipeline/session-resolver.js';
import { createServiceHandlers } from './services/index.js';

/** One 0.0001 g scale; one weighing on it has a ceiling of half a step = 5 units. */
const PROBE_SCALE: Scale = { id: 'probe', name: 'Probe scale', readabilityG: 0.0001, capacityG: 1 };

/** True when the shared domain rules load and answer as expected. */
export function sharedRulesOk(): boolean {
  return computeCeiling([{ scaleId: PROBE_SCALE.id }], [PROBE_SCALE]).ceilingU === 5;
}

export interface AppDeps {
  /** Unset when DATABASE_URL is not configured: health reports the database down, operations fail. */
  pool?: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  rateLimiter: RateLimiter;
  permissions: PermissionCheck;
  contract: Contract;
  handlers: HandlerMap;
  /**
   * The audit kinds of each state-changing operation (EP-06-S2 AC4). Defaults to the shared
   * OPERATION_AUDIT_KINDS when `contract` is the shared one (not given); a test contract is not
   * wrapped unless the test passes its own map.
   */
  auditKinds: AuditKindMap;
  /** Server-side log for unexpected errors; never sent to the caller. */
  log: ErrorLog;
  /** How long Read Health waits for the database before reporting it down. */
  healthTimeoutMs: number;
  /** Sign-in (EP-04); unset fields default from config. */
  auth: Partial<AuthDeps>;
  /** File upload and signed links (EP-09); unset when object storage is not configured. */
  files?: FilesDeps;
}

/** The sign-in dependencies from config, with `overrides` on top. */
function authDepsFor(config: Config, overrides: Partial<AuthDeps> = {}): AuthDeps {
  return {
    installationShop,
    passwords: passwordHasher,
    mailer: overrides.mailer ?? createAccountMailer(config),
    limits: config.authLimits,
    idleMinutes: config.sessionIdleMinutes,
    appUrl: config.appUrl,
    secureCookies: config.appEnv !== 'development',
    phoneSecret: config.sessionSecret,
    ...overrides,
  };
}

export function createApp(config: Config, deps: Partial<AppDeps> = {}): Express {
  const {
    pool,
    sessions = noSessionResolver,
    clock = systemClock,
    rateLimiter = allowAllRateLimiter,
    permissions = matrixPermissionCheck,
    contract = sharedContract,
    log = console.error,
    healthTimeoutMs = 2000,
  } = deps;
  const auth = authDepsFor(config, deps.auth);
  const handlers = deps.handlers ?? {
    ...createServiceHandlers({ mailer: auth.mailer, appUrl: auth.appUrl, log }),
    // The file operations (EP-09) are served only when object storage is configured.
    ...(deps.files ? createFileHandlers(deps.files) : {}),
  };
  // Throws at startup for a handler the contract does not declare (EP-03-S1).
  const auditKinds = deps.auditKinds ?? (deps.contract ? undefined : OPERATION_AUDIT_KINDS);
  const registry = createOperationRegistry(contract, handlers, { auditKinds });

  const app = express();
  app.disable('x-powered-by');

  // Read Health (EP-03-S10): the only call that needs no session; the rate-limit hook still applies.
  app.get('/health', async (req, res, next) => {
    try {
      const session = await withTimeout(sessions.resolve(req), healthTimeoutMs, null);
      const limit = await rateLimiter({
        operation: 'readHealth',
        userId: session?.userId ?? null,
        clientAddress: clientAddressOf(req),
      });
      if (!limit.allowed) throw new RateLimitedError();
      const database = await checkDatabase(pool, healthTimeoutMs);
      const shared = sharedRulesOk();
      const ok = database === 'up' && shared;
      res.status(ok ? 200 : 503).json({
        status: ok ? 'ok' : 'error',
        service: 'api',
        env: config.appEnv,
        api: 'up',
        database,
        shared: shared ? 'ok' : 'error',
      });
    } catch (err) {
      next(err);
    }
  });

  // The account-email stub's mailbox (EP-04-S4), never in production.
  if (auth.mailer instanceof StubMailer && config.appEnv !== 'production') {
    app.use(createDevMailboxRouter(auth.mailer));
  }
  app.use(createAuthRouter({ pool, sessions, clock, rateLimiter, log, maxBodyBytes: config.maxBodyBytes, auth }));
  app.use(
    createOperationRouter({
      pool,
      sessions,
      clock,
      rateLimiter,
      permissions,
      registry,
      log,
      maxBodyBytes: config.maxBodyBytes,
      idempotencyRetentionHours: config.idempotencyRetentionHours,
    }),
  );

  if (deps.files) {
    app.use(
      createFilesRouter({
        pool,
        sessions,
        clock,
        rateLimiter,
        errorLog: log,
        files: deps.files,
        idempotencyRetentionHours: config.idempotencyRetentionHours,
        installationShop: auth.installationShop,
      }),
    );
  }
  app.use((_req, _res, next) => next(new ApiError('not_found', 'Nothing is here.')));

  const sendError: ErrorRequestHandler = (err, _req, res, _next) => {
    const { status, body } = toErrorResponse(err, log);
    res.status(status).json(body);
  };
  app.use(sendError);

  return app;
}
