import { CONTRACT_VERSION } from '@goldsmith/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { DEV_SESSION_HEADER } from '../../src/pipeline/session-resolver.js';
import { addKarigar, describeDb, newShop } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, SERVER_NOW, startHarness } from '../support/api-harness.js';

describeDb('actor from the session, time from the server clock (EP-03-S3, S1 AC6)', () => {
  let h: Harness;
  let sanjayId: string;
  beforeAll(async () => {
    h = await startHarness();
    sanjayId = await newUser(h.pool, h.shop, { name: 'Sanjay Seth', role: 'owner' });
    await addKarigar(h.pool, h.shop, 'KG-07');
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    h.captured.length = 0;
  });

  const newLead = { customerName: 'Meena Iyer', items: [{ name: 'Bangle', qty: 2, approxWeightG: '20.5' }] };

  it('AC1: the actor is the session user, whatever the body says, and the record shows that user', async () => {
    const other = await newShop(h.pool, 'Someone else');
    const res = await h.call(
      'createLead',
      { ...newLead, by: { id: sanjayId, name: 'Sanjay Seth', role: 'owner' }, actor: 'Sanjay Seth', shopId: other.shopId },
      { session: h.session },
    );
    expect(res.status).toBe(200);
    const [call] = h.captured;
    expect(call.ctx.by).toEqual({ id: h.userId, name: 'Rajesh Verma', role: 'staff' });
    expect(call.ctx.shop).toEqual(h.shop);
    expect(call.input).not.toHaveProperty('by');
    const { rows } = await h.pool.query('select shop_id, taken_by_name from leads where code = $1 and shop_id = $2', [
      res.body.id,
      h.shop.shopId,
    ]);
    expect(rows).toEqual([{ shop_id: h.shop.shopId, taken_by_name: 'Rajesh Verma' }]);
  });

  it('AC2: the time is the server clock (UTC), not the at the body sends', async () => {
    const res = await h.call(
      'createLead',
      { ...newLead, at: '2025-01-01T09:00:00.000Z', time: '2025-01-01' },
      { session: h.session },
    );
    expect(res.status).toBe(200);
    expect(h.captured[0].ctx.at.toISOString()).toBe(SERVER_NOW.toISOString());
    const { rows } = await h.pool.query<{ arrived_at: Date }>(
      'select arrived_at from leads where code = $1 and shop_id = $2',
      [res.body.id, h.shop.shopId],
    );
    expect(rows[0].arrived_at.toISOString()).toBe('2026-11-21T10:00:00.000Z');
  });

  it('AC3: no session, an unreadable or unknown one, an ended or an expired one: unauthenticated, nothing runs', async () => {
    const ended = await newSession(h.pool, h.shop, h.userId, { endedAt: new Date('2026-11-21T09:00:00.000Z') });
    const expired = await newSession(h.pool, h.shop, h.userId, { expiresAt: new Date('2026-11-21T09:59:59.000Z') });
    const sessions: Array<string | undefined> = [
      undefined,
      'not-a-session',
      '00000000-0000-4000-8000-000000000000',
      ended,
      expired,
    ];
    for (const session of sessions) {
      const res = await h.call('createLead', newLead, { session });
      expect(res, String(session)).toEqual({
        status: 401,
        body: { code: 'unauthenticated', message: 'Sign in to continue.' },
      });
    }
    expect(h.captured).toEqual([]);
    const health = await fetch(`${h.base}/health`);
    expect(health.status).toBe(200);
  });

  it('AC4: times in responses are ISO 8601 UTC', async () => {
    const created = await h.call('recordParcelArrival', { karigarCode: 'KG-07', poRef: 'PO-1' }, { session: h.session });
    expect(created.status).toBe(200);
    const read = await h.call('readParcel', { parcelId: created.body.id }, { session: h.session });
    expect(read.status).toBe(200);
    const parcel = read.body.parcel as { arrivedAt: string };
    expect(parcel.arrivedAt).toBe('2026-11-21T10:00:00.000Z');
    expect(parcel.arrivedAt.endsWith('Z')).toBe(true);
  });

  it('S1 AC6: a signed-in caller can read the contract version; without a session it is refused', async () => {
    const signedIn = await fetch(`${h.base}/api/contract-version`, { headers: { [DEV_SESSION_HEADER]: h.session } });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({ ok: true, version: CONTRACT_VERSION });
    const anonymous = await fetch(`${h.base}/api/contract-version`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toEqual({ code: 'unauthenticated', message: 'Sign in to continue.' });
  });
});
