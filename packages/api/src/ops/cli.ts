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
 * Reads DATABASE_URL, APP_ENV, LANE and the BACKUP_* variables (backup-db and restore-db also BACKUP_ENCRYPTION_KEY).
 * Exit code 0 on success, 1 with a one-line error otherwise.
 */
import { parseArgs } from 'node:util';
import { redactErrorText } from '../jobs/redact-error-text.js';
import { checkAuditAfterRestore } from './audit-check.js';
import { runDatabaseBackup } from './backup-db.js';
import { checkBackupPresent } from './backup-check.js';
import { listBackups, type RunRecord } from './backup-records.js';
import { LocalFolderStore } from './backup-store.js';
import { dropRestored } from './drop-restored.js';
import { createOperatorNotifier, fileSink, logSink, outboxSink } from './notify-operator.js';
import { readBackupKey, readOpsEnv } from './ops-env.js';
import { assertRestoreTarget } from './ops-guards.js';
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
      'allow-staging': { type: 'boolean' },
      source: { type: 'boolean' },
      since: { type: 'string' },
      until: { type: 'string' },
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
