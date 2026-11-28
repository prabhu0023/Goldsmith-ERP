/**
 * The karigar scorecard figures (EP-16-S9 to S11), computed on read from the job and parcel rows
 * that exist today (no cache table), with grouped SQL and integer arithmetic only. Interim
 * sources until the ledger, per-job settlement and parcel gaps land (follow-up FU-029):
 *   - open job: status is not `handed_over`; gold with the karigar: its issued gold;
 *   - finished job: `settled_at` is set;
 *   - metal loss: the loss of the released parcels of finished jobs over the gold issued for
 *     them, in whole basis points, half up; no finished job means no figure (null);
 *   - days late: per finished job, shop calendar days (Asia/Kolkata) from the agreed date
 *     (confirmed, else due) to the handover (parcel arrival, else settlement), never negative;
 *   - gaps: the absolute net gap of the last six released parcels, newest first.
 * No rating is computed (formula undecided, G4).
 */
import { averageUnits, lossBp, SHOP_TIME_ZONE } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
export const LAST_GAPS = 6;
export interface Scorecard {
  openJobs: number;
  /** Gold issued on open jobs, units of 0.0001 g. */
  goldWithUnits: number;
  finishedJobs: number;
  /** Null until a job is finished. */
  metalLossBp: number | null;
  daysLate: number;
  /** Absolute gaps in units of 0.0001 g, newest release first, at most six. */
  lastGapUnits: number[];
  averageGapUnits: number | null;
}
interface FigureRow {
  karigar_id: string;
  open_jobs: number;
  gold_with: string;
  finished_jobs: number;
  issued_finished: string;
  loss_finished: string;
  days_late: number;
}
interface GapRow {
  karigar_id: string;
  gap: string;
}
const emptyScorecard = (): Scorecard => ({
  openJobs: 0,
  goldWithUnits: 0,
  finishedJobs: 0,
  metalLossBp: null,
  daysLate: 0,
  lastGapUnits: [],
  averageGapUnits: null,
});
/** The scorecard of each karigar uuid; a karigar with no jobs has the empty one. */
export async function loadScorecards(
  client: pg.Pool | pg.PoolClient,
  shop: ShopContext,
  karigarIds: readonly string[],
): Promise<Map<string, Scorecard>> {
  const cards = new Map<string, Scorecard>(karigarIds.map((id) => [id, emptyScorecard()]));
  if (karigarIds.length === 0) return cards;
  const figures = await client.query<FigureRow>(
    `with per_job as (
       select j.karigar_id, j.status, j.gold_issued_units, j.settled_at,
              coalesce(pj.loss, 0) as loss,
              case when j.settled_at is null then 0
                   else coalesce(greatest(0,
                     (coalesce(pj.arrived, j.settled_at) at time zone $3::text)::date
                       - (coalesce(j.confirmed_date, j.due_date) at time zone $3::text)::date), 0)
              end as late
         from karigar_jobs j
         left join lateral (
           select max(p.arrived_at) as arrived,
                  sum(coalesce(p.loss_units, 0)) filter (where p.status = 'released') as loss
             from parcels p where p.shop_id = j.shop_id and p.job_id = j.id
         ) pj on true
        where j.shop_id = $1 and j.karigar_id = any($2::uuid[])
     )
     select karigar_id,
            (count(*) filter (where status <> 'handed_over'))::int as open_jobs,
            coalesce(sum(gold_issued_units) filter (where status <> 'handed_over'), 0)::text as gold_with,
            (count(*) filter (where settled_at is not null))::int as finished_jobs,
            coalesce(sum(gold_issued_units) filter (where settled_at is not null), 0)::text as issued_finished,
            coalesce(sum(loss) filter (where settled_at is not null), 0)::text as loss_finished,
            coalesce(sum(late), 0)::int as days_late
       from per_job group by karigar_id`,
    [shop.shopId, karigarIds, SHOP_TIME_ZONE],
  );
  for (const row of figures.rows) {
    const card = cards.get(row.karigar_id);
    if (!card) continue;
    card.openJobs = row.open_jobs;
    card.goldWithUnits = Number(row.gold_with);
    card.finishedJobs = row.finished_jobs;
    card.metalLossBp = row.finished_jobs > 0 ? lossBp(Number(row.loss_finished), Number(row.issued_finished)) : null;
    card.daysLate = row.days_late;
  }
  const gaps = await client.query<GapRow>(
    `select karigar_id, gap::text as gap from (
       select p.karigar_id, abs(p.gap_net_units) as gap,
              row_number() over (partition by p.karigar_id order by p.released_at desc nulls last, p.id desc) as rn
         from parcels p
        where p.shop_id = $1 and p.karigar_id = any($2::uuid[]) and p.status = 'released' and p.gap_net_units is not null
     ) t where rn <= $3::int order by karigar_id, rn`,
    [shop.shopId, karigarIds, LAST_GAPS],
  );
  for (const row of gaps.rows) cards.get(row.karigar_id)?.lastGapUnits.push(Number(row.gap));
  for (const card of cards.values()) card.averageGapUnits = averageUnits(card.lastGapUnits);
  return cards;
}
