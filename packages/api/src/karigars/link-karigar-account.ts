/**
 * Link Karigar Account (EP-16-S6): give a karigar portal access from the karigar's own record.
 * With `userId`, an existing karigar user whose phone is the karigar's phone is linked to the
 * record. Without it, a karigar user is created from the record (name, phone, email,
 * `pending_activation`) and mailed an activation link, as Create User does. Refused: a
 * deactivated karigar, a karigar a live user is already linked to, a user who is not a karigar
 * user, a user with another phone number. One `karigar_linked` entry on the karigar record,
 * plus `user_added` and `activation_link_sent` for a created user, in one transaction.
 */
import { type contract, DomainError, KARIGAR_MESSAGES, USER_MESSAGES } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { auditNoChange } from '../audit/audited-operation.js';
import { issueActivationLink } from '../auth/activation.js';
import { updateVersioned } from '../db/versioned.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import type { UserHandlerDeps } from '../users/index.js';
import { writeUserLifecycleAudit } from '../users/user-audit.js';
import { emitUserListChanged } from '../users/user-live.js';
import {
  assertKarigarFree,
  assertPhoneFree,
  loadUserForUpdate,
  lockShopForUsers,
  withUniqueViolations,
} from '../users/user-store.js';
import { loadKarigarForUpdate } from './karigar-store.js';
export function createLinkKarigarAccount(deps: UserHandlerDeps): Handler<typeof contract.linkKarigarAccount> {
  return async (tx, ctx, input) => {
    await lockShopForUsers(tx, ctx.shop);
    const karigar = await loadKarigarForUpdate(tx, ctx.shop, input.karigarId);
    if (karigar.status === 'deactivated') throw new DomainError(KARIGAR_MESSAGES.deactivatedLoginFirst);
    let userId: string;
    if (input.userId) {
      const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
      if (user.role !== 'karigar') throw new DomainError(USER_MESSAGES.onlyKarigarLinks);
      if (user.karigar_id === karigar.id && user.status !== 'deactivated') {
        auditNoChange(tx.client);
        return { ok: true };
      }
      await assertKarigarFree(tx, ctx.shop, karigar.id, user.id);
      if (karigar.phone === null || user.phone_e164 !== karigar.phone) {
        throw new ValidationError('userId', KARIGAR_MESSAGES.userPhoneDiffers);
      }
      await withUniqueViolations(() =>
        updateVersioned(tx.client, ctx.shop, {
          table: 'users',
          id: user.id,
          expectedVersion: user.version,
          set: { karigar_id: karigar.id },
        }),
      );
      userId = user.id;
    } else {
      await assertKarigarFree(tx, ctx.shop, karigar.id);
      if (karigar.phone === null) throw new ValidationError('karigarId', KARIGAR_MESSAGES.phoneMissing);
      await assertPhoneFree(tx, ctx.shop, karigar.phone);
      const phone = karigar.phone;
      userId = await withUniqueViolations(async () => {
        const { rows } = await tx.client.query<{ id: string }>(
          `insert into users (shop_id, name, phone, email, role, karigar_id, status, created_at)
           values ($1, $2, $3, $4, 'karigar', $5, 'pending_activation', $6) returning id`,
          [ctx.shop.shopId, karigar.name, phone, karigar.email, karigar.id, ctx.at],
        );
        return rows[0].id;
      });
      await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
        kind: 'user_added',
        at: ctx.at,
        userId,
        summary: `${karigar.name} added as karigar`,
        after: { name: karigar.name, role: 'karigar', phone, email: karigar.email, karigarId: karigar.code },
      });
      await issueActivationLink(tx, {
        shopId: ctx.shop.shopId,
        userId,
        actor: { kind: 'user', ...ctx.by },
        at: ctx.at,
        mailer: deps.mailer,
        appUrl: deps.appUrl,
        log: deps.log,
      });
    }
    await auditChange(tx, ctx, {
      kind: 'karigar_linked',
      entityType: 'karigar',
      entityId: karigar.code,
      ref: karigar.code,
      summary: `Karigar ${karigar.code} ${karigar.name} given portal access`,
      before: { userId: null },
      after: { userId },
    });
    await emitUserListChanged(tx, ctx, userId);
    return { ok: true };
  };
}
