/**
 * The request pipeline for contract operations: `POST /api/ops/:operation` with a JSON body.
 *
 *   body size limit (express.json)  -> too large: validation, field body
 *   (a) look up the operation       -> not_found, nothing else runs
 *   (b) resolve the session (may be none)
 *   (c) rate-limit hook             -> rate_limited (EP-03-S11; sees no body)
 *   (d) require a session           -> unauthenticated (EP-03-S3)
 *   (d2) permission hook with the session actor -> forbidden (EP-05-S2); runs before input
 *       validation and before the transaction, so a refused call reads and writes nothing
 *   (e) validate the input          -> validation, field named (EP-03-S2); for a create, the
 *       Idempotency-Key header too (-> validation, field Idempotency-Key)
 *   (f) one transaction (EP-03-S6): shop context, ctx { by, at, shop } from the session and the
 *       server clock, session confirm (extends and row-locks it; ended or expired since (b) ->
 *       unauthenticated, EP-04-S12, S13; an operation with `extendsSession: false`, such as the
 *       live channel's background calls, is checked and locked without extending), idempotency claim for a create with a key
 *       (EP-03-S8; a replay answers the stored id without running the service function; the
 *       same key with a different input answers conflict),
 *       service function, store the created id with the claim
 *   (g) answer the service function's result
 * Every error goes to the app's error middleware (toErrorResponse).
 */
import { CONTRACT_VERSION } from '@goldsmith/shared';
import express, { type Request, type Router } from 'express';
import type pg from 'pg';
import { loadShopContext } from '../db/shop-context.js';
import { ApiError, type ErrorLog, RateLimitedError, UnauthenticatedError, ValidationError } from './api-errors.js';
import type { PermissionCheck, RateLimiter } from './hooks.js';
import { claimKey, completeKey } from './idempotency.js';
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
  /** How long an idempotency key is kept (EP-03-S8). */
  idempotencyRetentionHours: number;
}

export const clientAddressOf = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? '';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY = /^[\x20-\x7e]{1,200}$/;
/**
 * The Idempotency-Key of a create request (EP-03-S8): 1 to 200 printable ASCII characters.
 * Undefined when the header is absent or the operation is not a create (the header is ignored).
 */
function idempotencyKeyOf(req: Request, op: RegisteredOperation): string | undefined {
  if (op.def.kind !== 'create') return undefined;
  const key = req.get(IDEMPOTENCY_HEADER);
  if (key === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new ValidationError('Idempotency-Key', 'Idempotency-Key must be 1 to 200 printable characters.');
  }
  return key;
}
/**
 * Runs the service function inside the operation's transaction. With an idempotency key, the
 * key is claimed first and the created id stored with it after, in the same transaction, so a
 * refused or failed request leaves no record (EP-03-S8 AC4).
 */
async function runOperation(
  tx: Tx,
  ctx: OperationCtx,
  op: RegisteredOperation,
  input: unknown,
  idempotency: { key: string; retentionHours: number } | undefined,
): Promise<unknown> {
  if (!idempotency) return op.run(tx, ctx, input);
  const claim = await claimKey(tx, {
    key: idempotency.key,
    operation: op.def.name,
    userId: ctx.by.id,
    shopId: ctx.shop.shopId,
    input,
    now: ctx.at,
    retentionHours: idempotency.retentionHours,
  });
  if ('replay' in claim) return { ok: true, id: claim.replay };
  const result = (await op.run(tx, ctx, input)) as { id: string };
  await completeKey(tx, claim.claimId, result.id);
  return result;
}
export function createOperationRouter(deps: OperationRouterDeps): Router {
  const { pool, sessions, clock, rateLimiter, permissions, registry, log, maxBodyBytes, idempotencyRetentionHours } =
    deps;
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
      // (d2)
      await permissions(name, { id: session.userId, name: session.name, role: session.role });
      // (e)
      const input = parseInput(op.def.input, req.body);
      const key = idempotencyKeyOf(req, op);
      const idempotency = key === undefined ? undefined : { key, retentionHours: idempotencyRetentionHours };
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
          const extend = op.def.extendsSession !== false;
          if (sessions.confirm && !(await sessions.confirm(tx.client, session, ctx.at, { extend }))) {
            throw new UnauthenticatedError();
          }
          return runOperation(tx, ctx, op, input, idempotency);
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
