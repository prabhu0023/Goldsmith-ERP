/**
 * The durable record of backup runs (EP-38-S1, S3, S10): an append-only `runs.jsonl` in the
 * lane's backup folder, one JSON line per event. A run id appears on several lines (started,
 * then complete or failed, later deleted); listing folds them by id, the last line winning field
 * by field. No database table, so a database that is down or restored never hides the record.
 */
import { randomBytes } from 'node:crypto';
import type { BackupStore } from './backup-store.js';
export const RUNS_FILE = 'runs.jsonl';
export type RunKind = 'daily full' | 'file storage';
export type RunStatus = 'started' | 'complete' | 'failed' | 'deleted';
export interface RunRecord {
  id: string;
  kind: RunKind;
  status: RunStatus;
  environment: string;
  /** ISO times, UTC. */
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  sizeBytes?: number;
  /** Absolute path (or bucket URL) of the backup file. */
  location?: string;
  encrypted?: boolean;
  /** Redacted error text of a failed run. */
  error?: string;
  deletedAt?: string;
}
const RUN_ID = /^(db|files)-\d{8}T\d{6}Z-[0-9a-f]{4}$/;
export const isRunId = (id: string): boolean => RUN_ID.test(id);
/** `db-20260518T101530Z-ab12` for a database backup, `files-...` for a file storage run. */
export function newRunId(kind: RunKind, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${kind === 'daily full' ? 'db' : 'files'}-${stamp}-${randomBytes(2).toString('hex')}`;
}
export const dumpFileName = (id: string): string => `${id}.dump.enc`;
export const manifestFileName = (id: string): string => `${id}.manifest.json`;
export async function appendRun(store: BackupStore, record: RunRecord): Promise<void> {
  await store.appendLine(RUNS_FILE, JSON.stringify(record));
}
/** Every line of runs.jsonl in order. A line that is not valid JSON (a torn write) is skipped. */
export async function readRuns(store: BackupStore): Promise<RunRecord[]> {
  const text = (await store.readText(RUNS_FILE)) ?? '';
  const records: RunRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as RunRecord;
      if (typeof parsed.id === 'string' && typeof parsed.status === 'string') records.push(parsed);
    } catch {
      // skipped
    }
  }
  return records;
}
/** One record per run id, oldest start first. */
export function foldRuns(records: RunRecord[]): RunRecord[] {
  const byId = new Map<string, RunRecord>();
  for (const r of records) byId.set(r.id, { ...byId.get(r.id), ...r });
  return [...byId.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
export interface ListFilter {
  kind?: RunKind;
  status?: RunStatus;
  environment?: string;
}
export async function listBackups(store: BackupStore, filter: ListFilter = {}): Promise<RunRecord[]> {
  return foldRuns(await readRuns(store)).filter(
    (r) =>
      (filter.kind === undefined || r.kind === filter.kind) &&
      (filter.status === undefined || r.status === filter.status) &&
      (filter.environment === undefined || r.environment === filter.environment),
  );
}
