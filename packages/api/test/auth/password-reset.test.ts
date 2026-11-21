import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashSecret } from '../../src/auth/session-store.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, newUserWithPassword, startHarness } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const T0 = new Date('2026-11-21T10:00:00.000Z');
const MINUTE = 60_000;
const OLD_PASSWORD = 'gold2026!';
const NEW_PASSWORD = 'counter-2026';
const LAKSHMI = { name: 'Lakshmi Devi', phone: '+91 98400 10101', email: 'lakshmi.devi@example.com' };
const EXPIRED = { status: 422, body: { code: 'rule_refused', message: 'This link has expired. Ask for a new one.' } };

describeDb('reset a forgotten password from an emailed link (EP-04-S7)', () => {
  const clock = mutableClock(T0);
  let h: Harness;
  let lakshmi: string;

  beforeAll(async () => {
    h = await startHarness({ clock });
    lakshmi = await newUserWithPassword(h.pool, h.shop, { ...LAKSHMI, role: 'karigar', password: OLD_PASSWORD });
    await newUser(h.pool, h.shop, {
      name: 'Gone Karigar',
      phone: '+91 98400 20202',
      email: 'gone@example.com',
      status: 'deactivated',
      passwordHash: null,
    });
  });

  afterAll(async () => {
    await h.close();
  });

  const request = async (phone: string) => {
    const res = await h.auth('requestPasswordReset', { phone });
    return { status: res.status, body: res.body, setCookie: res.setCookie };
  };
  /** Ask for a reset for Lakshmi now and return the token from the mailbox. */
  const tokenForLakshmi = async (): Promise<string> => {
    await request(LAKSHMI.phone);
    const mail = h.mailer.messages().at(-1);
    expect(mail).toMatchObject({ to: LAKSHMI.email, subject: 'Reset your JGD password' });
    return (mail?.link ?? '').split('#token=')[1];
  };
  const reset = async (token: string, password = NEW_PASSWORD) => {
    const res = await h.auth('resetPassword', { token, password });
    return { status: res.status, body: res.body };
  };
  const hashOf = async () =>
    (await h.pool.query<{ password_hash: string }>('select password_hash from users where id = $1', [lakshmi])).rows[0]
      .password_hash;

  it('AC1, AC2: the answer is the same for a known, an unknown and a deactivated phone; only Lakshmi gets mail', async () => {
    clock.set(T0);
    const before = h.mailer.messages().length;
    const known = await request('98400 10101');
    const unknown = await request('+91 90000 00000');
    const deactivated = await request('+91 98400 20202');
    expect(known).toEqual({ status: 200, body: { ok: true }, setCookie: null });
    expect(unknown).toEqual(known);
    expect(deactivated).toEqual(known);
    const sent = h.mailer.messages().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: LAKSHMI.email, toMasked: 'l•••@example.com', subject: 'Reset your JGD password' });
    expect(sent[0].link).toMatch(/^http:\/\/localhost:3000\/reset-password#token=[A-Za-z0-9_-]{43}$/);
    const audit = await h.pool.query<{ kind: string; actor_name: string }>(
      `select kind, actor_name from audit_entries where shop_id = $1 and kind = 'password_reset_requested' and at = $2`,
      [h.shop.shopId, T0],
    );
    expect(audit.rows).toEqual([{ kind: 'password_reset_requested', actor_name: 'Lakshmi Devi' }]);
  });

  it('the byte-identical answer: same raw response text for known and unknown phones', async () => {
    const raw = async (phone: string) => {
      const res = await fetch(`${h.base}/api/auth/requestPasswordReset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      return `${res.status} ${res.headers.get('content-type')} ${await res.text()}`;
    };
    expect(await raw(LAKSHMI.phone)).toBe(await raw('+91 90000 00000'));
  });

  it('AC3: a 50 min old link sets the new hash, is marked used and ends all her open sessions', async () => {
    clock.set(T0);
    const phone = await newSession(h.pool, h.shop, lakshmi);
    const tablet = await newSession(h.pool, h.shop, lakshmi);
    const token = await tokenForLakshmi();
    const oldHash = await hashOf();
    clock.advance(50 * MINUTE);
    expect((await h.auth('checkPasswordLink', { token, purpose: 'reset' })).body).toEqual({ ok: true, state: 'valid' });
    expect(await reset(token)).toEqual({ status: 200, body: { ok: true } });
    expect(await hashOf()).not.toBe(oldHash);
    const link = await h.pool.query('select used_at from password_links where user_id = $1 and used_at is not null', [
      lakshmi,
    ]);
    expect(link.rows).toEqual([{ used_at: clock.now() }]);
    const ended = await h.pool.query('select end_reason, ended_at from sessions where token_hash = any($1)', [
      [hashSecret(phone), hashSecret(tablet)],
    ]);
    expect(ended.rows).toEqual([
      { end_reason: 'password_reset', ended_at: clock.now() },
      { end_reason: 'password_reset', ended_at: clock.now() },
    ]);
    for (const session of [phone, tablet]) {
      expect((await h.auth('readCurrentSession', {}, { token: session })).status).toBe(401);
    }
    const audit = await h.pool.query<{ detail: string }>(
      `select detail from audit_entries where shop_id = $1 and kind = 'password_reset' and actor_id = $2`,
      [h.shop.shopId, lakshmi],
    );
    expect(JSON.parse(audit.rows[0].detail)).toEqual({ entity: 'user', entityId: lakshmi, sessionsEnded: 2 });
    expect((await h.auth('signIn', { phone: LAKSHMI.phone, password: NEW_PASSWORD })).status).toBe(200);
    expect((await h.auth('signIn', { phone: LAKSHMI.phone, password: OLD_PASSWORD })).status).toBe(401);
    // Back to the old password for the next tests.
    await reset(await tokenForLakshmi(), OLD_PASSWORD);
  });

  it('AC4: a 61 min old link, or a used one, says "This link has expired. Ask for a new one." and changes nothing', async () => {
    clock.set(T0);
    const late = await tokenForLakshmi();
    const before = await hashOf();
    clock.advance(61 * MINUTE);
    expect((await h.auth('checkPasswordLink', { token: late, purpose: 'reset' })).body).toEqual({
      ok: true,
      state: 'expired',
    });
    expect(await reset(late)).toEqual(EXPIRED);
    expect(await hashOf()).toBe(before);

    const used = await tokenForLakshmi();
    expect((await reset(used, OLD_PASSWORD)).status).toBe(200);
    const afterUse = await hashOf();
    expect(await reset(used)).toEqual(EXPIRED);
    expect(await hashOf()).toBe(afterUse);
  });

  it('AC5: after two requests the first link is refused because the second replaced it', async () => {
    clock.set(T0);
    const first = await tokenForLakshmi();
    const second = await tokenForLakshmi();
    const before = await hashOf();
    expect(await reset(first)).toEqual(EXPIRED);
    expect(await hashOf()).toBe(before);
    expect(await reset(second, OLD_PASSWORD)).toEqual({ status: 200, body: { ok: true } });
  });

  it('a short password is refused with the policy sentence and the link stays usable', async () => {
    clock.set(T0);
    const token = await tokenForLakshmi();
    expect(await reset(token, 'gold26')).toEqual({
      status: 400,
      body: { code: 'validation', message: 'Use at least 8 characters.', field: 'password' },
    });
    expect((await h.auth('checkPasswordLink', { token, purpose: 'reset' })).body).toEqual({ ok: true, state: 'valid' });
  });

  it('an activation link cannot be used to reset a password', async () => {
    clock.set(T0);
    const token = await tokenForLakshmi();
    expect((await h.auth('checkPasswordLink', { token, purpose: 'activation' })).body).toEqual({
      ok: true,
      state: 'expired',
    });
    expect((await h.auth('activateAccount', { token, password: NEW_PASSWORD })).status).toBe(422);
  });
});
