import type { Server } from 'node:http';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db/connection.js';
import { describeDb, testPool } from './db/db-test-helpers.js';

const config = loadConfig({
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  API_PORT: '0',
});

/** Start the app on port 0; returns its base URL and a close function. */
async function serve(deps: Partial<AppDeps>): Promise<{ base: string; close(): Promise<void> }> {
  const server: Server = createApp(config, { log: () => {}, ...deps }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const HEALTH_KEYS = ['api', 'database', 'env', 'service', 'shared', 'status'];

/** Health must never reveal how the database is reached. */
function expectNoSecrets(body: unknown): void {
  const text = JSON.stringify(body);
  for (const secret of ['postgres', 'localhost', '127.0.0.1', '5432', '://', 'goldsmith_']) expect(text).not.toContain(secret);
}

describe('createPool timeouts', () => {
  it('sets connect, query and statement timeouts when given, and none otherwise', async () => {
    const url = 'postgres://postgres:postgres@127.0.0.1:1/goldsmith_dev';
    const timed = createPool(url, 3, { connectTimeoutMs: 1234, queryTimeoutMs: 5678 });
    expect(timed.options).toMatchObject({ max: 3, connectionTimeoutMillis: 1234, query_timeout: 5678, statement_timeout: 5678 });
    const plain = createPool(url, 1);
    expect(plain.options.query_timeout).toBeUndefined();
    expect(plain.options.statement_timeout).toBeUndefined();
    await Promise.all([timed.end(), plain.end()]);
  });
  it('frees the slot when a hung database does not answer the connect in time', async () => {
    const sockets: Socket[] = [];
    const silent = createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const port = (silent.address() as AddressInfo).port;
    const pool = createPool(`postgres://postgres:postgres@127.0.0.1:${port}/goldsmith_dev`, 1, {
      connectTimeoutMs: 200,
      queryTimeoutMs: 200,
    });
    pool.on('error', () => {});
    try {
      const started = Date.now();
      await expect(pool.query('select 1')).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(1500);
      expect(pool.totalCount).toBe(0);
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
      await pool.end().catch(() => {});
    }
  });
});
describeDb('GET /health with the database up (EP-03-S10 AC1, AC3, AC4)', () => {
  let pool: pg.Pool;
  let app: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => {
    pool = testPool(2);
    app = await serve({ pool });
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('answers 200 with api up, database up and the shared rules loaded, without a session', async () => {
    const res = await fetch(`${app.base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ok', service: 'api', env: 'development', api: 'up', database: 'up', shared: 'ok' });
    expect(Object.keys(body).sort()).toEqual(HEALTH_KEYS);
    expectNoSecrets(body);
  });
});

describe('GET /health with the database down (EP-03-S10 AC2, AC4, AC5)', () => {
  it('reports database down with a failure status when nothing listens on the database port', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const pool = createPool(`postgres://postgres:postgres@127.0.0.1:${port}/goldsmith_dev`, 1);
    const app = await serve({ pool });
    try {
      const res = await fetch(`${app.base}/health`);
      expect(res.status).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toEqual({ status: 'error', service: 'api', env: 'development', api: 'up', database: 'down', shared: 'ok' });
      expectNoSecrets(body);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it('gives up after the timeout when the database never answers', async () => {
    const sockets: Socket[] = [];
    const silent = createServer((socket) => {
      sockets.push(socket);
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const port = (silent.address() as AddressInfo).port;
    const pool = createPool(`postgres://postgres:postgres@127.0.0.1:${port}/goldsmith_dev`, 1);
    pool.on('error', () => {});
    const app = await serve({ pool, healthTimeoutMs: 200 });
    try {
      const started = Date.now();
      const res = await fetch(`${app.base}/health`);
      const elapsed = Date.now() - started;
      expect(res.status).toBe(503);
      expect(((await res.json()) as { database: string }).database).toBe('down');
      expect(elapsed).toBeLessThan(1500);
    } finally {
      await app.close();
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
      await pool.end().catch(() => {});
    }
  });

  it('holds no pool slot and leaves no socket open after repeated health checks against a hung database', async () => {
    const sockets: Socket[] = [];
    let closed = 0;
    const silent = createServer((socket) => {
      sockets.push(socket);
      // Read and drop what the client sends, so its close is seen; never answer.
      socket.resume();
      socket.on('close', () => {
        closed += 1;
      });
    });
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const port = (silent.address() as AddressInfo).port;
    const pool = createPool(`postgres://postgres:postgres@127.0.0.1:${port}/goldsmith_dev`, 1, {
      connectTimeoutMs: 300,
      queryTimeoutMs: 300,
    });
    pool.on('error', () => {});
    const app = await serve({ pool, healthTimeoutMs: 200 });
    try {
      for (let i = 0; i < 3; i++) {
        const started = Date.now();
        const res = await fetch(`${app.base}/health`);
        expect(res.status).toBe(503);
        expect(((await res.json()) as { database: string }).database).toBe('down');
        expect(Date.now() - started).toBeLessThan(1500);
      }
      // The probe never borrowed a pool slot, so the one slot is free for an operation.
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
      // Each probe connection is destroyed once its own timeout passes.
      expect(sockets).toHaveLength(3);
      await expect.poll(() => closed, { timeout: 2000 }).toBe(3);
    } finally {
      await app.close();
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => silent.close(() => resolve()));
      await pool.end().catch(() => {});
    }
  });
  it('reports database down when no database is configured', async () => {
    const app = await serve({});
    try {
      const res = await fetch(`${app.base}/health`);
      expect(res.status).toBe(503);
      expect(((await res.json()) as { database: string }).database).toBe('down');
    } finally {
      await app.close();
    }
  });

  it('answers 404 not_found for an unknown path', async () => {
    const app = await serve({});
    try {
      const res = await fetch(`${app.base}/nope`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ code: 'not_found', message: 'Nothing is here.' });
    } finally {
      await app.close();
    }
  });
});
