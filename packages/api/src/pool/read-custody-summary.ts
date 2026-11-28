/**
 * Read Custody Summary (EP-18-S11): where the shop's gold is, for the owner. Pool balance; gold
 * with karigars (open jobs, per karigar); gold in parcels (pieces draft, with_owner or stopped),
 * in stock (in_stock) and gone (billed), each as net gold (gross less stones). Scrapped pieces
 * and parcel gold before tagging are not counted (plan decision 6).
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';
import { openJobGold } from './open-job-gold.js';
export const readCustodySummary: Handler<typeof contract.readCustodySummary> = async (tx, ctx) => {
  const shopId = ctx.shop.shopId;
  const pool = await tx.client.query<{ balance_units: number }>('select balance_units from metal_pools where shop_id = $1', [
    shopId,
  ]);
  const pieces = await tx.client.query<{ in_parcels: number; in_stock: number; gone: number }>(
    `select coalesce(sum(gross_units - stone_units) filter (where status in ('draft', 'with_owner', 'stopped')), 0)::bigint as in_parcels,
            coalesce(sum(gross_units - stone_units) filter (where status = 'in_stock'), 0)::bigint as in_stock,
            coalesce(sum(gross_units - stone_units) filter (where status = 'billed'), 0)::bigint as gone
       from pieces where shop_id = $1`,
    [shopId],
  );
  const jobs = await openJobGold(tx.client, ctx.shop);
  const perKarigar = new Map<string, { karigarId: string; name: string; openJobs: number; units: number }>();
  for (const job of jobs) {
    const entry = perKarigar.get(job.karigarCode) ?? { karigarId: job.karigarCode, name: job.karigarName, openJobs: 0, units: 0 };
    entry.openJobs += 1;
    entry.units += job.withKarigarUnits;
    perKarigar.set(job.karigarCode, entry);
  }
  const karigars = [...perKarigar.values()].map(({ units, ...rest }) => ({ ...rest, goldG: unitsToGrams(units) }));
  const totalUnits = jobs.reduce((sum, job) => sum + job.withKarigarUnits, 0);
  return {
    ok: true,
    poolG: unitsToGrams(pool.rows[0]?.balance_units ?? 0),
    withKarigars: { totalG: unitsToGrams(totalUnits), openJobs: jobs.length, karigars },
    inParcelsG: unitsToGrams(pieces.rows[0].in_parcels),
    inStockG: unitsToGrams(pieces.rows[0].in_stock),
    goneG: unitsToGrams(pieces.rows[0].gone),
  };
};
