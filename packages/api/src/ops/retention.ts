/**
 * Retention for database backups (EP-38-S10). `pruneBackups` deletes the dump and manifest of
 * every complete daily full backup older than the retention period and appends a `deleted`
 * record for it; with `dryRun` it only reports what it would delete. It touches only files
 * named after a run id of this tool inside the lane's folder; anything else stays.
 */
import { appendRun, dumpFileName, isRunId, listBackups, manifestFileName, type RunRecord } from './backup-records.js';
import type { BackupStore } from './backup-store.js';
const DAY_MS = 86_400_000;
export interface PruneResult {
  dryRun: boolean;
  retentionDays: number;
  /** Backups deleted, or that a dry run would delete. */
  expired: RunRecord[];
  kept: number;
}
export async function pruneBackups(options: {
  store: BackupStore;
  retentionDays: number;
  now: Date;
  dryRun?: boolean;
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
  return { dryRun, retentionDays, expired, kept };
}
