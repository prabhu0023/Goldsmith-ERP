import { afterAll, beforeAll, expect, it } from 'vitest';
import { issueActivationLink } from '../../src/auth/activation.js';
import { ACTIVATION_HOURS } from '../../src/auth/password-links.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUser, startHarness } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const T0 = new Date('2026-11-21T10:00:00.000Z');
const HOUR = 3600_000;
const USED = { status: 422, body: { code: 'rule_refused', message: 'This link has already been used.' } };
const EXPIRED = {
  status: 422,
  body: { code: 'rule_refused', message: 'This link has expired. Ask the shop owner to send a new one.' },
};

describeDb('set the first password from an activation link (EP-04-S10)', () => {
  const clock = mutableClock(T0);
  let h: Harness;
  let n = 0;

  beforeAll(async () => {
    h = await startHarness({ clock });
  });

  afterAll(async () => {
    await h.close();
  });

  /** A pending user with a unique phone. */
  const newPending = async (name: string, email: string) => {
    n += 1;
    const phone = `+91 98410 6${String(n).padStart(4, '0')}`;
    const id = await newUser(h.pool, h.shop, { name, phone, email, status: 'pending_activation' });
    return { id, phone };
  };
  /** Issue an activation link now (server-only) and return the token from the mailbox. */
  const issue = async (userId: string): Promise<string> => {
    await runInTransaction(
      h.pool,
      (tx) =>
        issueActivationLink(tx, {
          shopId: h.shop.shopId,
          userId,
          actor: { kind: 'system' },
          at: clock.now(),
          mailer: h.mailer,
          appUrl: 'http://localhost:3000',
        }),
      () => {},
    );
    const link = h.mailer.messages().at(-1)?.link ?? '';
    return link.split('#token=')[1];
  };
  const activate = async (token: string, password: string) => {
    const res = await h.auth('activateAccount', { token, password });
    return { status: res.status, body: res.body };
  };
  const check = async (token: string) => (await h.auth('checkPasswordLink', { token, purpose: 'activation' })).body;
  const userRow = async (id: string) =>
    (await h.pool.query('select status, password_hash, password_set_at from users where id = $1', [id])).rows[0];
  const linkRow = async (userId: string) =>
    (
      await h.pool.query('select used_at, replaced_at from password_links where user_id = $1 order by created_at, id', [
        userId,
      ])
    ).rows;

  it('AC1: a 2 h old link sets the password, makes the user active, is marked used, and sign-in works', async () => {
    clock.set(T0);
    const deepak = await newPending('Deepak Rao', 'deepak.rao@example.com');
    const token = await issue(deepak.id);
    expect(h.mailer.messages().at(-1)).toMatchObject({ to: 'deepak.rao@example.com', subject: 'Set your JGD password' });
    clock.advance(2 * HOUR);
    expect(await check(token)).toEqual({ ok: true, state: 'valid' });
    expect(await activate(token, 'counter-2026')).toEqual({ status: 200, body: { ok: true } });
    const user = await userRow(deepak.id);
    expect(user).toMatchObject({ status: 'active', password_set_at: clock.now() });
    expect(user.password_hash).toMatch(/^\$scrypt\$/);
    expect(await linkRow(deepak.id)).toEqual([{ used_at: clock.now(), replaced_at: null }]);
    const signIn = await h.auth('signIn', { phone: deepak.phone, password: 'counter-2026' });
    expect(signIn.status).toBe(200);
    expect(signIn.body).toMatchObject({ user: { name: 'Deepak Rao', role: 'staff' }, landingRoute: 'today' });
  });

  it('AC2: a used link is refused with "This link has already been used." and nothing changes', async () => {
    clock.set(T0);
    const p = await newPending('Used Link User', 'used@example.com');
    const token = await issue(p.id);
    await activate(token, 'counter-2026');
    const before = await userRow(p.id);
    clock.advance(HOUR);
    expect(await check(token)).toEqual({ ok: true, state: 'used' });
    expect(await activate(token, 'another-2026')).toEqual(USED);
    expect(await userRow(p.id)).toEqual(before);
  });

  it('AC3: a link 25 h old (or exactly 24 h) is refused as expired and nothing changes', async () => {
    clock.set(T0);
    const p = await newPending('Late User', 'late@example.com');
    const token = await issue(p.id);
    clock.advance(ACTIVATION_HOURS * HOUR);
    expect(await check(token)).toEqual({ ok: true, state: 'expired' });
    clock.advance(HOUR);
    expect(await check(token)).toEqual({ ok: true, state: 'expired' });
    expect(await activate(token, 'counter-2026')).toEqual(EXPIRED);
    expect(await userRow(p.id)).toEqual({ status: 'pending_activation', password_hash: null, password_set_at: null });
    expect(await linkRow(p.id)).toEqual([{ used_at: null, replaced_at: null }]);
  });

  it('AC4: after a resend the older link is refused because the new one replaced it', async () => {
    clock.set(T0);
    const p = await newPending('Resent User', 'resent@example.com');
    const first = await issue(p.id);
    clock.advance(HOUR);
    const second = await issue(p.id);
    expect(await check(first)).toEqual({ ok: true, state: 'expired' });
    expect(await activate(first, 'counter-2026')).toEqual(EXPIRED);
    expect(await activate(second, 'counter-2026')).toEqual({ status: 200, body: { ok: true } });
    const links = await linkRow(p.id);
    expect(links[0]).toEqual({ used_at: null, replaced_at: new Date(T0.getTime() + HOUR) });
    expect(links[1].used_at).toEqual(clock.now());
  });

  it('AC5: "gold26" is refused with "Use at least 8 characters." and the link stays unused', async () => {
    clock.set(T0);
    const p = await newPending('Short Password User', 'short@example.com');
    const token = await issue(p.id);
    expect(await activate(token, 'gold26')).toEqual({
      status: 400,
      body: { code: 'validation', message: 'Use at least 8 characters.', field: 'password' },
    });
    expect(await linkRow(p.id)).toEqual([{ used_at: null, replaced_at: null }]);
    expect(await check(token)).toEqual({ ok: true, state: 'valid' });
  });

  it('an unknown token and a deactivated user are refused as expired', async () => {
    clock.set(T0);
    expect(await check('no-such-token')).toEqual({ ok: true, state: 'expired' });
    expect(await activate('no-such-token', 'counter-2026')).toEqual(EXPIRED);
    const p = await newPending('Gone User', 'gone@example.com');
    const token = await issue(p.id);
    await h.pool.query(`update users set status = 'deactivated' where id = $1`, [p.id]);
    expect(await activate(token, 'counter-2026')).toEqual(EXPIRED);
    expect(await linkRow(p.id)).toEqual([{ used_at: null, replaced_at: null }]);
  });

  it('audits activation_link_sent, then password_set with the user as actor, and never the token', async () => {
    clock.set(T0);
    const p = await newPending('Audited User', 'audited@example.com');
    const token = await issue(p.id);
    await activate(token, 'counter-2026');
    const { rows } = await h.pool.query<{ kind: string; actor_role: string; actor_name: string; detail: string }>(
      `select kind, actor_role, actor_name, detail from audit_entries
        where shop_id = $1 and detail::jsonb ->> 'entityId' = $2 order by at, kind`,
      [h.shop.shopId, p.id],
    );
    expect(rows.map((r) => [r.kind, r.actor_role, r.actor_name])).toEqual([
      ['activation_link_sent', 'system', 'System'],
      ['password_set', 'staff', 'Audited User'],
    ]);
    expect(JSON.parse(rows[0].detail)).toMatchObject({ email: 'a•••@example.com' });
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain('counter-2026');
  });
});
