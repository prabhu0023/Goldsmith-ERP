/**
 * Deactivate User (EP-05-S7): the user can no longer sign in and every open session ends at
 * once (S10). The row is never deleted, so past entries keep their actor. The owner cannot be
 * deactivated (S9). The versioned update, the session end, the `user.access_changed` outbox row
 * and the audit entry share one transaction.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { endUserAccess } from './end-access.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import { emitUserListChanged } from './user-live.js';
import { loadUserForUpdate, lockShopForUsers } from './user-store.js';

export const deactivateUser: Handler<typeof contract.deactivateUser> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  if (user.role === 'owner') throw new DomainError(USER_MESSAGES.shopNeedsOwner);
  if (user.status === 'deactivated') throw new DomainError(USER_MESSAGES.alreadyDeactivated);
  await updateVersioned(tx.client, ctx.shop, {
    table: 'users',
    id: user.id,
    expectedVersion: input.version,
    set: { status: 'deactivated', deactivated_at: ctx.at },
  });
  await endUserAccess(tx, ctx, { userId: user.id, reason: 'deactivated' });
  await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'user_deactivated',
    at: ctx.at,
    userId: user.id,
    summary: `${user.name} deactivated`,
    before: { status: user.status },
    after: { status: 'deactivated' },
    reason: input.reason || undefined,
  });
  await emitUserListChanged(tx, ctx, user.id);
  return { ok: true };
};
