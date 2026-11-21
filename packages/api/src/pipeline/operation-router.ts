/**
 * The request pipeline for contract operations: `POST /api/ops/:operation` with a JSON body.
 *
 *   body size limit (express.json)  -> too large: validation, field body
 *   (a) look up the operation       -> not_found, nothing else runs
 *   (b) resolve the session (may be none)
 *   (c) rate-limit hook             -> rate_limited (EP-03-S11; sees no body)
 *   (d) require a session           -> unauthenticated (EP-03-S3)
 *   (e) validate the input          -> validation, field named (EP-03-S2)
 *   (f) one transaction (EP-03-S6): shop context, ctx { by, at, shop } from the session and the
 *       server clock, permission hook (-> forbidden), service function
 *   (g) answer the service function's result
 * Every error goes to the app's error middleware (toErrorResponse).
 */
import { CONTRACT_VERSION } from '@goldsmith/shared';
import express, { type Request, type Router } from 'express';
import type pg from 'pg';
import { loadShopContext } from '../db/shop-context.js';
import { ApiError, type ErrorLog, RateLimitedError, UnauthenticatedError } from './api-errors.js';
import type { PermissionCheck, RateLimiter } from './hooks.js';
import { runInTransaction, type Tx } from './operation-transaction.js';
import type { OperationCtx, OperationRegistry, RegisteredOperation } from './registry.js';
import type { Clock } from './server-clock.js';
import type { SessionResolver } from './session-resolver.js';
import { parseInput } from './validate-input.js';

export interface OperationRouterDeps {
  pool?: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  rateLimiter: RateLimiter;
  permissions: PermissionCheck;
  registry: OperationRegistry;
  log: ErrorLog;
  maxBodyBytes: number;
}

export const clientAddressOf = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? '';

/**
 * Runs the service function inside the operation's transaction. This is the seam where
 * per-operation steps that must share the transaction (the idempotency key claim of EP-03-S8)
 * go: before and after `op.run`.
 */
async function runOperation(
  tx: Tx,
  ctx: OperationCtx,
  op: RegisteredOperation,
  input: unknown,
  _req: Request,
): Promise<unknown> {
  return op.run(tx, ctx, input);
}

export function createOperationRouter(deps: OperationRouterDeps): Router {
  const { pool, sessions, clock, rateLimiter, permissions, registry, log, maxBodyBytes } = deps;
  const router = express.Router();

  router.use('/api/ops', express.json({ limit: maxBodyBytes }));

  router.post('/api/ops/:operation', async (req, res, next) => {
    try {
      const name = req.params.operation;
      // (a)
      const op = registry.get(name);
      if (!op) throw new ApiError('not_found', `There is no operation named ${name}.`);
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
      if (!session) throw new UnauthenticatedError();
      // (e)
      const input = parseInput(op.def.input, req.body);
      // (f)
      if (!pool) throw new Error('No database is configured (DATABASE_URL is not set)');
      const result = await runInTransaction(
        pool,
        async (tx) => {
          const shop = await loadShopContext(tx.client, session.shopId);
          const ctx: OperationCtx = {
            by: { id: session.userId, name: session.name, role: session.role },
            at: clock.now(),
            shop,
          };
          await permissions(name, ctx.by);
          return runOperation(tx, ctx, op, input, req);
        },
        log,
      );
      // (g)
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/contract-version', async (req, res, next) => {
    try {
      const session = await sessions.resolve(req);
      if (!session) throw new UnauthenticatedError();
      res.json({ ok: true, version: CONTRACT_VERSION });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
