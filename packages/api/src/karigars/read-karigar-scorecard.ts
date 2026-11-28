/**
 * Read Karigar Scorecard (EP-16-S10): one karigar's metal loss against their allowance, days
 * late, last six parcel gaps and job ledger, for the owner. Figures come from scorecard.ts. An
 * unknown code is not_found. No rating and no money.
 */
import { averageUnits, type contract, unitsToGrams } from '@goldsmith/shared';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';
import { loadScorecards } from './scorecard.js';
interface JobRow {
  code: string;
  title: string | null;
  status: 'sent' | 'accepted' | 'on_bench' | 'ready' | 'handed_over';
  gold_issued_units: string;
  loss_units: string | null;
  due_date: Date | null;
}
export const readKarigarScorecard: Handler<typeof contract.readKarigarScorecard> = async (tx, ctx, input) => {
  const { rows: found } = await tx.client.query<{
    id: string;
    code: string;
    name: string;
    status: 'active' | 'deactivated';
    wastage_bp: number;
  }>('select id, code, name, status, wastage_bp from karigars where shop_id = $1 and code = $2', [
    ctx.shop.shopId,
    input.karigarId,
  ]);
  const karigar = found[0];
  if (!karigar) throw new NotFoundError('Karigar', input.karigarId);
  const card = (await loadScorecards(tx.client, ctx.shop, [karigar.id])).get(karigar.id);
  const { rows: jobs } = await tx.client.query<JobRow>(
    `select j.code, j.title, j.status, j.gold_issued_units::text as gold_issued_units, j.due_date,
            case when j.settled_at is null then null
                 else (select coalesce(sum(coalesce(p.loss_units, 0)), 0)::text from parcels p
                        where p.shop_id = j.shop_id and p.job_id = j.id and p.status = 'released') end as loss_units
       from karigar_jobs j
      where j.shop_id = $1 and j.karigar_id = $2
      order by j.code desc`,
    [ctx.shop.shopId, karigar.id],
  );
  const gaps = card?.lastGapUnits ?? [];
  const average = averageUnits(gaps);
  return {
    ok: true,
    karigar: { id: karigar.code, name: karigar.name, status: karigar.status, wastageBp: karigar.wastage_bp },
    scorecard: {
      metalLossBp: card?.metalLossBp ?? null,
      daysLate: card?.daysLate ?? 0,
      finishedJobs: card?.finishedJobs ?? 0,
      lastGapsG: gaps.map(unitsToGrams),
      averageGapG: average === null ? null : unitsToGrams(average),
    },
    jobs: jobs.map((j) => ({
      id: j.code,
      title: j.title,
      status: j.status,
      goldIssuedG: unitsToGrams(Number(j.gold_issued_units)),
      lossG: j.loss_units === null ? null : unitsToGrams(Number(j.loss_units)),
      dueDate: j.due_date?.toISOString() ?? null,
    })),
  };
};
