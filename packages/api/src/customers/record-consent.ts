/**
 * Consent (EP-17-S2, S6, S7). `recordConsentEvent` is the one place that writes a consent event
 * and the `customers.opted_in` copy, in the caller's transaction: Create Customer, the Record
 * Consent operation and the later WhatsApp STOP handler (EP-12) all call it. Recording the state
 * the customer is already in writes nothing.
 */
import type { contract, ConsentKind, ConsentSource } from '@goldsmith/shared';
import type pg from 'pg';
import { auditNoChange } from '../audit/audited-operation.js';
import type { AuditActor } from '../audit/audit-writer.js';
import type { ShopContext } from '../db/shop-context.js';
import type { Handler } from '../pipeline/registry.js';
import { writeConsentAudit } from './customer-audit.js';
import { loadCustomerForUpdate } from './customer-store.js';

export interface ConsentEventInput {
  /** The customer's uuid, already locked by the caller (or just inserted). */
  customerId: string;
  customerCode: string;
  kind: ConsentKind;
  source: ConsentSource;
  /** A signed-in user, or System for the WhatsApp reply handler and the import. */
  actor: AuditActor;
  at: Date;
  /** Write the audit entry (default). Create Customer passes false: its own entry holds the consent. */
  audit?: boolean;
}

export interface ConsentOutcome {
  optedIn: boolean;
  /** False when the customer was already in that state and nothing was written. */
  recorded: boolean;
}

export async function recordConsentEvent(
  client: pg.PoolClient,
  shop: ShopContext,
  { customerId, customerCode, kind, source, actor, at, audit = true }: ConsentEventInput,
): Promise<ConsentOutcome> {
  const wantOptedIn = kind === 'opt_in';
  const { rows } = await client.query<{ opted_in: boolean }>(
    'select opted_in from customers where shop_id = $1 and id = $2',
    [shop.shopId, customerId],
  );
  const current = rows[0]?.opted_in ?? false;
  if (current === wantOptedIn) return { optedIn: current, recorded: false };
  await client.query(
    `insert into consent_events (shop_id, customer_id, kind, source, recorded_by, at)
     values ($1, $2, $3, $4, $5, $6)`,
    [shop.shopId, customerId, kind, source, actor.kind === 'user' ? actor.id : null, at],
  );
  await client.query('update customers set opted_in = $3 where shop_id = $1 and id = $2', [
    shop.shopId,
    customerId,
    wantOptedIn,
  ]);
  if (audit) await writeConsentAudit(client, shop, { actor, at, customerCode, kind, source });
  return { optedIn: wantOptedIn, recorded: true };
}

export const recordConsent: Handler<typeof contract.recordConsent> = async (tx, ctx, input) => {
  const customer = await loadCustomerForUpdate(tx, ctx.shop, input.customerId);
  const outcome = await recordConsentEvent(tx.client, ctx.shop, {
    customerId: customer.id,
    customerCode: customer.code,
    kind: input.kind,
    source: input.source,
    actor: { kind: 'user', ...ctx.by },
    at: ctx.at,
  });
  if (!outcome.recorded) auditNoChange(tx.client);
  return { ok: true, ...outcome };
};
