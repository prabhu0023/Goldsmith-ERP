/**
 * The publish path (EP-07-S1, S2, S11 AC3): an event is recorded in the operation's transaction
 * and stamped with its sequence number only after that transaction commits.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { contract, type RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { loadConfig } from '../../src/config.js';
import { emitLiveEvent } from '../../src/live/emit-live-event.js';
import { onLiveCommit } from '../../src/live/live-wakeup.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import type { Handler, OperationCtx } from '../../src/pipeline/registry.js';
import { fixedClock } from '../../src/pipeline/server-clock.js';
import { markLeadLost } from '../../src/services/mark-lead-lost.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW, sessionCookie } from '../support/api-harness.js';
import {
  addLiveLead,
  addPieceAtVersion,
  inTransaction,
  liveOutboxRows,
  newLiveShop,
  rowSink,
  shopPublisher,
  stampAll,
} from './live-test-helpers.js';

const leadVersion = async (tx: Tx, shop: TestShop, code: string): Promise<number> =>
  (await tx.client.query<{ version: number }>('select version from leads where shop_id = $1 and code = $2', [shop.shopId, code]))
    .rows[0].version;

/** The reference markLeadLost (EP-03-S12) extended to cause a test event after its change. */
const lostThenEvent =
  (shop: TestShop, hooks: { afterEmit?: () => Promise<void> } = {}): Handler<typeof contract.markLeadLost> =>
  async (tx, ctx, input) => {
    const result = await markLeadLost(tx, ctx, input);
    await emitLiveEvent(tx, ctx.shop, 'lead.alert', {
      entityId: input.leadId,
      entityVersion: await leadVersion(tx, shop, input.leadId),
      at: ctx.at,
    });
    await hooks.afterEmit?.();
    return result;
  };

const ctxFor = (shop: TestShop, userId: string, role: RoleId = 'staff'): OperationCtx => ({
  by: { id: userId, name: 'Rajesh Verma', role },
  at: SERVER_NOW,
  shop,
});

describeDb('EP-07 publish path', () => {
  let pool: pg.Pool;
  const unsubscribe: Array<() => void> = [];

  beforeAll(() => {
    pool = testPool(10);
  });
  afterEach(() => {
    for (const off of unsubscribe.splice(0)) off();
  });
  afterAll(async () => {
    await pool.end();
  });

  /** Counts in-process wake-ups (after-commit hooks of emitLiveEvent). */
  const countWakeups = (): { count: number } => {
    const seen = { count: 0 };
    unsubscribe.push(onLiveCommit(() => seen.count++));
    return seen;
  };

  it('S1 AC1: one event after the commit, none before', async () => {
    const shop = await newLiveShop(pool);
    const userId = await newUser(pool, shop, { name: 'Rajesh Verma' });
    await addLiveLead(pool, shop, 'LD-2026-301');
    const sink = rowSink();
    const publisher = shopPublisher(pool, shop, { onRows: sink.onRows });
    const wakeups = countWakeups();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted!: () => void;
    const emitted = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const handler = lostThenEvent(shop, {
      afterEmit: async () => {
        inserted();
        await gate;
      },
    });
    const operation = inTransaction(pool, (tx) => handler(tx, ctxFor(shop, userId), { leadId: 'LD-2026-301' }));
    await emitted;
    // The transaction is still open: its row is invisible, so nothing is stamped or tailed.
    expect(await publisher.stamp()).toEqual([]);
    expect(await publisher.tail(shop.shopId, 0)).toEqual([]);
    expect(wakeups.count).toBe(0);
    release();
    await operation;
    expect(wakeups.count).toBe(1);
    const stamped = await stampAll(publisher);
    expect(stamped.map((r) => [r.topic, r.entityId, r.seq])).toEqual([['lead.alert', 'LD-2026-301', 1]]);
    expect(sink.rows).toEqual(stamped);
    expect(await publisher.tail(shop.shopId, 0)).toHaveLength(1);
    expect(await stampAll(publisher)).toEqual([]);
  });

  it('S1 AC2: forced failure after the insert leaves no row and no event', async () => {
    const shop = await newLiveShop(pool);
    const userId = await newUser(pool, shop, { name: 'Rajesh Verma' });
    await addLiveLead(pool, shop, 'LD-2026-302');
    const wakeups = countWakeups();
    const handler = lostThenEvent(shop, {
      afterEmit: async () => {
        throw new Error('forced failure after the outbox insert');
      },
    });
    await expect(inTransaction(pool, (tx) => handler(tx, ctxFor(shop, userId), { leadId: 'LD-2026-302' }))).rejects.toThrow(
      /forced failure/,
    );
    expect(await liveOutboxRows(pool, shop)).toEqual([]);
    expect(await stampAll(shopPublisher(pool, shop))).toEqual([]);
    expect(wakeups.count).toBe(0);
    const lead = await pool.query<{ state: string }>('select state from leads where shop_id = $1', [shop.shopId]);
    expect(lead.rows).toEqual([{ state: 'needs_glance' }]);
  });

  describe('S1 AC3: refused operations', () => {
    let server: Server;
    let base: string;
    let shop: TestShop;
    let staffSession: string;
    let karigarSession: string;
    /** Set by the version-conflict case: run once right after markLeadLost reads the lead. */
    let afterLeadRead: (() => Promise<void>) | null = null;

    beforeAll(async () => {
      shop = await newLiveShop(pool, 'Live refusal shop');
      staffSession = await newSession(pool, shop, await newUser(pool, shop, { name: 'Rajesh Verma' }));
      karigarSession = await newSession(pool, shop, await newUser(pool, shop, { name: 'Lakshmi Devi', role: 'karigar' }));
      // The event is recorded before the rule runs, so only the rollback keeps it unpublished.
      const eventThenLost: Handler<typeof contract.markLeadLost> = async (tx, ctx, input) => {
        await emitLiveEvent(tx, ctx.shop, 'lead.alert', {
          entityId: input.leadId,
          entityVersion: await leadVersion(tx, shop, input.leadId),
          at: ctx.at,
        });
        const query = tx.client.query.bind(tx.client) as (sql: string, params?: unknown[]) => Promise<unknown>;
        const client = {
          query: async (sql: string, params?: unknown[]) => {
            const result = await query(sql, params);
            if (afterLeadRead && /from leads where shop_id/.test(sql)) {
              const concurrent = afterLeadRead;
              afterLeadRead = null;
              await concurrent();
            }
            return result;
          },
        } as unknown as pg.PoolClient;
        return markLeadLost({ client, afterCommit: tx.afterCommit }, ctx, input);
      };
      const clock = fixedClock(SERVER_NOW);
      const config = loadConfig({
        APP_ENV: 'development',
        APP_URL: 'http://localhost:3000',
        SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
        API_PORT: '0',
      });
      // The production contract and permission check, with the extended markLeadLost.
      const app = createApp(config, {
        pool,
        sessions: createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes }),
        clock,
        contract,
        handlers: { markLeadLost: eventThenLost },
        log: () => {},
      });
      server = app.listen(0);
      await new Promise<void>((resolve) => server.once('listening', resolve));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    const call = async (session: string, leadId: string) => {
      const res = await fetch(`${base}/api/ops/markLeadLost`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: sessionCookie(session) },
        body: JSON.stringify({ leadId }),
      });
      return { status: res.status, body: (await res.json()) as { code?: string } };
    };

    it('S1 AC3: rule refusal, forbidden and version conflict publish nothing', async () => {
      await addLiveLead(pool, shop, 'LD-2026-303', 'converted');
      await addLiveLead(pool, shop, 'LD-2026-304');
      await addLiveLead(pool, shop, 'LD-2026-305');
      const wakeups = countWakeups();

      // A rule: a converted lead cannot be marked lost.
      expect(await call(staffSession, 'LD-2026-303')).toMatchObject({ status: 422, body: { code: 'rule_refused' } });
      // The permission check: a karigar may not mark a lead lost.
      expect(await call(karigarSession, 'LD-2026-304')).toMatchObject({ status: 403, body: { code: 'forbidden' } });
      // A version conflict (EP-02-S14): someone else saves the lead between the read and the write.
      afterLeadRead = async () => {
        await pool.query(`update leads set note = 'changed elsewhere' where shop_id = $1 and code = 'LD-2026-305'`, [
          shop.shopId,
        ]);
      };
      expect(await call(staffSession, 'LD-2026-305')).toMatchObject({ status: 409, body: { code: 'conflict' } });
      expect(afterLeadRead).toBeNull();

      expect(await liveOutboxRows(pool, shop)).toEqual([]);
      expect(await stampAll(shopPublisher(pool, shop))).toEqual([]);
      expect(wakeups.count).toBe(0);
      // The control: the same call on a fresh lead does publish one event.
      await addLiveLead(pool, shop, 'LD-2026-306');
      expect(await call(staffSession, 'LD-2026-306')).toMatchObject({ status: 200 });
      expect((await stampAll(shopPublisher(pool, shop))).map((r) => r.entityId)).toEqual(['LD-2026-306']);
    });
  });

  it('S1 AC4: publisher stopped while 3 commit: published in commit order, once', async () => {
    const shop = await newLiveShop(pool);
    // No publisher runs while three operations commit, one after another.
    for (const code of ['LD-2026-311', 'LD-2026-312', 'LD-2026-313']) {
      await addLiveLead(pool, shop, code);
      await inTransaction(pool, (tx) =>
        emitLiveEvent(tx, shop, 'lead.alert', { entityId: code, entityVersion: 1, at: SERVER_NOW }),
      );
    }
    expect((await liveOutboxRows(pool, shop)).map((r) => r.live_seq)).toEqual([null, null, null]);
    // The publisher starts.
    const first = await stampAll(shopPublisher(pool, shop));
    expect(first.map((r) => [r.entityId, r.seq])).toEqual([
      ['LD-2026-311', 1],
      ['LD-2026-312', 2],
      ['LD-2026-313', 3],
    ]);
    // It restarts: nothing is sent twice, and nothing was lost.
    expect(await stampAll(shopPublisher(pool, shop))).toEqual([]);
    const tailed = await shopPublisher(pool, shop).tail(shop.shopId, 0);
    expect(tailed.map((r) => [r.entityId, r.seq])).toEqual(first.map((r) => [r.entityId, r.seq]));
    expect(tailed.every((r) => r.publishedAt.getTime() === SERVER_NOW.getTime())).toBe(true);
  });

  it('S2 AC1: Edit applied TAG-8841 v7 envelope, seq previous+1', async () => {
    const shop = await newLiveShop(pool);
    const deepak = await newUser(pool, shop, { name: 'Deepak Rao' });
    const publisher = shopPublisher(pool, shop);
    // A previous event on the shop's stream.
    await inTransaction(pool, (tx) =>
      emitLiveEvent(tx, shop, 'metal_pool.changed', { entityId: 'metal-pool', entityVersion: 4, at: SERVER_NOW }),
    );
    const [previous] = await stampAll(publisher);
    // The edit moves TAG-8841 from version 6 to version 7.
    const pieceId = await addPieceAtVersion(pool, shop, 'TAG-8841', 6);
    const appliedAt = new Date('2026-11-21T10:05:00.000Z');
    await inTransaction(pool, async (tx) => {
      const { rows } = await tx.client.query<{ version: number }>(
        'update pieces set gross_units = 486100 where shop_id = $1 and id = $2 returning version',
        [shop.shopId, pieceId],
      );
      await emitLiveEvent(tx, shop, 'edit.applied', {
        entityId: 'TAG-8841',
        entityVersion: rows[0].version,
        at: appliedAt,
        proposerUserId: deepak,
      });
    });
    const [applied] = await stampAll(publisher);
    expect(publisher.toEnvelope(applied)).toEqual({
      seq: previous.seq + 1,
      name: 'Edit applied',
      entityType: 'piece',
      entityId: 'TAG-8841',
      entityVersion: 7,
      emittedAt: '2026-11-21T10:05:00.000Z',
      audience: { channels: [`user:${deepak}`, 'role:staff'] },
    });
    expect(await publisher.streamState(shop.shopId)).toEqual({ lastSeq: previous.seq + 1, prunedThrough: 0 });
  });

  it('S2 AC2: strictly increasing, no duplicates', async () => {
    const shop = await newLiveShop(pool);
    const codes = Array.from({ length: 20 }, (_, i) => `JOB-${String(i + 1).padStart(4, '0')}`);
    for (const code of codes) {
      await inTransaction(pool, (tx) =>
        emitLiveEvent(tx, shop, 'karigar_job.status_changed', {
          entityId: code,
          entityVersion: 2,
          at: SERVER_NOW,
          karigarUserId: null,
        }),
      );
    }
    // Two publishers (two API processes) stamp at once, in small batches.
    const [a, b] = await Promise.all([
      stampAll(shopPublisher(pool, shop, { batchSize: 3 })),
      stampAll(shopPublisher(pool, shop, { batchSize: 3 })),
    ]);
    const stamped = [...a, ...b];
    expect(stamped).toHaveLength(20);
    expect(new Set(stamped.map((r) => r.id)).size).toBe(20);
    expect(new Set(stamped.map((r) => r.seq)).size).toBe(20);
    // Each publisher hands its rows on in increasing order.
    for (const rows of [a, b]) {
      for (let i = 1; i < rows.length; i += 1) expect(rows[i].seq).toBeGreaterThan(rows[i - 1].seq);
    }
    const tailed = await shopPublisher(pool, shop).tail(shop.shopId, 0);
    expect(tailed.map((r) => r.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(tailed.map((r) => r.entityId))).toEqual(new Set(codes));
  });

  it('S11 AC3: unknown name refused at emit; a hand-inserted unknown topic is never published', async () => {
    const shop = await newLiveShop(pool);
    await addLiveLead(pool, shop, 'LD-2026-321');
    const wakeups = countWakeups();
    await expect(
      inTransaction(pool, async (tx) => {
        await tx.client.query(`update leads set note = 'should roll back' where shop_id = $1`, [shop.shopId]);
        // @ts-expect-error 'piece.held' is not in the catalogue (holds were removed from v1).
        await emitLiveEvent(tx, shop, 'piece.held', { entityId: 'TAG-8841', entityVersion: 2, at: SERVER_NOW });
      }),
    ).rejects.toThrow(/piece\.held/);
    expect(await liveOutboxRows(pool, shop)).toEqual([]);
    expect(wakeups.count).toBe(0);
    const lead = await pool.query<{ note: string | null }>('select note from leads where shop_id = $1', [shop.shopId]);
    expect(lead.rows).toEqual([{ note: null }]);

    // A row written around emitLiveEvent with an unknown topic stays unsent.
    await pool.query(
      `insert into outbox_events (shop_id, topic, payload, created_at, entity_type, entity_id, entity_version, audience)
       values ($1, 'piece.held', '{}', $2, 'piece', 'TAG-8841', 2, '{"channels":["role:staff"]}')`,
      [shop.shopId, SERVER_NOW],
    );
    expect(await stampAll(shopPublisher(pool, shop))).toEqual([]);
    expect(await liveOutboxRows(pool, shop)).toEqual([{ topic: 'piece.held', entity_id: 'TAG-8841', live_seq: null }]);
  });
});
