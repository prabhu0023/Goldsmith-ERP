/**
 * The missing-backup check (EP-38-S5 AC2): fails, and alerts the operator, when there is no
 * complete daily full backup finished within 24 hours plus a grace period (BACKUP_GRACE_HOURS).
 * Run it on a schedule after the backup. The clock is injected so a test needs no waiting.
 */
import { listBackups, type RunRecord } from './backup-records.js';
import type { BackupStore } from './backup-store.js';
import type { OperatorNotifier } from './notify-operator.js';
const HOUR_MS = 3_600_000;
export interface BackupCheckResult {
  ok: boolean;
  /** The newest complete daily full backup, when there is one. */
  latest?: RunRecord;
  message: string;
}
export async function checkBackupPresent(options: {
  store: BackupStore;
  notifier: OperatorNotifier;
  environment: string;
  graceHours: number;
  now: Date;
}): Promise<BackupCheckResult> {
  const { store, notifier, environment, graceHours, now } = options;
  const complete = await listBackups(store, { kind: 'daily full', status: 'complete', environment });
  const finishedAt = (r: RunRecord): number => Date.parse(r.finishedAt ?? r.startedAt);
  const newest = complete.reduce<RunRecord | undefined>((a, r) => (!a || finishedAt(r) > finishedAt(a) ? r : a), undefined);
  const limitMs = (24 + graceHours) * HOUR_MS;
  if (newest && now.getTime() - finishedAt(newest) <= limitMs) {
    return { ok: true, latest: newest, message: `Latest complete daily full backup finished ${newest.finishedAt}` };
  }
  const message = newest
    ? `No complete daily full backup in the last ${24 + graceHours} hours (latest finished ${newest.finishedAt})`
    : 'No complete daily full backup has been recorded';
  await notifier.notify({ environment, kind: 'daily full', at: now, error: message });
  return { ok: false, latest: newest, message };
}
