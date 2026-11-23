/**
 * EP-07-S8: who else has a parcel open. Presence arrives on the stream as `presence` messages;
 * the browser joins, heartbeats and leaves through ordinary API calls (Server-Sent Events, D3).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { addParcel, type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

const P44 = 'BATCH-2026-044';
const P45 = 'BATCH-2026-045';
type Person = { id: string; token: string };

describeDb('EP-07-S8 parcel presence', () => {
  let h: LiveHarness;
  let rajesh: Person;
  let deepak: Person;
  let r: LiveTestClient;
  let rajeshBeat: ReturnType<typeof setInterval>;
  beforeAll(async () => {
    h = await startLiveHarness();
    const kg = await addKarigar(h.pool, h.shop, 'KG-PR');
    await addParcel(h.pool, h.shop, P44, kg);
    await addParcel(h.pool, h.shop, P45, kg);
    rajesh = await h.user('Rajesh Verma');
    deepak = await h.user('Deepak Rao');
    r = await h.connect(rajesh.token);
    expect((await join(rajesh, r, P44)).body).toEqual({ ok: true, others: [] });
    // Rajesh keeps his own entry alive throughout, as his open screen would.
    rajeshBeat = setInterval(() => void join(rajesh, r, P44), 100);
  });
  afterAll(async () => {
    clearInterval(rajeshBeat);
    await h?.close();
  });

  const join = (p: Person, c: LiveTestClient, parcelId: string) =>
    h.call('joinParcelPresence', { connectionId: c.hello?.connectionId, parcelId }, p.token);
  const leave = (p: Person, c: LiveTestClient, parcelId: string) =>
    h.call('leaveParcelPresence', { connectionId: c.hello?.connectionId, parcelId }, p.token);
  /** The latest presence list a stream holds for a parcel, as names. */
  const names = (c: LiveTestClient, parcelId: string) => {
    const last = c.messages.filter((m) => m.type === 'presence' && m.parcelId === parcelId).at(-1);
    return last?.type === 'presence' ? last.others.map((o) => o.name) : null;
  };
  const untilNames = async (c: LiveTestClient, parcelId: string, want: string[], ms: number) => {
    const t0 = Date.now();
    while (JSON.stringify(names(c, parcelId)) !== JSON.stringify(want)) {
      if (Date.now() - t0 > ms) throw new Error(`presence ${JSON.stringify(names(c, parcelId))} is not ${JSON.stringify(want)}`);
      await sleep(10);
    }
    return Date.now() - t0;
  };

  it('S8 AC1: Rajesh sees "Deepak Rao" and Deepak sees "Rajesh Verma" on BATCH-2026-044', async () => {
    const d = await h.connect(deepak.token);
    const res = await join(deepak, d, P44);
    expect(res.body).toEqual({ ok: true, others: [{ userId: rajesh.id, name: 'Rajesh Verma' }] });
    await untilNames(r, P44, ['Deepak Rao'], 1_000);
    await untilNames(d, P44, ['Rajesh Verma'], 1_000);
    d.close();
    await untilNames(r, P44, [], 1_000);
  });

  it('S8 AC2: when his heartbeats stop, Deepak disappears within the timeout plus about 1 second', async () => {
    const d = await h.connect(deepak.token);
    await join(deepak, d, P44);
    await untilNames(r, P44, ['Deepak Rao'], 1_000);
    const lastBeat = Date.now();
    // The stream stays open; only the heartbeat calls stop.
    await untilNames(r, P44, [], 300 + 1_000);
    expect(Date.now() - lastBeat).toBeLessThan(300 + 1_000);
    expect(d.isEnded()).toBe(false);
    d.close();
  });

  it('S8 AC3: navigating to another parcel removes him from BATCH-2026-044 within about 1 second', async () => {
    const d = await h.connect(deepak.token);
    await join(deepak, d, P44);
    await untilNames(r, P44, ['Deepak Rao'], 1_000);
    expect((await leave(deepak, d, P44)).body).toEqual({ ok: true });
    await join(deepak, d, P45);
    expect(await untilNames(r, P44, [], 1_000)).toBeLessThan(1_000);
    d.close();
  });

  it('S8 AC4: Lakshmi (Karigar) joining presence on BATCH-2026-044 is refused as forbidden', async () => {
    const lakshmi = await h.user('Lakshmi Devi', 'karigar');
    const k = await h.connect(lakshmi.token);
    const res = await join(lakshmi, k, P44);
    expect([res.status, res.body.code]).toEqual([403, 'forbidden']);
    k.close();
  });

  it('S8 AC5: a user never sees their own name, not even from a second tab', async () => {
    const tab2 = await h.connect(rajesh.token);
    const res = await join(rajesh, tab2, P44);
    expect(res.body).toEqual({ ok: true, others: [] });
    const d = await h.connect(deepak.token);
    await join(deepak, d, P44);
    await untilNames(tab2, P44, ['Deepak Rao'], 1_000);
    await untilNames(d, P44, ['Rajesh Verma'], 1_000);
    for (const c of [r, tab2]) {
      for (const m of c.messages) if (m.type === 'presence') expect(m.others.map((o) => o.userId)).not.toContain(rajesh.id);
    }
    tab2.close();
    d.close();
  });

  it("S8 second tab: Deepak's second tab on BATCH-2026-044 gets Rajesh in its join answer", async () => {
    const d1 = await h.connect(deepak.token);
    expect((await join(deepak, d1, P44)).body).toEqual({ ok: true, others: [{ userId: rajesh.id, name: 'Rajesh Verma' }] });
    const d2 = await h.connect(deepak.token);
    expect((await join(deepak, d2, P44)).body).toEqual({ ok: true, others: [{ userId: rajesh.id, name: 'Rajesh Verma' }] });
    await untilNames(r, P44, ['Deepak Rao'], 1_000);
    d1.close();
    d2.close();
    await untilNames(r, P44, [], 1_000);
  });
  it('S8 rule: presence of an unknown parcel is not_found; the name comes from the server', async () => {
    const res = await join(rajesh, r, 'BATCH-2026-999');
    expect([res.status, res.body.code]).toEqual([404, 'not_found']);
  });
});
