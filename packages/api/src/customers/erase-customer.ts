/**
 * Erase Customer personal data (EP-17-S13): for an approved deletion request the owner clears the
 * name (it reads "Erased customer"), phone, address, birthday and anniversary, sets the status
 * `erased` and the consent copy to false. City and notes stay (no rule asks for them to go). The
 * record is never deleted, so its piece history and consent events stay linked. The audit entry
 * names the erased fields and the request reference; it holds no value (G22).
 */
import { CUSTOMER_MESSAGES, type contract, ERASED_CUSTOMER_NAME } from '@goldsmith/shared';
import { appendAudit } from '../audit/audit-writer.js';
import { updateVersioned } from '../db/versioned.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { loadCustomerForUpdate } from './customer-store.js';

const ERASED_FIELDS = ['name', 'phone', 'address', 'dob', 'anniversary'] as const;

export const eraseCustomer: Handler<typeof contract.eraseCustomer> = async (tx, ctx, input) => {
  if (input.deletionRequestRef === '') throw new ValidationError('deletionRequestRef', CUSTOMER_MESSAGES.deletionRequestRef);
  if (input.reason === '') throw new ValidationError('reason', CUSTOMER_MESSAGES.deletionReason);
  const customer = await loadCustomerForUpdate(tx, ctx.shop, input.customerId);
  await updateVersioned(tx.client, ctx.shop, {
    table: 'customers',
    id: customer.id,
    expectedVersion: input.version,
    set: {
      name: ERASED_CUSTOMER_NAME,
      phone: null,
      address: null,
      dob: null,
      anniversary: null,
      status: 'erased',
      opted_in: false,
    },
  });
  await appendAudit(tx.client, {
    shopId: ctx.shop.shopId,
    at: ctx.at,
    actor: { kind: 'user', ...ctx.by },
    kind: 'customer_erased',
    entityId: customer.code,
    summary: `Customer ${customer.code} erased`,
    detail: JSON.stringify({ erasedFields: ERASED_FIELDS, deletionRequestRef: input.deletionRequestRef }),
    reason: input.reason,
    ref: input.deletionRequestRef,
  });
  return { ok: true };
};
