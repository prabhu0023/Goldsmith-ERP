import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { hashSecret } from '../../src/auth/session-store.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUserWithPassword, sessionCookie, startHarness, tokenFrom } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const PASSWORD = 'gold2026!';
const T0 = new Date('2026-11-21T10:00:00.000Z');
const IDLE_MS = 720 * 60_000;
const UNAUTHENTICATED = { status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } };

describeDb('idle sessions expire (EP-04-S12)', () => {
  const clock = mutableClock(T0);
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({ clock });
    await newUserWithPassword(h.pool, h.shop, { name: 'Rajesh Verma', phone: '+91 98410 11111', password: PASSWORD });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    clock.set(T0);
  });

  const signIn = async () =>
    tokenFrom((await h.auth('signIn', { phone: '+91 98410 11111', password: PASSWORD })).setCookie) ?? '';
  const row = async (token: string) =>
    (await h.pool.query('select ended_at, end_reason, expires_at from sessions where token_hash = $1', [hashSecret(token)]))
      .rows[0];
  const leadsNamed = async (customerName: string) =>
    Number(
      (await h.pool.query('select count(*) from leads where shop_id = $1 and customer_name = $2', [h.shop.shopId, customerName]))
        .rows[0].count,
    );
  const lead = (customerName: string) => ({ customerName, items: [{ name: 'Ring', qty: 1 }] });

  it('AC1, AC2, AC4: a request at or after expires_at is refused, saves nothing and ends the row with expiry', async () => {
    const token = await signIn();
    clock.advance(IDLE_MS);
    expect(await h.call('createLead', lead('Expired Ena'), { session: token })).toEqual(UNAUTHENTICATED);
    expect(await leadsNamed('Expired Ena')).toBe(0);
    expect(await row(token)).toMatchObject({ ended_at: new Date(T0.getTime() + IDLE_MS), end_reason: 'expiry' });
  });

  it('an expired session is never revived, even when the clock reads earlier', async () => {
    const token = await signIn();
    clock.advance(IDLE_MS + 1000);
    expect(await h.call('createLead', lead('Late Lata'), { session: token })).toEqual(UNAUTHENTICATED);
    clock.set(T0);
    expect(await h.call('createLead', lead('Late Lata'), { session: token })).toEqual(UNAUTHENTICATED);
    expect((await h.auth('readCurrentSession', {}, { token })).status).toBe(401);
  });

  it('AC3: a request before expires_at is accepted and slides expires_at to now + idle time', async () => {
    const token = await signIn();
    clock.advance(IDLE_MS - 1000);
    expect((await h.call('createLead', lead('Sliding Sita'), { session: token })).status).toBe(200);
    expect((await row(token)).expires_at).toEqual(new Date(T0.getTime() + 2 * IDLE_MS - 1000));
    clock.advance(IDLE_MS - 1000);
    expect((await h.call('createLead', lead('Sliding Sita'), { session: token })).status).toBe(200);
    expect(await leadsNamed('Sliding Sita')).toBe(2);
  });

  it('the contract-version read resolves the session but does not extend it', async () => {
    const token = await signIn();
    clock.advance(3600_000);
    const res = await fetch(`${h.base}/api/contract-version`, { headers: { cookie: sessionCookie(token) } });
    expect(res.status).toBe(200);
    expect((await row(token)).expires_at).toEqual(new Date(T0.getTime() + IDLE_MS));
  });
});
