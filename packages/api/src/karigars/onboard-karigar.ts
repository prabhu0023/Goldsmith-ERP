/**
 * Create Karigar (EP-16-S3): the owner adds a karigar with their phone, email, specialties and
 * wastage allowance. The code comes from the shop's counter (KG-05 after KG-04), the shop from
 * the signed-in user, never from the request. New karigars are active and speak English until
 * a later story stores the language. One `karigar_onboarded` entry in the same transaction.
 */
import { assertWastageBp, type contract, shopDate } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { nextCode } from '../db/codes.js';
import type { Handler } from '../pipeline/registry.js';
import { cleanName, cleanSpecialties, replaceSpecialties, withKarigarUniqueViolations } from './karigar-store.js';

export const onboardKarigar: Handler<typeof contract.onboardKarigar> = async (tx, ctx, input) => {
  const name = cleanName(input.name);
  const specialties = cleanSpecialties(input.specialties);
  assertWastageBp(input.wastageBp);
  const workshopLocation = input.workshopLocation?.trim() || null;
  const code = await nextCode(tx.client, ctx.shop, { table: 'karigars', prefix: 'KG', pad: 2 });
  const { rows } = await withKarigarUniqueViolations(() =>
    tx.client.query<{ id: string }>(
      `insert into karigars (shop_id, code, name, phone, email, workshop_location, wastage_bp, open_since)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ctx.shop.shopId, code, name, input.phone, input.email, workshopLocation, input.wastageBp, shopDate(ctx.at.getTime())],
    ),
  );
  await replaceSpecialties(tx, ctx.shop, rows[0].id, specialties);
  await auditChange(tx, ctx, {
    kind: 'karigar_onboarded',
    entityId: code,
    ref: code,
    summary: `Karigar ${code} ${name} added`,
    before: null,
    after: {
      name,
      phone: input.phone,
      email: input.email,
      workshopLocation,
      specialties,
      wastageBp: input.wastageBp,
      status: 'active',
    },
  });
  return { ok: true, id: code };
};
