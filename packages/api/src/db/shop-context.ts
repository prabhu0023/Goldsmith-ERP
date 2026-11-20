/**
 * Shop scoping (D7, EP-02-S14). The server sets shop_id, and location_id on gold records, from
 * the signed-in user's shop; values a caller passes for either are ignored.
 */
import type pg from 'pg';

export interface ShopContext {
  shopId: string;
  /** The shop's one location ("Main shop" in v1). */
  locationId: string;
}

type Queryable = pg.Pool | pg.PoolClient;

/** Tables of gold records: they carry location_id as well as shop_id. */
export const LOCATION_TABLES: readonly string[] = ['scales', 'pieces', 'parcels', 'parcel_weighings', 'pool_entries'];

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

export function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`Invalid table or column name: ${JSON.stringify(name)}`);
}

/** Reads the shop's one location. */
export async function loadShopContext(client: Queryable, shopId: string): Promise<ShopContext> {
  const res = await client.query<{ id: string }>('select id from locations where shop_id = $1', [shopId]);
  if (res.rows.length !== 1) throw new Error(`Shop ${shopId} has ${res.rows.length} locations; expected 1`);
  return { shopId, locationId: res.rows[0].id };
}

/**
 * Insert one row with the context's shop (and, for gold tables, its location), whatever `values`
 * says about them. Returns the inserted row.
 */
export async function insertScoped<T extends pg.QueryResultRow = Record<string, unknown>>(
  client: Queryable,
  ctx: ShopContext,
  table: string,
  values: Record<string, unknown>,
): Promise<T> {
  assertIdentifier(table);
  const row: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(values)) {
    if (column === 'shop_id' || column === 'location_id') continue;
    assertIdentifier(column);
    row[column] = value;
  }
  row.shop_id = ctx.shopId;
  if (LOCATION_TABLES.includes(table)) row.location_id = ctx.locationId;
  const columns = Object.keys(row);
  const params = columns.map((_, i) => `$${i + 1}`);
  const res = await client.query<T>(
    `insert into ${table} (${columns.join(', ')}) values (${params.join(', ')}) returning *`,
    columns.map((c) => row[c]),
  );
  return res.rows[0];
}
