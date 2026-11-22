import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kolkataTime, LOCK_MINUTES, MAX_FAILED_PASSWORDS, unlockAccount } from '../../src/auth/lockout.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUser, newUserWithPassword, startHarness } from '../support/api-harness.js';
import { mutableClock } from '../support/test-clock.js';

const PASSWORD = 'gold2026!';
const T0 = new Date('2026-11-21T10:00:00.000Z');
const WRONG = { status: 401, body: { code: 'unauthenticated', message: 'Phone number or password is wrong.' } };
/** 10:00Z + 15 min = 10:15Z = 15:45 in Asia/Kolkata. */
const LOCKED = { status: 422, body: { code: 'rule_refused', message: 'Too many wrong passwords. Try again after 15:45.' } };

describe('lockout constants and time (EP-04-S8, D4)', () => {
  it('locks after 5 wrong passwords for 15 minutes, shown as HH:MM in Asia/Kolkata', () => {
    expect([MAX_FAILED_PASSWORDS, LOCK_MINUTES]).toEqual([5, 15]);
    expect(kolkataTime(new Date('2026-11-21T10:15:00.000Z'))).toBe('15:45');
    expect(kolkataTime(new Date('2026-11-21T18:40:00.000Z'))).toBe('00:10');
  });
});

describeDb('lockout after repeated wrong passwords (EP-04-S8)', () => {
  const clock = mutableClock(T0);
  let h: Harness;
  let owner: string;

  beforeAll(async () => {
    h = await startHarness({ clock, poolSize: 12 });
    owner = await newUser(h.pool, h.shop, { name: 'Sanjay Seth', role: 'owner' });
  });
  afterAll(async () => {
    await h.close();
  });

  let n = 0;
  /** A new user with a password and a unique phone; returns its id and phone. */
  const newPerson = async (name: string) => {
    n += 1;
    const phone = `+91 98410 2${String(n).padStart(4, '0')}`;
    const id = await newUserWithPassword(h.pool, h.shop, { name, phone, password: PASSWORD });
    return { id, phone };
  };
  const attempt = async (phone: string, password: string) => {
    const res = await h.auth('signIn', { phone, password });
    return { status: res.status, body: res.body };
  };
  const lockOf = async (userId: string) =>
    (
      await h.pool.query('select failed_count, locked_until, unlocked_by, unlocked_at from sign_in_lockouts where user_id = $1', [
        userId,
      ])
    ).rows[0];

  it('AC1, AC2, AC3: the 5th wrong password locks for 15 minutes; even the right one is refused; then it signs in at 0', async () => {
    clock.set(T0);
    const deepak = await newUserWithPassword(h.pool, h.shop, { name: 'Deepak Rao', phone: '+91 98410 22222', password: PASSWORD });
    for (let i = 1; i <= 4; i++) expect(await attempt('+91 98410 22222', 'wrong-password'), `attempt ${i}`).toEqual(WRONG);
    expect(await attempt('+91 98410 22222', 'wrong-password')).toEqual(LOCKED);
    expect(await lockOf(deepak)).toMatchObject({ failed_count: 5, locked_until: new Date('2026-11-21T10:15:00.000Z') });

    clock.advance(14 * 60_000);
    expect(await attempt('+91 98410 22222', PASSWORD)).toEqual(LOCKED);

    clock.set(new Date('2026-11-21T10:15:00.000Z'));
    const res = await attempt('+91 98410 22222', PASSWORD);
    expect(res.status).toBe(200);
    expect(await lockOf(deepak)).toMatchObject({ failed_count: 0, locked_until: null });
  });

  it('AC4: a right password before the 5th wrong one resets the count to 0', async () => {
    clock.set(T0);
    const p = await newPerson('Reset Ravi');
    for (let i = 0; i < 4; i++) await attempt(p.phone, 'wrong-password');
    expect((await lockOf(p.id)).failed_count).toBe(4);
    expect((await attempt(p.phone, PASSWORD)).status).toBe(200);
    expect((await lockOf(p.id)).failed_count).toBe(0);
    expect(await attempt(p.phone, 'wrong-password')).toEqual(WRONG);
  });

  it('AC5: unlockAccount clears the lock at once and audits account_unlocked with the actor', async () => {
    clock.set(T0);
    const p = await newPerson('Locked Lata');
    for (let i = 0; i < 5; i++) await attempt(p.phone, 'wrong-password');
    expect(await attempt(p.phone, PASSWORD)).toEqual(LOCKED);
    await runInTransaction(
      h.pool,
      (tx) =>
        unlockAccount(tx.client, {
          shopId: h.shop.shopId,
          userId: p.id,
          by: { kind: 'user', id: owner, name: 'Sanjay Seth', role: 'owner' },
          at: clock.now(),
        }),
      () => {},
    );
    expect(await lockOf(p.id)).toEqual({ failed_count: 0, locked_until: null, unlocked_by: owner, unlocked_at: T0 });
    expect((await attempt(p.phone, PASSWORD)).status).toBe(200);
    const { rows } = await h.pool.query(
      `select actor_id, actor_name, actor_role, detail from audit_entries where shop_id = $1 and kind = 'account_unlocked'`,
      [h.shop.shopId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actor_id: owner, actor_name: 'Sanjay Seth', actor_role: 'owner' });
    expect(JSON.parse(rows[0].detail)).toEqual({ entity: 'user', entityId: p.id });
  });

  it('AC6: an unknown phone answers exactly like a known one, wrong and then locked', async () => {
    clock.set(T0);
    const known = await newPerson('Known Kamal');
    for (const phone of [known.phone, '+91 90000 00001']) {
      for (let i = 1; i <= 4; i++) expect(await attempt(phone, 'wrong-password'), `${phone} #${i}`).toEqual(WRONG);
      expect(await attempt(phone, 'wrong-password'), phone).toEqual(LOCKED);
      expect(await attempt(phone, PASSWORD), phone).toEqual(LOCKED);
    }
    const { rows } = await h.pool.query(
      'select failed_count, locked_until from sign_in_lockouts where shop_id = $1 and phone_hash is not null',
      [h.shop.shopId],
    );
    expect(rows).toEqual([{ failed_count: 5, locked_until: new Date('2026-11-21T10:15:00.000Z') }]);
  });

  it('parallel wrong passwords are all counted: 5 at once lock the account', async () => {
    clock.set(T0);
    const p = await newPerson('Parallel Prem');
    const answers = await Promise.all(Array.from({ length: 5 }, () => attempt(p.phone, 'wrong-password')));
    expect(answers.filter((a) => a.status === 401)).toHaveLength(4);
    expect(answers.filter((a) => a.status === 422)).toEqual([LOCKED]);
    expect(await lockOf(p.id)).toMatchObject({ failed_count: 5, locked_until: new Date('2026-11-21T10:15:00.000Z') });
  });
});
