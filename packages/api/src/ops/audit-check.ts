/**
 * Audit-log completeness check after a restore (EP-38-S7). Read-only: one `read only`
 * transaction on the restored database, never a write. It compares the restored database with the
 * backup manifest: every table's row count and checksum, the audit log's count, latest
 * `(at, id)` and overall checksum, and each entry's hash (so one deleted or changed entry is
 * named by its id). With a source database it also compares each entry up to the backup's start
 * time with the source's copy. Finally it checks that the append-only rule survived the restore:
 * the triggers `audit_entries_no_change` and `audit_entries_no_truncate` exist and are enabled, and
 * the api's role `goldsmith_app` holds no UPDATE, DELETE or TRUNCATE on `audit_entries`.
 * Findings name ids and tables only, never the content of an entry. Weights inside an entry
 * (`before_value`, `after_value`) are part of the entry's hash, so they must come back identical.
 */
import type pg from 'pg';
import { createPool } from '../db/connection.js';
import type { DatabaseManifest } from './backup-db.js';
import { compareStats } from './restore-db.js';
import { readDbStats } from './table-stats.js';
export const APPEND_ONLY_TRIGGERS = ['audit_entries_no_change', 'audit_entries_no_truncate'] as const;
const APP_ROLE = 'goldsmith_app';
export type AuditCheckKind =
  | 'tables'
  | 'audit-count'
  | 'audit-latest'
  | 'audit-checksum'
  | 'entries'
  | 'source'
  | 'append-only'
  | 'privileges';
export interface AuditProblem {
  check: AuditCheckKind;
  message: string;
  /** Audit entry ids the problem names (never their content). */
  ids?: string[];
}
export interface AuditCheckResult {
  ok: boolean;
  problems: AuditProblem[];
  tables: number;
  auditEntries: number;
}
export interface AuditCheckInput {
  manifest: DatabaseManifest;
  /** The restored database. */
  targetUrl: string;
  /** The live database to compare entries with, or undefined. */
  sourceUrl?: string;
}
async function readOnly<T>(url: string, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = createPool(url, 1);
  try {
    const client = await pool.connect();
    try {
      await client.query('begin read only');
      return await work(client);
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
}
/** `id -> hash` of the audit entries written up to `cutoff`. */
async function entriesUpTo(client: pg.PoolClient, cutoff: string): Promise<Map<string, string>> {
  const res = await client.query<{ id: string; hash: string }>(
    `select id, left(md5(t::text), 16) as hash from public.audit_entries t where at <= $1 order by at, id`,
    [cutoff],
  );
  return new Map(res.rows.map((r) => [r.id, r.hash]));
}
function diffEntries(expected: Map<string, string>, actual: Map<string, string>) {
  const missing = [...expected.keys()].filter((id) => !actual.has(id));
  const unexpected = [...actual.keys()].filter((id) => !expected.has(id));
  const changed = [...expected].filter(([id, hash]) => actual.has(id) && actual.get(id) !== hash).map(([id]) => id);
  return { missing, unexpected, changed };
}
async function checkAppendOnly(client: pg.PoolClient): Promise<AuditProblem[]> {
  const problems: AuditProblem[] = [];
  const triggers = await client.query<{ tgname: string; tgenabled: string }>(
    `select tgname, tgenabled from pg_trigger where tgrelid = 'public.audit_entries'::regclass and not tgisinternal`,
  );
  for (const name of APPEND_ONLY_TRIGGERS) {
    const found = triggers.rows.find((t) => t.tgname === name);
    // 'O' fires for normal sessions, 'A' always; 'D' is disabled and 'R' fires only in replica mode.
    if (!found) problems.push({ check: 'append-only', message: `Trigger ${name} does not exist on audit_entries` });
    else if (found.tgenabled !== 'O' && found.tgenabled !== 'A') {
      problems.push({ check: 'append-only', message: `Trigger ${name} is not enabled on audit_entries` });
    }
  }
  const role = await client.query<{ role_exists: boolean }>(
    `select exists(select 1 from pg_roles where rolname = $1) as role_exists`,
    [APP_ROLE],
  );
  if (!role.rows[0].role_exists) {
    problems.push({ check: 'privileges', message: `Role ${APP_ROLE} does not exist, so its privileges cannot be checked` });
    return problems;
  }
  const held = await client.query<{ privilege: string; held: boolean }>(
    `select p as privilege, has_table_privilege($1, 'public.audit_entries', p) as held
       from unnest(array['UPDATE', 'DELETE', 'TRUNCATE']) as p`,
    [APP_ROLE],
  );
  for (const row of held.rows) {
    if (row.held) problems.push({ check: 'privileges', message: `${APP_ROLE} holds ${row.privilege} on audit_entries` });
  }
  return problems;
}
export async function checkAuditAfterRestore(input: AuditCheckInput): Promise<AuditCheckResult> {
  const { manifest } = input;
  const problems: AuditProblem[] = [];
  const cutoff = manifest.createdAt;
  const restored = await readOnly(input.targetUrl, async (client) => {
    const stats = await readDbStats(client);
    const hasAudit = 'audit_entries' in stats.tables;
    return {
      stats,
      upToCutoff: hasAudit ? await entriesUpTo(client, cutoff) : new Map<string, string>(),
      appOnly: hasAudit
        ? await checkAppendOnly(client)
        : [{ check: 'append-only' as const, message: 'Table audit_entries does not exist' }],
    };
  });
  const { stats } = restored;
  for (const message of compareStats(manifest.stats, stats)) problems.push({ check: 'tables', message });
  const want = manifest.stats.audit;
  const got = stats.audit;
  const { missing, unexpected, changed } = diffEntries(new Map(want.entries), new Map(got.entries));
  if (missing.length) {
    problems.push({ check: 'entries', message: `${missing.length} audit entries of the backup are missing`, ids: missing });
  }
  if (changed.length) {
    problems.push({ check: 'entries', message: `${changed.length} audit entries differ from the backup`, ids: changed });
  }
  if (unexpected.length) {
    problems.push({ check: 'entries', message: `${unexpected.length} audit entries are not in the backup`, ids: unexpected });
  }
  if (want.count !== got.count) {
    problems.push({ check: 'audit-count', message: `Audit log has ${got.count} entries, the backup had ${want.count}` });
  }
  if (want.latestId !== got.latestId || want.latestAt !== got.latestAt) {
    problems.push({
      check: 'audit-latest',
      message: `Latest audit entry is ${got.latestId ?? 'none'} at ${got.latestAt ?? '-'}, the backup had ${want.latestId ?? 'none'} at ${want.latestAt ?? '-'}`,
    });
  }
  if (want.checksum !== got.checksum) {
    problems.push({ check: 'audit-checksum', message: 'Audit log checksum differs from the backup' });
  }
  if (input.sourceUrl !== undefined && 'audit_entries' in stats.tables) {
    const live = await readOnly(input.sourceUrl, (client) => entriesUpTo(client, cutoff));
    const diff = diffEntries(live, restored.upToCutoff);
    if (diff.missing.length) {
      problems.push({
        check: 'source',
        message: `${diff.missing.length} audit entries written before the backup are in the source but not in the restore`,
        ids: diff.missing,
      });
    }
    if (diff.changed.length) {
      problems.push({
        check: 'source',
        message: `${diff.changed.length} audit entries differ between the restore and the source`,
        ids: diff.changed,
      });
    }
    if (diff.unexpected.length) {
      problems.push({
        check: 'source',
        message: `${diff.unexpected.length} audit entries are in the restore but no longer in the source`,
        ids: diff.unexpected,
      });
    }
  }
  problems.push(...restored.appOnly);
  return { ok: problems.length === 0, problems, tables: Object.keys(stats.tables).length, auditEntries: got.count };
}
