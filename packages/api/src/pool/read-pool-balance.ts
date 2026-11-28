/**
 * Read Pool Balance (EP-18-S10): the metal pool's balance for the screens that warn before gold
 * is issued. A shop with no pool row yet has balance 0 and version 0 (the first posting creates
 * the row). Staff and owner, by the central permission check.
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';
export const readPoolBalance: Handler<typeof contract.readPoolBalance> = async (tx, ctx) => {
  const { rows } = await tx.client.query<{ balance_units: number; version: number }>(
    'select balance_units, version from metal_pools where shop_id = $1',
    [ctx.shop.shopId],
  );
  const balanceUnits = rows[0]?.balance_units ?? 0;
  return { ok: true, balanceUnits, balanceG: unitsToGrams(balanceUnits), version: rows[0]?.version ?? 0 };
};
