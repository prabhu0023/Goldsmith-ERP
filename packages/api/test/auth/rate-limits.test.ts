import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { checkAuthLimits, phoneKey } from '../../src/auth/auth-rate-limits.js';
import type { PasswordHasher } from '../../src/auth/password-hash.js';
import { AuthRateLimitedError } from '../../src/pipeline/api-errors.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUserWithPassword, startHarness, testPasswords } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const PASSWORD = 'gold2026!';
const LIMITS = { windowMinutes: 15, signInPerPhone: 3, signInPerDevice: 8, resetPerPhone: 2, resetPerDevice: 10 };
const REFUSED = { status: 429, body: { code: 'rate_limited', message: 'Too many requests. Wait a few minutes and try again.' } };
const WINDOW_MS = 15 * 60_000;
const T0 = new Date('2026-11-21T10:00:00.000Z');

describeDb('sign-in and reset rate limits per phone and device (EP-04-S9)', () => {
  const clock = mutableClock(T0);
  const verify = vi.fn(testPasswords.verify);
  const passwords: PasswordHasher = { ...testPasswords, verify };
  let h: Harness;
  /** Every test starts in a fresh window: the device (127.0.0.1) is shared by all of them. */
  let windowNo = 0;

  beforeAll(async () => {
    h = await startHarness({ clock, auth: { passwords, limits: LIMITS } });
    // One known user per test, so wrong passwords never reach the lockout (EP-04-S8).
    await newUserWithPassword(h.pool, h.shop, { name: 'Rajesh Verma', phone: '+91 98410 11111', password: PASSWORD });
    await newUserWithPassword(h.pool, h.shop, { name: 'Deepak Rao', phone: '+91 98410 22222', password: PASSWORD });
    await newUserWithPassword(h.pool, h.shop, { name: 'Lakshmi Devi', phone: '+91 98400 10101', password: PASSWORD });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    windowNo += 1;
    clock.set(new Date(T0.getTime() + windowNo * WINDOW_MS));
    verify.mockClear();
  });

  const attempt = async (phone: string, password = 'wrong-password') => {
    const res = await h.auth('signIn', { phone, password });
    return { status: res.status, body: res.body };
  };

  it('AC1, AC3: over the per-phone limit the request is refused before any password check', async () => {
    for (let i = 0; i < 3; i++) expect((await attempt('+91 98410 11111')).status).toBe(401);
    verify.mockClear();
    expect(await attempt('+91 98410 11111', PASSWORD)).toEqual(REFUSED);
    expect(verify).not.toHaveBeenCalled();
  });

  it('AC2: one device trying many phones is refused past the device limit, before any password check', async () => {
    for (let i = 0; i < 8; i++) expect((await attempt(`+91 90000 1000${i}`)).status).toBe(401);
    verify.mockClear();
    expect(await attempt('+91 90000 20000')).toEqual(REFUSED);
    expect(verify).not.toHaveBeenCalled();
  });

  it('AC4: an unknown phone over the limit gets the same refusal as a known one', async () => {
    const answers = [];
    for (const phone of ['+91 98410 22222', '+91 90000 00000']) {
      for (let i = 0; i < 3; i++) await attempt(phone);
      answers.push(await attempt(phone));
    }
    expect(answers).toEqual([REFUSED, REFUSED]);
  });

  it('AC5: once the period has passed a request is allowed again', async () => {
    for (let i = 0; i < 3; i++) await attempt('+91 98400 10101');
    expect(await attempt('+91 98400 10101', PASSWORD)).toEqual(REFUSED);
    clock.advance(WINDOW_MS);
    expect((await attempt('+91 98400 10101', PASSWORD)).status).toBe(200);
  });

  it('AC1 (reset kind): the R+1th reset request for one phone in a period is refused', async () => {
    const args = {
      shopId: h.shop.shopId,
      kind: 'reset' as const,
      phoneHash: phoneKey('test-secret', '+919841011111'),
      deviceHash: phoneKey('test-secret', 'reset-device'),
      now: clock.now(),
      limits: LIMITS,
    };
    await checkAuthLimits(h.pool, args);
    await checkAuthLimits(h.pool, args);
    await expect(checkAuthLimits(h.pool, args)).rejects.toBeInstanceOf(AuthRateLimitedError);
    await expect(checkAuthLimits(h.pool, { ...args, now: new Date(args.now.getTime() + WINDOW_MS) })).resolves.toBeUndefined();
  });

  it('AC1, AC3 over HTTP: the 3rd reset request for one phone (R=2) is refused and no email is sent', async () => {
    const before = h.mailer.messages().length;
    for (let i = 0; i < 2; i++) {
      const res = await h.auth('requestPasswordReset', { phone: '+91 98410 11111' });
      expect({ status: res.status, body: res.body }).toEqual({ status: 200, body: { ok: true } });
    }
    expect(h.mailer.messages().length).toBe(before + 2);
    const refused = await h.auth('requestPasswordReset', { phone: '98410 11111' });
    expect({ status: refused.status, body: refused.body }).toEqual(REFUSED);
    expect(h.mailer.messages().length).toBe(before + 2);
  });

  it('the generic rate-limit hook also applies to sign-in', async () => {
    const hooked = await startHarness({ rateLimiter: ({ operation }) => ({ allowed: operation !== 'signIn' }) });
    try {
      const res = await hooked.auth('signIn', { phone: '+91 98410 11111', password: PASSWORD });
      expect(res.status).toBe(429);
      expect(res.body).toMatchObject({ code: 'rate_limited' });
    } finally {
      await hooked.close();
    }
  });

  it('counters key on a hash of the phone and device, never the plain number', async () => {
    await attempt('+91 90000 30000');
    const { rows } = await h.pool.query<{ bucket: string }>('select bucket from auth_rate_counters where shop_id = $1', [
      h.shop.shopId,
    ]);
    for (const { bucket } of rows) expect(bucket).toMatch(/^(sign_in|reset):(phone|device):[0-9a-f]{64}$/);
    // The harness SESSION_SECRET keys the HMAC.
    const secret = 'test-only-session-secret-0123456789abcdef';
    expect(rows.map((r) => r.bucket)).toContain(`sign_in:phone:${phoneKey(secret, '+919000030000')}`);
  });
});
