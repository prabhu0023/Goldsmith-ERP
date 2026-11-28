/**
 * The live event for the owner's user list (EP-08): every user write adds one `user.list_changed`
 * outbox row in its own transaction, so a second owner's directory refetches within about a
 * second. The row exists only if the write commits. The event carries the user's id and version,
 * no phone, name or email. It goes to the owner channel; the user's own account events stay
 * `user.access_changed`.
 */
import { emitLiveEvent } from '../live/emit-live-event.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';

export async function emitUserListChanged(tx: Tx, ctx: OperationCtx, userId: string): Promise<void> {
  const { rows } = await tx.client.query<{ version: number }>('select version from users where shop_id = $1 and id = $2', [
    ctx.shop.shopId,
    userId,
  ]);
  await emitLiveEvent(tx, ctx.shop, 'user.list_changed', {
    entityId: userId,
    entityVersion: rows[0].version,
    at: ctx.at,
  });
}
