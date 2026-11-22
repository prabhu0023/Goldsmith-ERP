/**
 * End a user's access (EP-05-S10): in the operation's transaction, end every open session
 * (EP-04-S13 Delete All sessions, audited `sessions_ended`) and add one `user.access_changed`
 * outbox row, recorded as the live event "User deactivated or role changed" to that user's
 * channel. Both exist only if the transaction commits; EP-07 delivers the event and then closes
 * the user's live connections. The payload holds ids only: no phone or name.
 */
import type { RoleId } from '@goldsmith/shared';
import { revokeAllSessions } from '../auth/session-store.js';
import { emitLiveEvent } from '../live/emit-live-event.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';

export interface EndAccess {
  userId: string;
  reason: 'deactivated' | 'role_changed';
  /** The new role, for a role change. */
  role?: RoleId;
}

export async function endUserAccess(tx: Tx, ctx: OperationCtx, { userId, reason, role }: EndAccess): Promise<void> {
  await revokeAllSessions(tx.client, {
    shopId: ctx.shop.shopId,
    userId,
    reason,
    actor: { kind: 'user', ...ctx.by },
    at: ctx.at,
  });
  const { rows } = await tx.client.query<{ version: number }>('select version from users where shop_id = $1 and id = $2', [
    ctx.shop.shopId,
    userId,
  ]);
  await emitLiveEvent(tx, ctx.shop, 'user.access_changed', {
    entityId: userId,
    entityVersion: rows[0].version,
    at: ctx.at,
    payload: { userId, reason, ...(role ? { role } : {}), at: ctx.at.toISOString() },
    userId,
  });
}
