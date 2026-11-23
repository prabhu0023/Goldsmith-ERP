/**
 * Audit entries for changes jobs make (EP-10-S12) and for job actions a person takes (S13).
 * A job's entry names the System actor: actor_role 'system', no user id, and actor name
 * "System (<job label>)" (the same System model as EP-04's sign-in entries). It is written in the
 * job's transaction, so a rolled-back run leaves no entry.
 */
import type { Actor } from '@goldsmith/shared';
import type pg from 'pg';
import { type AuditActor, appendAudit } from '../audit/audit-writer.js';
import type { ShopContext } from '../db/shop-context.js';

export type JobAuditKind =
  | 'lead_marked_late'
  | 'job_marked_overdue'
  | 'job_reminder_sent'
  | 'edit_token_expired'
  | 'job_run_retried';

export interface JobAuditEntry {
  kind: JobAuditKind;
  at: Date;
  summary: string;
  detail?: string | null;
  /** The lead, job, edit or run code it concerns; also the entry's entity id. */
  reference?: string | null;
  /** The record id of the token concerned (an edit's token_ref), never the token itself. */
  tokenReference?: string | null;
  before?: unknown;
  after?: unknown;
}

/** "System (SLA breach job)". */
export const systemActorName = (label: string): string => `System (${label})`;

function insertAudit(client: pg.PoolClient, shop: ShopContext, actor: AuditActor, entry: JobAuditEntry): Promise<unknown> {
  return appendAudit(client, {
    shopId: shop.shopId,
    at: entry.at,
    actor,
    kind: entry.kind,
    entityId: entry.reference ?? '',
    summary: entry.summary,
    detail: entry.detail ?? null,
    ref: entry.reference ?? null,
    tokenReference: entry.tokenReference ?? null,
    before: entry.before,
    after: entry.after,
  });
}

/** An entry made by the job labelled `label`. */
export async function writeJobAudit(client: pg.PoolClient, shop: ShopContext, label: string, entry: JobAuditEntry): Promise<void> {
  await insertAudit(client, shop, { kind: 'system', name: systemActorName(label) }, entry);
}

/** An entry made by a signed-in person (e.g. the Owner retrying a run). */
export async function writeUserAudit(client: pg.PoolClient, shop: ShopContext, actor: Actor, entry: JobAuditEntry): Promise<void> {
  await insertAudit(client, shop, { kind: 'user', ...actor }, entry);
}
