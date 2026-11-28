/**
 * Audit entries for customer changes (EP-17-S14). Summaries carry the customer code only, never
 * a name or phone. Before and after values go through appendAudit's redaction, so phones are
 * masked; value keys must not contain "code", "token", "link", "password" or "secret". The erase
 * entry names the erased fields and holds no value.
 */
import type { AuditAction } from '@goldsmith/shared';
import type pg from 'pg';
import { type AuditActor, appendAudit } from '../audit/audit-writer.js';
import type { ShopContext } from '../db/shop-context.js';
import type { CustomerRow } from './customer-store.js';

/** The stored fields of a customer as an audit value. */
export function customerAuditValues(row: Pick<CustomerRow, 'name' | 'phone' | 'city' | 'address' | 'customer_group' | 'dob' | 'anniversary' | 'notes'>): Record<string, unknown> {
  return {
    name: row.name,
    phone: row.phone,
    city: row.city,
    address: row.address,
    group: row.customer_group,
    dob: row.dob,
    anniversary: row.anniversary,
    notes: row.notes,
  };
}

export interface ConsentAuditEntry {
  actor: AuditActor;
  at: Date;
  customerCode: string;
  kind: 'opt_in' | 'opt_out';
  source: string;
}

/** `customer_consent_recorded` for an opt-in, `customer_opted_out` for an opt-out. */
export async function writeConsentAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  { actor, at, customerCode, kind, source }: ConsentAuditEntry,
): Promise<void> {
  const optIn = kind === 'opt_in';
  const action: AuditAction = optIn ? 'customer_consent_recorded' : 'customer_opted_out';
  await appendAudit(client, {
    shopId: shop.shopId,
    at,
    actor,
    kind: action,
    entityId: customerCode,
    summary: optIn ? `Customer ${customerCode} opted in (${source})` : `Customer ${customerCode} opted out (${source})`,
    before: { optedIn: !optIn },
    after: { optedIn: optIn, consentSource: source },
  });
}
