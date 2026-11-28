/**
 * Create User (EP-05-S4): the owner adds a staff or karigar user, who gets an activation email
 * (EP-04-S10) and sets their own password. Owner only, by the central permission check.
 *   - role owner is refused: the shop has exactly one owner (S9);
 *   - a karigar user needs a karigar record that no live user has yet (S13); staff ignore it;
 *   - the phone must be free among users who are not deactivated;
 *   - the user, its audit entry and the activation link share one transaction, and the
 *     pipeline's idempotency key makes a double tap create one user.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { issueActivationLink } from '../auth/activation.js';
import type { Handler } from '../pipeline/registry.js';
import type { UserHandlerDeps } from './index.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import { emitUserListChanged } from './user-live.js';
import {
  assertKarigarFree,
  assertPhoneFree,
  type KarigarRef,
  lockShopForUsers,
  resolveKarigar,
  withUniqueViolations,
} from './user-store.js';

export function createUserHandler(deps: UserHandlerDeps): Handler<typeof contract.createUser> {
  return async (tx, ctx, input) => {
    await lockShopForUsers(tx, ctx.shop);
    if (input.role === 'owner') throw new DomainError(USER_MESSAGES.shopHasOwner);
    let karigar: KarigarRef | null = null;
    if (input.role === 'karigar') {
      if (!input.karigarId) throw new DomainError(USER_MESSAGES.linkFirst);
      karigar = await resolveKarigar(tx, ctx.shop, input.karigarId);
      await assertKarigarFree(tx, ctx.shop, karigar.id);
    }
    await assertPhoneFree(tx, ctx.shop, input.phone);
    const id = await withUniqueViolations(async () => {
      const { rows } = await tx.client.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role, karigar_id, status, created_at)
         values ($1, $2, $3, $4, $5, $6, 'pending_activation', $7) returning id`,
        [ctx.shop.shopId, input.name, input.phone, input.email, input.role, karigar?.id ?? null, ctx.at],
      );
      return rows[0].id;
    });
    await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
      kind: 'user_added',
      at: ctx.at,
      userId: id,
      summary: `${input.name} added as ${input.role}`,
      after: {
        name: input.name,
        role: input.role,
        phone: input.phone,
        email: input.email,
        ...(karigar ? { karigarId: karigar.code } : {}),
      },
    });
    await issueActivationLink(tx, {
      shopId: ctx.shop.shopId,
      userId: id,
      actor: { kind: 'user', ...ctx.by },
      at: ctx.at,
      mailer: deps.mailer,
      appUrl: deps.appUrl,
      log: deps.log,
    });
    await emitUserListChanged(tx, ctx, id);
    return { ok: true, id };
  };
}
