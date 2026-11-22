/**
 * Update User role (EP-05-S6): staff to karigar or back. The owner keeps the owner role and no
 * one else gets it (S9). A karigar needs a karigar record (S13), and moving away from karigar
 * clears it. The versioned update, the session end, the `user.access_changed` outbox row
 * (S10) and the audit entry share one transaction.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { endUserAccess } from './end-access.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import {
  assertKarigarFree,
  type KarigarRef,
  loadUserForUpdate,
  lockShopForUsers,
  resolveKarigar,
  withUniqueViolations,
} from './user-store.js';

export const updateUserRole: Handler<typeof contract.updateUserRole> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  if (user.role === 'owner') throw new DomainError(USER_MESSAGES.shopNeedsOwner);
  if (input.role === 'owner') throw new DomainError(USER_MESSAGES.shopHasOwner);
  let karigar: KarigarRef | null = null;
  if (input.role === 'karigar') {
    if (input.karigarId) {
      karigar = await resolveKarigar(tx, ctx.shop, input.karigarId);
      await assertKarigarFree(tx, ctx.shop, karigar.id, user.id);
    } else if (user.karigar_id && user.karigar_code) {
      karigar = { id: user.karigar_id, code: user.karigar_code };
    } else {
      throw new DomainError(USER_MESSAGES.linkFirst);
    }
  }
  await withUniqueViolations(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'users',
      id: user.id,
      expectedVersion: input.version,
      set: { role: input.role, karigar_id: karigar?.id ?? null },
    }),
  );
  await endUserAccess(tx, ctx, { userId: user.id, reason: 'role_changed', role: input.role });
  await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'role_changed',
    at: ctx.at,
    userId: user.id,
    summary: `${user.name}'s role changed from ${user.role} to ${input.role}`,
    before: { role: user.role, karigarId: user.karigar_code },
    after: { role: input.role, karigarId: karigar?.code ?? null },
  });
  return { ok: true };
};
