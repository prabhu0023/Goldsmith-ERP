/**
 * Starts the real app on port 0 against the test database with the fixture operations, a fixed
 * server clock (or the test's own) and the cookie session resolver, and calls it over HTTP with
 * fetch. Sign-in (EP-04) runs with the harness shop as the installation shop, a fast password
 * hasher (ln=10), an in-memory mailer and limits high enough never to trigger.
 */
import { randomInt } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { createApp } from '../../src/app.js';
import { StubMailer } from '../../src/auth/account-mail.js';
import type { AuthDeps } from '../../src/auth/auth-router.js';
import { createPasswordHasher } from '../../src/auth/password-hash.js';
import { createSessionResolver, generateSecret, hashSecret, SESSION_COOKIE } from '../../src/auth/session-store.js';
import { type AppEnv, loadConfig } from '../../src/config.js';
import type { ErrorLog } from '../../src/pipeline/api-errors.js';
import { allowAllPermissions, type PermissionCheck, type RateLimiter } from '../../src/pipeline/hooks.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import type { AnyHandler, HandlerMap, OperationCtx } from '../../src/pipeline/registry.js';
import { type Clock, fixedClock } from '../../src/pipeline/server-clock.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { addKarigar, appRolePool, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
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
  /** Defaults to a fixed clock at SERVER_NOW. */
  clock?: Clock;
  /** Sign-in dependencies over the harness defaults. */
  auth?: Partial<AuthDeps>;
  /** Defaults to development. */
  appEnv?: AppEnv;
  /**
   * Use the production contract, handlers and permission check instead of the fixture
   * operations and allow-all permissions (EP-05), with file storage on (in memory, EP-09). The app then connects as goldsmith_app, the
   * role the api runs as (EP-06, FU-001); `pool` (setup and checks) stays the owner.
   */
  production?: boolean;
}

/** The fast hasher every harness uses (the S2 tests use the production parameters). */
export const testPasswords = createPasswordHasher({ ln: 10 });

/** Limits no test reaches unless it sets its own. */
export const HIGH_AUTH_LIMITS: AuthDeps['limits'] = {
  windowMinutes: 15,
  signInPerPhone: 10_000,
  signInPerDevice: 10_000,
  resetPerPhone: 10_000,
  resetPerDevice: 10_000,
};

/** The Cookie header value that carries a session token. */
export const sessionCookie = (token: string): string => `${SESSION_COOKIE}=${token}`;

export interface Captured {
  operation: string;
  ctx: OperationCtx;
  input: unknown;
}

export interface CallOptions {
  /** A session token, sent as the gs_session cookie. */
  session?: string;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

export interface AuthCallOptions {
  token?: string;
  headers?: Record<string, string>;
}

export interface AuthCallResult {
  status: number;
  body: Record<string, unknown>;
  /** The Set-Cookie header, or null. */
  setCookie: string | null;
}

/** The session token in a Set-Cookie header, or null. */
export function tokenFrom(setCookie: string | null): string | null {
  const m = setCookie?.match(new RegExp(`(?:^|,\\s*)${SESSION_COOKIE}=([^;]*)`));
  return m?.[1] ? m[1] : null;
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
  /** A session token for a new active staff user "Rajesh Verma" in `shop`. */
  session: string;
  userId: string;
  /** The account emails the app sent. */
  mailer: StubMailer;
  /** POST /api/ops/<op>. A string body is sent as is (for malformed or oversized bodies). */
  call(op: string, body: unknown, opts?: CallOptions): Promise<{ status: number; body: Record<string, unknown> }>;
  /** POST /api/auth/<op>, with the session token as the cookie when given. */
  auth(op: string, body: unknown, opts?: AuthCallOptions): Promise<AuthCallResult>;
  close(): Promise<void>;
}

export type UserStatus = 'pending_activation' | 'active' | 'deactivated';

export interface NewUserOptions {
  name: string;
  role?: RoleId;
  /** Defaults to a random mobile number. */
  phone?: string;
  email?: string;
  /** Defaults to active, so the user's sessions are accepted. */
  status?: UserStatus;
  passwordHash?: string | null;
  /** A karigar user's karigar record; one is created when not given. */
  karigarId?: string;
}

/** Insert a user in `shop`; returns its id. */
export async function newUser(
  pool: pg.Pool,
  shop: TestShop,
  { name, role = 'staff', phone, email, status = 'active', passwordHash = null, karigarId }: NewUserOptions,
): Promise<string> {
  const number = phone ?? `9${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
  const karigar =
    role === 'karigar' ? (karigarId ?? (await addKarigar(pool, shop, `KG-U-${randomInt(0, 1_000_000_000)}`))) : null;
  const { rows } = await pool.query<{ id: string }>(
    `insert into users (shop_id, name, phone, email, role, status, password_hash, karigar_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [shop.shopId, name, number, email ?? `${number.replace(/[^0-9]/g, '')}@example.test`, role, status, passwordHash, karigar],
  );
  return rows[0].id;
}

/** Insert a user whose password is `password` (hashed with the test hasher); returns its id. */
export async function newUserWithPassword(
  pool: pg.Pool,
  shop: TestShop,
  options: Omit<NewUserOptions, 'passwordHash'> & { password: string },
): Promise<string> {
  const { password, ...rest } = options;
  return newUser(pool, shop, { ...rest, passwordHash: await testPasswords.hash(password) });
}

/**
 * Insert a session for `userId`, issued for the user's role and live for 12 h after SERVER_NOW
 * unless told otherwise; returns its token.
 */
export async function newSession(
  pool: pg.Pool,
  shop: TestShop,
  userId: string,
  { expiresAt, endedAt, roleAtIssue }: { expiresAt?: Date; endedAt?: Date | null; roleAtIssue?: RoleId } = {},
): Promise<string> {
  const token = generateSecret();
  await pool.query(
    `insert into sessions (shop_id, user_id, expires_at, ended_at, token_hash, role_at_issue)
     select $1, u.id, $3, $4, $5, coalesce($6, u.role) from users u where u.shop_id = $1 and u.id = $2`,
    [
      shop.shopId,
      userId,
      expiresAt ?? new Date(SERVER_NOW.getTime() + 12 * 3600_000),
      endedAt ?? null,
      hashSecret(token),
      roleAtIssue ?? null,
    ],
  );
  return token;
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

  const clock = options.clock ?? fixedClock(SERVER_NOW);
  const mailer = new StubMailer({ mailboxUrl: 'http://localhost/dev/mailbox', log: () => {} });
  const config = loadConfig({
    APP_ENV: options.appEnv ?? 'development',
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
    API_PORT: '0',
    ...(options.maxBodyBytes === undefined ? {} : { API_MAX_BODY_BYTES: String(options.maxBodyBytes) }),
  });
  const appPool = options.production ? appRolePool(options.poolSize ?? 10) : pool;
  const app = createApp(config, {
    pool: appPool,
    sessions: createSessionResolver({ pool: appPool, clock, idleMinutes: config.sessionIdleMinutes }),
    clock,
    rateLimiter: options.rateLimiter,
    ...(options.production
      ? {
          files: {
            storage: new MemoryStorage(),
            limits: { maxBytes: config.fileMaxBytes },
            linkSecret: config.sessionSecret,
            ttlSeconds: config.fileLinkTtlSeconds,
            log: () => {},
          },
        }
      : { permissions: options.permissions ?? allowAllPermissions, contract: testContract, handlers }),
    log: options.log ?? ((message, err) => logged.push({ message, err })),
    auth: {
      installationShop: async () => shop.shopId,
      passwords: testPasswords,
      mailer,
      limits: HIGH_AUTH_LIMITS,
      ...options.auth,
    },
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
    mailer,
    async call(op, body, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
      if (opts.session !== undefined) headers.cookie = sessionCookie(opts.session);
      if (opts.idempotencyKey !== undefined) headers['idempotency-key'] = opts.idempotencyKey;
      const res = await fetch(`${base}/api/ops/${op}`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    async auth(op, body, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
      if (opts.token !== undefined) headers.cookie = sessionCookie(opts.token);
      const res = await fetch(`${base}/api/auth/${op}`, {
        method: 'POST',
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return {
        status: res.status,
        body: (await res.json()) as Record<string, unknown>,
        setCookie: res.headers.get('set-cookie'),
      };
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      if (appPool !== pool) await appPool.end();
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
