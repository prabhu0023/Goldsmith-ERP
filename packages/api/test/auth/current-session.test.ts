import { permissionsFor, type RoleId } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashSecret } from '../../src/auth/session-store.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUserWithPassword, startHarness, tokenFrom } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const PASSWORD = 'gold2026!';
const T0 = new Date('2026-11-21T10:00:00.000Z');
const UNAUTHENTICATED = { status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } };
const lead = { customerName: 'Meena Iyer', items: [{ name: 'Chain', qty: 1 }] };

describeDb('read current session and sign out (EP-04-S6 AC4, S11)', () => {
  const clock = mutableClock(T0);
  let h: Harness;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    h = await startHarness({ clock });
    for (const [name, role, phone] of [
      ['Sanjay Seth', 'owner', '+91 98410 33333'],
      ['Rajesh Verma', 'staff', '+91 98410 11111'],
      ['Lakshmi Devi', 'karigar', '+91 98400 10101'],
      ['Deepak Rao', 'staff', '+91 98410 22222'],
    ] as Array<[string, RoleId, string]>) {
      ids[name] = await newUserWithPassword(h.pool, h.shop, { name, role, phone, password: PASSWORD });
    }
  });
  afterAll(async () => {
    await h.close();
  });

  const signIn = async (phone: string, deviceLabel?: string) => {
    const res = await h.auth('signIn', { phone, password: PASSWORD, deviceLabel });
    expect(res.status).toBe(200);
    return tokenFrom(res.setCookie) ?? '';
  };
  const current = async (token?: string) => {
    const res = await h.auth('readCurrentSession', {}, { token });
    return { status: res.status, body: res.body };
  };
  const sessionRow = async (token: string) =>
    (
      await h.pool.query('select id, ended_at, end_reason, expires_at from sessions where token_hash = $1', [
        hashSecret(token),
      ])
    ).rows[0];

  it('S6 AC4: returns user id, name, role and landing route for each role', async () => {
    clock.set(T0);
    for (const [name, phone, role, landingRoute] of [
      ['Sanjay Seth', '+91 98410 33333', 'owner', 'decisions'],
      ['Rajesh Verma', '+91 98410 11111', 'staff', 'today'],
      ['Lakshmi Devi', '+91 98400 10101', 'karigar', 'k-jobs'],
    ]) {
      expect(await current(await signIn(phone))).toEqual({
        status: 200,
        body: {
          ok: true,
          user: { userId: ids[name], name, role },
          landingRoute,
          permissions: [...permissionsFor(role as RoleId)],
          shopName: 'Test shop',
          serverTime: T0.toISOString(),
        },
      });
    }
  });

  it('S6 AC4: without a valid session it is unauthenticated', async () => {
    expect(await current()).toEqual(UNAUTHENTICATED);
    expect(await current('not-a-token')).toEqual(UNAUTHENTICATED);
  });

  it('S12: reading the current session extends it to now + the idle time', async () => {
    clock.set(T0);
    const token = await signIn('+91 98410 11111');
    clock.advance(3600_000);
    expect((await current(token)).status).toBe(200);
    expect((await sessionRow(token)).expires_at).toEqual(new Date('2026-11-21T23:00:00.000Z'));
  });

  it('S11 AC1-3: sign out ends only this session, clears the cookie and audits signed_out', async () => {
    clock.set(T0);
    const shopDevice = await signIn('+91 98410 22222', 'Shop counter');
    const ownPhone = await signIn('+91 98410 22222', 'Deepak phone');
    clock.advance(60_000);
    const res = await h.auth('signOut', {}, { token: shopDevice });
    expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { ok: true } });
    expect(res.setCookie).toMatch(/^gs_session=; /);
    expect((res.setCookie ?? '').split(';').map((a) => a.trim())).toEqual(
      expect.arrayContaining(['Max-Age=0', 'HttpOnly', 'SameSite=Lax', 'Path=/']),
    );
    const ended = await sessionRow(shopDevice);
    expect(ended).toMatchObject({ ended_at: new Date(T0.getTime() + 60_000), end_reason: 'sign_out' });

    expect(await h.call('createLead', lead, { session: shopDevice })).toEqual(UNAUTHENTICATED);
    expect(await current(shopDevice)).toEqual(UNAUTHENTICATED);
    expect((await current(ownPhone)).status).toBe(200);
    expect((await h.call('createLead', lead, { session: ownPhone })).status).toBe(200);

    const { rows } = await h.pool.query(
      `select actor_id, actor_name, actor_role, detail from audit_entries where shop_id = $1 and kind = 'signed_out'`,
      [h.shop.shopId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: ids['Deepak Rao'], actor_name: 'Deepak Rao', actor_role: 'staff' });
    expect(JSON.parse(rows[0].detail)).toEqual({ entity: 'session', entityId: ended.id, deviceLabel: 'Shop counter' });
  });

  it('S11: signing out without a session is unauthenticated', async () => {
    const res = await h.auth('signOut', {});
    expect({ status: res.status, body: res.body }).toEqual(UNAUTHENTICATED);
  });
});
