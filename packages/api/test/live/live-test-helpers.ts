/**
 * Helpers for the EP-07 live channel tests: a shop of the test's own (test files share one
 * database), a transaction to emit events in, a publisher scoped to that shop, and the rows it
 * stamped; and startLiveHarness, the real app plus a live channel on port 0 with Server-Sent
 * Events clients that send the gs_session cookie.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LiveCatalogue, LiveEnvelope, LiveServerMessage, LiveTopic, RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { createApp } from '../../src/app.js';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { loadConfig } from '../../src/config.js';
import { loadShopContext } from '../../src/db/shop-context.js';
import { emitLiveEvent, type LiveEmit } from '../../src/live/emit-live-event.js';
import { createLiveChannel, type LiveChannel, type LiveChannelOptions } from '../../src/live/live-channel.js';
import { type LivePublisher, type LivePublisherOptions, type LiveRow, createLivePublisher } from '../../src/live/publisher.js';
import { runInTransaction, type Tx } from '../../src/pipeline/operation-transaction.js';
import type { Clock } from '../../src/pipeline/server-clock.js';
import { addKarigar, addPiece, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { HIGH_AUTH_LIMITS, newSession, newUser, SERVER_NOW, sessionCookie, testPasswords } from '../support/api-harness.js';
import { type MutableClock, mutableClock } from '../support/test-clock.js';
import { readSseFrames } from './node-live-stream.js';

type Queryable = pg.Pool | pg.PoolClient;

/** A fresh shop for one live test. */
export const newLiveShop = (pool: Queryable, name = 'Live test shop'): Promise<TestShop> => newShop(pool, name);

/** Run `fn` in one operation transaction, as the pipeline does; after-commit hooks run after it. */
export function inTransaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runInTransaction(pool, fn, () => {});
}

/** A recording onRows sink: every row a publisher stamped, in the order it reported them. */
export function rowSink(): { rows: LiveRow[]; onRows: (rows: LiveRow[]) => void } {
  const rows: LiveRow[] = [];
  return { rows, onRows: (stamped) => rows.push(...stamped) };
}

/** A publisher that sees only `shop`'s rows, with the server clock at SERVER_NOW unless given. */
export function shopPublisher(
  pool: pg.Pool,
  shop: TestShop,
  opts: Partial<Omit<LivePublisherOptions, 'pool' | 'shopIds'>> & { clock?: Clock } = {},
): LivePublisher {
  return createLivePublisher({
    pool,
    clock: opts.clock ?? { now: () => new Date(SERVER_NOW.getTime()) },
    log: () => {},
    ...opts,
    shopIds: [shop.shopId],
  });
}

/** Stamp until nothing is left; returns every row stamped. */
export async function stampAll(publisher: LivePublisher): Promise<LiveRow[]> {
  const all: LiveRow[] = [];
  for (;;) {
    const rows = await publisher.stamp();
    if (rows.length === 0) return all;
    all.push(...rows);
  }
}

/** The shop's live outbox rows (stamped or not), in commit order. */
export async function liveOutboxRows(
  client: Queryable,
  shop: TestShop,
): Promise<Array<{ topic: string; entity_id: string; live_seq: string | null }>> {
  const { rows } = await client.query<{ topic: string; entity_id: string; live_seq: string | null }>(
    `select topic, entity_id, live_seq from outbox_events
      where shop_id = $1 and entity_type is not null order by insert_order`,
    [shop.shopId],
  );
  return rows;
}

/** Insert a lead in the shop; returns its id. */
export async function addLiveLead(client: Queryable, shop: TestShop, code: string, state = 'needs_glance'): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into leads (shop_id, code, source, state, arrived_at) values ($1, $2, 'whatsapp', $3, $4) returning id`,
    [shop.shopId, code, state, SERVER_NOW],
  );
  return rows[0].id;
}

/** Insert a piece in stock and raise it to `version` (every update bumps it by one). */
export async function addPieceAtVersion(client: Queryable, shop: TestShop, tagNo: string, version: number): Promise<string> {
  const id = await addPiece(client, shop, tagNo);
  for (let v = 1; v < version; v += 1) {
    await client.query('update pieces set name = name where shop_id = $1 and id = $2', [shop.shopId, id]);
  }
  return id;
}

/** Insert a parcel from `karigarId` (a karigars.id); returns its id. */
export async function addParcel(client: Queryable, shop: TestShop, code: string, karigarId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'insert into parcels (shop_id, location_id, code, karigar_id) values ($1, $2, $3, $4) returning id',
    [shop.shopId, shop.locationId, code, karigarId],
  );
  return rows[0].id;
}

/** Insert a karigar job for `karigarId` (a karigars.id); returns its id. */
export async function addJob(client: Queryable, shop: TestShop, code: string, karigarId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into karigar_jobs (shop_id, code, karigar_id, status, target_gross_units, target_net_units,
       tolerance_units, gold_issued_units)
     values ($1, $2, $3, 'sent', 100000, 90000, 500, 100000) returning id`,
    [shop.shopId, code, karigarId],
  );
  return rows[0].id;
}

/** The karigar record linked to a user. */
export async function karigarOf(client: Queryable, userId: string): Promise<string> {
  const { rows } = await client.query<{ karigar_id: string }>('select karigar_id from users where id = $1', [userId]);
  return rows[0].karigar_id;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A Server-Sent Events client for tests: fetch with the session cookie, frames parsed and checked. */
export interface LiveTestClient {
  status: number;
  /** The JSON error body of a refused stream. */
  body: Record<string, unknown> | null;
  /** Every message received, each checked against the shared protocol schema. */
  messages: LiveServerMessage[];
  /** The SSE `id` of the last message that had one (what EventSource sends as Last-Event-ID). */
  lastEventId: number | null;
  hello: Extract<LiveServerMessage, { type: 'hello' }> | null;
  events(): LiveEnvelope[];
  /** The first message (already received or arriving within `ms`) that matches. */
  waitFor(pred: (m: LiveServerMessage) => boolean, ms?: number): Promise<LiveServerMessage>;
  /** Resolves when the server ends the stream. */
  ended: Promise<void>;
  isEnded(): boolean;
  /** Drop the connection from the client side. */
  close(): void;
}

export interface ConnectOptions {
  since?: number;
  lastEventId?: number;
  origin?: string;
}

export async function openLiveStream(base: string, token: string | null, opts: ConnectOptions = {}): Promise<LiveTestClient> {
  const abort = new AbortController();
  const headers: Record<string, string> = { accept: 'text/event-stream' };
  if (token !== null) headers.cookie = sessionCookie(token);
  if (opts.lastEventId !== undefined) headers['last-event-id'] = String(opts.lastEventId);
  if (opts.origin !== undefined) headers.origin = opts.origin;
  const url = `${base}/api/live${opts.since === undefined ? '' : `?since=${opts.since}`}`;
  const res = await fetch(url, { headers, signal: abort.signal });
  const waiters: Array<() => void> = [];
  let endedFlag = false;
  let resolveEnded: () => void = () => {};
  const ended = new Promise<void>((resolve) => {
    resolveEnded = resolve;
  });
  const client: LiveTestClient = {
    status: res.status,
    body: null,
    messages: [],
    lastEventId: null,
    hello: null,
    events: () => client.messages.flatMap((m) => (m.type === 'event' ? [m.event] : [])),
    waitFor(pred, ms = 2_000) {
      const found = client.messages.find(pred);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no matching live message within ${ms} ms`)), ms);
        const check = () => {
          const m = client.messages.find(pred);
          if (m) {
            clearTimeout(timer);
            resolve(m);
          } else waiters.push(check);
        };
        waiters.push(check);
      });
    },
    ended,
    isEnded: () => endedFlag,
    close: () => abort.abort(),
  };
  const finish = () => {
    endedFlag = true;
    resolveEnded();
  };
  if (res.status !== 200 || !res.body) {
    client.body = (await res.json()) as Record<string, unknown>;
    finish();
    return client;
  }
  const body = res.body;
  void (async () => {
    try {
      await readSseFrames(body, ({ id, msg }) => {
        if (id !== null) client.lastEventId = id;
        if (msg === null) return;
        if (msg.type === 'hello') client.hello = msg;
        client.messages.push(msg);
        for (const w of waiters.splice(0)) w();
      });
    } catch {
      // Aborted by the test.
    } finally {
      finish();
    }
  })();
  await client.waitFor((m) => m.type === 'hello' || m.type === 'closed');
  return client;
}

export interface LiveHarness {
  pool: pg.Pool;
  shop: TestShop;
  clock: MutableClock;
  base: string;
  live: LiveChannel;
  logged: Array<{ message: string; err: unknown }>;
  /** A new active user in the shop with a live session. */
  user(name: string, role?: RoleId, opts?: { password?: string; karigarId?: string }): Promise<{ id: string; token: string }>;
  connect(token: string | null, opts?: ConnectOptions): Promise<LiveTestClient>;
  /** Record a live event in its own committed transaction, as a service function would. */
  emit<T extends LiveTopic>(topic: T, event: Omit<LiveEmit<T>, 'at'> & { at?: Date }): Promise<void>;
  /** POST /api/ops/<op> with the session cookie. */
  call(op: string, body: unknown, token?: string): Promise<{ status: number; body: Record<string, unknown> }>;
  /** POST /api/dev/live/emit with the session cookie. */
  devEmit(body: unknown, token?: string): Promise<{ status: number; body: Record<string, unknown> }>;
  close(): Promise<void>;
}

export interface LiveHarnessOptions extends Partial<Omit<LiveChannelOptions, 'pool' | 'sessions' | 'clock' | 'appUrl' | 'log'>> {
  /** Start the live loops (default true); tests that drive tick() and sweep() themselves pass false. */
  start?: boolean;
  appEnv?: 'development' | 'production';
  catalogue?: LiveCatalogue;
}

export const LIVE_APP_URL = 'http://localhost:3000';

/** The real app with the production handlers and a live channel on port 0, with fast live timings. */
export async function startLiveHarness(opts: LiveHarnessOptions = {}): Promise<LiveHarness> {
  const { start = true, appEnv = 'development', ...liveOpts } = opts;
  const pool = testPool(10);
  const shop = await newShop(pool, 'Live harness shop');
  const clock = mutableClock(SERVER_NOW);
  const logged: LiveHarness['logged'] = [];
  const log = (message: string, err: unknown) => logged.push({ message, err });
  const config = loadConfig({
    APP_ENV: appEnv,
    APP_URL: LIVE_APP_URL,
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
    API_PORT: '0',
  });
  const sessions = createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes });
  const live = createLiveChannel({
    pool,
    sessions,
    clock,
    appUrl: LIVE_APP_URL,
    log,
    pollMs: 50,
    sweepMs: 100,
    heartbeatMs: 200,
    presenceTimeoutMs: 300,
    pruneEveryMs: 3_600_000,
    shopIds: [shop.shopId],
    ...liveOpts,
  });
  const app = createApp(config, {
    pool,
    sessions,
    clock,
    log,
    live,
    auth: {
      installationShop: async () => shop.shopId,
      passwords: testPasswords,
      limits: HIGH_AUTH_LIMITS,
    },
  });
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  if (start) live.start();
  const clients: LiveTestClient[] = [];
  const post = async (path: string, body: unknown, token?: string) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token !== undefined) headers.cookie = sessionCookie(token);
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  return {
    pool,
    shop,
    clock,
    base,
    live,
    logged,
    async user(name, role = 'staff', userOpts = {}) {
      const passwordHash = userOpts.password ? await testPasswords.hash(userOpts.password) : null;
      const karigarId =
        role === 'karigar' ? (userOpts.karigarId ?? (await addKarigar(pool, shop, `KG-${name.replace(/\W/g, '')}`))) : undefined;
      const id = await newUser(pool, shop, { name, role, passwordHash, karigarId });
      return { id, token: await newSession(pool, shop, id) };
    },
    async connect(token, connectOpts) {
      const c = await openLiveStream(base, token, connectOpts);
      clients.push(c);
      await live.settled();
      return c;
    },
    async emit(topic, event) {
      await inTransaction(pool, async (tx) => {
        const ctx = await loadShopContext(tx.client, shop.shopId);
        await emitLiveEvent(tx, ctx, topic, { at: clock.now(), ...event } as LiveEmit<typeof topic>);
      });
    },
    call: (op, body, token) => post(`/api/ops/${op}`, body, token),
    devEmit: (body, token) => post('/api/dev/live/emit', body, token),
    async close() {
      for (const c of clients) c.close();
      await live.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
    },
  };
}
