/**
 * List Customers (EP-17-S8): the shop's active customers by name, keyset paged by (name, id).
 * The search is a case-insensitive "contains" on name and city; a search made only of digits and
 * phone punctuation also matches the phone on its digits. Piece count and grams taken home are
 * summed from the history's integer units.
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { decodeTextCursor, encodeTextCursor } from '../users/text-cursor.js';
import type { CustomerGroup } from './customer-store.js';

interface ListRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  city: string | null;
  customer_group: CustomerGroup;
  opted_in: boolean;
  piece_count: number;
  units: number | string;
}

const PHONE_SEARCH = /^[0-9\s+\-().]+$/;

export const listCustomers: Handler<typeof contract.listCustomers> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const after = input.cursor === undefined ? undefined : decodeTextCursor(input.cursor);
  const params: unknown[] = [ctx.shop.shopId];
  const where = ["c.shop_id = $1", "c.status = 'active'"];
  const search = input.search?.trim() ?? '';
  if (search !== '') {
    params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const textMatch = `c.name ilike $${params.length} or c.city ilike $${params.length}`;
    const digits = search.replace(/[^0-9]/g, '');
    if (digits !== '' && PHONE_SEARCH.test(search)) {
      params.push(`%${digits}%`);
      where.push(`(${textMatch} or c.phone like $${params.length})`);
    } else {
      where.push(`(${textMatch})`);
    }
  }
  if (input.group !== undefined) {
    params.push(input.group);
    where.push(`c.customer_group = $${params.length}`);
  }
  if (after) {
    params.push(after[0], after[1]);
    where.push(`(c.name, c.id) > ($${params.length - 1}, $${params.length}::uuid)`);
  }
  params.push(pageSize + 1);
  const { rows } = await tx.client.query<ListRow>(
    `select c.id, c.code, c.name, c.phone, c.city, c.customer_group, c.opted_in,
            h.piece_count, h.units
       from customers c
       left join lateral (
         select count(*)::int as piece_count, coalesce(sum(x.pure_units), 0)::bigint as units
           from customer_history x
          where x.shop_id = c.shop_id and x.customer_id = c.id
       ) h on true
      where ${where.join(' and ')}
      order by c.name, c.id
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeTextCursor([last.name, last.id]) : null;
  const items = page.map((row) => ({
    id: row.code,
    name: row.name,
    phone: row.phone,
    city: row.city,
    group: row.customer_group,
    optedIn: row.opted_in,
    pieceCount: row.piece_count,
    takenHomeG: unitsToGrams(Number(row.units)),
  }));
  return { ok: true, items, nextCursor, pageSize };
};
