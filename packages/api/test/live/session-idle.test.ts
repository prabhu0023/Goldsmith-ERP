/**
 * The live channel's background calls keep EP-04-S12 idle expiry intact. The browser makes them on
 * its own (badge reads after an event, presence heartbeats, re-subscribing after a reconnect), so
 * they check and lock the session but do not extend it (`extendsSession: false`); an operation the
 * user asks for still does. The stream itself never extends the session either.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashSecret } from '../../src/auth/session-store.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { addParcel, type LiveHarness, startLiveHarness } from './live-test-helpers.js';

const HOUR = 3_600_000;
const PARCEL = 'BATCH-2026-061';

describeDb('EP-07 live background calls and session idle expiry (EP-04-S12)', () => {
  let h: LiveHarness;

  beforeAll(async () => {
    h = await startLiveHarness();
    await addParcel(h.pool, h.shop, PARCEL, await addKarigar(h.pool, h.shop, 'KG-SI'));
  });
  afterAll(async () => {
    await h?.close();
  });

  const expiresAt = async (token: string) =>
    (await h.pool.query<{ expires_at: Date }>('select expires_at from sessions where token_hash = $1', [hashSecret(token)]))
      .rows[0].expires_at;

  it('badge reads, presence heartbeats and subscriptions are accepted without moving expires_at; a user call still slides it', async () => {
    const sanjay = await h.user('Sanjay Seth', 'owner');
    const issued = await expiresAt(sanjay.token);
    expect(issued).toEqual(new Date(SERVER_NOW.getTime() + 12 * HOUR));
    const c = await h.connect(sanjay.token);
    const connectionId = c.hello?.connectionId;

    h.clock.advance(HOUR);
    expect((await h.call('readRailBadges', {}, sanjay.token)).status).toBe(200);
    expect((await h.call('joinParcelPresence', { connectionId, parcelId: PARCEL }, sanjay.token)).status).toBe(200);
    expect((await h.call('joinParcelPresence', { connectionId, parcelId: PARCEL }, sanjay.token)).status).toBe(200);
    expect((await h.call('subscribeLiveChannel', { connectionId, channel: `parcel:${PARCEL}` }, sanjay.token)).status).toBe(200);
    expect((await h.call('leaveParcelPresence', { connectionId, parcelId: PARCEL }, sanjay.token)).status).toBe(200);
    expect((await h.call('unsubscribeLiveChannel', { connectionId, channel: `parcel:${PARCEL}` }, sanjay.token)).status).toBe(200);
    expect(await expiresAt(sanjay.token)).toEqual(issued);

    expect((await h.call('listUsers', {}, sanjay.token)).status).toBe(200);
    expect((await expiresAt(sanjay.token)).getTime()).toBeGreaterThan(issued.getTime());
    c.close();
  });

  it('a background call after the idle expiry is refused as unauthenticated and does not revive the session', async () => {
    h.clock.set(SERVER_NOW);
    const rajesh = await h.user('Rajesh Verma');
    const issued = await expiresAt(rajesh.token);
    h.clock.set(issued);
    expect(await h.call('readRailBadges', {}, rajesh.token)).toEqual({
      status: 401,
      body: { code: 'unauthenticated', message: 'Sign in to continue.' },
    });
    h.clock.set(SERVER_NOW);
    expect((await h.call('readRailBadges', {}, rajesh.token)).status).toBe(401);
  });
});
