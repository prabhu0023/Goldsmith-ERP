/**
 * Helpers for the EP-18 operation tests over the production app: a shop of the test's own with
 * an owner, a staff user and a karigar user signed in, ledger entries and karigar jobs written
 * straight to the tables, and readers for what the operations stored. Every test that counts
 * entries uses its own shop, so entries written by other tests never show up.
 */
import type pg from 'pg';
import { addKarigar, newShop, type TestShop } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser } from '../support/api-harness.js';
export interface PoolApiShop {
  shop: TestShop;
  ownerId: string;
  owner: string;
  staff: string;
  /** The session of a karigar user linked to `karigarCode`. */
  karigar: string;
  karigarUserId: string;
  karigarCode: string;
  karigarId: string;
}
/** A new shop with Sanjay Seth (owner), Rajesh Verma (staff) and Lakshmi Devi (karigar KG-LD). */
export async function newPoolApiShop(h: Harness): Promise<PoolApiShop> {
  const shop = await newShop(h.pool, 'Pool api shop');
  const ownerId = await newUser(h.pool, shop, { name: 'Sanjay Seth', role: 'owner' });
  const staffId = await newUser(h.pool, shop, { name: 'Rajesh Verma', role: 'staff' });
  const karigarId = await addKarigar(h.pool, shop, 'KG-LD');
  const karigarUserId = await newUser(h.pool, shop, { name: 'Lakshmi Devi', role: 'karigar', karigarId });
  return {
    shop,
    ownerId,
    owner: await newSession(h.pool, shop, ownerId),
    staff: await newSession(h.pool, shop, staffId),
    karigar: await newSession(h.pool, shop, karigarUserId),
    karigarUserId,
    karigarCode: 'KG-LD',
    karigarId,
  };
}
export interface LedgerEntry {
  kind: 'opening' | 'issued' | 'returned' | 'recovered' | 'adjustment';
  deltaUnits: number;
  at?: Date | string;
  note?: string | null;
  refType?: 'job' | 'piece' | null;
  refId?: string | null;
  code?: string;
}
/** Write one ledger entry and move the balance with it, as the posting function would. */
export async function addLedgerEntry(pool: pg.Pool, shop: TestShop, entry: LedgerEntry): Promise<string> {
  await pool.query('insert into metal_pools (shop_id) values ($1) on conflict (shop_id) do nothing', [shop.shopId]);
  const poolRow = await pool.query<{ id: string }>('select id from metal_pools where shop_id = $1', [shop.shopId]);
  const code =
    entry.code ??
    `PL-${String((await pool.query('select count(*)::int as n from pool_entries where shop_id = $1', [shop.shopId])).rows[0].n + 1).padStart(3, '0')}`;
  await pool.query(
    `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units, note, ref_type, ref_id, actor_name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Sanjay Seth')`,
    [
      shop.shopId,
      shop.locationId,
      poolRow.rows[0].id,
      code,
      entry.at ?? new Date('2026-11-20T09:00:00Z'),
      entry.kind,
      entry.deltaUnits,
      entry.note ?? null,
      entry.refType ?? null,
      entry.refId ?? null,
    ],
  );
  await pool.query('update metal_pools set balance_units = balance_units + $2 where id = $1', [poolRow.rows[0].id, entry.deltaUnits]);
  return code;
}
/** A karigar job with `issuedUnits` of gold issued; open unless `status` is handed_over or `settled`. */
export async function addPoolJob(
  pool: pg.Pool,
  shop: TestShop,
  values: { code: string; karigarId: string; issuedUnits: number; status?: string; settled?: boolean },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into karigar_jobs (shop_id, code, karigar_id, status, target_gross_units, target_net_units,
       tolerance_units, gold_issued_units, settled_at)
     values ($1, $2, $3, $4, 100000, 90000, 500, $5, $6) returning id`,
    [shop.shopId, values.code, values.karigarId, values.status ?? 'on_bench', values.issuedUnits, values.settled ? new Date() : null],
  );
  return rows[0].id;
}
export async function poolBalance(pool: pg.Pool, shop: TestShop): Promise<number> {
  return (await pool.query<{ balance_units: number }>('select balance_units from metal_pools where shop_id = $1', [shop.shopId]))
    .rows[0].balance_units;
}
export interface StoredEntry {
  code: string;
  kind: string;
  delta_units: number;
  note: string | null;
  ref_type: string | null;
  ref_id: string | null;
  actor_name: string;
}
export async function storedEntries(pool: pg.Pool, shop: TestShop): Promise<StoredEntry[]> {
  return (
    await pool.query<StoredEntry>(
      'select code, kind, delta_units, note, ref_type, ref_id, actor_name from pool_entries where shop_id = $1 order by code',
      [shop.shopId],
    )
  ).rows;
}
export interface StoredAudit {
  kind: string;
  entity_type: string;
  entity_id: string;
  reference: string | null;
  reason: string | null;
  actor_name: string;
  actor_role: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}
export async function poolAudits(pool: pg.Pool, shop: TestShop): Promise<StoredAudit[]> {
  return (
    await pool.query<StoredAudit>(
      `select kind, entity_type, entity_id, reference, reason, actor_name, actor_role, before_value, after_value
         from audit_entries where shop_id = $1 and entity_type = 'metal_pool' order by at, id`,
      [shop.shopId],
    )
  ).rows;
}
