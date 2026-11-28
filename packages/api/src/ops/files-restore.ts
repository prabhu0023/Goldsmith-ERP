/**
 * Restore of a file-storage backup into a throwaway bucket (EP-38-S3). The target must pass
 * `assertRestoreBucket` (`goldsmith-restore...` with this lane as a `-` segment) before any
 * storage call, so the live bucket can never be the target. Each object is decrypted (the GCM
 * tag is checked) and its sha256 and size compared with the manifest before it is put under its
 * original key and content type. Every attempt that passed the guard is appended to restores.jsonl.
 */
import { createHash } from 'node:crypto';
import { userInfo } from 'node:os';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { createDecryptStream } from './backup-crypto.js';
import { isRunId, listBackups, manifestFileName } from './backup-records.js';
import type { BackupStore } from './backup-store.js';
import { type FileBackupEntry, type FileStores, type FilesManifest, type ListableStorage, objectFileName } from './files-backup.js';
import type { OpsEnv } from './ops-env.js';
import { assertRestoreBucket } from './ops-guards.js';
import { RESTORES_FILE, type RestoreRecord } from './restore-db.js';

/** The manifest of `backup` (a `files-...` run id or `latest`); throws when there is none. */
export async function loadFilesManifest(
  store: BackupStore,
  files: FileStores,
  backup: string,
): Promise<FilesManifest> {
  let id = backup;
  if (backup === 'latest') {
    const newest = (await listBackups(store, { kind: 'file storage', status: 'complete' })).at(-1);
    if (!newest) throw new Error('No complete file storage backup is recorded; run backup:files first');
    id = newest.id;
  } else if (!isRunId(backup) || !backup.startsWith('files-')) {
    throw new Error(`"${backup}" is not a file storage backup id (files-YYYYMMDDTHHMMSSZ-xxxx) or "latest"`);
  }
  const text = await files.manifests.readText(manifestFileName(id));
  if (text === undefined) throw new Error(`File backup ${id} has no manifest (deleted or unknown)`);
  const manifest = JSON.parse(text) as FilesManifest;
  if (manifest.version !== 1 || manifest.id !== id) throw new Error(`The manifest of file backup ${id} is not readable`);
  return manifest;
}

export interface FilesRestoreDeps {
  env: Pick<OpsEnv, 'appEnv' | 'lane'>;
  store: BackupStore;
  files: FileStores;
  /** Opens the storage of a bucket by name; called only after the guard accepted the name. */
  openStorage: (bucket: string) => ListableStorage;
  getKey: () => Buffer;
  now?: () => Date;
  runBy?: string;
}

export interface FilesRestoreResult {
  backup: string;
  bucket: string;
  objects: number;
  bytes: number;
  durationMs: number;
}

/** The plain bytes of one object, checked against the manifest entry (GCM tag, sha256, size). */
async function readChecked(files: FileStores, entry: FileBackupEntry, key: Buffer, backup: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of await createDecryptStream(files.objects.locate(objectFileName(entry.sha256)), key)) {
      chunks.push(chunk as Buffer);
    }
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') throw new Error(`File backup ${backup}: an object is missing from the backup folder`);
    throw e;
  }
  const body = Buffer.concat(chunks);
  if (createHash('sha256').update(body).digest('hex') !== entry.sha256 || body.length !== entry.size) {
    throw new Error(`File backup ${backup}: an object does not match its sha256 in the manifest; the backup is damaged`);
  }
  return body;
}

export async function restoreFiles(
  deps: FilesRestoreDeps,
  options: { backup: string; bucket: string; allowStaging?: boolean },
): Promise<FilesRestoreResult> {
  const { env, store, files } = deps;
  const now = deps.now ?? (() => new Date());
  const { bucket } = options;
  // Pure guard first: nothing is read or written for a refused name or environment.
  assertRestoreBucket({ name: bucket, appEnv: env.appEnv, lane: env.lane, allowStaging: options.allowStaging });
  const started = now();
  const record = (fields: Pick<RestoreRecord, 'result'> & Partial<RestoreRecord>): Promise<void> => {
    const finished = now();
    const line: RestoreRecord = {
      backup: options.backup,
      target: bucket,
      environment: env.appEnv,
      runBy: deps.runBy ?? userInfo().username,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      ...fields,
    };
    return store.appendLine(RESTORES_FILE, JSON.stringify(line));
  };
  const storage = deps.openStorage(bucket);
  try {
    const manifest = await loadFilesManifest(store, files, options.backup);
    const key = deps.getKey();
    // Pass 1: check every object before the bucket is created or written.
    for (const entry of manifest.objects) await readChecked(files, entry, key, manifest.id);
    // Pass 2: put each one back under its original key and content type.
    await storage.ensureBucket();
    for (const entry of manifest.objects) {
      await storage.put(entry.key, await readChecked(files, entry, key, manifest.id), entry.contentType);
    }
    const durationMs = now().getTime() - started.getTime();
    await record({ result: 'ok' });
    return { backup: manifest.id, bucket, objects: manifest.objects.length, bytes: manifest.totalBytes, durationMs };
  } catch (e) {
    await record({ result: 'failed', error: redactErrorText(e) }).catch(() => {});
    throw e;
  }
}
