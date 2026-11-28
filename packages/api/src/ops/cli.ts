/**
 * Backup commands (EP-38), run via `npm run backup:<command>`:
 *   backup-db [--if-not-done-today]          encrypted database backup into the lane's folder
 *   backup-list                              every backup run with status, size and location
 *   backup-check                             exit 1 and alert when the daily backup is missing
 *   backup-prune [--dry-run] [--retention-days n]   delete database backups past the retention
 *   restore-db --backup <id|latest> --target <name> [--allow-staging]   restore into a new throwaway database
 *   restore-drop <name> [--allow-staging]    drop a throwaway restore database
 *   check-audit --backup <id|latest> --target <name> [--source]   audit-log completeness check of a restore
 *   restore-sends --since <ISO> [--until <ISO>]   sends and lost work after a restore point
 *   backup-files                             encrypted copy of every object of the lane's file bucket
 *   restore-files --backup <id|latest> --bucket <name>   restore into a new throwaway bucket
 *   check-files --target <db> --bucket <name>   every stored file of a restored database is in the restored bucket
 *   drill-run                                time a backup, restore, audit check and a damaged copy, then drop both copies
 *   drill-record --date <YYYY-MM-DD> --restore-point <text> --duration-minutes <n> --step <1-8>=<pass|fail> (all eight)
 *                [--environment <name>] [--run-by <name>] [--notes <text>] [--target-minutes <n>]   append a row to docs/setup/restore-drills.md
 * Reads DATABASE_URL, APP_ENV, LANE and the BACKUP_* variables (backup-db, restore-db, backup-files and restore-files also BACKUP_ENCRYPTION_KEY; the file commands read STORAGE_*).
 * Exit code 0 on success, 1 with a one-line error otherwise.
 */
import { userInfo } from 'node:os';
import { parseArgs } from 'node:util';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { checkAuditAfterRestore } from './audit-check.js';
import { runDatabaseBackup } from './backup-db.js';
import { checkBackupPresent } from './backup-check.js';
import { listBackups, type RunRecord } from './backup-records.js';
import { LocalFolderStore } from './backup-store.js';
import { readStorageEnv } from '../files/storage-config.js';
import { S3Storage } from '../files/s3-storage.js';
import { dropRestored } from './drop-restored.js';
import { recordDrill } from './drill-record.js';
import { runDrill } from './drill-run.js';
import { checkFileReferences } from './files-check.js';
import { backupFiles, openFileStores } from './files-backup.js';
import { restoreFiles } from './files-restore.js';
import { createOperatorNotifier, fileSink, logSink, outboxSink } from './notify-operator.js';
import { readBackupKey, readOpsEnv } from './ops-env.js';
import { assertRestoreBucket, assertRestoreTarget } from './ops-guards.js';
import { createPgTools } from './pg-tools.js';
import { loadManifest, restoreDatabase, urlForDatabase } from './restore-db.js';
import { pruneBackups } from './retention.js';
import { parseInstant, readSendsAndLostWork } from './sends-after.js';
const COMMANDS = [
  'backup-db',
  'backup-list',
  'backup-check',
  'backup-prune',
  'restore-db',
  'restore-drop',
  'check-audit',
  'restore-sends',
  'backup-files',
  'restore-files',
  'check-files',
  'drill-run',
  'drill-record',
];
const MAX_IDS_SHOWN = 20;
function table(rows: string[][]): void {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => row[i].length)));
  for (const row of rows) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd());
}
const megabytes = (bytes: number | undefined): string => (bytes === undefined ? '-' : `${(bytes / 1_048_576).toFixed(2)} MB`);
function printList(runs: RunRecord[]): void {
  if (runs.length === 0) {
    console.log('No backups recorded.');
    return;
  }
  table([
    ['Id', 'Kind', 'Status', 'Environment', 'Started (UTC)', 'Finished (UTC)', 'Size', 'Encrypted', 'Location'],
    ...runs.map((r) => [
      r.id,
      r.kind,
      r.status,
      r.environment,
      r.startedAt,
      r.finishedAt ?? r.deletedAt ?? '-',
      megabytes(r.sizeBytes),
      r.encrypted ? 'yes' : '-',
      r.location ?? '-',
    ]),
  ]);
}
/** The file bucket settings (lane applied), or a clear error when STORAGE_BUCKET is not set. */
function storageSettings(): NonNullable<ReturnType<typeof readStorageEnv>> {
  const settings = readStorageEnv();
  if (!settings) throw new Error('STORAGE_BUCKET is not set; there is no file storage to back up or check');
  return settings;
}

function requireOption(values: Record<string, unknown>, name: string, command: string): string {
  const value = values[name];
  if (typeof value !== 'string' || value === '') throw new Error(`${command} needs --${name}`);
  return value;
}
async function main(command: string | undefined, args: string[]): Promise<void> {
  if (command === undefined || !COMMANDS.includes(command)) {
    throw new Error(`Unknown command ${command ?? '(none)'}; use ${COMMANDS.join(', ')}`);
  }
  const { values, positionals } = parseArgs({
    args,
    options: {
      'if-not-done-today': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'retention-days': { type: 'string' },
      backup: { type: 'string' },
      target: { type: 'string' },
      bucket: { type: 'string' },
      'allow-staging': { type: 'boolean' },
      source: { type: 'boolean' },
      since: { type: 'string' },
      until: { type: 'string' },
      date: { type: 'string' },
      environment: { type: 'string' },
      'restore-point': { type: 'string' },
      'duration-minutes': { type: 'string' },
      'target-minutes': { type: 'string' },
      step: { type: 'string', multiple: true },
      'run-by': { type: 'string' },
      notes: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const wanted = command === 'restore-drop' ? 1 : 0;
  if (positionals.length !== wanted) {
    throw new Error(command === 'restore-drop' ? 'restore-drop needs one database name' : `Unexpected argument ${positionals[0]}`);
  }
  const env = readOpsEnv();
  const store = new LocalFolderStore(env.laneDir);
  const notifier = createOperatorNotifier({
    sinks: [logSink(), fileSink(store), outboxSink(env.databaseUrl)],
    store,
    groupMinutes: env.alertGroupMinutes,
  });
  if (command === 'backup-list') {
    printList(await listBackups(store));
  } else if (command === 'backup-db') {
    const result = await runDatabaseBackup(
      { env, store, notifier, tools: createPgTools({ container: env.pgContainer }), getKey: () => readBackupKey() },
      { ifNotDoneToday: values['if-not-done-today'] },
    );
    if (result.status === 'skipped') {
      console.log(`Skipped: today's daily full backup already exists (${result.record.id}).`);
    } else {
      const r = result.record;
      console.log(`Backup ${r.id} complete: ${r.location} (${megabytes(r.sizeBytes)}, ${r.durationMs} ms, encrypted)`);
    }
  } else if (command === 'backup-check') {
    const result = await checkBackupPresent({
      store,
      notifier,
      environment: env.appEnv,
      graceHours: env.graceHours,
      now: new Date(),
    });
    if (!result.ok) throw new Error(result.message);
    console.log(result.message);
  } else if (command === 'restore-db') {
    const target = requireOption(values, 'target', command);
    const result = await restoreDatabase(
      { env, store, tools: createPgTools({ container: env.pgContainer }), getKey: () => readBackupKey() },
      { backup: requireOption(values, 'backup', command), target, allowStaging: values['allow-staging'] },
    );
    console.log(
      `Restored ${result.backup} into ${result.target}: ${result.tables} tables and ${result.auditEntries} audit entries match the manifest (${result.durationMs} ms).`,
    );
  } else if (command === 'restore-drop') {
    const name = positionals[0];
    const result = await dropRestored(
      { env, tools: createPgTools({ container: env.pgContainer }) },
      { name, allowStaging: values['allow-staging'] },
    );
    console.log(result.dropped ? `Dropped ${name}.` : `${name} does not exist; nothing to drop.`);
  } else if (command === 'check-audit') {
    const target = requireOption(values, 'target', command);
    assertRestoreTarget({
      name: target,
      liveDatabase: new URL(env.databaseUrl).pathname.slice(1),
      appEnv: env.appEnv,
      lane: env.lane,
      allowStaging: values['allow-staging'],
    });
    const manifest = await loadManifest(store, requireOption(values, 'backup', command));
    const result = await checkAuditAfterRestore({
      manifest,
      targetUrl: urlForDatabase(env.databaseUrl, target),
      sourceUrl: values.source ? env.databaseUrl : undefined,
    });
    for (const p of result.problems) {
      console.log(`FAIL [${p.check}] ${p.message}`);
      for (const id of p.ids?.slice(0, MAX_IDS_SHOWN) ?? []) console.log(`  ${id}`);
      if ((p.ids?.length ?? 0) > MAX_IDS_SHOWN) console.log(`  ... and ${(p.ids?.length ?? 0) - MAX_IDS_SHOWN} more`);
    }
    if (!result.ok) throw new Error(`Audit check failed with ${result.problems.length} problem(s), listed above`);
    console.log(
      `Audit check passed: ${result.tables} tables and ${result.auditEntries} audit entries match ${manifest.id}${values.source ? ' and the source' : ''}; append-only rule intact.`,
    );
  } else if (command === 'backup-files') {
    const settings = storageSettings();
    const storage = new S3Storage(settings);
    try {
      const result = await backupFiles({
        env,
        store,
        files: openFileStores(env.laneDir),
        storage,
        bucket: settings.bucket,
        notifier,
        getKey: () => readBackupKey(),
      });
      const r = result.record;
      console.log(
        `File backup ${r.id} complete: ${result.manifest.objects.length} objects from bucket ${settings.bucket} (${megabytes(r.sizeBytes)}, ${result.written} new, ${r.durationMs} ms, encrypted) in ${r.location}`,
      );
    } finally {
      storage.close();
    }
  } else if (command === 'restore-files') {
    const settings = storageSettings();
    const bucket = requireOption(values, 'bucket', command);
    const opened: S3Storage[] = [];
    try {
      const result = await restoreFiles(
        {
          env,
          store,
          files: openFileStores(env.laneDir),
          openStorage: (name) => {
            const storage = new S3Storage({ ...settings, bucket: name });
            opened.push(storage);
            return storage;
          },
          getKey: () => readBackupKey(),
        },
        { backup: requireOption(values, 'backup', command), bucket, allowStaging: values['allow-staging'] },
      );
      console.log(`Restored ${result.backup} into bucket ${result.bucket}: ${result.objects} objects verified and written (${result.durationMs} ms).`);
    } finally {
      for (const storage of opened) storage.close();
    }
  } else if (command === 'check-files') {
    const settings = storageSettings();
    const target = requireOption(values, 'target', command);
    const bucket = requireOption(values, 'bucket', command);
    const guard = { appEnv: env.appEnv, lane: env.lane, allowStaging: values['allow-staging'] };
    assertRestoreTarget({ ...guard, name: target, liveDatabase: new URL(env.databaseUrl).pathname.slice(1) });
    assertRestoreBucket({ ...guard, name: bucket });
    const storage = new S3Storage({ ...settings, bucket });
    try {
      const result = await checkFileReferences({ targetUrl: urlForDatabase(env.databaseUrl, target), storage });
      for (const m of result.missing) console.log(`FAIL missing file ${m.code} (${m.missing.join(', ')})`);
      if (!result.ok) throw new Error(`File check failed: ${result.missing.length} of ${result.files} file(s) missing from the restored bucket, listed above`);
      console.log(`File check passed: ${result.files} files (${result.keys} stored copies) are all in bucket ${bucket}; zero missing.`);
    } finally {
      storage.close();
    }
  } else if (command === 'drill-run') {
    const result = await runDrill({
      env,
      store,
      tools: createPgTools({ container: env.pgContainer }),
      notifier,
      getKey: () => readBackupKey(),
      log: (line) => console.log(line),
    });
    const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
    const t = result.timings;
    console.log(
      `Drill passed in ${seconds(t.totalMs)}: backup ${seconds(t.backupMs)}, restore ${seconds(t.restoreMs)}, audit check ${seconds(t.auditCheckMs)}, damaged copy check ${seconds(t.damagedCheckMs)}, drop ${seconds(t.dropMs)}.`,
    );
    console.log(`The damaged copy failed the check as it must (deleted audit entry ${result.damagedEntryId}); both throwaway databases are dropped.`);
    console.log('Finish the manual steps in docs/setup/restore-drill.md, then record the drill (replace each <pass|fail> and the notes):');
    console.log(result.recordCommand);
  } else if (command === 'drill-record') {
    const steps: Record<string, string> = {};
    for (const item of values.step ?? []) {
      const [number, ...result] = item.split('=');
      steps[number] = result.join('=');
    }
    const minutes = (raw: string, flag: string): number => {
      if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`--${flag} must be a number of minutes, for example 12.5`);
      return Number(raw);
    };
    const recorded = recordDrill({
      date: requireOption(values, 'date', command),
      environment: values.environment ?? env.appEnv,
      restorePoint: requireOption(values, 'restore-point', command),
      durationMinutes: minutes(requireOption(values, 'duration-minutes', command), 'duration-minutes'),
      targetMinutes: values['target-minutes'] === undefined ? undefined : minutes(values['target-minutes'], 'target-minutes'),
      steps,
      runBy: values['run-by'] ?? userInfo().username,
      notes: values.notes,
    });
    console.log(`Recorded in ${recorded.path}: ${recorded.withinTarget ? 'within' : 'over'} target${recorded.provisional ? ' (default target, provisional)' : ''}.`);
    console.log(recorded.row);
  } else if (command === 'restore-sends') {
    const since = parseInstant(requireOption(values, 'since', command), '--since');
    const until = values.until === undefined ? undefined : parseInstant(values.until, '--until');
    if (until && until < since) throw new Error('--until must not be before --since');
    const { sends, lostWork } = await readSendsAndLostWork(env.databaseUrl, { since, until });
    console.log(`Sends since ${sends.window.since}${sends.window.until ? ` until ${sends.window.until}` : ''} (codes and ids only):`);
    table([
      ['Source', 'Id or code', 'Kind or topic', 'At (UTC)'],
      ...sends.outbox.map((r) => ['outbox', r.id, r.topic, r.createdAt]),
      ...sends.wishes.map((r) => ['wish', r.code, r.kind, r.at]),
      ...sends.broadcasts.map((r) => ['broadcast', r.code, `${r.audience} (${r.recipients} recipients)`, r.at]),
      ...sends.audit.map((r) => ['audit', r.id, r.entityId ? `${r.kind} (${r.entityId})` : r.kind, r.at]),
    ]);
    console.log(`Work recorded in the same window (${lostWork.total} audit entries, to be redone after a restore):`);
    for (const [kind, n] of Object.entries(lostWork.byKind)) console.log(`  ${kind}  ${n}`);
  } else {
    const raw = values['retention-days'];
    if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) throw new Error('--retention-days must be a whole number of at least 1');
    const result = await pruneBackups({
      store,
      retentionDays: raw === undefined ? env.retentionDays : Number(raw),
      now: new Date(),
      dryRun: values['dry-run'],
      files: openFileStores(env.laneDir),
    });
    const verb = result.dryRun ? 'Would delete' : 'Deleted';
    for (const r of result.expired) console.log(`${verb} ${r.id} (started ${r.startedAt})`);
    for (const r of result.expiredFileRuns) console.log(`${verb} ${r.id} (file storage, started ${r.startedAt})`);
    console.log(
      `${verb} ${result.expiredFileRuns.length} file backup run(s) and ${result.removedObjects} unreferenced file object(s); ${result.keptFileRuns} file run(s) kept${result.dryRun ? ' (dry run, nothing deleted)' : ''}.`,
    );
    console.log(
      `${verb} ${result.expired.length} backup(s) older than ${result.retentionDays} days; ${result.kept} kept${result.dryRun ? ' (dry run, nothing deleted)' : ''}.`,
    );
  }
}
main(process.argv[2], process.argv.slice(3)).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(`Error: ${redactErrorText(e)}`.split('\n')[0]);
    process.exit(1);
  },
);
