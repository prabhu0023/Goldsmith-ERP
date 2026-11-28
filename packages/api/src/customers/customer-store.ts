/**
 * Reads, checks and guards shared by the customer operations (EP-17). Customer ids cross the API
 * as codes ("CU-009"); the uuid stays inside the server. Dates are read as text ("2000-03-14") so
 * no time zone can move them. Every query is scoped by the shop.
 */
import {
  CUSTOMER_MESSAGES,
  dateTextToDayMonth,
  dayMonthProblem,
  dayMonthToDateText,
  normaliseCustomerPhone,
} from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';

type Queryable = pg.Pool | pg.PoolClient;

export type CustomerGroup = 'VIP Bridal' | 'High net worth' | 'Regular' | 'Wholesale';

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  customer_group: CustomerGroup;
  /** "YYYY-MM-DD" text, or null. */
  dob: string | null;
  anniversary: string | null;
  notes: string | null;
  opted_in: boolean;
  status: 'active' | 'erased';
  version: number;
}

const CUSTOMER_COLUMNS = `c.id, c.code, c.name, c.phone, c.city, c.address, c.customer_group,
  c.dob::text as dob, c.anniversary::text as anniversary, c.notes, c.opted_in, c.status, c.version`;

/** The active customer with this code, locked for this transaction; a miss, an erased one or another shop's is not_found. */
export async function loadCustomerForUpdate(tx: Tx, shop: ShopContext, code: string): Promise<CustomerRow> {
  const { rows } = await tx.client.query<CustomerRow>(
    `select ${CUSTOMER_COLUMNS} from customers c
      where c.shop_id = $1 and c.code = $2 and c.status = 'active'
      for no key update of c`,
    [shop.shopId, code],
  );
  if (!rows[0]) throw new NotFoundError('Customer', code);
  return rows[0];
}

/** The active customer with this code; a miss, an erased one or another shop's is not_found. */
export async function loadActiveCustomer(client: Queryable, shop: ShopContext, code: string): Promise<CustomerRow> {
  const { rows } = await client.query<CustomerRow>(
    `select ${CUSTOMER_COLUMNS} from customers c where c.shop_id = $1 and c.code = $2 and c.status = 'active'`,
    [shop.shopId, code],
  );
  if (!rows[0]) throw new NotFoundError('Customer', code);
  return rows[0];
}

export interface CustomerMatch {
  id: string;
  name: string;
  city: string | null;
  group: CustomerGroup;
}

/**
 * The one active customer who holds `phone` (any typing of it), or null, also when the phone has
 * fewer than 10 digits. Read only. Server code (EP-28, EP-29) calls this directly.
 */
export async function findCustomerByPhone(
  client: Queryable,
  shop: ShopContext,
  phone: string,
): Promise<CustomerMatch | null> {
  const normalised = normaliseCustomerPhone(phone);
  if (normalised === null) return null;
  const { rows } = await client.query<{ code: string; name: string; city: string | null; customer_group: CustomerGroup }>(
    `select code, name, city, customer_group from customers
      where shop_id = $1 and phone = $2 and status = 'active' limit 1`,
    [shop.shopId, normalised],
  );
  const row = rows[0];
  return row ? { id: row.code, name: row.name, city: row.city, group: row.customer_group } : null;
}

/** Refuse a phone another active customer holds. */
export async function assertPhoneFree(
  client: Queryable,
  shop: ShopContext,
  phone: string,
  excludeCustomerId?: string,
): Promise<void> {
  const { rows } = await client.query(
    `select 1 from customers
      where shop_id = $1 and phone = $2 and status = 'active' and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [shop.shopId, phone, excludeCustomerId ?? null],
  );
  if (rows.length > 0) throw new ValidationError('phone', CUSTOMER_MESSAGES.duplicatePhone);
}

/** Run `fn`, answering a unique violation of the (shop, phone) rule with the duplicate-phone sentence. */
export async function withUniquePhone<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
    if (code === '23505' && constraint === 'customers_shop_id_phone_key') {
      throw new ValidationError('phone', CUSTOMER_MESSAGES.duplicatePhone);
    }
    throw err;
  }
}

export interface DayMonthInput {
  day?: number | null;
  month?: number | null;
}

/**
 * Refuse a birthday or anniversary that is half given, or not a real date. The pair sentences
 * come first (birthday, then anniversary), then the "not a real date" ones.
 */
export function assertDates(dob: DayMonthInput | null | undefined, anniversary: DayMonthInput | null | undefined): void {
  const checks = [
    { field: 'dob', problem: dayMonthProblem('birthday', dob?.day, dob?.month) },
    { field: 'anniversary', problem: dayMonthProblem('anniversary', anniversary?.day, anniversary?.month) },
  ];
  const pairs: string[] = [CUSTOMER_MESSAGES.birthdayPair, CUSTOMER_MESSAGES.anniversaryPair];
  for (const check of checks) {
    if (check.problem !== null && pairs.includes(check.problem)) throw new ValidationError(check.field, check.problem);
  }
  for (const check of checks) {
    if (check.problem !== null) throw new ValidationError(check.field, check.problem);
  }
}

/**
 * The text to store for a typed day and month. When they equal the stored date's day and month,
 * the stored date is kept as it is (it may carry a real year).
 */
export function dateToStore(input: DayMonthInput | null | undefined, stored: string | null): string | null {
  if (!input || input.day == null || input.month == null) return null;
  const was = dateTextToDayMonth(stored);
  if (stored !== null && was && was.day === input.day && was.month === input.month) return stored;
  return dayMonthToDateText(input.day, input.month);
}

/** A typed optional text, trimmed; empty is null. */
export function optionalText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
