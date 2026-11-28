/**
 * The automatic half of a restore drill (EP-38-S8). `runDrill` times, in order: a fresh database
 * backup, a restore into a throwaway database, the S7 audit check (which must pass), a second
 * restore into another throwaway database whose audit log is then damaged on purpose (one entry
 * deleted) and checked again (which must fail and name the entry), and the drop of both copies.
 * Both copies are always dropped, also when a step fails. It never touches anything but the live
 * database (read only, through the backup) and the two throwaway databases it names, and both names
 * pass the restore guards of this lane. The manual steps (approval, files, sign-in, telling staff)
 * are in docs/setup/restore-drill.md; `recordCommand` is the `drill:record` line to finish after them.
 */
import { randomBytes } from 'node:crypto';
import { userInfo } from 'node:os';
import { createPool } from '../db/connection.js';
import { checkAuditAfterRestore } from './audit-check.js';
import { type DatabaseManifest, runDatabaseBackup } from './backup-db.js';
import type { BackupStore } from './backup-store.js';
import { dropRestored } from './drop-restored.js';
import type { OperatorNotifier } from './notify-operator.js';
import type { OpsEnv } from './ops-env.js';
import { assertRestoreTarget } from './ops-guards.js';
import type { PgTools } from './pg-tools.js';
import { databaseExists, restoreDatabase, urlForDatabase } from './restore-db.js';

export interface DrillRunDeps {
  env: Pick<OpsEnv, 'databaseUrl' | 'appEnv' | 'lane'>;
  store: BackupStore;
  tools: PgTools;
  notifier: OperatorNotifier;
  getKey: () => Buffer;
  now?: () => Date;
  /** Progress lines; defaults to nothing. */
  log?: (line: string) => void;
  /** Throwaway database names; default `goldsmith_restore_<lane>_drill_<hex>` and `..._drill_bad_<hex>`. */
  names?: { restore: string; damaged: string };
  /** Defaults to the operating-system user name. */
  runBy?: string;
}

export interface DrillTimings {
  backupMs: number;
  restoreMs: number;
  auditCheckMs: number;
  damagedCheckMs: number;
  dropMs: number;
  totalMs: number;
}
export interface DrillRunResult {
  backup: string;
  backupCreatedAt: string;
  restoreTarget: string;
  damagedTarget: string;
  timings: DrillTimings;
  /** Tables and audit entries of the intact restore, all matching the backup. */
  tables: number;
  auditEntries: number;
  /** The audit entry deleted from the damaged copy, and the check's findings that named it. */
  damagedEntryId: string;
  damagedProblems: string[];
  /** Backup, restore and the audit check, in minutes: the part of the drill this command measured. */
  measuredMinutes: number;
  recordCommand: string;
}

export class DrillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrillError';
  }
}

/** `goldsmith_restore_c_drill_ab12cd` for lane c, `goldsmith_restore_drill_ab12cd` without a lane. */
export function drillNames(lane: string | undefined): { restore: string; damaged: string } {
  const prefix = lane ? `goldsmith_restore_${lane}` : 'goldsmith_restore';
  const id = randomBytes(3).toString('hex');
  return { restore: `${prefix}_drill_${id}`, damaged: `${prefix}_drill_bad_${id}` };
}

/** Deletes the first audit entry of a copy as its owner; the append-only triggers only fire for origin sessions. */
async function deleteOneAuditEntry(url: string): Promise<string> {
  const pool = createPool(url, 1);
  const client = await pool.connect();
  try {
    const first = await client.query<{ id: string }>('select id from audit_entries order by at, id limit 1');
    const id = first.rows[0]?.id;
    if (!id) throw new DrillError('The restored copy has no audit entry to damage; seed the database first');
    await client.query('begin');
    await client.query('set local session_replication_role = replica');
    await client.query('delete from audit_entries where id = $1', [id]);
    await client.query('commit');
    return id;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

export function drillRecordCommand(input: {
  date: string;
  environment: string;
  manifest: Pick<DatabaseManifest, 'id' | 'createdAt'>;
  measuredMinutes: number;
  runBy: string;
}): string {
  const { manifest } = input;
  return [
    'npm run drill:record --',
    `--date ${input.date}`,
    `--environment ${input.environment}`,
    `--restore-point "backup ${manifest.id} taken ${manifest.createdAt}"`,
    `--duration-minutes ${input.measuredMinutes}`,
    '--step 1=pass',
    '--step 2=<pass|fail>',
    '--step 3=pass',
    '--step 4=<pass|fail>',
    '--step 5=<pass|fail>',
    '--step 6=pass',
    '--step 7=<pass|fail>',
    '--step 8=<pass|fail>',
    `--run-by "${input.runBy}"`,
    '--notes "<what you saw>"',
  ].join(' ');
}

export async function runDrill(deps: DrillRunDeps): Promise<DrillRunResult> {
  const { env, store, tools } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => {});
  const names = deps.names ?? drillNames(env.lane);
  const guarded = { env, tools };
  const restoreDeps = { env, store, tools, getKey: deps.getKey, now, runBy: deps.runBy };
  const timed = async <T>(work: () => Promise<T>): Promise<{ value: T; ms: number }> => {
    const t0 = now().getTime();
    const value = await work();
    return { value, ms: now().getTime() - t0 };
  };
  const started = now().getTime();
  // Pure guards before any connection; then a name that already exists is not ours to drop afterwards.
  for (const name of [names.restore, names.damaged]) {
    assertRestoreTarget({ name, liveDatabase: new URL(env.databaseUrl).pathname.slice(1), appEnv: env.appEnv, lane: env.lane });
  }
  for (const name of [names.restore, names.damaged]) {
    if (await databaseExists(env.databaseUrl, name)) throw new DrillError(`Database ${name} already exists; the drill never reuses a database`);
  }
  let failure: unknown;
  let result:
    | (Omit<DrillRunResult, 'timings' | 'recordCommand' | 'measuredMinutes'> & {
        manifest: DatabaseManifest;
        times: Omit<DrillTimings, 'dropMs' | 'totalMs'>;
      })
    | undefined;
  try {
    const backup = await timed(async () => {
      const r = await runDatabaseBackup({ env, store, tools, notifier: deps.notifier, getKey: deps.getKey, now });
      if (r.status !== 'complete') throw new DrillError('The drill backup did not complete');
      return r.manifest;
    });
    log(`Backup ${backup.value.id} complete (${backup.ms} ms)`);

    const restored = await timed(() => restoreDatabase(restoreDeps, { backup: backup.value.id, target: names.restore }));
    log(`Restored into ${names.restore}: ${restored.value.tables} tables, ${restored.value.auditEntries} audit entries match (${restored.ms} ms)`);

    const intact = await timed(() =>
      checkAuditAfterRestore({
        manifest: backup.value,
        targetUrl: restored.value.targetUrl,
        sourceUrl: env.databaseUrl,
      }),
    );
    if (!intact.value.ok) {
      throw new DrillError(
        `The audit check failed on the intact restore (${intact.value.problems.map((p) => p.check).join(', ')}); run check:audit for the details`,
      );
    }
    log(`Audit check passed on the intact copy (${intact.ms} ms)`);

    await restoreDatabase(restoreDeps, { backup: backup.value.id, target: names.damaged });
    const damagedEntryId = await deleteOneAuditEntry(urlForDatabase(env.databaseUrl, names.damaged));
    const damaged = await timed(() =>
      checkAuditAfterRestore({
        manifest: backup.value,
        targetUrl: urlForDatabase(env.databaseUrl, names.damaged),
      }),
    );
    const naming = damaged.value.problems.filter((p) => p.ids?.includes(damagedEntryId));
    if (damaged.value.ok || naming.length === 0) {
      throw new DrillError('The audit check did not detect the deliberately deleted audit entry');
    }
    log(`Audit check failed on the damaged copy as it must, naming the deleted entry (${damaged.ms} ms)`);

    result = {
      backup: backup.value.id,
      backupCreatedAt: backup.value.createdAt,
      restoreTarget: names.restore,
      damagedTarget: names.damaged,
      tables: restored.value.tables,
      auditEntries: restored.value.auditEntries,
      damagedEntryId,
      damagedProblems: naming.map((p) => `[${p.check}] ${p.message}`),
      manifest: backup.value,
      times: { backupMs: backup.ms, restoreMs: restored.ms, auditCheckMs: intact.ms, damagedCheckMs: damaged.ms },
    };
  } catch (e) {
    failure = e;
  }

  // Both throwaway copies go, whatever happened above.
  const drop = await timed(async () => {
    const problems: string[] = [];
    for (const name of [names.damaged, names.restore]) {
      try {
        await dropRestored(guarded, { name });
        if (await databaseExists(env.databaseUrl, name)) problems.push(`${name} still exists after the drop`);
      } catch (e) {
        problems.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return problems;
  });
  if (failure !== undefined) throw failure;
  if (!result) throw new DrillError('The drill did not finish');
  if (drop.value.length > 0) throw new DrillError(`Could not drop the throwaway copies: ${drop.value.join('; ')}`);
  log(`Dropped ${names.damaged} and ${names.restore} (${drop.ms} ms)`);

  const { manifest, times, ...rest } = result;
  const totalMs = now().getTime() - started;
  const measuredMinutes = Number(((times.backupMs + times.restoreMs + times.auditCheckMs) / 60_000).toFixed(2));
  return {
    ...rest,
    timings: { ...times, dropMs: drop.ms, totalMs },
    measuredMinutes,
    recordCommand: drillRecordCommand({
      date: now().toISOString().slice(0, 10),
      environment: env.appEnv,
      manifest,
      measuredMinutes: Math.max(measuredMinutes, 0.01),
      runBy: deps.runBy ?? userInfo().username,
    }),
  };
}
