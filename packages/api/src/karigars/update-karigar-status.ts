/**
 * Update Karigar status (EP-16-S7): deactivate or reactivate a karigar. Deactivation is refused
 * while the karigar has an open job (naming every job), under a lock on the karigar row that
 * assertKarigarActive shares, so a deactivation and a new job for the same karigar cannot both
 * succeed. It also deactivates the linked user and ends their sessions in the same transaction.
 * Reactivation leaves that user deactivated: the owner reactivates the account separately.
 * The record is never deleted.
 */
import { type contract, DomainError, KARIGAR_MESSAGES, openJobsMessage } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { updateVersioned } from '../db/versioned.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { Handler } from '../pipeline/registry.js';
import { endUserAccess } from '../users/end-access.js';
import { writeUserLifecycleAudit } from '../users/user-audit.js';
import { emitUserListChanged } from '../users/user-live.js';
import { loadUserForUpdate, lockShopForUsers } from '../users/user-store.js';
import { assertVersion, findLiveLinkedUserId, loadKarigarForUpdate } from './karigar-store.js';

async function openJobCodes(tx: Tx, shopId: string, karigarId: string): Promise<string[]> {
  const { rows } = await tx.client.query<{ code: string }>(
    `select code from karigar_jobs where shop_id = $1 and karigar_id = $2 and status <> 'handed_over' order by code`,
    [shopId, karigarId],
  );
  return rows.map((r) => r.code);
}

export const updateKarigarStatus: Handler<typeof contract.updateKarigarStatus> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const karigar = await loadKarigarForUpdate(tx, ctx.shop, input.karigarId);
  assertVersion(karigar, input.version);
  if (karigar.status === input.status) {
    throw new DomainError(input.status === 'active' ? KARIGAR_MESSAGES.alreadyActive : KARIGAR_MESSAGES.alreadyDeactivated);
  }
  const deactivating = input.status === 'deactivated';
  if (deactivating) {
    const jobs = await openJobCodes(tx, ctx.shop.shopId, karigar.id);
    if (jobs.length > 0) throw new DomainError(openJobsMessage(karigar.code, jobs));
  }
  await updateVersioned(tx.client, ctx.shop, {
    table: 'karigars',
    id: karigar.id,
    expectedVersion: input.version,
    set: { status: input.status, deactivated_at: deactivating ? ctx.at : null },
  });
  if (deactivating) {
    const userId = await findLiveLinkedUserId(tx, ctx.shop, karigar.id);
    if (userId) {
      const user = await loadUserForUpdate(tx, ctx.shop, userId);
      await updateVersioned(tx.client, ctx.shop, {
        table: 'users',
        id: user.id,
        expectedVersion: user.version,
        set: { status: 'deactivated', deactivated_at: ctx.at },
      });
      await endUserAccess(tx, ctx, { userId: user.id, reason: 'deactivated' });
      await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
        kind: 'user_deactivated',
        at: ctx.at,
        userId: user.id,
        summary: `${user.name} deactivated with karigar ${karigar.code}`,
        before: { status: user.status },
        after: { status: 'deactivated' },
        reason: input.reason || undefined,
      });
      await emitUserListChanged(tx, ctx, user.id);
    }
  }
  await auditChange(tx, ctx, {
    kind: deactivating ? 'karigar_deactivated' : 'karigar_reactivated',
    entityId: karigar.code,
    ref: karigar.code,
    summary: `Karigar ${karigar.code} ${deactivating ? 'deactivated' : 'reactivated'}`,
    reason: input.reason || null,
    before: { status: karigar.status },
    after: { status: input.status },
  });
  return { ok: true };
};
