/**
 * EP-07-S12: two signed-in clients receive each other's events, the M1 demo proven on every run.
 * Each "browser" is the shared LiveClient (the same code the web app runs) on a Node
 * Server-Sent Events stream, signed in through the real POST /api/auth/signIn, against the real
 * app on port 0. No browser stack is used: every criterion is observable at the protocol level.
 * Test events go through the dev stub POST /api/dev/live/emit, which records them in the outbox
 * like a service function (EP-07-S1). Each test title names its criterion, so a failure names it (AC5).
 */
import {
  createLiveClient,
  createLiveEntityCache,
  type LiveClient,
  type LiveEnvelope,
  type LivePresenceOther,
  type LiveTimers,
} from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { sessionCookie, tokenFrom } from '../support/api-harness.js';
import { addJob, addParcel, karigarOf, type LiveHarness, sleep, startLiveHarness } from './live-test-helpers.js';
import { type NodeLiveStream, nodeLiveStream } from './node-live-stream.js';

const PASSWORD = 'counter-2026!';
const TAG = 'TAG-8841';
const PARCEL = 'BATCH-2026-044';

const timers: LiveTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

interface Browser {
  name: string;
  userId: string;
  token: string;
  stream: NodeLiveStream;
  client: LiveClient;
  events: LiveEnvelope[];
  presence: Map<string, string[]>;
}

/** Poll until `check` holds; returns the time it took. */
async function until(check: () => boolean | Promise<boolean>, ms: number, what: string): Promise<number> {
  const t0 = Date.now();
  while (!(await check())) {
    if (Date.now() - t0 > ms) throw new Error(`${what} did not happen within ${ms} ms`);
    await sleep(5);
  }
  return Date.now() - t0;
}

describeDb('EP-07-S12 two browsers receive each other\'s events', () => {
  let h: LiveHarness;
  const browsers: Browser[] = [];
  let rajesh: Browser;
  let deepak: Browser;
  let sanjay: Browser;
  let lakshmi: Browser;
  let mahesh: Browser;

  /** A real sign-in over HTTP; the session token comes from the Set-Cookie header. */
  async function signIn(userId: string): Promise<string> {
    const { rows } = await h.pool.query<{ phone: string }>('select phone from users where id = $1', [userId]);
    const res = await fetch(`${h.base}/api/auth/signIn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: rows[0].phone, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const token = tokenFrom(res.headers.get('set-cookie'));
    if (!token) throw new Error('signIn set no session cookie');
    return token;
  }

  async function browser(name: string, role: 'owner' | 'staff' | 'karigar', karigarId?: string): Promise<Browser> {
    const user = await h.user(name, role, { password: PASSWORD, karigarId });
    const token = await signIn(user.id);
    const stream = nodeLiveStream({ base: h.base, cookie: sessionCookie(token) });
    const client = createLiveClient({
      source: stream.source,
      timers,
      ops: {
        call: async (op, input) => {
          const res = await h.call(op, input, token);
          if (res.status !== 200) return { ok: false };
          const others = res.body.others as LivePresenceOther[] | undefined;
          return others ? { ok: true, others } : { ok: true };
        },
      },
      checkSession: async () => {
        if (stream.isCut()) throw new Error('network is cut');
        const res = await fetch(`${h.base}/api/auth/readCurrentSession`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: sessionCookie(token) },
          body: '{}',
        });
        await res.body?.cancel();
        return res.status === 200;
      },
      backoff: { initialMs: 50, factor: 2, maxMs: 400 },
      presenceHeartbeatMs: 100,
    });
    const b: Browser = { name, userId: user.id, token, stream, client, events: [], presence: new Map() };
    client.onEvent((e) => b.events.push(e));
    client.onPresence((parcelId: string, others: LivePresenceOther[]) => b.presence.set(parcelId, others.map((o) => o.name)));
    client.start();
    browsers.push(b);
    await until(() => client.status() === 'open', 2_000, `${name}'s connection`);
    return b;
  }

  const devEmit = async (by: Browser, event: string, entityId: string) => {
    const res = await h.devEmit({ event, entityId }, by.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
  };
  const stockBadge = async (b: Browser) => {
    const res = await h.call('readRailBadges', {}, b.token);
    expect(res.status).toBe(200);
    return (res.body.badges as { stock: number }).stock;
  };

  beforeAll(async () => {
    h = await startLiveHarness();
    rajesh = await browser('Rajesh Verma', 'staff');
    deepak = await browser('Deepak Rao', 'staff');
    sanjay = await browser('Sanjay Seth', 'owner');
    lakshmi = await browser('Lakshmi Devi', 'karigar');
    mahesh = await browser('Mahesh Soni', 'karigar');
    // Seed rows (EP-02-S13 stand-in): TAG-8841 in stock, BATCH-2026-044 from Lakshmi, a job of Mahesh's.
    await addPiece(h.pool, h.shop, TAG);
    for (const tag of ['TAG-8851', 'TAG-8852', 'TAG-8853']) await addPiece(h.pool, h.shop, tag);
    await addParcel(h.pool, h.shop, PARCEL, await karigarOf(h.pool, lakshmi.userId));
    await addJob(h.pool, h.shop, 'JOB-M-01', await karigarOf(h.pool, mahesh.userId));
  });

  afterAll(async () => {
    for (const b of browsers) b.client.stop();
    await h?.close();
  });

  it('S12 AC1: Deepak bills TAG-8841; within 1 second Rajesh gets "Piece billed" and stops showing it as available', async () => {
    // Rajesh's stock screen: the records come from a permission-checked read (readPiece, FU-013).
    const cache = createLiveEntityCache({
      fetchEntity: async (_type, id) => {
        const res = await h.call('readPiece', { tagNo: id }, rajesh.token);
        const piece = (res.body as { piece?: { tagNo: string; version: number; status: string } }).piece;
        return res.status === 200 && piece ? { tagNo: piece.tagNo, version: piece.version, status: piece.status } : null;
      },
    });
    const { rows } = await h.pool.query<{ tag_no: string; version: number; status: string }>(
      `select tag_no, version, status from pieces where shop_id = $1 and status = 'in_stock'`,
      [h.shop.shopId],
    );
    for (const r of rows) cache.put('piece', r.tag_no, { tagNo: r.tag_no, version: r.version, status: r.status });
    const available = () =>
      cache
        .values('piece')
        .filter((p) => p.status === 'in_stock')
        .map((p) => p.tagNo);
    const off = rajesh.client.onEvent((e) => void cache.apply(e));
    expect(available()).toContain(TAG);
    const stockBefore = await stockBadge(rajesh);

    // Deepak bills the piece (SQL stands in for EP-26's billing) and his browser triggers the test event.
    await h.pool.query(`update pieces set status = 'billed' where shop_id = $1 and tag_no = $2`, [h.shop.shopId, TAG]);
    const t0 = Date.now();
    await devEmit(deepak, 'piece.billed', TAG);
    await until(() => !available().includes(TAG), 1_000, 'TAG-8841 leaving Rajesh\'s available list');
    expect(Date.now() - t0).toBeLessThan(1_000);
    off();

    expect(rajesh.events.filter((e) => e.entityId === TAG).map((e) => e.name)).toEqual(['Piece billed by one staff member']);
    expect(await stockBadge(rajesh)).toBe(stockBefore - 1);
    // The billing user gets his result from the API answer, not the event.
    await sleep(100);
    expect(deepak.events.filter((e) => e.entityId === TAG)).toEqual([]);
  });

  it('S12 AC2: Rajesh is cut off while 3 events are published; after reconnect he has all 3, in order, once', async () => {
    // Scaled down from the story's 30 seconds to 600 ms so the suite stays fast; the client's
    // backoff (capped here at 400 ms) keeps retrying through the cut either way.
    const seqBefore = rajesh.client.lastSeq();
    const before = rajesh.events.length;
    rajesh.stream.cutOff(600);
    await until(() => rajesh.client.status() === 'reconnecting', 1_000, 'Rajesh noticing the cut');
    for (const tag of ['TAG-8851', 'TAG-8852', 'TAG-8853']) await devEmit(deepak, 'piece.billed', tag);
    await until(() => rajesh.events.length >= before + 3, 3_000, 'catch-up of the 3 events');
    await sleep(200);
    const caught = rajesh.events.slice(before);
    expect(caught.map((e) => e.entityId)).toEqual(['TAG-8851', 'TAG-8852', 'TAG-8853']);
    const seqs = caught.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(3);
    // The resume asked for what came after the last event he had, as EventSource's Last-Event-ID does.
    expect(rajesh.stream.opens.at(-1)).toBe(seqBefore);
    expect(rajesh.client.status()).toBe('open');
  });

  it('S12 AC3: both on parcel-tag for BATCH-2026-044 see each other\'s name', async () => {
    rajesh.client.joinPresence(PARCEL);
    deepak.client.joinPresence(PARCEL);
    await until(() => JSON.stringify(rajesh.presence.get(PARCEL)) === '["Deepak Rao"]', 1_000, 'Rajesh seeing Deepak');
    await until(() => JSON.stringify(deepak.presence.get(PARCEL)) === '["Rajesh Verma"]', 1_000, 'Deepak seeing Rajesh');
    // Heartbeats keep both on the list past the server's presence timeout (300 ms in the harness).
    await sleep(500);
    expect(rajesh.presence.get(PARCEL)).toEqual(['Deepak Rao']);
    deepak.client.leavePresence(PARCEL);
    await until(() => JSON.stringify(rajesh.presence.get(PARCEL)) === '[]', 1_000, 'Deepak leaving the list');
    rajesh.client.leavePresence(PARCEL);
  });

  it('S12 AC4: Lakshmi gets nothing for Mahesh\'s job; deactivating Deepak closes his connection within about 1 second', async () => {
    const lakshmiBefore = lakshmi.events.length;
    await devEmit(rajesh, 'karigar_job.status_changed', 'JOB-M-01');
    await until(() => mahesh.events.some((e) => e.entityId === 'JOB-M-01'), 1_000, 'Mahesh receiving his job event');
    await until(() => sanjay.events.some((e) => e.entityId === 'JOB-M-01'), 1_000, 'the owner receiving the job event');
    await sleep(200);
    expect(lakshmi.events.slice(lakshmiBefore)).toEqual([]);

    const { rows } = await h.pool.query<{ version: number }>('select version from users where id = $1', [deepak.userId]);
    const res = await h.call('deactivateUser', { userId: deepak.userId, version: rows[0].version }, sanjay.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const t0 = Date.now();
    await until(() => !h.live.connections().some((c) => c.userId === deepak.userId), 1_000, 'Deepak\'s connection closing');
    await until(() => deepak.client.status() === 'signed_out', 1_000, 'Deepak\'s browser going to sign-in');
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(deepak.events.at(-1)?.name).toBe('User deactivated or role changed');
    // Rajesh's connection is untouched.
    expect(rajesh.client.status()).toBe('open');
  });
});
