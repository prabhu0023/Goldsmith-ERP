/**
 * Update Customer (EP-17-S5): staff change a customer's details, saving with the version they
 * read. The form sends every field, so a text field or date left out is cleared. A stored date
 * whose day and month are unchanged is kept as it is. An edit that changes nothing writes
 * nothing (and no audit entry). Consent is not editable here; the contract refuses `optedIn`.
 */
import { CUSTOMER_MESSAGES, type contract, normaliseCustomerPhone } from '@goldsmith/shared';
import { auditNoChange } from '../audit/audited-operation.js';
import { auditChange } from '../audit/audit-writer.js';
import { StaleWriteError, updateVersioned } from '../db/versioned.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { customerAuditValues } from './customer-audit.js';
import {
  assertDates,
  assertPhoneFree,
  dateToStore,
  loadCustomerForUpdate,
  optionalText,
  withUniquePhone,
} from './customer-store.js';

export const updateCustomer: Handler<typeof contract.updateCustomer> = async (tx, ctx, input) => {
  const name = input.name.trim();
  if (name === '') throw new ValidationError('name', CUSTOMER_MESSAGES.name);
  const phone = normaliseCustomerPhone(input.phone);
  if (phone === null) throw new ValidationError('phone', CUSTOMER_MESSAGES.phone);
  assertDates(input.dob, input.anniversary);
  const customer = await loadCustomerForUpdate(tx, ctx.shop, input.customerId);
  await assertPhoneFree(tx.client, ctx.shop, phone, customer.id);
  const next = {
    name,
    phone,
    city: optionalText(input.city),
    address: optionalText(input.address),
    customer_group: input.group,
    dob: dateToStore(input.dob, customer.dob),
    anniversary: dateToStore(input.anniversary, customer.anniversary),
    notes: optionalText(input.notes),
  };
  const before = customerAuditValues(customer);
  const after = customerAuditValues(next);
  const set: Record<string, unknown> = {};
  for (const column of Object.keys(next) as Array<keyof typeof next>) {
    if (next[column] !== customer[column]) set[column] = next[column];
  }
  if (Object.keys(set).length === 0) {
    if (customer.version !== input.version) throw new StaleWriteError('Customer', customer.code, input.version);
    auditNoChange(tx.client);
    return { ok: true };
  }
  await withUniquePhone(() =>
    updateVersioned(tx.client, ctx.shop, {
      table: 'customers',
      id: customer.id,
      expectedVersion: input.version,
      set,
    }),
  );
  await auditChange(tx, ctx, {
    kind: 'customer_edited',
    entityId: customer.code,
    summary: `Customer ${customer.code} edited`,
    before,
    after,
  });
  return { ok: true };
};
