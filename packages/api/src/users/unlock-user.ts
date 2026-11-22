/**
 * Unlock User (EP-05-S11 AC6): the owner lets a locked-out user sign in at once (EP-04-S8),
 * audited `account_unlocked` with the owner as actor.
 */
import type { contract } from '@goldsmith/shared';
import { unlockAccount } from '../auth/lockout.js';
import type { Handler } from '../pipeline/registry.js';
import { loadUserForUpdate, lockShopForUsers } from './user-store.js';

export const unlockUser: Handler<typeof contract.unlockUser> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  await unlockAccount(tx.client, { shopId: ctx.shop.shopId, userId: user.id, by: { kind: 'user', ...ctx.by }, at: ctx.at });
  return { ok: true };
};
