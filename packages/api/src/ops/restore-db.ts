/**
 * Restore a database backup into a new throwaway database (EP-38-S6 local half, S1 AC4 and AC5).
 * Order: guards (pure, before any connection), refuse an existing target, find the backup and its
 * manifest, check the file's sha256 against the manifest, check the AES-GCM tag over the whole file
 * (a wrong key or a damaged byte stops here, nothing is created), create the database, stream the
 * decrypted dump into `pg_restore --exit-on-error --no-owner`, then compare every table's row
 * count and checksum with the manifest. Any failure after the database was created drops it again.
 * A database that already existed is never touched. Every attempt past the guards is appended to
 * `restores.jsonl` in the lane folder (backup, target, OS user, times, result). Point-in-time
 * recovery is the AWS half of S6 (docs/setup/backup.md); locally a restore is to a named backup.
 */
import { userInfo } from 'node:os';
import { createPool } from '../db/connection.js';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { createDecryptStream, sha256Of, verifyEncryptedFile } from './backup-crypto.js';
import type { DatabaseManifest } from './backup-db.js';
import { isRunId, listBackups, manifestFileName } from './backup-records.js';
import type { BackupStore } from './backup-store.js';
import type { OpsEnv } from './ops-env.js';
import { assertRestoreTarget, assertTargetAbsent } from './ops-guards.js';
import type { PgTools } from './pg-tools.js';
import { type DbStats, readDbStats } from './table-stats.js';
export const RESTORES_FILE = 'restores.jsonl';
export interface RestoreRecord {
  backup: string;
  target: string;
  environment: string;
  /** The operating-system user who ran the restore. */
  runBy: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: 'ok' | 'failed';
  tables?: number;
  auditEntries?: number;
  error?: string;
}
export interface RestoreDeps {
  env: Pick<OpsEnv, 'databaseUrl' | 'appEnv' | 'lane'>;
  store: BackupStore;
  tools: PgTools;
  getKey: () => Buffer;
  now?: () => Date;
  /** Defaults to the operating-system user name. */
  runBy?: string;
}
export interface RestoreOptions {
  /** A run id, or `latest` for the newest complete daily full backup. */
  backup: string;
  target: string;
  allowStaging?: boolean;
}
export interface RestoreResult {
  backup: string;
  target: string;
  targetUrl: string;
  manifest: DatabaseManifest;
  durationMs: number;
  tables: number;
  auditEntries: number;
}
/** The restored copy differs from what the manifest recorded. Names tables, never rows. */
export class RestoreMismatchError extends Error {
  constructor(readonly problems: string[]) {
    super(`The restored database does not match the backup manifest: ${problems.join('; ')}`);
    this.name = 'RestoreMismatchError';
  }
}
/** The same server and credentials as `url`, another database. */
export function urlForDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}
export async function databaseExists(url: string, name: string): Promise<boolean> {
  const pool = createPool(urlForDatabase(url, 'postgres'), 1);
  try {
    const res = await pool.query('select 1 from pg_database where datname = $1', [name]);
    return (res.rowCount ?? 0) > 0;
  } finally {
    await pool.end();
  }
}
/** The manifest of `backup` (a run id or `latest`) in the store; throws when there is none. */
export async function loadManifest(store: BackupStore, backup: string): Promise<DatabaseManifest> {
  let id = backup;
  if (backup === 'latest') {
    const complete = await listBackups(store, { kind: 'daily full', status: 'complete' });
    const newest = complete.at(-1);
    if (!newest) throw new Error('No complete database backup is recorded; run backup:db first');
    id = newest.id;
  } else if (!isRunId(backup) || !backup.startsWith('db-')) {
    throw new Error(`"${backup}" is not a database backup id (db-YYYYMMDDTHHMMSSZ-xxxx) or "latest"`);
  }
  const text = await store.readText(manifestFileName(id));
  if (text === undefined) throw new Error(`Backup ${id} has no manifest (deleted or unknown)`);
  const manifest = JSON.parse(text) as DatabaseManifest;
  if (manifest.version !== 1 || manifest.id !== id) throw new Error(`The manifest of backup ${id} is not readable`);
  return manifest;
}
/** Table-level differences between what the manifest recorded and what the database holds. */
export function compareStats(expected: DbStats, actual: DbStats): string[] {
  const problems: string[] = [];
  const names = new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)]);
  for (const name of [...names].sort()) {
    const want = expected.tables[name];
    const got = actual.tables[name];
    if (!want) problems.push(`table ${name} is not in the manifest`);
    else if (!got) problems.push(`table ${name} is missing`);
    else if (want.rows !== got.rows) problems.push(`table ${name} has ${got.rows} rows, the backup had ${want.rows}`);
    else if (want.checksum !== got.checksum) problems.push(`table ${name} has the same row count but different content`);
  }
  return problems;
}
export async function restoreDatabase(deps: RestoreDeps, options: RestoreOptions): Promise<RestoreResult> {
  const { env, store, tools } = deps;
  const now = deps.now ?? (() => new Date());
  const { target } = options;
  // Pure guards first: nothing is connected, read or written for a refused name or environment.
  assertRestoreTarget({
    name: target,
    liveDatabase: new URL(env.databaseUrl).pathname.slice(1),
    appEnv: env.appEnv,
    lane: env.lane,
    allowStaging: options.allowStaging,
  });
  const started = now();
  const record = (fields: Pick<RestoreRecord, 'result'> & Partial<RestoreRecord>): Promise<void> => {
    const finished = now();
    const line: RestoreRecord = {
      backup: options.backup,
      target,
      environment: env.appEnv,
      runBy: deps.runBy ?? userInfo().username,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      ...fields,
    };
    return store.appendLine(RESTORES_FILE, JSON.stringify(line));
  };
  const targetUrl = urlForDatabase(env.databaseUrl, target);
  let created = false;
  try {
    assertTargetAbsent(target, await databaseExists(env.databaseUrl, target));
    const manifest = await loadManifest(store, options.backup);
    if ((await sha256Of(store.readStream(manifest.file))) !== manifest.sha256) {
      throw new Error(`Backup ${manifest.id} does not match the sha256 in its manifest; the file is damaged`);
    }
    await verifyEncryptedFile(store.locate(manifest.file), deps.getKey());
    await tools.createDatabase(env.databaseUrl, target);
    created = true;
    await tools.restore({
      databaseUrl: targetUrl,
      input: await createDecryptStream(store.locate(manifest.file), deps.getKey()),
    });
    const pool = createPool(targetUrl, 1);
    let actual: DbStats;
    try {
      actual = await readDbStats(pool);
    } finally {
      await pool.end();
    }
    const problems = compareStats(manifest.stats, actual);
    if (problems.length > 0) throw new RestoreMismatchError(problems);
    const tables = Object.keys(actual.tables).length;
    await record({ backup: manifest.id, result: 'ok', tables, auditEntries: actual.audit.count });
    return {
      backup: manifest.id,
      target,
      targetUrl,
      manifest,
      durationMs: now().getTime() - started.getTime(),
      tables,
      auditEntries: actual.audit.count,
    };
  } catch (e) {
    // Drop only what this run created; an existing database is never ours to drop.
    if (created) await tools.dropDatabase(env.databaseUrl, target).catch(() => {});
    await record({ result: 'failed', error: redactErrorText(e) }).catch(() => {});
    throw e;
  }
}
