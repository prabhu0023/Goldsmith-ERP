/**
 * Starts the real app on port 0 against the test database with the fixture operations, a fixed
 * server clock and the development session stub, and calls it over HTTP with fetch.
 */
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import type { ErrorLog } from '../../src/pipeline/api-errors.js';
import type { PermissionCheck, RateLimiter } from '../../src/pipeline/hooks.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import type { AnyHandler, HandlerMap, OperationCtx } from '../../src/pipeline/registry.js';
import { fixedClock } from '../../src/pipeline/server-clock.js';
import { createDevSessionResolver, DEV_SESSION_HEADER } from '../../src/pipeline/session-resolver.js';
import { newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { createFixtureHandlers, testContract } from './fixture-operations.js';

/** The fixed server time every harness app uses. */
export const SERVER_NOW = new Date('2026-11-21T10:00:00.000Z');

export interface HarnessOptions {
  rateLimiter?: RateLimiter;
  permissions?: PermissionCheck;
  /** Defaults to collecting into `logged` without printing. */
  log?: ErrorLog;
  maxBodyBytes?: number;
  /** Awaited by parcelWithPoolEntry between its two writes. */
  gate?: () => Promise<void>;
  /** Pool size for the app (parallel tests need more). */
  poolSize?: number;
}

export interface Captured {
  operation: string;
  ctx: OperationCtx;
  input: unknown;
}

export interface CallOptions {
  /** sessions.id sent in the dev session header. */
  session?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface Harness {
  pool: pg.Pool;
  shop: TestShop;
  base: string;
  /** Every handler call: operation, ctx and validated input. */
  captured: Captured[];
  /** Operations whose after-commit hook ran, in order. */
  commits: string[];
  /** Unexpected errors the app logged. */
  logged: Array<{ message: string; err: unknown }>;
  /** A session for a new staff user "Rajesh Verma" in `shop`. */
  session: string;
  userId: string;
  /** POST /api/ops/<op>. A string body is sent as is (for malformed or oversized bodies). */
  call(op: string, body: unknown, opts?: CallOptions): Promise<{ status: number; body: Record<string, unknown> }>;
  close(): Promise<void>;
}

/** Insert a user in `shop`; returns its id. */
export async function newUser(
  pool: pg.Pool,
  shop: TestShop,
  { name, role = 'staff' }: { name: string; role?: RoleId },
): Promise<string> {
  const phone = `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
  const { rows } = await pool.query<{ id: string }>(
    `insert into users (shop_id, name, phone, email, role) values ($1, $2, $3, $4, $5) returning id`,
    [shop.shopId, name, phone, `${phone}@example.test`, role],
  );
  return rows[0].id;
}

/** Insert a session for `userId`, live for 12 h after SERVER_NOW unless told otherwise; returns its id. */
export async function newSession(
  pool: pg.Pool,
  shop: TestShop,
  userId: string,
  { expiresAt, endedAt }: { expiresAt?: Date; endedAt?: Date | null } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into sessions (shop_id, user_id, expires_at, ended_at) values ($1, $2, $3, $4) returning id`,
    [shop.shopId, userId, expiresAt ?? new Date(SERVER_NOW.getTime() + 12 * 3600_000), endedAt ?? null],
  );
  return rows[0].id;
}

export async function startHarness(options: HarnessOptions = {}): Promise<Harness> {
  const pool = testPool(options.poolSize ?? 10);
  const shop = await newShop(pool);
  const userId = await newUser(pool, shop, { name: 'Rajesh Verma', role: 'staff' });
  const session = await newSession(pool, shop, userId);

  const captured: Captured[] = [];
  const commits: string[] = [];
  const logged: Harness['logged'] = [];
  const fixtures = createFixtureHandlers({ gate: options.gate, onCommit: (op) => commits.push(op) });
  const handlers: Record<string, AnyHandler> = {};
  for (const [operation, handler] of Object.entries(fixtures as HandlerMap)) {
    if (!handler) continue;
    const run = handler as (tx: Tx, ctx: OperationCtx, input: unknown) => Promise<unknown>;
    handlers[operation] = async (tx: Tx, ctx: OperationCtx, input: unknown) => {
      captured.push({ operation, ctx, input });
      return run(tx, ctx, input);
    };
  }

  const clock = fixedClock(SERVER_NOW);
  const config = loadConfig({
    APP_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
    API_PORT: '0',
    ...(options.maxBodyBytes === undefined ? {} : { API_MAX_BODY_BYTES: String(options.maxBodyBytes) }),
  });
  const app = createApp(config, {
    pool,
    sessions: createDevSessionResolver({ appEnv: 'development', pool, clock }),
    clock,
    rateLimiter: options.rateLimiter,
    permissions: options.permissions,
    contract: testContract,
    handlers,
    log: options.log ?? ((message, err) => logged.push({ message, err })),
  });
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    pool,
    shop,
    base,
    captured,
    commits,
    logged,
    session,
    userId,
    async call(op, body, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
      if (opts.session !== undefined) headers[DEV_SESSION_HEADER] = opts.session;
      if (opts.idempotencyKey !== undefined) headers['idempotency-key'] = opts.idempotencyKey;
      const res = await fetch(`${base}/api/ops/${op}`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      await pool.end();
    },
  };
}

/** Patterns that must never appear in an error body: stack frames, file paths, database text. */
export const LEAK_PATTERNS = [
  /\bat \S+:\d+/,
  /\.ts\b/,
  /\/Users\//,
  /node_modules/,
  /postgres/i,
  /\bstack\b/i,
  /\b(select|insert|update) /i,
  /violates|constraint|relation /i,
];

/** Fail when the serialized body shows any leak pattern. */
export function leaksIn(body: unknown): RegExp[] {
  const text = JSON.stringify(body);
  return LEAK_PATTERNS.filter((p) => p.test(text));
}
