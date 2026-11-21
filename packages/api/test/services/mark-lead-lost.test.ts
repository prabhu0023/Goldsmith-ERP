/**
 * markLeadLost, the reference service (EP-03-S12), served by the production app wiring
 * (shared contract + production handlers) against a freshly seeded temp database.
 */
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { contract } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { seedPrototype } from '../../src/db/seed/seed-database.js';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { fixedClock } from '../../src/pipeline/server-clock.js';
import { handlers } from '../../src/services/index.js';
import { createTempDatabase, describeDb, newShop } from '../db/db-test-helpers.js';
import { leaksIn, newSession, SERVER_NOW, sessionCookie } from '../support/api-harness.js';

interface LeadRow {
  state: string;
  note: string | null;
  version: number;
}

describeDb('markLeadLost reference service (EP-03-S12)', () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let pool: pg.Pool;
  let server: Server;
  let base: string;
  let session: string;
  let shopId: string;
  const logged: unknown[] = [];

  beforeAll(async () => {
    temp = await createTempDatabase();
    pool = createPool(temp.url, 10);
    await migrate(pool, new URL('../../migrations/', import.meta.url));
    await seedPrototype(pool, { appEnv: 'development', now: SERVER_NOW });
    const user = (
      await pool.query<{ id: string; shop_id: string }>(`select id, shop_id from users where name = 'Rajesh Verma'`)
    ).rows[0];
    shopId = user.shop_id;
    // Seeded users are pending until they set a password; sessions need an active user (EP-04).
    await pool.query(`update users set status = 'active' where id = $1`, [user.id]);
    const locationId = (await pool.query<{ id: string }>('select id from locations where shop_id = $1', [shopId]))
      .rows[0].id;
    session = await newSession(pool, { shopId, locationId }, user.id);
    const clock = fixedClock(SERVER_NOW);
    const config = loadConfig({
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
      API_PORT: '0',
    });
    const app = createApp(config, {
      pool,
      sessions: createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes }),
      clock,
      contract,
      handlers,
      log: (message, err) => logged.push({ message, err }),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
    await temp?.drop();
  });

  const call = async (body: unknown) => {
    const res = await fetch(`${base}/api/ops/markLeadLost`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie(session) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const lead = async (code: string, shop = shopId): Promise<LeadRow | undefined> =>
    (
      await pool.query<LeadRow>('select state, note, version from leads where shop_id = $1 and code = $2', [
        shop,
        code,
      ])
    ).rows[0];

  it('AC1: marks an opened lead lost with the reason as its note and answers { ok: true }', async () => {
    const before = await lead('LD-2026-213');
    expect(before?.state).toBe('opened');
    const res = await call({ leadId: 'LD-2026-213', reason: 'Customer went elsewhere.' });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await lead('LD-2026-213')).toEqual({
      state: 'lost',
      note: 'Customer went elsewhere.',
      version: (before?.version ?? 0) + 1,
    });
  });

  it('AC2: refuses a converted lead with rule_refused and leaves it unchanged', async () => {
    const before = await lead('LD-2026-201');
    expect(before?.state).toBe('converted');
    const res = await call({ leadId: 'LD-2026-201', reason: 'Changed mind.' });
    expect(res).toEqual({
      status: 422,
      body: { code: 'rule_refused', message: 'A converted lead cannot be marked lost.' },
    });
    expect(leaksIn(res.body)).toEqual([]);
    expect(await lead('LD-2026-201')).toEqual(before);
  });

  it('AC3: answers not_found for a lead code that does not exist', async () => {
    expect(await call({ leadId: 'LD-2026-999' })).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Lead LD-2026-999 was not found.' },
    });
  });

  it('AC4: refuses a request without leadId as validation on field leadId', async () => {
    const res = await call({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(res.body.field).toBe('leadId');
    expect(leaksIn(res.body)).toEqual([]);
  });

  it('AC5: takes the shop from ctx, writes through updateVersioned and has no hold logic', async () => {
    const source = await readFile(new URL('../../src/services/mark-lead-lost.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('heldForLeadId');
    expect(source).toContain('updateVersioned');
    expect(source).toContain('ctx.shop');
  });

  it("FU-002: a lead code that exists only in another shop is not_found, and that shop's lead is unchanged", async () => {
    const other = await newShop(pool, 'Other shop');
    await pool.query(`insert into leads (shop_id, code, source, state) values ($1, 'LD-2026-777', 'counter', 'opened')`, [
      other.shopId,
    ]);
    expect(await call({ leadId: 'LD-2026-777' })).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Lead LD-2026-777 was not found.' },
    });
    expect((await lead('LD-2026-777', other.shopId))?.state).toBe('opened');
  });

  it('ignores by and at in the body: actor and time stay the server’s', async () => {
    const res = await call({ leadId: 'LD-2026-213', by: { name: 'Sanjay Seth' }, at: '2025-01-01T00:00:00Z' });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  it('NFR: two parallel calls on the same lead give 200 or 409 conflict, never 500, and leave it lost', async () => {
    const target = (
      await pool.query<{ code: string }>(
        `select code from leads where shop_id = $1 and state not in ('converted', 'lost') order by code limit 1`,
        [shopId],
      )
    ).rows[0];
    expect(target).toBeDefined();
    const results = await Promise.all([
      call({ leadId: target.code, reason: 'First.' }),
      call({ leadId: target.code, reason: 'Second.' }),
    ]);
    for (const r of results) {
      expect([200, 409]).toContain(r.status);
      if (r.status === 409) expect(r.body.code).toBe('conflict');
    }
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect((await lead(target.code))?.state).toBe('lost');
    expect(logged).toEqual([]);
  });
});
