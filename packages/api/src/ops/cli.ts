/**
 * Backup commands (EP-38), run via `npm run backup:<command>`:
 *   backup-db [--if-not-done-today]          encrypted database backup into the lane's folder
 *   backup-list                              every backup run with status, size and location
 *   backup-check                             exit 1 and alert when the daily backup is missing
 *   backup-prune [--dry-run] [--retention-days n]   delete database backups past the retention
 * Reads DATABASE_URL, APP_ENV, LANE and the BACKUP_* variables (backup-db also BACKUP_ENCRYPTION_KEY).
 * Exit code 0 on success, 1 with a one-line error otherwise.
 */
import { parseArgs } from 'node:util';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { runDatabaseBackup } from './backup-db.js';
import { checkBackupPresent } from './backup-check.js';
import { listBackups, type RunRecord } from './backup-records.js';
import { LocalFolderStore } from './backup-store.js';
import { createOperatorNotifier, fileSink, logSink, outboxSink } from './notify-operator.js';
import { readBackupKey, readOpsEnv } from './ops-env.js';
import { createPgTools } from './pg-tools.js';
import { pruneBackups } from './retention.js';
const COMMANDS = ['backup-db', 'backup-list', 'backup-check', 'backup-prune'];
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
async function main(command: string | undefined, args: string[]): Promise<void> {
  if (command === undefined || !COMMANDS.includes(command)) {
    throw new Error(`Unknown command ${command ?? '(none)'}; use ${COMMANDS.join(', ')}`);
  }
  const { values } = parseArgs({
    args,
    options: {
      'if-not-done-today': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      'retention-days': { type: 'string' },
    },
    strict: true,
  });
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
  } else {
    const raw = values['retention-days'];
    if (raw !== undefined && !/^[1-9]\d*$/.test(raw)) throw new Error('--retention-days must be a whole number of at least 1');
    const result = await pruneBackups({
      store,
      retentionDays: raw === undefined ? env.retentionDays : Number(raw),
      now: new Date(),
      dryRun: values['dry-run'],
    });
    const verb = result.dryRun ? 'Would delete' : 'Deleted';
    for (const r of result.expired) console.log(`${verb} ${r.id} (started ${r.startedAt})`);
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
