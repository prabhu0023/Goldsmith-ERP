/**
 * The file operations served by the generic operation router (EP-09). They need the link key
 * and lifetime, so the app builds them from config with `createFileHandlers` and merges them into
 * the production handlers when file storage is configured (src/app.ts).
 */
import type { contract, FileContentType, FileOwnerType, FileRole } from '@goldsmith/shared';
import type { Handler, Handlers } from '../pipeline/registry.js';
import { attach, checkOwnerRole, detach, findOwner, OWNER_TABLES } from './attachments.js';
import { readableFile } from './file-access.js';
import { linkKey, signLink } from './file-links.js';
import { checkAttach, checkDetach, checkList } from './file-roles.js';
import type { FileLog } from './store-file.js';

export interface FileHandlerDeps {
  /** SESSION_SECRET; links are signed with a key derived from it. */
  linkSecret: string;
  /** Seconds an issued link stays valid (FILE_LINK_TTL_SECONDS). */
  ttlSeconds: number;
  log: FileLog;
}

export function createFileHandlers(deps: FileHandlerDeps): Handlers<typeof contract> {
  const key = linkKey(deps.linkSecret);

  /** Signed links for up to 50 files at once (EP-09-S5); each passes the access check first (S6). */
  const readFileLinks: Handler<typeof contract.readFileLinks> = async (tx, ctx, input) => {
    const links = [];
    for (const item of input.files) {
      const file = await readableFile(tx.client, ctx.shop, ctx.by, item.fileId, deps.log);
      const link = signLink(key, file.code, item.size, ctx.at, deps.ttlSeconds);
      deps.log(`[files] link issued ${file.code} ${item.size} by ${ctx.by.id}`);
      links.push({ fileId: file.code, size: item.size, url: link.url, expiresAt: link.expiresAt.toISOString() });
    }
    return { ok: true, links };
  };

  /**
   * Attach a file the caller may read to a piece, order copy, job or lead (S7, S8, S10). Reusing
   * an existing file (e.g. one from the lead) adds only an Attachment row (S8 AC3).
   */
  const createAttachment: Handler<typeof contract.createAttachment> = async (tx, ctx, input) => {
    checkOwnerRole(input.ownerType, input.role);
    await checkAttach(tx.client, ctx.shop, ctx.by, input);
    const file = await readableFile(tx.client, ctx.shop, ctx.by, input.fileId, deps.log);
    const created = await attach(tx, ctx.shop, ctx.by, ctx.at, {
      file: { id: file.id, code: file.code },
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      role: input.role,
    });
    return { ok: true, id: created.code };
  };
  const deleteAttachment: Handler<typeof contract.deleteAttachment> = async (tx, ctx, input) => {
    checkDetach(ctx.by);
    await detach(tx, ctx.shop, ctx.by, ctx.at, input.attachmentId);
    return { ok: true };
  };
  /**
   * The owner's attachments by role and position. A job also lists the reference images of its
   * order copy first (they are the job's reference images, S8 AC4).
   */
  const listAttachments: Handler<typeof contract.listAttachments> = async (tx, ctx, input) => {
    await checkList(tx.client, ctx.shop, ctx.by, input.ownerType, input.ownerId);
    const owner = await findOwner(tx.client, ctx.shop, input.ownerType, input.ownerId);
    const column = OWNER_TABLES[owner.type].column;
    const copyReferences =
      owner.type === 'job'
        ? `or (a.role = 'reference' and a.order_copy_id in
              (select id from order_copies where shop_id = $1 and job_id = $2::uuid))`
        : '';
    const { rows } = await tx.client.query<{
      attachment_id: string;
      file_id: string;
      owner_type: FileOwnerType;
      owner_code: string;
      role: FileRole;
      position: number;
      content_type: FileContentType;
      width: number | null;
      height: number | null;
      resize_failed: boolean;
      attached_by_name: string;
      attached_at: Date;
    }>(
      `select a.code as attachment_id, f.code as file_id, a.owner_type,
              case when a.owner_type = 'order_copy' then oc.code else $3 end as owner_code,
              a.role, a.position, f.content_type, f.width, f.height, f.resize_failed,
              a.attached_by_name, a.attached_at
         from attachments a
         join stored_files f on f.shop_id = a.shop_id and f.id = a.file_id
         left join order_copies oc on oc.shop_id = a.shop_id and oc.id = a.order_copy_id
        where a.shop_id = $1 and f.removed_at is null and (a.${column} = $2 ${copyReferences})
        order by (a.owner_type = 'order_copy') desc, a.role, a.position`,
      [ctx.shop.shopId, owner.id, owner.code],
    );
    return {
      ok: true,
      items: rows.map((r) => ({
        attachmentId: r.attachment_id,
        fileId: r.file_id,
        ownerType: r.owner_type,
        ownerId: r.owner_code,
        role: r.role,
        position: r.position,
        contentType: r.content_type,
        width: r.width,
        height: r.height,
        resizeFailed: r.resize_failed,
        attachedByName: r.attached_by_name,
        attachedAt: r.attached_at.toISOString(),
      })),
    };
  };
  return { readFileLinks, createAttachment, deleteAttachment, listAttachments };
}
