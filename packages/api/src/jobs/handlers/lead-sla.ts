/**
 * The lead SLA clock (EP-10-S5, S6). A lead in needs_glance or opened passes its SLA at
 * leadSlaDueAt(arrivedAt, settings) (open decision A2: clock hours until EP-13 adds shop hours).
 *
 * Each lead gets one 'lead-sla-breach' timer row (run key = lead id, key '<lead code>:sla-breach').
 * The 'lead-sla-timers' job reconciles those rows every minute, so seeded leads, a changed SLA
 * setting (S5 AC3) and a lost cancel are all picked up within a minute. The breach job re-reads
 * the lead under a row lock and acts only while its clock still runs (S6 AC2, S11 AC5).
 */
import { type LeadSlaCounting, type LeadState, leadSlaDueAt, slaRunning } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../../db/shop-context.js';
import { emitLiveEvent } from '../../live/emit-live-event.js';
import { writeJobAudit } from '../job-audit.js';
import type { JobDefinition } from '../job-definition.js';
import { cancelJob } from '../job-store.js';
import { emitOutboxEvent } from '../outbox.js';

type Queryable = pg.Pool | pg.PoolClient;

export const LEAD_SLA_TIMERS_JOB = 'lead-sla-timers';
export const LEAD_SLA_BREACH_JOB = 'lead-sla-breach';
const BREACH_LABEL = 'SLA breach job';
const BREACH_MAX_ATTEMPTS = 3;
const RUNNING_STATES = ['needs_glance', 'opened'];

const breachKey = (leadCode: string): string => `${leadCode}:sla-breach`;

interface SlaSettingsRow {
  lead_sla_hours: number;
  lead_sla_counting: LeadSlaCounting;
}

async function slaSettings(client: Queryable, shop: ShopContext) {
  const { rows } = await client.query<SlaSettingsRow>(
    'select lead_sla_hours, lead_sla_counting from settings where shop_id = $1',
    [shop.shopId],
  );
  const row = rows[0];
  if (!row) throw new Error('The shop has no settings row');
  return { leadSlaHours: row.lead_sla_hours, leadSlaCounting: row.lead_sla_counting };
}

interface TimerLead {
  id: string;
  code: string;
  arrived_at: Date;
}

/**
 * Put the lead's breach timer at `dueAt`: insert it, move a pending one, re-arm a cancelled one,
 * or reset a finished one whose lead is still running and not late (its earlier run made no
 * change, e.g. the SLA was raised just before it ran). That earlier run claimed the lead's key
 * without effect, so the claim is freed for the new run.
 */
async function putBreachTimer(client: Queryable, shop: ShopContext, lead: TimerLead, dueAt: Date, now: Date): Promise<void> {
  await client.query(
    `delete from job_keys k using pending_jobs p
      where k.shop_id = $1 and k.idempotency_key = $2
        and p.shop_id = $1 and p.job_name = $3 and p.run_key = $4 and p.status = 'done'`,
    [shop.shopId, breachKey(lead.code), LEAD_SLA_BREACH_JOB, lead.id],
  );
  await client.query(
    `insert into pending_jobs (shop_id, job_name, run_key, due_at, payload, idempotency_key, max_attempts, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (shop_id, job_name, run_key) do update
       set due_at = excluded.due_at, payload = excluded.payload,
           idempotency_key = excluded.idempotency_key, max_attempts = excluded.max_attempts,
           status = 'pending',
           attempts = case when pending_jobs.status = 'pending' then pending_jobs.attempts else 0 end,
           next_attempt_at = case when pending_jobs.status = 'pending' then pending_jobs.next_attempt_at else null end,
           run_id = case when pending_jobs.status = 'pending' then pending_jobs.run_id else null end
     where pending_jobs.status in ('cancelled', 'done')
        or (pending_jobs.status = 'pending' and pending_jobs.due_at <> excluded.due_at)`,
    [
      shop.shopId,
      LEAD_SLA_BREACH_JOB,
      lead.id,
      dueAt,
      JSON.stringify({ leadId: lead.id }),
      breachKey(lead.code),
      BREACH_MAX_ATTEMPTS,
      now,
    ],
  );
}

const RUNNING_LEADS_SQL = `select id, code, arrived_at from leads
  where shop_id = $1 and state = any($2::text[]) and sla_breached_at is null and arrived_at is not null`;

/**
 * Schedule (or move) the breach timer of one lead from the current SLA setting; cancel it when
 * the lead's clock does not run. For services that create a lead or reopen one (EP-28).
 */
export async function scheduleLeadSlaTimer(client: Queryable, shop: ShopContext, leadId: string, now: Date): Promise<void> {
  const { rows } = await client.query<TimerLead>(`${RUNNING_LEADS_SQL} and id = $3`, [
    shop.shopId,
    RUNNING_STATES,
    leadId,
  ]);
  const lead = rows[0];
  if (!lead) {
    await cancelJob(client, shop, LEAD_SLA_BREACH_JOB, leadId);
    return;
  }
  const settings = await slaSettings(client, shop);
  await putBreachTimer(client, shop, lead, new Date(leadSlaDueAt(lead.arrived_at.getTime(), settings)), now);
}

/**
 * Call in the transaction that changes a lead's state (EP-10-S6): a lead leaving needs_glance and
 * opened has its timer cancelled; needs_glance -> opened keeps it. A rollback keeps it too.
 */
export async function leadSlaTimerAfterTransition(
  client: Queryable,
  shop: ShopContext,
  lead: { leadId: string; state: LeadState },
): Promise<void> {
  if (slaRunning({ state: lead.state })) return;
  await cancelJob(client, shop, LEAD_SLA_BREACH_JOB, lead.leadId);
}

/**
 * Reconcile every lead's timer with the current SLA setting: running leads get their timer at
 * the due time, timers of leads no longer running are cancelled. For EP-13 after the setting
 * changes; the 'lead-sla-timers' job runs it every minute.
 */
export async function rescheduleLeadSlaTimers(client: Queryable, shop: ShopContext, now: Date): Promise<void> {
  const settings = await slaSettings(client, shop);
  const { rows } = await client.query<TimerLead>(`${RUNNING_LEADS_SQL} order by code`, [shop.shopId, RUNNING_STATES]);
  for (const lead of rows) {
    await putBreachTimer(client, shop, lead, new Date(leadSlaDueAt(lead.arrived_at.getTime(), settings)), now);
  }
  await client.query(
    `update pending_jobs p set status = 'cancelled'
      where p.shop_id = $1 and p.job_name = $2 and p.status = 'pending'
        and not exists (
          select 1 from leads l
           where l.shop_id = p.shop_id and l.id::text = p.run_key and l.state = any($3::text[])
             and l.sla_breached_at is null and l.arrived_at is not null)`,
    [shop.shopId, LEAD_SLA_BREACH_JOB, RUNNING_STATES],
  );
}

export const leadSlaTimersJob: JobDefinition = {
  name: LEAD_SLA_TIMERS_JOB,
  label: 'SLA timers',
  schedule: { kind: 'every', minutes: 1 },
  maxAttempts: 3,
  handler: (tx, ctx) => rescheduleLeadSlaTimers(tx.client, ctx.shop, ctx.now),
};

interface BreachLeadRow {
  id: string;
  code: string;
  state: LeadState;
  arrived_at: Date | null;
  sla_breached_at: Date | null;
}

export const leadSlaBreachJob: JobDefinition = {
  name: LEAD_SLA_BREACH_JOB,
  label: BREACH_LABEL,
  schedule: { kind: 'delay' },
  maxAttempts: BREACH_MAX_ATTEMPTS,
  async handler(tx, ctx) {
    const leadId = ctx.payload.leadId;
    if (typeof leadId !== 'string') return;
    const { rows } = await tx.client.query<BreachLeadRow>(
      'select id, code, state, arrived_at, sla_breached_at from leads where shop_id = $1 and id = $2 for update',
      [ctx.shop.shopId, leadId],
    );
    const lead = rows[0];
    if (!lead || !slaRunning({ state: lead.state }) || lead.sla_breached_at !== null || lead.arrived_at === null) return;
    // The setting may have changed since the timer was set: the current one decides.
    const due = new Date(leadSlaDueAt(lead.arrived_at.getTime(), await slaSettings(tx.client, ctx.shop)));
    if (ctx.now < due) return;
    const updated = await tx.client.query<{ version: number }>(
      'update leads set sla_breached_at = $3, sla_breach_notified = true where shop_id = $1 and id = $2 returning version',
      [ctx.shop.shopId, lead.id, due],
    );
    const slaBreachedAt = due.toISOString();
    await writeJobAudit(tx.client, ctx.shop, BREACH_LABEL, {
      kind: 'lead_marked_late',
      at: ctx.now,
      summary: `Lead ${lead.code} marked late`,
      reference: lead.code,
      before: { slaBreachedAt: null },
      after: { slaBreachedAt },
    });
    await emitOutboxEvent(tx.client, ctx.shop, 'lead.sla_passed', { leadId: lead.code, slaBreachedAt }, ctx.now);
    // "Lead arrived / passed its SLA" to staff and owner screens (EP-07-S11).
    await emitLiveEvent(tx, ctx.shop, 'lead.alert', {
      entityId: lead.code,
      entityVersion: updated.rows[0].version,
      at: ctx.now,
    });
  },
};
