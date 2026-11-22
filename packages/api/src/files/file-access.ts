/**
 * May this caller read this file (EP-09-S6)? The check follows what the file is attached to and
 * runs on every link request. Every refusal is the same not-found answer as for a file that does
 * not exist, so nobody learns that a file exists (FR-09-7):
 *
 *   missing, removed by retention, or in another shop -> not found
 *   not attached to anything                          -> only its uploader
 *   Staff, Owner                                      -> any attached file
 *   Karigar                                           -> attached to an own job, or to the order
 *                                                        copy of an own job (S9)
 *
 * The attachment lookup uses the attachments (shop_id, file_id) index.
 */
import type { Actor } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { NotFoundError } from '../pipeline/api-errors.js';
import { isKarigar, karigarIdOf, readsAllAttachedFiles } from './file-roles.js';
import type { FileLog } from './store-file.js';

type Queryable = pg.Pool | pg.PoolClient;

export interface FileRow {
  id: string;
  code: string;
  storage_key: string;
  thumbnail_key: string | null;
  display_key: string | null;
  content_type: string;
  uploaded_by: string | null;
  removed_at: Date | null;
}

/** The shop's file with this code, removed or not, or undefined. */
export async function fileByCode(client: Queryable, shopId: string, code: string): Promise<FileRow | undefined> {
  const { rows } = await client.query<FileRow>(
    `select id, code, storage_key, thumbnail_key, display_key, content_type, uploaded_by, removed_at
       from stored_files where shop_id = $1 and code = $2`,
    [shopId, code],
  );
  return rows[0];
}

/** The file when `actor` may read it; otherwise NotFoundError('File', code). */
export async function readableFile(
  client: Queryable,
  shop: ShopContext,
  actor: Actor,
  fileCode: string,
  log: FileLog,
): Promise<FileRow> {
  const refuse = (): never => {
    log(`[files] link refused for user ${actor.id}`);
    throw new NotFoundError('File', fileCode);
  };
  const file = await fileByCode(client, shop.shopId, fileCode);
  if (!file || file.removed_at !== null) return refuse();
  const karigarId = isKarigar(actor) ? await karigarIdOf(client, shop, actor) : null;
  const { rows } = await client.query<{ own_job: boolean }>(
    `select coalesce(j.karigar_id = $3 or cj.karigar_id = $3, false) as own_job
       from attachments a
       left join karigar_jobs j on j.shop_id = a.shop_id and j.id = a.job_id
       left join order_copies oc on oc.shop_id = a.shop_id and oc.id = a.order_copy_id
       left join karigar_jobs cj on cj.shop_id = oc.shop_id and cj.id = oc.job_id
      where a.shop_id = $1 and a.file_id = $2`,
    [shop.shopId, file.id, karigarId],
  );
  if (rows.length === 0) return file.uploaded_by === actor.id ? file : refuse();
  if (readsAllAttachedFiles(actor)) return file;
  if (karigarId !== null && rows.some((r) => r.own_job)) return file;
  return refuse();
}
