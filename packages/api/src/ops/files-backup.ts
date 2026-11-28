/**
 * File-storage backup (EP-38-S3, S5). `backupFiles` copies every object of the live bucket into
 * the lane's backup folder, encrypted with AES-256-GCM:
 *   <laneDir>/files/objects/<sha256 of the plain bytes>.enc   one file per distinct content
 *   <laneDir>/files/files-<ts>-<hex>.manifest.json            per run: every key, sha256, size, type
 * Content addressing means a run only writes objects it has not stored before, and an object a
 * later run no longer sees in the bucket (a file deleted after the restore point) stays
 * restorable from the older manifest until retention expires that run (retention.ts).
 * The bucket is only read (list and get). A failure removes nothing already stored, writes a
 * `failed` record, alerts the operator with kind `file storage` and rethrows.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ObjectStorage } from '../files/object-storage.js';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { createEncryptStream } from './backup-crypto.js';
import { appendRun, manifestFileName, newRunId, type RunRecord } from './backup-records.js';
import { type BackupStore, LocalFolderStore } from './backup-store.js';
import type { OperatorNotifier } from './notify-operator.js';
import type { OpsEnv } from './ops-env.js';

/** The file store the backup reads: ObjectStorage plus a listing of every key (S3Storage has both). */
export type ListableStorage = ObjectStorage & { listKeys(): Promise<string[]> };

export interface FileBackupEntry {
  key: string;
  /** sha256 (hex) of the plain bytes; also the name of the encrypted object. */
  sha256: string;
  size: number;
  contentType: string;
}

export interface FilesManifest {
  version: 1;
  id: string;
  kind: 'file storage';
  environment: string;
  lane: string | null;
  bucket: string;
  createdAt: string;
  encryption: 'AES-256-GCM';
  /** Plain bytes of all entries together. */
  totalBytes: number;
  objects: FileBackupEntry[];
}

/** Where file backups live inside the lane folder: manifests in `files/`, encrypted objects in `files/objects/`. */
export interface FileStores {
  manifests: BackupStore;
  objects: BackupStore;
}

export function openFileStores(laneDir: string): FileStores {
  const manifests = join(laneDir, 'files');
  return { manifests: new LocalFolderStore(manifests), objects: new LocalFolderStore(join(manifests, 'objects')) };
}

const OBJECT_NAME = /^[0-9a-f]{64}\.enc$/;
export const objectFileName = (sha256: string): string => `${sha256}.enc`;
export const isObjectFileName = (name: string): boolean => OBJECT_NAME.test(name);

export interface FilesBackupDeps {
  env: Pick<OpsEnv, 'appEnv' | 'lane'>;
  /** The lane folder: runs.jsonl lives here. */
  store: BackupStore;
  files: FileStores;
  /** The live bucket, read only. */
  storage: ListableStorage;
  /** Name shown in the manifest. */
  bucket: string;
  notifier: OperatorNotifier;
  getKey: () => Buffer;
  now?: () => Date;
}

export interface FilesBackupResult {
  record: RunRecord;
  manifest: FilesManifest;
  /** Encrypted objects written by this run (the others were already stored). */
  written: number;
  /** Keys listed but gone before they were read (deleted while the run was going). */
  vanished: number;
}

export async function backupFiles(deps: FilesBackupDeps): Promise<FilesBackupResult> {
  const { env, store, files, storage, notifier } = deps;
  const now = deps.now ?? (() => new Date());
  const started = now();
  const environment = env.appEnv;
  const id = newRunId('file storage', started);
  const manifestName = manifestFileName(id);
  const base: RunRecord = {
    id,
    kind: 'file storage',
    environment,
    startedAt: started.toISOString(),
    status: 'started',
    location: files.manifests.locate(manifestName),
    encrypted: true,
  };
  await appendRun(store, base);
  try {
    const key = deps.getKey();
    const objects: FileBackupEntry[] = [];
    let written = 0;
    let vanished = 0;
    for (const objectKey of (await storage.listKeys()).sort()) {
      const object = await storage.get(objectKey);
      if (object === null) {
        vanished++;
        continue;
      }
      const sha256 = createHash('sha256').update(object.body).digest('hex');
      const name = objectFileName(sha256);
      if (!(await files.objects.exists(name))) {
        const encrypt = createEncryptStream(key);
        await Promise.all([files.objects.writeStream(name, encrypt), pipeline(Readable.from([object.body]), encrypt)]);
        written++;
      }
      objects.push({ key: objectKey, sha256, size: object.body.length, contentType: object.contentType });
    }
    const totalBytes = objects.reduce((sum, o) => sum + o.size, 0);
    const manifest: FilesManifest = {
      version: 1,
      id,
      kind: 'file storage',
      environment,
      lane: env.lane ?? null,
      bucket: deps.bucket,
      createdAt: started.toISOString(),
      encryption: 'AES-256-GCM',
      totalBytes,
      objects,
    };
    await files.manifests.writeText(manifestName, `${JSON.stringify(manifest, null, 2)}\n`);
    const finished = now();
    const record: RunRecord = {
      ...base,
      status: 'complete',
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      sizeBytes: totalBytes,
    };
    await appendRun(store, record);
    return { record, manifest, written, vanished };
  } catch (e) {
    const error = redactErrorText(e);
    const finished = now();
    await appendRun(store, {
      ...base,
      status: 'failed',
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      error,
    });
    await notifier.notify({ environment, kind: 'file storage', at: finished, error });
    throw e;
  }
}
