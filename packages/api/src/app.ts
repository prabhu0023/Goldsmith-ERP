import { type Contract, computeCeiling, contract as sharedContract, type Scale } from '@goldsmith/shared';
import express, { type ErrorRequestHandler, type Express } from 'express';
import type pg from 'pg';
import type { Config } from './config.js';
import { checkDatabase, withTimeout } from './health-check.js';
import { ApiError, type ErrorLog, RateLimitedError, toErrorResponse } from './pipeline/api-errors.js';
import { allowAllPermissions, allowAllRateLimiter, type PermissionCheck, type RateLimiter } from './pipeline/hooks.js';
import { clientAddressOf, createOperationRouter } from './pipeline/operation-router.js';
import { createOperationRegistry, type HandlerMap } from './pipeline/registry.js';
import { type Clock, systemClock } from './pipeline/server-clock.js';
import { noSessionResolver, type SessionResolver } from './pipeline/session-resolver.js';
import { handlers as serviceHandlers } from './services/index.js';

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
  /** Server-side log for unexpected errors; never sent to the caller. */
  log: ErrorLog;
  /** How long Read Health waits for the database before reporting it down. */
  healthTimeoutMs: number;
}

export function createApp(config: Config, deps: Partial<AppDeps> = {}): Express {
  const {
    pool,
    sessions = noSessionResolver,
    clock = systemClock,
    rateLimiter = allowAllRateLimiter,
    permissions = allowAllPermissions,
    contract = sharedContract,
    handlers = serviceHandlers,
    log = console.error,
    healthTimeoutMs = 2000,
  } = deps;
  // Throws at startup for a handler the contract does not declare (EP-03-S1).
  const registry = createOperationRegistry(contract, handlers);

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

  app.use((_req, _res, next) => next(new ApiError('not_found', 'Nothing is here.')));

  const sendError: ErrorRequestHandler = (err, _req, res, _next) => {
    const { status, body } = toErrorResponse(err, log);
    res.status(status).json(body);
  };
  app.use(sendError);

  return app;
}
