/**
 * Shared set-up for the customer operation tests (EP-17-S3 to S14): the production app with the
 * owner Sanjay Seth, the staff member Rajesh Verma (the harness user) and a karigar, plus helpers
 * that add a customer row directly and read back what the operations wrote.
 */
import { newSession, newUser, type Harness, type HarnessOptions } from '../support/api-harness.js';
import { startUsersHarness, type UsersHarness } from '../users/user-test-helpers.js';

export interface CustomersHarness extends UsersHarness {
  /** Vijay Kumar, a karigar user's session. */
  karigar: string;
  /** Call an operation as Rajesh Verma (staff). */
  asStaff(op: string, body: unknown, idempotencyKey?: string): ReturnType<Harness['call']>;
}

export async function startCustomersHarness(options: HarnessOptions = {}): Promise<CustomersHarness> {
  const h = await startUsersHarness(options);
  const karigarUser = await newUser(h.pool, h.shop, { name: 'Vijay Kumar', role: 'karigar' });
  const karigar = await newSession(h.pool, h.shop, karigarUser);
  return Object.assign(h, {
    karigar,
    asStaff: (op: string, body: unknown, idempotencyKey?: string) =>
      h.call(op, body, { session: h.session, idempotencyKey }),
  });
}

export interface CustomerFixture {
  code?: string;
  name: string;
  phone: string | null;
  city?: string | null;
  group?: string;
  optedIn?: boolean;
  status?: 'active' | 'erased';
  dob?: string | null;
  anniversary?: string | null;
  address?: string | null;
  notes?: string | null;
}

let codeSeq = 500;

/** Insert a customer row; returns its uuid and code. */
export async function addCustomer(h: Harness, c: CustomerFixture): Promise<{ id: string; code: string }> {
  const code = c.code ?? `CU-${++codeSeq}`;
  const { rows } = await h.pool.query<{ id: string }>(
    `insert into customers (shop_id, code, name, phone, city, customer_group, opted_in, status, dob, anniversary, address, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [
      h.shop.shopId,
      code,
      c.name,
      c.phone,
      c.city ?? null,
      c.group ?? 'Regular',
      c.optedIn ?? false,
      c.status ?? 'active',
      c.dob ?? null,
      c.anniversary ?? null,
      c.address ?? null,
      c.notes ?? null,
    ],
  );
  return { id: rows[0].id, code };
}

/** Add history rows to a customer: tag, piece name, pure units and date. */
export async function addHistory(
  h: Harness,
  customerId: string,
  rows: Array<{ tag: string; name: string; units: number; on: string }>,
): Promise<void> {
  let position = 0;
  for (const r of rows) {
    await h.pool.query(
      `insert into customer_history (shop_id, customer_id, position, code, name, tag_no, pure_units, on_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [h.shop.shopId, customerId, position, `H-${customerId.slice(0, 4)}-${position}`, r.name, r.tag, r.units, r.on],
    );
    position += 1;
  }
}

export interface CustomerRowView {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  customer_group: string;
  dob: string | null;
  anniversary: string | null;
  notes: string | null;
  opted_in: boolean;
  status: string;
  version: number;
  created_by: string | null;
  created_at: Date;
  budget_inr: string | null;
  spent_inr: string | null;
}

export async function customerRow(h: Harness, code: string): Promise<CustomerRowView | undefined> {
  const { rows } = await h.pool.query<CustomerRowView>(
    `select id, code, name, phone, city, address, customer_group, dob::text as dob, anniversary::text as anniversary,
            notes, opted_in, status, version, created_by, created_at, budget_inr, spent_inr
       from customers where shop_id = $1 and code = $2`,
    [h.shop.shopId, code],
  );
  return rows[0];
}

export async function customerCount(h: Harness): Promise<number> {
  const { rows } = await h.pool.query<{ n: number }>('select count(*)::int as n from customers where shop_id = $1', [h.shop.shopId]);
  return rows[0].n;
}

export async function consentRows(h: Harness, code: string): Promise<Array<Record<string, unknown>>> {
  const { rows } = await h.pool.query(
    `select e.kind, e.source, e.recorded_by, e.at
       from consent_events e join customers c on c.shop_id = e.shop_id and c.id = e.customer_id
      where e.shop_id = $1 and c.code = $2 order by e.at, e.seq`,
    [h.shop.shopId, code],
  );
  return rows;
}

export interface AuditView {
  at: Date;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  summary: string | null;
  detail: string | null;
  reason: string | null;
  reference: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}

/** The audit entries of `kind` about the customer with `code`, oldest first. */
export async function customerAudit(h: Harness, kind: string, code: string): Promise<AuditView[]> {
  const { rows } = await h.pool.query<AuditView>(
    `select at, actor_id, actor_name, actor_role, kind, entity_type, entity_id, summary, detail, reason, reference,
            before_value, after_value
       from audit_entries where shop_id = $1 and kind = $2 and entity_id = $3 order by at, id`,
    [h.shop.shopId, kind, code],
  );
  return rows;
}

export async function auditCount(h: Harness): Promise<number> {
  const { rows } = await h.pool.query<{ n: number }>('select count(*)::int as n from audit_entries where shop_id = $1', [h.shop.shopId]);
  return rows[0].n;
}

/** A full add form for Meera Iyer (S3 AC1). */
export const MEERA = {
  name: 'Meera Iyer',
  phone: '+91 98840 21107',
  city: 'Chennai',
  group: 'VIP Bridal',
  dob: { day: 14, month: 3 },
} as const;
