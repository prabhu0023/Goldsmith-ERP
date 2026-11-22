/**
 * Server-side refusal (EP-05-S2 AC1-AC4): owner-only prototype operations, served by a local
 * test contract behind the production permission check, refuse a staff session before the
 * service function runs, let the owner through, and deny an operation the list does not name.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_REFUSAL, defineOperation, ERROR_CODES, okResult, ROLE_IDS } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { StubMailer } from '../../src/auth/account-mail.js';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { loadConfig } from '../../src/config.js';
import { insertScoped } from '../../src/db/shop-context.js';
import { updateVersioned } from '../../src/db/versioned.js';
import type { Handler, HandlerMap } from '../../src/pipeline/registry.js';
import { fixedClock } from '../../src/pipeline/server-clock.js';
import { addKarigar, describeDb, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW, sessionCookie, testPasswords } from '../support/api-harness.js';

const parcelOp = <N extends string>(name: N) =>
  defineOperation({
    name,
    kind: 'command',
    input: z.object({ parcelId: z.string().trim().min(1) }),
    result: okResult,
    errors: ERROR_CODES,
  });

const localContract = {
  clearMismatch: parcelOp('clearMismatch'),
  applyEdit: parcelOp('applyEdit'),
  ownerScrap: parcelOp('ownerScrap'),
  unlistedOperation: parcelOp('unlistedOperation'),
} as const;

describeDb('the server refuses what the role does not allow (EP-05-S2 AC1-AC4)', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  let server: Server;
  let base: string;
  const ran: string[] = [];
  const sessions: Partial<Record<(typeof ROLE_IDS)[number], string>> = {};

  /** Every handler bumps the parcel's version by changing its PO reference. */
  const touchParcel =
    (op: string): Handler<ReturnType<typeof parcelOp>> =>
    async (tx, ctx, input) => {
      ran.push(op);
      const { rows } = await tx.client.query<{ id: string; version: number }>(
        'select id, version from parcels where shop_id = $1 and code = $2',
        [ctx.shop.shopId, input.parcelId],
      );
      await updateVersioned(tx.client, ctx.shop, {
        table: 'parcels',
        id: rows[0].id,
        expectedVersion: rows[0].version,
        set: { po_ref: `${op} by ${ctx.by.name}` },
      });
      return { ok: true };
    };

  const call = async (op: string, session: string | undefined) => {
    const res = await fetch(`${base}/api/ops/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie(session ?? '') },
      body: JSON.stringify({ parcelId: 'BATCH-2026-014' }),
    });
    return { status: res.status, body: await res.json() };
  };

  const parcel = async () =>
    (
      await pool.query<{ version: number; po_ref: string | null }>(
        'select version, po_ref from parcels where shop_id = $1 and code = $2',
        [shop.shopId, 'BATCH-2026-014'],
      )
    ).rows[0];

  beforeAll(async () => {
    pool = testPool(5);
    shop = await newShop(pool);
    const karigarId = await addKarigar(pool, shop, 'KG-04');
    await insertScoped(pool, shop, 'parcels', { code: 'BATCH-2026-014', karigar_id: karigarId, po_ref: 'PO-1' });
    sessions.staff = await newSession(pool, shop, await newUser(pool, shop, { name: 'Rajesh Verma', role: 'staff' }));
    sessions.owner = await newSession(pool, shop, await newUser(pool, shop, { name: 'Sanjay Seth', role: 'owner' }));
    sessions.karigar = await newSession(pool, shop, await newUser(pool, shop, { name: 'Lakshmi Devi', role: 'karigar' }));
    const config = loadConfig({
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
      API_PORT: '0',
    });
    const clock = fixedClock(SERVER_NOW);
    const handlers: HandlerMap = Object.fromEntries(Object.keys(localContract).map((op) => [op, touchParcel(op)]));
    const app = createApp(config, {
      pool,
      sessions: createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes }),
      clock,
      contract: localContract,
      handlers,
      log: () => {},
      auth: {
        installationShop: async () => shop.shopId,
        passwords: testPasswords,
        mailer: new StubMailer({ mailboxUrl: 'http://localhost/dev/mailbox', log: () => {} }),
      },
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
  });

  it('AC1: a staff session clearing a mismatch is refused and the parcel is unchanged', async () => {
    const before = await parcel();
    expect(await call('clearMismatch', sessions.staff)).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only the owner can clear a mismatch.' },
    });
    expect(await parcel()).toEqual(before);
    expect(ran).toEqual([]);
  });

  it('AC2: apply-edit and mark-scrap are refused with their sentences and change no row', async () => {
    const before = await parcel();
    expect(await call('applyEdit', sessions.staff)).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only the owner can apply an edit.' },
    });
    expect(await call('ownerScrap', sessions.staff)).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only the owner can mark a piece as scrap.' },
    });
    expect(await parcel()).toEqual(before);
    expect(ran).toEqual([]);
  });

  it('AC3: the owner reaches the service function', async () => {
    const before = await parcel();
    expect(await call('clearMismatch', sessions.owner)).toEqual({ status: 200, body: { ok: true } });
    expect(ran).toEqual(['clearMismatch']);
    expect(await parcel()).toEqual({ version: before.version + 1, po_ref: 'clearMismatch by Sanjay Seth' });
  });

  it.each(ROLE_IDS)('AC4: an operation with no list entry is refused for %s', async (role) => {
    const before = await parcel();
    expect(await call('unlistedOperation', sessions[role])).toEqual({
      status: 403,
      body: { code: 'forbidden', message: DEFAULT_REFUSAL },
    });
    expect(await parcel()).toEqual(before);
    expect(ran).not.toContain('unlistedOperation');
  });
});
