/**
 * Attachments (EP-09-S7, S8, S10, S11): a stored file attached to a piece, order copy, karigar job
 * or lead in a role, at a position. Owners are found by their own code in the shop (missing ->
 * not_found). Attach and detach lock the owner row (`for update`), so two people attaching to the
 * same owner at once get distinct positions, and write their audit entry in the same transaction.
 * Positions count per owner and role (photo 1, 2, …); a detach leaves the others where they are.
 * Who may attach is decided in file-roles.ts, not here. Attaching a file in role `po` gives it
 * retention class `po` (EP-09-S12).
 */
import type { FileOwnerType, FileRole } from '@goldsmith/shared';
import type pg from 'pg';
import { nextCode } from '../db/codes.js';
import type { ShopContext } from '../db/shop-context.js';
import { ApiError, NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import { type FileActor, type FileAuditKind, writeFileAudit } from './file-audit.js';
import { OWNER_NOUNS } from './file-roles.js';
import type { StoredFileRef } from './store-file.js';
type Queryable = pg.Pool | pg.PoolClient;
/** The roles each owner takes (the attachments_owner_role check of the migration). */
export const OWNER_ROLES: Record<FileOwnerType, readonly FileRole[]> = {
  piece: ['photo'],
  order_copy: ['reference'],
  job: ['bench', 'reference'],
  lead: ['po', 'reference'],
};
export const ROLE_LABELS: Record<FileRole, string> = {
  photo: 'Photo',
  reference: 'Reference image',
  po: 'PO attachment',
  bench: 'Bench photo',
};
/** Where each owner lives: its table, its code column and its column on attachments. */
export const OWNER_TABLES: Record<FileOwnerType, { table: string; code: string; column: string }> = {
  piece: { table: 'pieces', code: 'tag_no', column: 'piece_id' },
  order_copy: { table: 'order_copies', code: 'code', column: 'order_copy_id' },
  job: { table: 'karigar_jobs', code: 'code', column: 'job_id' },
  lead: { table: 'leads', code: 'code', column: 'lead_id' },
};
export interface Owner {
  type: FileOwnerType;
  /** The owner row's uuid. */
  id: string;
  /** Its own code. */
  code: string;
}
const noun = (type: FileOwnerType): string => OWNER_NOUNS[type].toLowerCase();
/** A validation refusal when `role` is not one `ownerType` takes. */
export function checkOwnerRole(ownerType: FileOwnerType, role: FileRole): void {
  if (!OWNER_ROLES[ownerType].includes(role)) {
    throw new ValidationError('role', `A ${noun(ownerType)} takes only ${OWNER_ROLES[ownerType].join(' or ')} attachments.`);
  }
}
/** The owner with this code in the shop, optionally locked for update; else not_found. */
export async function findOwner(
  client: Queryable,
  shop: ShopContext,
  type: FileOwnerType,
  code: string,
  lock = false,
): Promise<Owner> {
  const t = OWNER_TABLES[type];
  const { rows } = await client.query<{ id: string }>(
    `select id from ${t.table} where shop_id = $1 and ${t.code} = $2${lock ? ' for update' : ''}`,
    [shop.shopId, code],
  );
  if (!rows[0]) throw new NotFoundError(OWNER_NOUNS[type], code);
  return { type, id: rows[0].id, code };
}
/** The owner's file ids in `role`, in position order. */
async function fileCodesOf(client: Queryable, shop: ShopContext, owner: Owner, role: FileRole): Promise<string[]> {
  const { rows } = await client.query<{ code: string }>(
    `select f.code from attachments a join stored_files f on f.shop_id = a.shop_id and f.id = a.file_id
      where a.shop_id = $1 and a.${OWNER_TABLES[owner.type].column} = $2 and a.role = $3
      order by a.position`,
    [shop.shopId, owner.id, role],
  );
  return rows.map((r) => r.code);
}
export interface AttachInput {
  file: StoredFileRef;
  ownerType: FileOwnerType;
  /** The owner's code. */
  ownerId: string;
  role: FileRole;
}
/**
 * Attach `file` to its owner at the next position, with the audit entry (`file_attached`, or
 * `po_attachment_stored` for intake). The same file twice on one owner in one role is a conflict.
 */
export async function attach(
  tx: Tx,
  shop: ShopContext,
  by: FileActor,
  at: Date,
  input: AttachInput,
  kind: FileAuditKind = 'file_attached',
): Promise<{ code: string }> {
  checkOwnerRole(input.ownerType, input.role);
  const owner = await findOwner(tx.client, shop, input.ownerType, input.ownerId, true);
  const before = await fileCodesOf(tx.client, shop, owner, input.role);
  if (before.includes(input.file.code)) {
    throw new ApiError('conflict', `File ${input.file.code} is already attached to ${noun(owner.type)} ${owner.code}.`);
  }
  const column = OWNER_TABLES[owner.type].column;
  const code = await nextCode(tx.client, shop, { table: 'attachments', prefix: `AT-${at.getUTCFullYear()}`, pad: 5 });
  await tx.client.query(
    `insert into attachments (shop_id, code, file_id, owner_type, ${column}, role, position,
                              attached_by, attached_by_name, attached_at)
     select $1, $2, $3, $4, $5, $6, coalesce(max(position), 0) + 1, $7, $8, $9
       from attachments where shop_id = $1 and ${column} = $5 and role = $6`,
    [shop.shopId, code, input.file.id, owner.type, owner.id, input.role, by.id, by.name, at],
  );
  // A file attached as a PO is kept only as long as PO files are (BR-09-3, EP-09-S12).
  if (input.role === 'po') {
    await tx.client.query(
      `update stored_files set retention_class = 'po' where shop_id = $1 and id = $2 and retention_class <> 'po'`,
      [shop.shopId, input.file.id],
    );
  }
  await writeFileAudit(tx.client, shop, by, {
    kind,
    at,
    summary: `${ROLE_LABELS[input.role]} ${input.file.code} attached to ${noun(owner.type)} ${owner.code}`,
    reference: owner.code,
    before,
    after: [...before, input.file.code],
  });
  return { code };
}
/** Remove the attachment with this code (the file stays), with the `file_detached` audit entry. */
export async function detach(tx: Tx, shop: ShopContext, by: FileActor, at: Date, attachmentCode: string): Promise<void> {
  const missing = new NotFoundError('Attachment', attachmentCode);
  const { rows } = await tx.client.query<{ owner_type: FileOwnerType; owner_id: string; role: FileRole; file_code: string }>(
    `select a.owner_type, coalesce(a.piece_id, a.order_copy_id, a.job_id, a.lead_id) as owner_id, a.role,
            f.code as file_code
       from attachments a join stored_files f on f.shop_id = a.shop_id and f.id = a.file_id
      where a.shop_id = $1 and a.code = $2`,
    [shop.shopId, attachmentCode],
  );
  const found = rows[0];
  if (!found) throw missing;
  const t = OWNER_TABLES[found.owner_type];
  const locked = await tx.client.query<{ code: string }>(
    `select ${t.code} as code from ${t.table} where shop_id = $1 and id = $2 for update`,
    [shop.shopId, found.owner_id],
  );
  const owner: Owner = { type: found.owner_type, id: found.owner_id, code: locked.rows[0].code };
  const before = await fileCodesOf(tx.client, shop, owner, found.role);
  const deleted = await tx.client.query('delete from attachments where shop_id = $1 and code = $2', [
    shop.shopId,
    attachmentCode,
  ]);
  if (deleted.rowCount === 0) throw missing;
  await writeFileAudit(tx.client, shop, by, {
    kind: 'file_detached',
    at,
    summary: `${ROLE_LABELS[found.role]} ${found.file_code} detached from ${noun(owner.type)} ${owner.code}`,
    reference: owner.code,
    before,
    after: before.filter((c) => c !== found.file_code),
  });
}
