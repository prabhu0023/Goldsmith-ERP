/**
 * EP-07-S7: a stream that reconnects with its last sequence number (the browser's Last-Event-ID,
 * or ?since=) gets exactly the events it missed, in order, through the same filter; a gap
 * older than the replay window gets one refetch_all; an expired session is refused.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

const waitEntity = (c: LiveTestClient, id: string) => c.waitFor((m) => m.type === 'event' && m.event.entityId === id);

describeDb('EP-07-S7 reconnect and catch up', () => {
  let h: LiveHarness;
  let rajesh: { id: string; token: string };
  let watcher: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    rajesh = await h.user('Rajesh Verma');
    watcher = await h.connect((await h.user('Deepak Rao')).token);
  });
  afterAll(async () => {
    await h?.close();
  });

  it('S7 AC1: after a drop while 4 events are published to his channels he receives all 4 in order and no others', async () => {
    const first = await h.connect(rajesh.token);
    await h.emit('lead.alert', { entityId: 'LD-2026-700', entityVersion: 1 });
    await waitEntity(first, 'LD-2026-700');
    const last = first.lastEventId as number;
    first.close();
    for (const n of [1, 2, 3, 4]) await h.emit('lead.alert', { entityId: `LD-2026-70${n}`, entityVersion: 1 });
    await h.emit('parcel.stopped', { entityId: 'BATCH-2026-070', entityVersion: 2 }); // owner only
    await waitEntity(watcher, 'LD-2026-704');
    const back = await h.connect(rajesh.token, { lastEventId: last });
    await back.waitFor((m) => m.type === 'replayed');
    await sleep(200);
    const events = back.events();
    expect(events.map((e) => e.entityId)).toEqual(['LD-2026-701', 'LD-2026-702', 'LD-2026-703', 'LD-2026-704']);
    expect(events.map((e) => e.seq)).toEqual([...events.map((e) => e.seq)].sort((a, b) => a - b));
    expect(back.hello?.seq).toBe(last);
    back.close();
  });

  it('S7 AC3: the event he already had (his last id) is not sent again; resume also works with ?since=', async () => {
    const c = await h.connect(rajesh.token);
    await h.emit('lead.alert', { entityId: 'LD-2026-710', entityVersion: 1 });
    const had = await waitEntity(c, 'LD-2026-710');
    const seq = had.type === 'event' ? had.event.seq : -1;
    c.close();
    await h.emit('lead.alert', { entityId: 'LD-2026-711', entityVersion: 1 });
    await waitEntity(watcher, 'LD-2026-711');
    const back = await h.connect(rajesh.token, { since: seq });
    await back.waitFor((m) => m.type === 'replayed');
    expect(back.events().map((e) => e.entityId)).toEqual(['LD-2026-711']);
    back.close();
  });

  it('S7 rule: events published while the stream replays follow once, in order', async () => {
    const c = await h.connect(rajesh.token);
    const from = c.hello?.seq as number;
    c.close();
    await h.emit('lead.alert', { entityId: 'LD-2026-720', entityVersion: 1 });
    const back = await h.connect(rajesh.token, { lastEventId: from });
    await h.emit('lead.alert', { entityId: 'LD-2026-721', entityVersion: 1 });
    await waitEntity(back, 'LD-2026-721');
    await sleep(200);
    expect(back.events().map((e) => e.entityId)).toEqual(['LD-2026-720', 'LD-2026-721']);
    back.close();
  });

  it('S7 AC2: a last sequence number older than the replay window gets one refetch_all and no events', async () => {
    const c = await h.connect(rajesh.token);
    const old = c.hello?.seq as number;
    c.close();
    await h.emit('lead.alert', { entityId: 'LD-2026-730', entityVersion: 1, payload: { leadId: 'LD-2026-730' } });
    await waitEntity(watcher, 'LD-2026-730');
    h.clock.advance(6 * 60_000); // past the 5-minute test window
    expect(await h.live.prune()).toBeGreaterThan(0);
    // Pruning takes the row out of replay only: the outbox row and its payload stay for other consumers.
    const kept = await h.pool.query(
      `select topic, payload, live_seq, entity_type, published_at is not null as published
         from outbox_events where shop_id = $1 and payload->>'leadId' = 'LD-2026-730'`,
      [h.shop.shopId],
    );
    expect(kept.rows).toEqual([
      { topic: 'lead.alert', payload: { leadId: 'LD-2026-730' }, live_seq: null, entity_type: null, published: true },
    ]);
    expect(await h.live.prune()).toBe(0);
    const back = await h.connect(rajesh.token, { lastEventId: old });
    await back.waitFor((m) => m.type === 'refetch_all');
    await sleep(100);
    expect(back.messages.filter((m) => m.type === 'refetch_all')).toHaveLength(1);
    expect(back.events()).toEqual([]);
    const ahead = await h.connect(rajesh.token, { lastEventId: 999_999 });
    await ahead.waitFor((m) => m.type === 'refetch_all');
    back.close();
    ahead.close();
  });

  it('S7 AC5: a session that expired during the drop is refused as unauthenticated; an open stream is closed', async () => {
    const open = await h.connect(rajesh.token);
    const dropped = await h.connect(rajesh.token);
    const last = dropped.lastEventId as number;
    dropped.close();
    h.clock.set(new Date(SERVER_NOW.getTime() + 13 * 3600_000));
    await open.ended;
    expect(open.messages.at(-1)).toEqual({ type: 'closed', reason: 'session_ended' });
    const resume = await h.connect(rajesh.token, { lastEventId: last });
    expect([resume.status, resume.body]).toEqual([401, { code: 'unauthenticated', message: 'Sign in to continue.' }]);
  });
});
