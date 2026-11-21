import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { PasswordHasher } from '../../src/auth/password-hash.js';
import { hashSecret } from '../../src/auth/session-store.js';
import { describeDb } from '../db/db-test-helpers.js';
import {
  type Harness,
  newUser,
  newUserWithPassword,
  startHarness,
  testPasswords,
  tokenFrom,
} from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const PASSWORD = 'gold2026!';
const WRONG = { status: 401, body: { code: 'unauthenticated', message: 'Phone number or password is wrong.' } };
/** 09:58 IST (EP-04-S14 AC1). */
const START = new Date('2026-11-21T04:28:00.000Z');

describeDb('sign in with phone and password (EP-04-S3, S5, S14 AC1)', () => {
  const clock = mutableClock(START);
  const verify = vi.fn(testPasswords.verify);
  const passwords: PasswordHasher = { ...testPasswords, verify };
  let h: Harness;
  let rajesh: string;

  beforeAll(async () => {
    h = await startHarness({ clock, auth: { passwords } });
    rajesh = await newUserWithPassword(h.pool, h.shop, {
      name: 'Rajesh Verma',
      role: 'staff',
      phone: '+91 98410 11111',
      email: 'rajesh@example.com',
      password: PASSWORD,
    });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    clock.set(START);
    verify.mockClear();
    h.captured.length = 0;
  });

  const signIn = (phone: string, password: string, opts: { deviceLabel?: string; headers?: Record<string, string> } = {}) =>
    h.auth('signIn', { phone, password, deviceLabel: opts.deviceLabel }, { headers: opts.headers });
  const failedCount = async (userId: string) =>
    (await h.pool.query<{ failed_count: number }>('select failed_count from sign_in_lockouts where user_id = $1', [userId]))
      .rows[0]?.failed_count;
  const sessionsOf = async (userId: string) =>
    Number((await h.pool.query('select count(*) from sessions where user_id = $1', [userId])).rows[0].count);

  it('S3 AC1, S6: the bare and the spaced phone forms sign Rajesh in and land him on today', async () => {
    for (const phone of ['98410 11111', '+91 98410 11111', '09841011111']) {
      const res = await signIn(phone, PASSWORD);
      expect(res.status, phone).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        user: { userId: rajesh, name: 'Rajesh Verma', role: 'staff' },
        landingRoute: 'today',
      });
      expect(tokenFrom(res.setCookie)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('S3 AC2: a wrong password answers the wrong-password sentence and counts one failure', async () => {
    await signIn('98410 11111', PASSWORD);
    const res = await signIn('98410 11111', 'gold2026?');
    expect({ status: res.status, body: res.body }).toEqual(WRONG);
    expect(res.setCookie).toBeNull();
    expect(await failedCount(rajesh)).toBe(1);
  });

  it('S3 AC3: unknown, deactivated and pending phones answer exactly like a wrong password, with one verify each', async () => {
    await newUserWithPassword(h.pool, h.shop, {
      name: 'Gone Away',
      phone: '+91 98410 44444',
      password: PASSWORD,
      status: 'deactivated',
    });
    await newUser(h.pool, h.shop, { name: 'Not Yet', phone: '+91 98410 55555', status: 'pending_activation' });
    const answers = [];
    for (const [phone, password] of [
      ['98410 11111', 'wrong-password'],
      ['+91 90000 00000', PASSWORD],
      ['+91 98410 44444', PASSWORD],
      ['+91 98410 55555', PASSWORD],
    ]) {
      verify.mockClear();
      const res = await signIn(phone, password);
      answers.push({ status: res.status, body: res.body, setCookie: res.setCookie });
      expect(verify, phone).toHaveBeenCalledTimes(1);
    }
    for (const answer of answers) expect(answer).toEqual({ ...WRONG, setCookie: null });
  });

  it('S3 AC4: "12345" is a validation error on phone and no password is checked', async () => {
    const res = await signIn('12345', PASSWORD);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field: 'phone' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('S5 AC1, AC2: the session row holds shop, user, role, times and device label; only the token hash is stored', async () => {
    const res = await signIn('98410 11111', PASSWORD, { deviceLabel: 'Counter tablet' });
    const token = tokenFrom(res.setCookie) ?? '';
    const { rows } = await h.pool.query('select * from sessions where token_hash = $1', [hashSecret(token)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      shop_id: h.shop.shopId,
      user_id: rajesh,
      role_at_issue: 'staff',
      created_at: START,
      expires_at: new Date(START.getTime() + 720 * 60_000),
      ended_at: null,
      device_label: 'Counter tablet',
    });
    for (const value of Object.values(rows[0])) expect(String(value)).not.toContain(token);
  });

  it('S5: without a typed label the device label is the first 80 characters of the user agent', async () => {
    const agent = `Mozilla/5.0 ${'x'.repeat(100)}`;
    const res = await signIn('98410 11111', PASSWORD, { headers: { 'user-agent': agent } });
    const { rows } = await h.pool.query('select device_label from sessions where token_hash = $1', [
      hashSecret(tokenFrom(res.setCookie) ?? ''),
    ]);
    expect(rows[0].device_label).toBe(agent.slice(0, 80));
  });

  it('S5 AC3: the cookie from sign-in makes Rajesh the actor of an operation, in his shop', async () => {
    const token = tokenFrom((await signIn('98410 11111', PASSWORD)).setCookie) ?? '';
    const res = await h.call('createLead', { customerName: 'Meena Iyer', items: [{ name: 'Ring', qty: 1 }] }, { session: token });
    expect(res.status).toBe(200);
    expect(h.captured[0].ctx.by).toEqual({ id: rajesh, name: 'Rajesh Verma', role: 'staff' });
    expect(h.captured[0].ctx.shop).toEqual(h.shop);
  });

  it('S5 AC4: a locked account gets no session, even with the right password', async () => {
    const locked = await newUserWithPassword(h.pool, h.shop, { name: 'Locked Lal', phone: '+91 98410 66666', password: PASSWORD });
    await h.pool.query(
      `insert into sign_in_lockouts (shop_id, user_id, failed_count, locked_until) values ($1, $2, 5, $3)`,
      [h.shop.shopId, locked, new Date(START.getTime() + 10 * 60_000)],
    );
    const res = await signIn('+91 98410 66666', PASSWORD);
    expect(res.status).toBe(422);
    expect(res.setCookie).toBeNull();
    expect(await sessionsOf(locked)).toBe(0);
  });

  it('S5 AC5: after a success the failed count is 0', async () => {
    await signIn('98410 11111', 'wrong-password');
    expect(await failedCount(rajesh)).toBeGreaterThan(0);
    await signIn('98410 11111', PASSWORD);
    expect(await failedCount(rajesh)).toBe(0);
  });

  it('S5: two parallel sign-ins each get their own session', async () => {
    const [a, b] = await Promise.all([signIn('98410 11111', PASSWORD), signIn('98410 11111', PASSWORD)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(tokenFrom(a.setCookie)).not.toBe(tokenFrom(b.setCookie));
  });

  it('S14 AC1: signing in at 09:58 IST writes signed_in by Rajesh Verma at 04:28 UTC with role and device label', async () => {
    const res = await signIn('98410 11111', PASSWORD, { deviceLabel: 'Shop counter' });
    const sessionId = (
      await h.pool.query<{ id: string }>('select id from sessions where token_hash = $1', [hashSecret(tokenFrom(res.setCookie) ?? '')])
    ).rows[0].id;
    const { rows } = await h.pool.query(
      `select at, actor_id, actor_name, actor_role, detail from audit_entries
        where shop_id = $1 and kind = 'signed_in' and detail like $2`,
      [h.shop.shopId, `%${sessionId}%`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ at: START, actor_id: rajesh, actor_name: 'Rajesh Verma', actor_role: 'staff' });
    expect(JSON.parse(rows[0].detail)).toEqual({
      entity: 'session',
      entityId: sessionId,
      role: 'staff',
      deviceLabel: 'Shop counter',
    });
  });

  it('cookie flags: HttpOnly, SameSite=Lax, Path=/, and no Secure in development', async () => {
    const { setCookie } = await signIn('98410 11111', PASSWORD);
    const attributes = (setCookie ?? '').split(';').map((a) => a.trim());
    expect(attributes).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']));
    expect(attributes).not.toContain('Secure');
    expect(setCookie).not.toMatch(/Max-Age|Expires/i);
  });
});

describeDb('session cookie with secureCookies (EP-04-S5)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ auth: { secureCookies: true } });
    await newUserWithPassword(h.pool, h.shop, { name: 'Rajesh Verma', phone: '+91 98410 11111', password: PASSWORD });
  });
  afterAll(async () => {
    await h.close();
  });

  it('adds Secure', async () => {
    const res = await h.auth('signIn', { phone: '98410 11111', password: PASSWORD });
    expect(res.status).toBe(200);
    expect((res.setCookie ?? '').split(';').map((a) => a.trim())).toEqual(
      expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/', 'Secure']),
    );
  });
});
