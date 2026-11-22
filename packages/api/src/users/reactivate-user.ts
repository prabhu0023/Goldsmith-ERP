/**
 * Reactivate User (EP-05-S8): a deactivated user may sign in again with their old account. The
 * phone and the karigar record must still be free. The user becomes active when they have a
 * password, else awaiting activation again, so a link can still be sent. No session is revived.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import {
  assertKarigarFree,
  assertPhoneFree,
  loadUserForUpdate,
  lockShopForUsers,
  withUniqueViolations,
} from './user-store.js';

export const reactivateUser: Handler<typeof contract.reactivateUser> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  if (user.status !== 'deactivated') throw new DomainError(USER_MESSAGES.alreadyActive);
  if (user.phone_e164) await assertPhoneFree(tx, ctx.shop, user.phone_e164, user.id);
  if (user.karigar_id) await assertKarigarFree(tx, ctx.shop, user.karigar_id, user.id);
  const status = user.has_password ? 'active' : 'pending_activation';
  await withUniqueViolations(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'users',
      id: user.id,
      expectedVersion: input.version,
      set: { status, deactivated_at: null },
    }),
  );
  await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'user_reactivated',
    at: ctx.at,
    userId: user.id,
    summary: `${user.name} reactivated`,
    before: { status: 'deactivated' },
    after: { status },
  });
  return { ok: true };
};
