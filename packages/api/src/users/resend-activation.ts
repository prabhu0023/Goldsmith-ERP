/**
 * Resend activation (EP-05-S4 AC6): a new activation link for a user who has not activated
 * yet; issuing it replaces the earlier link (EP-04-S10). Any other user is refused.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { issueActivationLink } from '../auth/activation.js';
import type { Handler } from '../pipeline/registry.js';
import type { UserHandlerDeps } from './index.js';
import { loadUserForUpdate, lockShopForUsers } from './user-store.js';

export function resendActivationHandler(deps: UserHandlerDeps): Handler<typeof contract.resendActivation> {
  return async (tx, ctx, input) => {
    await lockShopForUsers(tx, ctx.shop);
    const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
    if (user.status !== 'pending_activation') throw new DomainError(USER_MESSAGES.notPending);
    await issueActivationLink(tx, {
      shopId: ctx.shop.shopId,
      userId: user.id,
      actor: { kind: 'user', ...ctx.by },
      at: ctx.at,
      mailer: deps.mailer,
      appUrl: deps.appUrl,
      log: deps.log,
    });
    return { ok: true };
  };
}
