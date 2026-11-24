/**
 * EP-07-S10: deactivating a user or changing their role (EP-05, over the real API) delivers
 * "User deactivated or role changed" to that user's streams only, then the server closes them.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { newSession } from '../support/api-harness.js';
import { addParcel, type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

const NAME = 'User deactivated or role changed';
const P44 = 'BATCH-2026-044';
type Person = { id: string; token: string };

describeDb('EP-07-S10 closing a user\'s streams on deactivate or re-role', () => {
  let h: LiveHarness;
  let sanjay: Person;
  let rajesh: Person;
  let s: LiveTestClient;
  let r: LiveTestClient;
  let vijayTokens: string[] = [];
  beforeAll(async () => {
    h = await startLiveHarness();
    await addParcel(h.pool, h.shop, P44, await addKarigar(h.pool, h.shop, 'KG-AC'));
    sanjay = await h.user('Sanjay Seth', 'owner');
    rajesh = await h.user('Rajesh Verma');
    s = await h.connect(sanjay.token);
    r = await h.connect(rajesh.token);
  });
  afterAll(async () => {
    await h?.close();
  });

  const versionOf = async (userId: string) =>
    (await h.pool.query<{ version: number }>('select version from users where id = $1', [userId])).rows[0].version;
  const accessEvent = (c: LiveTestClient, userId: string) =>
    c.events().filter((e) => e.name === NAME && e.entityId === userId);

  it('S10 AC1: Vijay Kumar on two devices: both streams get the event and are closed within about 1 second', async () => {
    const vijay = await h.user('Vijay Kumar');
    const phoneToken = await newSession(h.pool, h.shop, vijay.id);
    vijayTokens = [vijay.token, phoneToken];
    const desk = await h.connect(vijay.token);
    const phone = await h.connect(phoneToken);
    const res = await h.call('deactivateUser', { userId: vijay.id, version: await versionOf(vijay.id) }, sanjay.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const t0 = Date.now();
    await Promise.all([desk.ended, phone.ended]);
    expect(Date.now() - t0).toBeLessThan(1_000);
    for (const c of [desk, phone]) {
      expect(accessEvent(c, vijay.id)).toHaveLength(1);
      expect(c.messages.at(-1)).toEqual({ type: 'closed', reason: 'access_changed' });
    }
    expect(h.live.connections().filter((c) => c.userId === vijay.id)).toEqual([]);
  });

  it('S10 AC3: the deactivated user\'s reconnect is refused as unauthenticated', async () => {
    expect(vijayTokens).toHaveLength(2);
    for (const token of vijayTokens) {
      const c = await h.connect(token, { lastEventId: 1 });
      expect([c.status, c.body]).toEqual([401, { code: 'unauthenticated', message: 'Sign in to continue.' }]);
    }
  });

  it('S10 AC2: Deepak changed from Staff to Karigar: his stream closes, his name leaves presence, he reconnects on his user channel only', async () => {
    const deepak = await h.user('Deepak Rao');
    const d = await h.connect(deepak.token);
    for (const [p, c] of [[rajesh, r], [deepak, d]] as const) {
      await h.call('joinParcelPresence', { connectionId: c.hello?.connectionId, parcelId: P44 }, p.token);
    }
    await r.waitFor((m) => m.type === 'presence' && m.others.some((o) => o.name === 'Deepak Rao'));
    await addKarigar(h.pool, h.shop, 'KG-DR');
    const res = await h.call(
      'updateUserRole',
      { userId: deepak.id, version: await versionOf(deepak.id), role: 'karigar', karigarId: 'KG-DR' },
      sanjay.token,
    );
    expect(res).toEqual({ status: 200, body: { ok: true } });
    await d.ended;
    expect(accessEvent(d, deepak.id)).toHaveLength(1);
    await r.waitFor((m) => m.type === 'presence' && m.parcelId === P44 && m.others.length === 0);
    const old = await h.connect(deepak.token, { lastEventId: d.lastEventId ?? 0 });
    expect(old.status).toBe(401);
    const again = await h.connect(await newSession(h.pool, h.shop, deepak.id));
    expect(again.hello).toMatchObject({ role: 'karigar', channels: [`user:${deepak.id}`] });
    again.close();
  });

  it('S10 AC4: only the affected user\'s streams receive the event', async () => {
    await sleep(100);
    for (const c of [s, r]) expect(c.events().filter((e) => e.name === NAME)).toEqual([]);
    expect(s.isEnded() || r.isEnded()).toBe(false);
  });
});
