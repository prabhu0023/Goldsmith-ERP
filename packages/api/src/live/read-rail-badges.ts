/**
 * Read Rail Badges (EP-07-S9): the rail counts for the caller's role, tallied from the shop's
 * rows and turned into badges by the shared railBadgeCounts rule the web's in-memory selector
 * also uses. Late leads use the shared slaState with the shop's SLA hours, overdue jobs the shared
 * jobOverdueDays, both at the operation's server time. A karigar is refused by the permission
 * list before this runs.
 */
import { type contract, type JobStatus, jobOverdueDays, type RailBadgeTallies, railBadgeCounts, slaState } from '@goldsmith/shared';
import type { LeadState } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';

interface CountRow {
  open_parcels: number;
  in_stock: number;
  mismatched_parcels: number;
  open_problems: number;
  pending_edits: number;
  pending_scrap: number;
  needs_glance: number;
  lead_sla_hours: number;
}

export const readRailBadges: Handler<typeof contract.readRailBadges> = async (tx, ctx) => {
  const shopId = ctx.shop.shopId;
  const now = ctx.at.getTime();
  const counts = await tx.client.query<CountRow>(
    `select
       (select count(*)::int from parcels where shop_id = $1 and status <> 'released') as open_parcels,
       (select count(*)::int from pieces where shop_id = $1 and status = 'in_stock') as in_stock,
       (select count(*)::int from parcels pa
          where pa.shop_id = $1 and pa.status = 'stopped' and pa.resolution is null and pa.verdict = 'mismatch'
            and not exists (select 1 from problems pr
                             where pr.shop_id = $1 and pr.status = 'open' and pr.target_kind = 'parcel'
                               and pr.parcel_id = pa.id)) as mismatched_parcels,
       (select count(*)::int from problems where shop_id = $1 and status = 'open') as open_problems,
       (select count(*)::int from piece_edits where shop_id = $1 and status in ('proposed', 'token_sent')) as pending_edits,
       (select count(*)::int from scrap_requests where shop_id = $1 and status = 'pending') as pending_scrap,
       (select count(*)::int from leads where shop_id = $1 and state = 'needs_glance') as needs_glance,
       (select lead_sla_hours from settings where shop_id = $1) as lead_sla_hours`,
    [shopId],
  );
  const c = counts.rows[0];
  const leads = await tx.client.query<{ state: LeadState; arrived_at: Date }>(
    `select state, arrived_at from leads
      where shop_id = $1 and state in ('needs_glance', 'opened') and arrived_at is not null`,
    [shopId],
  );
  const jobs = await tx.client.query<{ status: JobStatus; due_date: Date | null; confirmed_date: Date | null }>(
    `select status, due_date, confirmed_date from karigar_jobs
      where shop_id = $1 and status <> 'handed_over' and coalesce(confirmed_date, due_date) is not null`,
    [shopId],
  );
  const slaHours = c.lead_sla_hours ?? 8;
  const lateLeads = leads.rows.filter(
    (l) => slaState({ state: l.state, arrivedAt: l.arrived_at.getTime() }, now, slaHours).phase === 'late',
  ).length;
  const overdueJobs = jobs.rows.filter((j) => {
    const confirmedDate = j.confirmed_date?.getTime() ?? null;
    const dueDate = j.due_date?.getTime() ?? (confirmedDate as number);
    return jobOverdueDays({ status: j.status, dueDate, confirmedDate }, now) > 0;
  }).length;
  const tallies: RailBadgeTallies = {
    openParcels: c.open_parcels,
    inStock: c.in_stock,
    mismatchedParcels: c.mismatched_parcels,
    openProblems: c.open_problems,
    pendingEdits: c.pending_edits,
    pendingScrap: c.pending_scrap,
    lateLeads,
    overdueJobs,
    leadsNeedingGlance: c.needs_glance,
  };
  return { ok: true, badges: railBadgeCounts(ctx.by.role, tallies) };
};
