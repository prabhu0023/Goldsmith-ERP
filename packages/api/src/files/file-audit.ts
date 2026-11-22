/**
 * Audit entries for files (EP-09-S7, S8, S10, S11): attach, detach and an inbound PO stored. Same
 * columns as src/jobs/job-audit.ts, written in the caller's transaction, so the change and its
 * entry commit together. `before` and `after` are the owner's file ids in that role, in position
 * order. A system entry (intake) has no user id and actor role 'system'.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
export type FileAuditKind = 'file_attached' | 'file_detached' | 'po_attachment_stored';
/** Who made the change: a signed-in person, or the system (id null, role 'system'). */
export interface FileActor {
  id: string | null;
  name: string;
  role: string;
}
export interface FileAuditEntry {
  kind: FileAuditKind;
  at: Date;
  summary: string;
  /** The owner's code (piece tag, order copy, job MO-…, lead LD-…). */
  reference: string;
  before: string[];
  after: string[];
}
export async function writeFileAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  actor: FileActor,
  entry: FileAuditEntry,
): Promise<void> {
  await client.query(
    `insert into audit_entries
       (shop_id, at, actor_id, actor_name, actor_role, kind, summary, detail, reference, before_value, after_value)
     values ($1, $2, $3, $4, $5, $6, $7, null, $8, $9, $10)`,
    [
      shop.shopId,
      entry.at,
      actor.id,
      actor.name,
      actor.role,
      entry.kind,
      entry.summary,
      entry.reference,
      JSON.stringify(entry.before),
      JSON.stringify(entry.after),
    ],
  );
}
