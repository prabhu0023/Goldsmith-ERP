/**
 * Audit entries for changes jobs make (EP-10-S12) and for job actions a person takes (S13).
 * A job's entry names the System actor: actor_role 'system', no user id, and actor name
 * "System (<job label>)" (the same System model as EP-04's sign-in entries). It is written in the
 * job's transaction, so a rolled-back run leaves no entry.
 */
import type { Actor } from '@goldsmith/shared';
import type pg from 'pg';
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
  /** The lead, job, edit or run code it concerns. */
  reference?: string | null;
  before?: unknown;
  after?: unknown;
}

/** "System (SLA breach job)". */
export const systemActorName = (label: string): string => `System (${label})`;

const json = (value: unknown): string | null => (value === undefined ? null : JSON.stringify(value));

async function insertAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  actor: { id: string | null; name: string; role: string },
  entry: JobAuditEntry,
): Promise<void> {
  await client.query(
    `insert into audit_entries
       (shop_id, at, actor_id, actor_name, actor_role, kind, summary, detail, reference, before_value, after_value)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      shop.shopId,
      entry.at,
      actor.id,
      actor.name,
      actor.role,
      entry.kind,
      entry.summary,
      entry.detail ?? null,
      entry.reference ?? null,
      json(entry.before),
      json(entry.after),
    ],
  );
}

/** An entry made by the job labelled `label`. */
export function writeJobAudit(client: pg.PoolClient, shop: ShopContext, label: string, entry: JobAuditEntry): Promise<void> {
  return insertAudit(client, shop, { id: null, name: systemActorName(label), role: 'system' }, entry);
}

/** An entry made by a signed-in person (e.g. the Owner retrying a run). */
export function writeUserAudit(client: pg.PoolClient, shop: ShopContext, actor: Actor, entry: JobAuditEntry): Promise<void> {
  return insertAudit(client, shop, { id: actor.id, name: actor.name, role: actor.role }, entry);
}
