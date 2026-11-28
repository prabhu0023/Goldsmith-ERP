/** The ledger sum must equal the stored balance (EP-18-S1 AC4). */
import { ledgerMatchesBalance, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';

export interface PoolConsistency {
  balanceUnits: number;
  ledgerUnits: number;
  ok: boolean;
}

export async function checkPoolConsistency(client: pg.Pool | pg.PoolClient, shop: ShopContext): Promise<PoolConsistency> {
  const { rows } = await client.query<{ balance_units: number; ledger_units: number }>(
    `select coalesce((select balance_units from metal_pools where shop_id = $1), 0)::bigint as balance_units,
            coalesce((select sum(delta_units) from pool_entries where shop_id = $1), 0)::bigint as ledger_units`,
    [shop.shopId],
  );
  const { balance_units: balanceUnits, ledger_units: ledgerUnits } = rows[0];
  return { balanceUnits, ledgerUnits, ok: ledgerMatchesBalance(ledgerUnits, balanceUnits) };
}

/** Throws an Error naming both figures when the ledger and the balance disagree. */
export async function assertPoolConsistent(client: pg.Pool | pg.PoolClient, shop: ShopContext): Promise<void> {
  const { balanceUnits, ledgerUnits, ok } = await checkPoolConsistency(client, shop);
  if (!ok) {
    throw new Error(
      `Metal pool balance ${unitsToGrams(balanceUnits)} g does not match the ledger sum ${unitsToGrams(ledgerUnits)} g`,
    );
  }
}
