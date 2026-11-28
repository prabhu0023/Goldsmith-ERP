/**
 * Update Karigar wastage (EP-16-S5): the owner changes a karigar's allowance, 60 to 120 whole
 * basis points. A separate operation so the change is deliberate and always records the old and
 * new value, with the owner's reason when given. The same value changes nothing and writes no entry.
 */
import { assertWastageBp, type contract } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { auditNoChange } from '../audit/audited-operation.js';
import { updateVersioned } from '../db/versioned.js';
import type { Handler } from '../pipeline/registry.js';
import { assertVersion, loadKarigarForUpdate } from './karigar-store.js';

export const updateKarigarWastage: Handler<typeof contract.updateKarigarWastage> = async (tx, ctx, input) => {
  assertWastageBp(input.wastageBp);
  const karigar = await loadKarigarForUpdate(tx, ctx.shop, input.karigarId);
  assertVersion(karigar, input.version);
  if (karigar.wastage_bp === input.wastageBp) {
    auditNoChange(tx.client);
    return { ok: true };
  }
  await updateVersioned(tx.client, ctx.shop, {
    table: 'karigars',
    id: karigar.id,
    expectedVersion: input.version,
    set: { wastage_bp: input.wastageBp },
  });
  await auditChange(tx, ctx, {
    kind: 'karigar_wastage_changed',
    entityId: karigar.code,
    ref: karigar.code,
    summary: `Karigar ${karigar.code} wastage allowance changed`,
    reason: input.reason || null,
    before: { wastageBp: karigar.wastage_bp },
    after: { wastageBp: input.wastageBp },
  });
  return { ok: true };
};
