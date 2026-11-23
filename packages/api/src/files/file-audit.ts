/**
 * Audit entries for files (EP-09-S7, S8, S10, S11, S12): attach, detach, an inbound PO stored and
 * a file removed by retention. Written through the one audit writer (EP-06, audit-writer.ts) in
 * the caller's transaction, so the change and its entry commit together. The entry's entity is
 * the file's owner (piece, order copy, job or lead, by its code). `before` and `after` are the
 * owner's file ids in that role, in position order, under the role's name (for retention: the
 * removed file id, then none). A system entry (intake, retention) has no user id and actor role
 * 'system'.
 */
import type { FileOwnerType, FileRole, RoleId } from '@goldsmith/shared';
import type pg from 'pg';
import { type AuditActor, appendAudit } from '../audit/audit-writer.js';
import type { ShopContext } from '../db/shop-context.js';
export type FileAuditKind = 'file_attached' | 'file_detached' | 'po_attachment_stored' | 'file_removed_by_retention';
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
  ownerType: FileOwnerType;
  /** The owner's code (piece tag, order copy, job MO-…, lead LD-…). */
  reference: string;
  role: FileRole;
  before: string[];
  after: string[];
}
const auditActor = (actor: FileActor): AuditActor =>
  actor.id === null
    ? { kind: 'system', name: actor.name }
    : { kind: 'user', id: actor.id, name: actor.name, role: actor.role as RoleId };
export async function writeFileAudit(
  client: pg.PoolClient,
  shop: ShopContext,
  actor: FileActor,
  entry: FileAuditEntry,
): Promise<void> {
  await appendAudit(client, {
    shopId: shop.shopId,
    at: entry.at,
    actor: auditActor(actor),
    kind: entry.kind,
    entityType: entry.ownerType,
    entityId: entry.reference,
    summary: entry.summary,
    ref: entry.reference,
    before: { [entry.role]: entry.before },
    after: { [entry.role]: entry.after },
  });
}
