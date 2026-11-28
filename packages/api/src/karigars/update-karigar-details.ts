/**
 * Update Karigar details (EP-16-S4): name, phone, email, workshop location and specialties,
 * saved with the version the owner read. The allowance and status are not here (the contract
 * refuses those keys). A live linked user gets the new phone and email in the same transaction,
 * under the EP-05 phone rule, so the new number is their portal login. A deactivated karigar can
 * still be edited. Saving what is stored changes nothing and writes no entry.
 */
import type { contract } from '@goldsmith/shared';
import { auditChange, changedFields } from '../audit/audit-writer.js';
import { auditNoChange } from '../audit/audited-operation.js';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { writeUserLifecycleAudit } from '../users/user-audit.js';
import { emitUserListChanged } from '../users/user-live.js';
import { assertPhoneFree, loadUserForUpdate, lockShopForUsers, withUniqueViolations } from '../users/user-store.js';
import {
  assertVersion,
  cleanName,
  cleanSpecialties,
  findLiveLinkedUserId,
  loadKarigarForUpdate,
  readSpecialties,
  replaceSpecialties,
  withKarigarUniqueViolations,
} from './karigar-store.js';

export const updateKarigarDetails: Handler<typeof contract.updateKarigarDetails> = async (tx, ctx, input) => {
  const name = cleanName(input.name);
  const specialties = cleanSpecialties(input.specialties);
  const workshopLocation = input.workshopLocation?.trim() || null;
  await lockShopForUsers(tx, ctx.shop);
  const karigar = await loadKarigarForUpdate(tx, ctx.shop, input.karigarId);
  assertVersion(karigar, input.version);
  const before = {
    name: karigar.name,
    phone: karigar.phone,
    email: karigar.email,
    workshopLocation: karigar.workshop_location,
    specialties: await readSpecialties(tx.client, karigar.id),
  };
  const after = { name, phone: input.phone, email: input.email, workshopLocation, specialties };
  if (Object.keys(changedFields(before, after).after ?? {}).length === 0) {
    auditNoChange(tx.client);
    return { ok: true };
  }
  const userId = await findLiveLinkedUserId(tx, ctx.shop, karigar.id);
  const user = userId ? await loadUserForUpdate(tx, ctx.shop, userId) : null;
  if (user && input.phone !== user.phone_e164) await assertPhoneFree(tx, ctx.shop, input.phone, user.id);
  await withKarigarUniqueViolations(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'karigars',
      id: karigar.id,
      expectedVersion: input.version,
      set: { name, phone: input.phone, email: input.email, workshop_location: workshopLocation },
    }),
  );
  await replaceSpecialties(tx, ctx.shop, karigar.id, specialties);
  if (user && (user.phone_e164 !== input.phone || user.email !== input.email)) {
    await withUniqueViolations(() =>
      updateVersioned(tx.client, ctx.shop, {
        table: 'users',
        id: user.id,
        expectedVersion: user.version,
        set: { phone: input.phone, email: input.email },
      }),
    );
    await writeUserLifecycleAudit(tx.client, ctx.shop, ctx.by, {
      kind: 'user_edited',
      at: ctx.at,
      userId: user.id,
      summary: `${user.name}'s details changed with karigar ${karigar.code}`,
      before: { phone: user.phone, email: user.email },
      after: { phone: input.phone, email: input.email },
    });
    await emitUserListChanged(tx, ctx, user.id);
  }
  await auditChange(tx, ctx, {
    kind: 'karigar_edited',
    entityId: karigar.code,
    ref: karigar.code,
    summary: `Karigar ${karigar.code} ${name} edited`,
    before,
    after,
  });
  return { ok: true };
};
