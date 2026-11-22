/**
 * EP-07-S4: user and role channels from the session; entity channels joined and left through the
 * live operations after the EP-05 read check.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { addParcel, type LiveHarness, type LiveTestClient, startLiveHarness } from './live-test-helpers.js';

const PARCEL = 'BATCH-2026-044';
const CHANNEL = `parcel:${PARCEL}`;

describeDb('EP-07-S4 user, role and entity channels', () => {
  let h: LiveHarness;
  let rajesh: { id: string; token: string };
  let deepak: { id: string; token: string };
  let r: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    await addParcel(h.pool, h.shop, PARCEL, await addKarigar(h.pool, h.shop, 'KG-CH'));
    rajesh = await h.user('Rajesh Verma');
    deepak = await h.user('Deepak Rao');
    r = await h.connect(rajesh.token);
  });
  afterAll(async () => {
    await h?.close();
  });

  const conn = (c: LiveTestClient) => h.live.connections().find((x) => x.id === c.hello?.connectionId);
  const tagSaved = (tagNo: string) => h.emit('tag.saved', { entityId: tagNo, entityVersion: 1, actorUserId: deepak.id, parcelId: PARCEL });
  const hasEvent = (c: LiveTestClient, entityId: string) => c.events().some((e) => e.entityId === entityId);

  it('S4 AC1: Rajesh (Staff) joins user:<his id> and role:staff and no other channel', () => {
    expect(r.hello?.channels).toEqual([`user:${rajesh.id}`, 'role:staff']);
    expect(conn(r)?.channels).toEqual([`user:${rajesh.id}`, 'role:staff']);
  });

  it('S4 AC2: Sanjay (Owner) joins user:<his id> and role:owner', async () => {
    const sanjay = await h.user('Sanjay Seth', 'owner');
    const s = await h.connect(sanjay.token);
    expect(s.hello?.channels).toEqual([`user:${sanjay.id}`, 'role:owner']);
    s.close();
  });

  it('S4 AC3: subscribing to parcel:BATCH-2026-044 adds the channel after the read check', async () => {
    const res = await h.call('subscribeLiveChannel', { connectionId: r.hello?.connectionId, channel: CHANNEL }, rajesh.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(conn(r)?.channels).toContain(CHANNEL);
    await tagSaved('TAG-0001');
    await r.waitFor((m) => m.type === 'event' && m.event.entityId === 'TAG-0001');
  });

  it('S4 AC3 rule: an unknown parcel is not_found; another user\'s connection is not_found', async () => {
    const unknown = await h.call(
      'subscribeLiveChannel',
      { connectionId: r.hello?.connectionId, channel: 'parcel:BATCH-2026-999' },
      rajesh.token,
    );
    expect([unknown.status, unknown.body.code]).toEqual([404, 'not_found']);
    const foreign = await h.call('subscribeLiveChannel', { connectionId: r.hello?.connectionId, channel: CHANNEL }, deepak.token);
    expect([foreign.status, foreign.body.code]).toEqual([404, 'not_found']);
  });

  it('S4 AC4: after unsubscribing he gets no more BATCH-2026-044 events; his role channel still carries its own', async () => {
    const res = await h.call('unsubscribeLiveChannel', { connectionId: r.hello?.connectionId, channel: CHANNEL }, rajesh.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(conn(r)?.channels).not.toContain(CHANNEL);
    await tagSaved('TAG-0002');
    await h.emit('lead.alert', { entityId: 'LD-2026-301', entityVersion: 1 });
    await r.waitFor((m) => m.type === 'event' && m.event.entityId === 'LD-2026-301');
    expect(hasEvent(r, 'TAG-0002')).toBe(false);
  });

  it('S4 AC5: asking for role:owner as Staff is refused as forbidden and the stream keeps its own channels', async () => {
    for (const channel of ['role:owner', `user:${deepak.id}`]) {
      const res = await h.call('subscribeLiveChannel', { connectionId: r.hello?.connectionId, channel }, rajesh.token);
      expect([res.status, res.body.code]).toEqual([403, 'forbidden']);
    }
    const unknownKind = await h.call('subscribeLiveChannel', { connectionId: r.hello?.connectionId, channel: 'piece:TAG-8841' }, rajesh.token);
    expect([unknownKind.status, unknownKind.body.code, unknownKind.body.field]).toEqual([400, 'validation', 'channel']);
    const dropOwn = await h.call('unsubscribeLiveChannel', { connectionId: r.hello?.connectionId, channel: 'role:staff' }, rajesh.token);
    expect([dropOwn.status, dropOwn.body.code]).toEqual([403, 'forbidden']);
    expect(conn(r)?.channels).toEqual([`user:${rajesh.id}`, 'role:staff']);
  });

  it('S4 rule: a karigar may not join entity channels (S6: user channel only)', async () => {
    const lakshmi = await h.user('Lakshmi Devi', 'karigar');
    const k = await h.connect(lakshmi.token);
    const res = await h.call('subscribeLiveChannel', { connectionId: k.hello?.connectionId, channel: CHANNEL }, lakshmi.token);
    expect([res.status, res.body.code]).toEqual([403, 'forbidden']);
    k.close();
  });
});
