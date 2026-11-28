/**
 * Daily database backup (EP-38-S1, S4, S5). Steps:
 *   1. open a REPEATABLE READ READ ONLY transaction as the owner and export its snapshot
 *      (MVCC: no write lock, so the counter never waits);
 *   2. read the manifest statistics in that snapshot;
 *   3. `pg_dump --format=custom --snapshot=<id>` streams through AES-256-GCM into the store;
 *   4. write the manifest (sha256 of the encrypted file, statistics) and a `complete` record.
 * Any failure removes the partial file, writes a `failed` record, alerts the operator and
 * rethrows. A write that commits after step 1 is in neither the dump nor the statistics.
 */
import { pipeline } from 'node:stream/promises';
import { createPool } from '../db/connection.js';
import { databaseName } from '../db/create-databases.js';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { createEncryptStream, sha256Of } from './backup-crypto.js';
import {
  appendRun,
  dumpFileName,
  listBackups,
  manifestFileName,
  newRunId,
  type RunRecord,
} from './backup-records.js';
import type { BackupStore } from './backup-store.js';
import type { OperatorNotifier } from './notify-operator.js';
import type { OpsEnv } from './ops-env.js';
import type { PgTools } from './pg-tools.js';
import { type DbStats, readDbStats } from './table-stats.js';
export interface DatabaseManifest {
  version: 1;
  id: string;
  kind: 'daily full';
  environment: string;
  lane: string | null;
  database: string;
  createdAt: string;
  format: 'pg_dump custom';
  encryption: 'AES-256-GCM';
  file: string;
  sizeBytes: number;
  /** sha256 (hex) of the encrypted file. */
  sha256: string;
  stats: DbStats;
}
export interface DatabaseBackupDeps {
  env: Pick<OpsEnv, 'databaseUrl' | 'appEnv' | 'lane'>;
  store: BackupStore;
  tools: PgTools;
  notifier: OperatorNotifier;
  /** Read inside the run, so a missing key is a failed (and alerted) backup, not a crash. */
  getKey: () => Buffer;
  now?: () => Date;
}
export type DatabaseBackupResult =
  | { status: 'complete'; record: RunRecord; manifest: DatabaseManifest }
  | { status: 'skipped'; record: RunRecord };
const utcDay = (iso: string): string => iso.slice(0, 10);
export async function runDatabaseBackup(
  deps: DatabaseBackupDeps,
  options: { ifNotDoneToday?: boolean } = {},
): Promise<DatabaseBackupResult> {
  const { env, store, tools, notifier } = deps;
  const now = deps.now ?? (() => new Date());
  const started = now();
  const environment = env.appEnv;
  if (options.ifNotDoneToday) {
    const done = (await listBackups(store, { kind: 'daily full', status: 'complete', environment })).find(
      (r) => utcDay(r.startedAt) === utcDay(started.toISOString()),
    );
    if (done) return { status: 'skipped', record: done };
  }
  const id = newRunId('daily full', started);
  const file = dumpFileName(id);
  const base: RunRecord = {
    id,
    kind: 'daily full',
    environment,
    startedAt: started.toISOString(),
    status: 'started',
    location: store.locate(file),
    encrypted: true,
  };
  await appendRun(store, base);
  const pool = createPool(env.databaseUrl, 1);
  try {
    const key = deps.getKey();
    const client = await pool.connect();
    let stats: DbStats;
    let sizeBytes: number;
    try {
      await client.query('begin isolation level repeatable read read only');
      const snapshot = (await client.query<{ s: string }>('select pg_export_snapshot() as s')).rows[0].s;
      stats = await readDbStats(client);
      const encrypt = createEncryptStream(key);
      const dump = tools.dump({ databaseUrl: env.databaseUrl, snapshot });
      [sizeBytes] = await Promise.all([store.writeStream(file, encrypt), pipeline(dump, encrypt)]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    const sha256 = await sha256Of(store.readStream(file));
    const finished = now();
    const manifest: DatabaseManifest = {
      version: 1,
      id,
      kind: 'daily full',
      environment,
      lane: env.lane ?? null,
      database: databaseName(env.databaseUrl),
      createdAt: started.toISOString(),
      format: 'pg_dump custom',
      encryption: 'AES-256-GCM',
      file,
      sizeBytes,
      sha256,
      stats,
    };
    await store.writeText(manifestFileName(id), `${JSON.stringify(manifest, null, 2)}\n`);
    const record: RunRecord = {
      ...base,
      status: 'complete',
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      sizeBytes,
    };
    await appendRun(store, record);
    return { status: 'complete', record, manifest };
  } catch (e) {
    const error = redactErrorText(e);
    await store.remove(file).catch(() => {});
    const finished = now();
    await appendRun(store, {
      ...base,
      status: 'failed',
      finishedAt: finished.toISOString(),
      durationMs: finished.getTime() - started.getTime(),
      error,
    });
    await notifier.notify({ environment, kind: 'daily full', at: finished, error });
    throw e;
  } finally {
    await pool.end();
  }
}
