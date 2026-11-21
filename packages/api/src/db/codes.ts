/**
 * Human-readable codes (EP-03-S7): `<prefix>-<number>`, e.g. LD-2026-214. The number comes from
 * an atomic upsert on code_counters (migration 0013), so parallel creates get distinct codes; a
 * prefix used for the first time continues after the highest existing code in `table`.
 */
import type pg from 'pg';
import { assertIdentifier, type ShopContext } from './shop-context.js';

type Queryable = pg.Pool | pg.PoolClient;

export interface NextCodeOptions {
  /** The table whose `code` column holds codes with this prefix. */
  table: string;
  /** e.g. 'LD-2026'; the code is `${prefix}-${number}`. */
  prefix: string;
  /** Minimum digits of the number (zero-padded). */
  pad?: number;
}

export async function nextCode(client: Queryable, ctx: ShopContext, { table, prefix, pad = 3 }: NextCodeOptions): Promise<string> {
  assertIdentifier(table);
  const { rows } = await client.query<{ last_value: number }>(
    `insert into code_counters (shop_id, prefix, last_value)
     values ($1, $2, (
       select coalesce(max(substring(code from length($2) + 2)::int), 0) + 1
         from ${table}
        where shop_id = $1
          and left(code, length($2) + 1) = $2 || '-'
          and substring(code from length($2) + 2) ~ '^[0-9]+$'
     ))
     on conflict (shop_id, prefix) do update set last_value = code_counters.last_value + 1
     returning last_value`,
    [ctx.shopId, prefix],
  );
  return `${prefix}-${String(rows[0].last_value).padStart(pad, '0')}`;
}
