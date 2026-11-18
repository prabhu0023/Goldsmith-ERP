import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  API_PORT: '0',
});

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp(config).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('GET /health', () => {
  it('answers 200 with status ok and the shared rules loaded', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'api', env: 'development', shared: 'ok' });
  });

  it('answers 404 for an unknown path', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});
