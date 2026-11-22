/**
 * EP-07-S12 rule: the test-event stub. It needs a real session and the entity's read permission,
 * emits through the outbox like a service function, and does not exist in production.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

describeDb('EP-07-S12 dev test-event stub', () => {
  let h: LiveHarness;
  let rajesh: { id: string; token: string };
  let deepak: { id: string; token: string };
  let r: LiveTestClient;
  let d: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    await addPiece(h.pool, h.shop, 'TAG-8841');
    rajesh = await h.user('Rajesh Verma');
    deepak = await h.user('Deepak Rao');
    r = await h.connect(rajesh.token);
    d = await h.connect(deepak.token);
  });
  afterAll(async () => {
    await h?.close();
  });

  it('a staff emit of "Piece billed" for TAG-8841 is delivered to the other staff, not the actor', async () => {
    expect(await h.devEmit({ event: 'piece.billed', entityId: 'TAG-8841' }, deepak.token)).toEqual({
      status: 200,
      body: { ok: true },
    });
    const got = await r.waitFor((m) => m.type === 'event' && m.event.entityId === 'TAG-8841');
    expect(got).toMatchObject({ event: { name: 'Piece billed by one staff member', entityType: 'piece', entityVersion: 1 } });
    await sleep(100);
    expect(d.events()).toEqual([]);
  });

  it('a karigar is refused 403; no session 401; an unknown record 404; a bad body 400', async () => {
    const lakshmi = await h.user('Lakshmi Devi', 'karigar');
    const k = await h.devEmit({ event: 'piece.billed', entityId: 'TAG-8841' }, lakshmi.token);
    expect([k.status, k.body.code]).toEqual([403, 'forbidden']);
    const none = await h.devEmit({ event: 'piece.billed', entityId: 'TAG-8841' });
    expect([none.status, none.body.code]).toEqual([401, 'unauthenticated']);
    const unknown = await h.devEmit({ event: 'piece.billed', entityId: 'TAG-0000' }, deepak.token);
    expect([unknown.status, unknown.body.code]).toEqual([404, 'not_found']);
    const bad = await h.devEmit({ event: 'user.access_changed', entityId: rajesh.id }, deepak.token);
    expect([bad.status, bad.body.code]).toEqual([400, 'validation']);
  });
});

describe('EP-07-S12 stub in production', () => {
  describeDb('APP_ENV=production', () => {
    let h: LiveHarness;
    beforeAll(async () => {
      h = await startLiveHarness({ appEnv: 'production' });
    });
    afterAll(async () => {
      await h?.close();
    });

    it('answers not_found: the stub does not exist in production', async () => {
      const rajesh = await h.user('Rajesh Verma');
      const res = await h.devEmit({ event: 'piece.billed', entityId: 'TAG-8841' }, rajesh.token);
      expect([res.status, res.body.code]).toEqual([404, 'not_found']);
    });
  });
});
