/**
 * Storing a file (EP-09-S1, S4): the bytes and their copies go to object storage under a random
 * key first, then the caller's transaction inserts the StoredFile row. When that transaction
 * fails, every object just written is deleted again, so storage and database never disagree
 * (S1 AC4). The key is `files/<32 random hex>`: never the file name or the uploader (S1 AC2).
 *
 *   storeFile(deps, bytes, type, async (prepared) =>
 *     runInTransaction(pool, (tx) => insertFileRow(tx, shop, prepared, row, deps.log), log))
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FileContentType } from '@goldsmith/shared';
import { nextCode } from '../db/codes.js';
import type { ShopContext } from '../db/shop-context.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import { makeCopies } from './image-copies.js';
import type { ObjectStorage } from './object-storage.js';

/** Info lines of the file service ("[files] …"); never file content, links or other people's ids. */
export type FileLog = (line: string) => void;

export interface StoreFileDeps {
  storage: ObjectStorage;
  log: FileLog;
}

export type RetentionClass = 'standard' | 'po';

/** The objects written for one file, before its row exists. */
export interface PreparedFile {
  contentType: FileContentType;
  sizeBytes: number;
  /** SHA-256 (hex) of the original bytes. */
  sha256: string;
  storageKey: string;
  thumbnailKey: string | null;
  displayKey: string | null;
  width: number | null;
  height: number | null;
  resizeFailed: boolean;
  /** sharp's message when resizing failed. */
  resizeReason?: string;
  /** Every key written (original and copies). */
  keys: string[];
}

export interface FileRowInput {
  originalName: string;
  retentionClass: RetentionClass;
  /** id null for the system (intake, seed); the name says who. */
  uploadedBy: { id: string | null; name: string };
  at: Date;
  /** '<channel>:<message key>' of an intake message. */
  inboundKey?: string;
}

export interface StoredFileRef {
  /** stored_files.id (uuid). */
  id: string;
  /** FILE-<year>-<00001>, the id callers see. */
  code: string;
}

const COPY_TYPE = 'image/jpeg';

/** Delete `keys`, logging (not throwing) each failure. */
async function deleteAll(deps: StoreFileDeps, keys: readonly string[]): Promise<void> {
  for (const key of keys) {
    try {
      await deps.storage.delete(key);
    } catch (err) {
      deps.log(`[files] could not delete object ${key} (${err instanceof Error ? err.message : String(err)})`);
    }
  }
}

/**
 * Write the original and, for an image, its thumbnail and display copies. A resize failure keeps
 * the original only (`resizeFailed`); a failed write deletes what was already written and throws.
 * `key` replaces the random key (the dev seed's `seed/<sha256>`, so a re-seed overwrites).
 */
export async function putFileObjects(
  deps: StoreFileDeps,
  bytes: Buffer,
  contentType: FileContentType,
  key?: string,
): Promise<PreparedFile> {
  const storageKey = key ?? `files/${randomBytes(16).toString('hex')}`;
  const prepared: PreparedFile = {
    contentType,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    storageKey,
    thumbnailKey: null,
    displayKey: null,
    width: null,
    height: null,
    resizeFailed: false,
    keys: [],
  };
  const writes: Array<{ key: string; body: Buffer; type: string }> = [{ key: storageKey, body: bytes, type: contentType }];
  if (contentType !== 'application/pdf') {
    const copies = await makeCopies(bytes);
    if (copies.failed) {
      prepared.resizeFailed = true;
      prepared.resizeReason = copies.reason;
    } else {
      prepared.width = copies.width;
      prepared.height = copies.height;
      prepared.thumbnailKey = `${storageKey}-thumb.jpg`;
      prepared.displayKey = `${storageKey}-display.jpg`;
      writes.push(
        { key: prepared.thumbnailKey, body: copies.thumbnail, type: COPY_TYPE },
        { key: prepared.displayKey, body: copies.display, type: COPY_TYPE },
      );
    }
  }
  try {
    for (const w of writes) {
      prepared.keys.push(w.key);
      await deps.storage.put(w.key, w.body, w.type);
    }
  } catch (err) {
    await deleteAll(deps, prepared.keys);
    throw err;
  }
  return prepared;
}

/** Delete every object of a file whose row was not kept (rollback, idempotent replay). */
export async function discardObjects(deps: StoreFileDeps, prepared: PreparedFile): Promise<void> {
  await deleteAll(deps, prepared.keys);
}

/** Insert the StoredFile row for written objects, in the caller's transaction. */
export async function insertFileRow(
  tx: Tx,
  shop: ShopContext,
  prepared: PreparedFile,
  row: FileRowInput,
  log: FileLog,
): Promise<StoredFileRef> {
  const code = await nextCode(tx.client, shop, {
    table: 'stored_files',
    prefix: `FILE-${row.at.getUTCFullYear()}`,
    pad: 5,
  });
  const { rows } = await tx.client.query<{ id: string }>(
    `insert into stored_files (shop_id, code, storage_key, original_name, content_type, size_bytes, width, height,
       thumbnail_key, display_key, resize_failed, uploaded_by, uploaded_by_name, uploaded_at, retention_class, inbound_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     returning id`,
    [
      shop.shopId,
      code,
      prepared.storageKey,
      row.originalName,
      prepared.contentType,
      prepared.sizeBytes,
      prepared.width,
      prepared.height,
      prepared.thumbnailKey,
      prepared.displayKey,
      prepared.resizeFailed,
      row.uploadedBy.id,
      row.uploadedBy.name,
      row.at,
      row.retentionClass,
      row.inboundKey ?? null,
    ],
  );
  if (prepared.resizeFailed) {
    tx.afterCommit(() => log(`[files] resize failed ${code} (${prepared.resizeReason ?? 'unknown'})`));
  }
  return { id: rows[0].id, code };
}

/**
 * Write the objects, then run `commit` (the caller's transaction, which inserts the row). If
 * `commit` throws, the objects are deleted and the error rethrown.
 */
export async function storeFile<T>(
  deps: StoreFileDeps,
  bytes: Buffer,
  contentType: FileContentType,
  commit: (prepared: PreparedFile) => Promise<T>,
): Promise<T> {
  const prepared = await putFileObjects(deps, bytes, contentType);
  try {
    return await commit(prepared);
  } catch (err) {
    await discardObjects(deps, prepared);
    throw err;
  }
}
