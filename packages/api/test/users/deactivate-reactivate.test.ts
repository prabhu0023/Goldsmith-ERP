/**
 * Deactivate User (EP-05-S7), Reactivate User (EP-05-S8) and the live session end on
 * deactivation (EP-05-S10 AC1, AC2, AC4, AC5).
 */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newUser, newUserWithPassword, SERVER_NOW } from '../support/api-harness.js';
import {
  accessEvents,
  OWNER_ONLY,
  PASSWORD,
  refused,
  sessionLive,
  signIn,
  startUsersHarness,
  UNAUTHENTICATED,
  type UsersHarness,
  userRow,
  WRONG_PASSWORD,
} from './user-test-helpers.js';

/** The user whose lifecycle audit insert fails on purpose (S10 AC2), or null. */
const failAudit = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('../../src/users/user-audit.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/users/user-audit.js')>();
  return {
    ...real,
    writeUserLifecycleAudit: async (...args: Parameters<typeof real.writeUserLifecycleAudit>) => {
      if (args[3].userId === failAudit.userId) throw new Error('audit insert failed on purpose');
      return real.writeUserLifecycleAudit(...args);
    },
  };
});
describeDb('deactivate and reactivate a user (EP-05-S7, S8, S10)', () => {
  let h: UsersHarness;
  let rajesh: string;
  let vijay: string;

  beforeAll(async () => {
    h = await startUsersHarness();
    rajesh = await newUserWithPassword(h.pool, h.shop, {
      name: 'Rajesh Verma',
      phone: '+91 98410 44444',
      email: 'rajesh.verma@example.com',
      password: PASSWORD,
    });
    vijay = await newUserWithPassword(h.pool, h.shop, {
      name: 'Vijay Kumar',
      phone: '+91 98410 77777',
      email: 'vijay.kumar@example.com',
      password: PASSWORD,
    });
  });

  afterAll(async () => {
    await h?.close();
  });

  const deactivate = async (userId: string, reason?: string) =>
    h.asOwner('deactivateUser', { userId, version: (await userRow(h, userId)).version, reason });
  const reactivate = async (userId: string) =>
    h.asOwner('reactivateUser', { userId, version: (await userRow(h, userId)).version });
  const sessionCount = async (userId: string) =>
    Number((await h.pool.query('select count(*) from sessions where user_id = $1', [userId])).rows[0].count);

  it('S7 AC1, S10 AC4: both devices are refused on their next request once Rajesh is deactivated', async () => {
    const shopDevice = await signIn(h, '+91 98410 44444');
    const ownPhone = await signIn(h, '+91 98410 44444');
    const before = await userRow(h, rajesh);
    expect(await deactivate(rajesh, 'Left the shop')).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, rajesh)).toMatchObject({
      status: 'deactivated',
      deactivated_at: SERVER_NOW,
      version: before.version + 1,
    });
    for (const token of [shopDevice.token, ownPhone.token]) {
      expect(await h.call('listUsers', {}, { session: token ?? '' })).toEqual(UNAUTHENTICATED);
      expect(await sessionLive(h, token ?? '')).toBe(false);
    }
    const { rows } = await h.pool.query('select end_reason from sessions where user_id = $1', [rajesh]);
    expect(rows.map((r) => r.end_reason)).toEqual(['deactivated', 'deactivated']);
  });

  it('S7 AC2: a deactivated user signing in gets the wrong-password answer and no session', async () => {
    const sessions = await sessionCount(rajesh);
    const res = await signIn(h, '+91 98410 44444');
    expect({ status: res.status, body: res.body }).toEqual(WRONG_PASSWORD);
    expect(res.token).toBeNull();
    expect(await sessionCount(rajesh)).toBe(sessions);
  });

  it('S7 AC3: the directory still lists him as deactivated and his past entries keep him as actor', async () => {
    const list = await h.asOwner('listUsers', {});
    expect((list.body.items as Array<Record<string, unknown>>).find((u) => u.id === rajesh)).toMatchObject({
      name: 'Rajesh Verma',
      status: 'deactivated',
    });
    const { rows } = await h.pool.query(`select actor_id from audit_entries where kind = 'signed_in' and actor_id = $1`, [rajesh]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('S7 AC4: the owner cannot deactivate himself', async () => {
    const before = await userRow(h, h.ownerId);
    expect(await deactivate(h.ownerId)).toEqual(refused(USER_MESSAGES.shopNeedsOwner));
    expect(await userRow(h, h.ownerId)).toEqual(before);
    expect(await accessEvents(h, h.ownerId)).toEqual([]);
  });

  it('S7 AC5: a staff session is refused', async () => {
    expect(await h.call('deactivateUser', { userId: vijay, version: 1 }, { session: h.session })).toEqual({
      status: 403,
      body: OWNER_ONLY,
    });
  });

  it('S7: an already deactivated user is refused', async () => {
    expect(await deactivate(rajesh)).toEqual(refused(USER_MESSAGES.alreadyDeactivated));
  });

  it('S10 AC1, AC5: deactivating Vijay emits exactly one event with id, reason and time, and no phone or name', async () => {
    expect(await deactivate(vijay)).toEqual({ status: 200, body: { ok: true } });
    const events = await accessEvents(h, vijay);
    expect(events).toEqual([{ userId: vijay, reason: 'deactivated', at: SERVER_NOW.toISOString() }]);
    expect(JSON.stringify(events)).not.toMatch(/Vijay|Kumar|9841077777|98410|77777/);
  });

  it('S10 AC2: a deactivation that fails after the session end rolls the session end and the event back', async () => {
    const nikhil = await newUserWithPassword(h.pool, h.shop, {
      name: 'Nikhil Shah',
      phone: '+91 90030 71188',
      password: PASSWORD,
    });
    const live = await signIn(h, '+91 90030 71188');
    // The audit entry is written after endUserAccess, so failing it proves both share the transaction.
    failAudit.userId = nikhil;
    try {
      expect((await deactivate(nikhil)).status).toBe(500);
    } finally {
      failAudit.userId = null;
    }
    expect(await sessionLive(h, live.token ?? '')).toBe(true);
    expect(await accessEvents(h, nikhil)).toEqual([]);
    const { rows } = await h.pool.query(`select end_reason from sessions where user_id = $1`, [nikhil]);
    expect(rows.map((r) => r.end_reason)).toEqual([null]);
    expect(await userRow(h, nikhil)).toMatchObject({ status: 'active', deactivated_at: null });
  });
  it('S10 AC2: a stale-version deactivation ends no session and emits nothing', async () => {
    const deepak = await newUserWithPassword(h.pool, h.shop, {
      name: 'Deepak Rao',
      phone: '+91 90030 71145',
      password: PASSWORD,
    });
    const live = await signIn(h, '+91 90030 71145');
    const res = await h.asOwner('deactivateUser', { userId: deepak, version: 7 });
    expect(res).toEqual({
      status: 409,
      body: { code: 'conflict', message: 'Someone else changed this user. Reload and try again.' },
    });
    expect(await sessionLive(h, live.token ?? '')).toBe(true);
    expect(await accessEvents(h, deepak)).toEqual([]);
    expect(await userRow(h, deepak)).toMatchObject({ status: 'active', deactivated_at: null });
  });

  it('S8 AC1, AC2: reactivated Rajesh is active again and signs in with his old password to today', async () => {
    const before = await userRow(h, rajesh);
    expect(await reactivate(rajesh)).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, rajesh)).toMatchObject({ status: 'active', deactivated_at: null, version: before.version + 1 });
    const res = await signIn(h, '+91 98410 44444');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ landingRoute: 'today', user: { userId: rajesh } });
  });

  it("S8 AC3: a phone someone else now holds is refused on field phone and the user stays deactivated", async () => {
    await newUser(h.pool, h.shop, { name: 'Arun Pillai', phone: '+91 98410 77777' });
    expect(await reactivate(vijay)).toEqual({
      status: 400,
      body: { code: 'validation', message: USER_MESSAGES.phoneTaken, field: 'phone' },
    });
    expect(await userRow(h, vijay)).toMatchObject({ status: 'deactivated' });
  });

  it('S8 AC4: an active user is refused', async () => {
    expect(await reactivate(rajesh)).toEqual(refused(USER_MESSAGES.alreadyActive));
  });

  it('S8 AC5: a staff session is refused', async () => {
    expect(await h.call('reactivateUser', { userId: vijay, version: 2 }, { session: h.session })).toEqual({
      status: 403,
      body: OWNER_ONLY,
    });
  });

  it('S8: a user deactivated before activating goes back to awaiting activation', async () => {
    const meera = await newUser(h.pool, h.shop, { name: 'Meera Nair', status: 'pending_activation' });
    expect(await deactivate(meera)).toEqual({ status: 200, body: { ok: true } });
    expect(await reactivate(meera)).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, meera)).toMatchObject({ status: 'pending_activation', deactivated_at: null });
  });
});
