/**
 * Create Customer (EP-17-S3, S4, S6): staff add a buyer at the counter. The handler checks, in
 * this order, the name, the phone, both day-and-month pairs and that the dates exist, so the
 * person gets the sentence for the first problem. A phone another active customer holds is
 * refused as a validation error on `phone`; the unique (shop, phone) index decides two adds at
 * the same moment. The customer, the optional opt-in event and the audit entry share one
 * transaction.
 */
import { CUSTOMER_MESSAGES, type contract, normaliseCustomerPhone } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { nextCode } from '../db/codes.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { customerAuditValues } from './customer-audit.js';
import { assertDates, assertPhoneFree, dateToStore, optionalText, withUniquePhone } from './customer-store.js';
import { recordConsentEvent } from './record-consent.js';

export const createCustomer: Handler<typeof contract.createCustomer> = async (tx, ctx, input) => {
  const name = input.name.trim();
  if (name === '') throw new ValidationError('name', CUSTOMER_MESSAGES.name);
  const phone = normaliseCustomerPhone(input.phone);
  if (phone === null) throw new ValidationError('phone', CUSTOMER_MESSAGES.phone);
  assertDates(input.dob, input.anniversary);
  await assertPhoneFree(tx.client, ctx.shop, phone);
  const stored = {
    name,
    phone,
    city: optionalText(input.city),
    address: optionalText(input.address),
    customer_group: input.group,
    dob: dateToStore(input.dob, null),
    anniversary: dateToStore(input.anniversary, null),
    notes: optionalText(input.notes),
  };
  const code = await nextCode(tx.client, ctx.shop, { table: 'customers', prefix: 'CU', pad: 3 });
  const id = await withUniquePhone(async () => {
    const { rows } = await tx.client.query<{ id: string }>(
      `insert into customers
         (shop_id, code, name, phone, city, address, customer_group, dob, anniversary, notes, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        ctx.shop.shopId,
        code,
        stored.name,
        stored.phone,
        stored.city,
        stored.address,
        stored.customer_group,
        stored.dob,
        stored.anniversary,
        stored.notes,
        ctx.at,
        ctx.by.id,
      ],
    );
    return rows[0].id;
  });
  let optedIn = false;
  if (input.optInSource) {
    const outcome = await recordConsentEvent(tx.client, ctx.shop, {
      customerId: id,
      customerCode: code,
      kind: 'opt_in',
      source: input.optInSource,
      actor: { kind: 'user', ...ctx.by },
      at: ctx.at,
      audit: false,
    });
    optedIn = outcome.optedIn;
  }
  await auditChange(tx, ctx, {
    kind: 'customer_added',
    entityId: code,
    summary: `Customer ${code} added`,
    before: null,
    after: { ...customerAuditValues(stored), optedIn },
  });
  return { ok: true, id: code };
};
