/** Update User role (EP-05-S6) and the session end on a role change (EP-05-S10 AC3). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { newUserWithPassword, SERVER_NOW } from '../support/api-harness.js';
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
} from './user-test-helpers.js';

describeDb("change a user's role (EP-05-S6, S10 AC3)", () => {
  let h: UsersHarness;
  let deepak: string;
  let kg07: string;

  beforeAll(async () => {
    h = await startUsersHarness();
    kg07 = await addKarigar(h.pool, h.shop, 'KG-07');
    deepak = await newUserWithPassword(h.pool, h.shop, {
      name: 'Deepak Rao',
      phone: '+91 90030 71145',
      email: 'deepak.rao@example.com',
      password: PASSWORD,
    });
  });

  afterAll(async () => {
    await h?.close();
  });

  const endReasons = async (userId: string) =>
    (await h.pool.query('select end_reason from sessions where user_id = $1 order by created_at, id', [userId])).rows.map(
      (r) => r.end_reason,
    );

  it('AC1, AC2, S10 AC3: staff to karigar ends every session, emits one event, and the next sign-in lands on k-jobs', async () => {
    const counter = await signIn(h, '+91 90030 71145');
    const phone = await signIn(h, '+91 90030 71145');
    const before = await userRow(h, deepak);
    const res = await h.asOwner('updateUserRole', { userId: deepak, version: before.version, role: 'karigar', karigarId: 'KG-07' });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, deepak)).toMatchObject({ role: 'karigar', karigar_id: kg07, version: before.version + 1 });
    for (const token of [counter.token, phone.token]) {
      expect(await sessionLive(h, token ?? '')).toBe(false);
      expect(await h.call('listMyJobs', {}, { session: token ?? '' })).toEqual(UNAUTHENTICATED);
    }
    expect(await endReasons(deepak)).toEqual(['role_changed', 'role_changed']);
    const events = await accessEvents(h, deepak);
    expect(events).toEqual([{ userId: deepak, reason: 'role_changed', role: 'karigar', at: SERVER_NOW.toISOString() }]);
    expect(JSON.stringify(events)).not.toMatch(/Deepak|9003071145|90030/);
    const again = await signIn(h, '+91 90030 71145');
    expect(again.body).toMatchObject({ landingRoute: 'k-jobs', user: { role: 'karigar' } });
  });

  it('karigar back to staff clears the karigar record', async () => {
    const { version } = await userRow(h, deepak);
    expect(await h.asOwner('updateUserRole', { userId: deepak, version, role: 'staff' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await userRow(h, deepak)).toMatchObject({ role: 'staff', karigar_id: null });
    expect(await accessEvents(h, deepak)).toHaveLength(2);
  });

  it('AC3: staff to karigar without a karigar record is refused and changes nothing', async () => {
    const before = await userRow(h, deepak);
    const res = await h.asOwner('updateUserRole', { userId: deepak, version: before.version, role: 'karigar' });
    expect(res).toEqual(refused(USER_MESSAGES.linkFirst));
    expect(await userRow(h, deepak)).toEqual(before);
    expect(await accessEvents(h, deepak)).toHaveLength(2);
  });

  it('AC4: a staff session is refused with the owner-only sentence', async () => {
    const { version } = await userRow(h, deepak);
    const res = await h.call('updateUserRole', { userId: deepak, version, role: 'karigar', karigarId: 'KG-07' }, { session: h.session });
    expect(res).toEqual({ status: 403, body: OWNER_ONLY });
  });

  it('AC5: no one becomes owner, and the owner keeps the role', async () => {
    const { version } = await userRow(h, deepak);
    expect(await h.asOwner('updateUserRole', { userId: deepak, version, role: 'owner' })).toEqual(
      refused(USER_MESSAGES.shopHasOwner),
    );
    const owner = await userRow(h, h.ownerId);
    expect(await h.asOwner('updateUserRole', { userId: h.ownerId, version: owner.version, role: 'staff' })).toEqual(
      refused(USER_MESSAGES.shopNeedsOwner),
    );
    expect(await userRow(h, h.ownerId)).toEqual(owner);
  });

  it('a stale version is a conflict and leaves the sessions live', async () => {
    const live = await signIn(h, '+91 90030 71145');
    const { version } = await userRow(h, deepak);
    const res = await h.asOwner('updateUserRole', { userId: deepak, version: version - 1, role: 'karigar', karigarId: 'KG-07' });
    expect(res.status).toBe(409);
    expect(await sessionLive(h, live.token ?? '')).toBe(true);
    expect(await accessEvents(h, deepak)).toHaveLength(2);
  });
});
