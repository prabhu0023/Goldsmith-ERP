/**
 * Reference check of a restored file store (EP-38-S3). Every `stored_files` row of the restored
 * database that is not removed (`removed_at is null`) must find its original, thumbnail and
 * display copy (`storage_key`, `thumbnail_key`, `display_key` when set) in the restored bucket.
 * Reads one read-only transaction and the bucket listing; names the missing files by code only.
 */
import { createPool } from '../db/connection.js';
import type { ListableStorage } from './files-backup.js';

export type FileKeyColumn = 'storage_key' | 'thumbnail_key' | 'display_key';

export interface MissingFile {
  /** The file's code (for example `FIL-0007`), never its name or a person. */
  code: string;
  /** Which copies are not in the bucket. */
  missing: FileKeyColumn[];
}

export interface FileCheckResult {
  ok: boolean;
  /** Files (rows) checked. */
  files: number;
  /** Keys looked up. */
  keys: number;
  missing: MissingFile[];
}

interface StoredFileRow {
  code: string;
  storage_key: string;
  thumbnail_key: string | null;
  display_key: string | null;
}

const COLUMNS: FileKeyColumn[] = ['storage_key', 'thumbnail_key', 'display_key'];

export async function checkFileReferences(options: {
  targetUrl: string;
  storage: ListableStorage;
}): Promise<FileCheckResult> {
  const present = new Set(await options.storage.listKeys());
  const pool = createPool(options.targetUrl, 1);
  let rows: StoredFileRow[];
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      rows = (
        await client.query<StoredFileRow>(
          'select code, storage_key, thumbnail_key, display_key from stored_files where removed_at is null order by code, id',
        )
      ).rows;
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  const missing: MissingFile[] = [];
  let keys = 0;
  for (const row of rows) {
    const lost: FileKeyColumn[] = [];
    for (const column of COLUMNS) {
      const key = row[column];
      if (key === null) continue;
      keys++;
      if (!present.has(key)) lost.push(column);
    }
    if (lost.length > 0) missing.push({ code: row.code, missing: lost });
  }
  return { ok: missing.length === 0, files: rows.length, keys, missing };
}
