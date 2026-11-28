/**
 * Retention for database backups (EP-38-S10). `pruneBackups` deletes the dump and manifest of
 * every complete daily full backup older than the retention period and appends a `deleted`
 * record for it; with `dryRun` it only reports what it would delete. It touches only files
 * named after a run id of this tool inside the lane's folder; anything else stays.
 *
 * File storage runs (S10 AC4) expire the same way: the run's manifest goes and a `deleted` record
 * is appended. Then every encrypted object that no remaining manifest lists is removed, so a file
 * deleted from the live bucket stays restorable from any run that is still inside the period and
 * nothing a retained run needs is touched. Objects are skipped altogether while a file run that
 * started less than a day ago has not finished (its manifest is not written yet).
 */
import { appendRun, dumpFileName, isRunId, listBackups, manifestFileName, type RunRecord } from './backup-records.js';
import type { BackupStore } from './backup-store.js';
import { type FilesManifest, type FileStores, isObjectFileName } from './files-backup.js';
const DAY_MS = 86_400_000;
export interface PruneResult {
  dryRun: boolean;
  retentionDays: number;
  /** Backups deleted, or that a dry run would delete. */
  expired: RunRecord[];
  kept: number;
  /** File storage runs deleted, or that a dry run would delete (only when `files` was given). */
  expiredFileRuns: RunRecord[];
  keptFileRuns: number;
  /** Encrypted file objects removed, or that a dry run would remove. */
  removedObjects: number;
}

const FILE_MANIFEST = /^(files-\d{8}T\d{6}Z-[0-9a-f]{4})\.manifest\.json$/;

/** sha256 names listed by the manifests in `names` (all of them are read; an unreadable one throws). */
async function referencedObjects(files: FileStores, names: string[]): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const name of names) {
    const text = await files.manifests.readText(name);
    let manifest: FilesManifest;
    try {
      manifest = JSON.parse(text ?? '') as FilesManifest;
    } catch {
      throw new Error(`The file backup manifest ${name} is not readable; no object was removed`);
    }
    if (!Array.isArray(manifest.objects)) throw new Error(`The file backup manifest ${name} is not readable; no object was removed`);
    for (const o of manifest.objects) referenced.add(o.sha256);
  }
  return referenced;
}
export async function pruneBackups(options: {
  store: BackupStore;
  retentionDays: number;
  now: Date;
  dryRun?: boolean;
  /** Where file backups live; when given, file storage runs are expired and unreferenced objects removed. */
  files?: FileStores;
}): Promise<PruneResult> {
  const { store, retentionDays, now } = options;
  const dryRun = options.dryRun ?? false;
  const limit = now.getTime() - retentionDays * DAY_MS;
  const complete = await listBackups(store, { kind: 'daily full', status: 'complete' });
  const expired: RunRecord[] = [];
  let kept = 0;
  for (const run of complete) {
    const age = Date.parse(run.finishedAt ?? run.startedAt);
    if (!isRunId(run.id) || age >= limit) {
      kept++;
      continue;
    }
    expired.push(run);
    if (dryRun) continue;
    await store.remove(dumpFileName(run.id));
    await store.remove(manifestFileName(run.id));
    await appendRun(store, {
      id: run.id,
      kind: run.kind,
      environment: run.environment,
      startedAt: run.startedAt,
      status: 'deleted',
      deletedAt: now.toISOString(),
    });
  }
  const fileResult = options.files
    ? await pruneFileRuns({ store, files: options.files, limit, now, dryRun })
    : { expired: [], kept: 0, removedObjects: 0 };
  return {
    dryRun,
    retentionDays,
    expired,
    kept,
    expiredFileRuns: fileResult.expired,
    keptFileRuns: fileResult.kept,
    removedObjects: fileResult.removedObjects,
  };
}

async function pruneFileRuns(options: {
  store: BackupStore;
  files: FileStores;
  limit: number;
  now: Date;
  dryRun: boolean;
}): Promise<{ expired: RunRecord[]; kept: number; removedObjects: number }> {
  const { store, files, limit, now, dryRun } = options;
  const complete = await listBackups(store, { kind: 'file storage', status: 'complete' });
  const expired: RunRecord[] = [];
  let kept = 0;
  for (const run of complete) {
    if (!isRunId(run.id) || Date.parse(run.finishedAt ?? run.startedAt) >= limit) {
      kept++;
      continue;
    }
    expired.push(run);
  }
  const expiredNames = new Set(expired.map((r) => manifestFileName(r.id)));
  // Objects are judged against every manifest on disk that stays, listed or not.
  const staying = (await files.manifests.list()).filter((n) => FILE_MANIFEST.test(n) && !expiredNames.has(n));
  const referenced = await referencedObjects(files, staying);
  const running = (await listBackups(store, { kind: 'file storage', status: 'started' })).some(
    (r) => now.getTime() - Date.parse(r.startedAt) < DAY_MS,
  );
  const orphans = running
    ? []
    : (await files.objects.list())
        .filter(isObjectFileName)
        .filter((name) => !referenced.has(name.slice(0, -'.enc'.length)));
  if (!dryRun) {
    for (const run of expired) {
      await files.manifests.remove(manifestFileName(run.id));
      await appendRun(store, {
        id: run.id,
        kind: run.kind,
        environment: run.environment,
        startedAt: run.startedAt,
        status: 'deleted',
        deletedAt: now.toISOString(),
      });
    }
    for (const name of orphans) await files.objects.remove(name);
  }
  return { expired, kept, removedObjects: orphans.length };
}
