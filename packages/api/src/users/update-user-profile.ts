/**
 * Update User profile (EP-05-S5): the owner corrects a user's name, phone or email. A versioned
 * write (a stale version is conflict); the new phone must be free among the other users who are
 * not deactivated. Role and status do not change here, and open sessions stay.
 */
import type { contract } from '@goldsmith/shared';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import { emitUserListChanged } from './user-live.js';
import { assertPhoneFree, loadUserForUpdate, lockShopForUsers, withUniqueViolations } from './user-store.js';

export const updateUserProfile: Handler<typeof contract.updateUserProfile> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  // A deactivated user's number may be held by someone else; reactivation checks it (S8 AC3).
  if (user.status !== 'deactivated') await assertPhoneFree(tx, ctx.shop, input.phone, user.id);
  await withUniqueViolations(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'users',
      id: user.id,
      expectedVersion: input.version,
      set: { name: input.name, phone: input.phone, email: input.email },
    }),
  );
  await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'user_edited',
    at: ctx.at,
    userId: user.id,
    summary: `${input.name}'s details changed`,
    before: { name: user.name, phone: user.phone, email: user.email },
    after: { name: input.name, phone: input.phone, email: input.email },
  });
  await emitUserListChanged(tx, ctx, user.id);
  return { ok: true };
};
