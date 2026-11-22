/** One shop has exactly one owner (EP-05-S9). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';
import { auditOf, refused, startUsersHarness, type UsersHarness, userRow } from './user-test-helpers.js';

describeDb('keep exactly one owner (EP-05-S9)', () => {
  let h: UsersHarness;
  let deepak: string;

  beforeAll(async () => {
    h = await startUsersHarness();
    deepak = await newUser(h.pool, h.shop, { name: 'Deepak Rao', phone: '+91 90030 71145' });
  });

  afterAll(async () => {
    await h?.close();
  });

  const liveOwners = async () =>
    (
      await h.pool.query(`select id from users where shop_id = $1 and role = 'owner' and status <> 'deactivated'`, [
        h.shop.shopId,
      ])
    ).rows.map((r) => r.id);

  it('AC1: the owner changing his own role to staff is refused and he stays owner', async () => {
    const before = await userRow(h, h.ownerId);
    const res = await h.asOwner('updateUserRole', { userId: h.ownerId, version: before.version, role: 'staff' });
    expect(res).toEqual(refused(USER_MESSAGES.shopNeedsOwner));
    expect(await userRow(h, h.ownerId)).toEqual(before);
    expect(await auditOf(h, 'role_changed', h.ownerId)).toEqual([]);
  });

  it('AC2: the owner deactivating himself is refused and nothing changes', async () => {
    const before = await userRow(h, h.ownerId);
    const res = await h.asOwner('deactivateUser', { userId: h.ownerId, version: before.version });
    expect(res).toEqual(refused(USER_MESSAGES.shopNeedsOwner));
    expect(await userRow(h, h.ownerId)).toEqual(before);
    expect(await auditOf(h, 'user_deactivated', h.ownerId)).toEqual([]);
  });

  it('AC3: adding an owner or making Deepak owner is refused', async () => {
    const add = await h.asOwner('createUser', {
      name: 'Second Owner',
      phone: '+91 90030 71146',
      email: 'second.owner@example.com',
      role: 'owner',
    });
    expect(add).toEqual(refused(USER_MESSAGES.shopHasOwner));
    const before = await userRow(h, deepak);
    const change = await h.asOwner('updateUserRole', { userId: deepak, version: before.version, role: 'owner' });
    expect(change).toEqual(refused(USER_MESSAGES.shopHasOwner));
    expect(await userRow(h, deepak)).toEqual(before);
    expect(await liveOwners()).toEqual([h.ownerId]);
  });

  it('AC4: two parallel changes to owner are both refused and the shop keeps one owner', async () => {
    const vijay = await newUser(h.pool, h.shop, { name: 'Vijay Kumar', phone: '+91 90030 71147' });
    const results = await Promise.all(
      [deepak, vijay].map(async (userId) =>
        h.asOwner('updateUserRole', { userId, version: (await userRow(h, userId)).version, role: 'owner' }),
      ),
    );
    expect(results).toEqual([refused(USER_MESSAGES.shopHasOwner), refused(USER_MESSAGES.shopHasOwner)]);
    expect(await liveOwners()).toEqual([h.ownerId]);
  });
});
