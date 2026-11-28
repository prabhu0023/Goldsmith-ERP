/**
 * Take the shop's pool lock (EP-18-S5). The metal_pools row is created when the shop has none,
 * then locked with `for update` until the transaction ends, so every posting and every operation
 * that reads the figures before posting runs one after another. Returns the locked row.
 */
import type { ShopContext } from '../db/shop-context.js';
import type { Tx } from '../pipeline/operation-transaction.js';

export interface LockedPool {
  id: string;
  balanceUnits: number;
  version: number;
}

export async function lockPool(tx: Tx, shop: ShopContext): Promise<LockedPool> {
  await tx.client.query('insert into metal_pools (shop_id) values ($1) on conflict (shop_id) do nothing', [shop.shopId]);
  const { rows } = await tx.client.query<{ id: string; balance_units: number; version: number }>(
    'select id, balance_units, version from metal_pools where shop_id = $1 for update',
    [shop.shopId],
  );
  return { id: rows[0].id, balanceUnits: rows[0].balance_units, version: rows[0].version };
}
