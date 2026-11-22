/**
 * Link Karigar (EP-05-S13): point a karigar user at one karigar record, such as KG-04, so they
 * see exactly that record's jobs (S3). One record has at most one live user. Versioned.
 */
import { type contract, DomainError, USER_MESSAGES } from '@goldsmith/shared';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { writeUserLifecycleAudit } from './user-audit.js';
import {
  assertKarigarFree,
  loadUserForUpdate,
  lockShopForUsers,
  resolveKarigar,
  withUniqueViolations,
} from './user-store.js';

export const linkKarigar: Handler<typeof contract.linkKarigar> = async (tx, ctx, input) => {
  await lockShopForUsers(tx, ctx.shop);
  const user = await loadUserForUpdate(tx, ctx.shop, input.userId);
  if (user.role !== 'karigar') throw new DomainError(USER_MESSAGES.onlyKarigarLinks);
  const karigar = await resolveKarigar(tx, ctx.shop, input.karigarId);
  if (user.status !== 'deactivated') await assertKarigarFree(tx, ctx.shop, karigar.id, user.id);
  await withUniqueViolations(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'users',
      id: user.id,
      expectedVersion: input.version,
      set: { karigar_id: karigar.id },
    }),
  );
  await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
    kind: 'karigar_linked',
    at: ctx.at,
    userId: user.id,
    summary: `${user.name} linked to karigar ${karigar.code}`,
    before: { karigarId: user.karigar_code },
    after: { karigarId: karigar.code },
  });
  return { ok: true };
};
