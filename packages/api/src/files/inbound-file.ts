/**
 * Create Inbound file (EP-09-S11): the email and WhatsApp intake store a PO attachment and link it
 * to the lead it created, with role po. This is a server-only function, never a route or contract
 * operation, so no browser session of any role can call it (S11 AC3).
 *
 *   - Same size and type limits as an upload with purpose po (PDF allowed). A refused file stores
 *     nothing and answers `{ kept: false, reason }` with a logged reason; the intake puts
 *     `inboundNotKeptNote(reason)` on the lead it still creates (AC4).
 *   - Deduplicated by '<channel>:<message key>' (stored_files.inbound_key): the same message
 *     delivered twice gives one StoredFile and one Attachment (AC5).
 *   - Stored with retention class po by the system actor "System (WhatsApp intake)" / "System
 *     (email intake)"; the attachment and its `po_attachment_stored` audit entry commit with it.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { systemActorName } from '../jobs/job-audit.js';
import { ApiError } from '../pipeline/api-errors.js';
import { runInTransaction } from '../pipeline/operation-transaction.js';
import type { Clock } from '../pipeline/server-clock.js';
import { attach } from './attachments.js';
import { SNIFF_BYTES } from './content-type-sniff.js';
import type { FileActor } from './file-audit.js';
import { checkDeclaredSize, checkType, type FileLimits } from './file-limits.js';
import type { ObjectStorage } from './object-storage.js';
import { type FileLog, insertFileRow, storeFile } from './store-file.js';
export type InboundChannel = 'whatsapp' | 'email';
export interface InboundFileDeps {
  pool: pg.Pool;
  storage: ObjectStorage;
  clock: Clock;
  limits: FileLimits;
  log: FileLog;
}
export interface InboundFile {
  channel: InboundChannel;
  /** The provider's message id; a repeat delivery carries the same one. */
  messageKey: string;
  /** The lead the intake created (LD-…). */
  leadCode: string;
  bytes: Buffer;
  originalName: string;
}
export type InboundResult =
  | { kept: true; fileId: string; repeated: boolean }
  | { kept: false; reason: string };
const CHANNEL_LABELS: Record<InboundChannel, string> = { whatsapp: 'WhatsApp intake', email: 'email intake' };
/** The sentence the intake puts on the lead when the attachment was refused. */
export const inboundNotKeptNote = (reason: string): string => `The attachment was not kept: ${reason}`;
const UNIQUE_VIOLATION = '23505';
async function existing(pool: pg.Pool, shop: ShopContext, inboundKey: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ code: string }>(
    'select code from stored_files where shop_id = $1 and inbound_key = $2',
    [shop.shopId, inboundKey],
  );
  return rows[0]?.code;
}
export async function storeInboundFile(
  deps: InboundFileDeps,
  shop: ShopContext,
  input: InboundFile,
): Promise<InboundResult> {
  const inboundKey = `${input.channel}:${input.messageKey}`;
  const repeat = await existing(deps.pool, shop, inboundKey);
  if (repeat) return { kept: true, fileId: repeat, repeated: true };
  let contentType: ReturnType<typeof checkType>;
  try {
    checkDeclaredSize(input.bytes.length, deps.limits);
    contentType = checkType(input.bytes.subarray(0, SNIFF_BYTES), 'po');
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    deps.log(`[files] inbound ${input.channel} file for ${input.leadCode} not kept: ${err.message}`);
    return { kept: false, reason: err.message };
  }
  const actor: FileActor = { id: null, name: systemActorName(CHANNEL_LABELS[input.channel]), role: 'system' };
  const errorLog = (message: string, err: unknown) =>
    deps.log(`[files] ${message} (${err instanceof Error ? err.message : String(err)})`);
  try {
    const fileId = await storeFile(deps, input.bytes, contentType, (prepared) =>
      runInTransaction(
        deps.pool,
        async (tx) => {
          const at = deps.clock.now();
          const file = await insertFileRow(
            tx,
            shop,
            prepared,
            { originalName: input.originalName, retentionClass: 'po', uploadedBy: actor, at, inboundKey },
            deps.log,
          );
          await attach(tx, shop, actor, at, { file, ownerType: 'lead', ownerId: input.leadCode, role: 'po' }, 'po_attachment_stored');
          return file.code;
        },
        errorLog,
      ),
    );
    deps.log(`[files] inbound ${input.channel} file ${fileId} stored for ${input.leadCode}`);
    return { kept: true, fileId, repeated: false };
  } catch (err) {
    // The same message delivered twice at once: the other delivery stored it first.
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      const stored = await existing(deps.pool, shop, inboundKey);
      if (stored) return { kept: true, fileId: stored, repeated: true };
    }
    throw err;
  }
}
