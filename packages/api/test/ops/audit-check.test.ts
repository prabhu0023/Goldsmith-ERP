import { dirname } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { type AuditCheckResult, checkAuditAfterRestore } from '../../src/ops/audit-check.js';
import { createPool } from '../../src/db/connection.js';
import { type DatabaseManifest, runDatabaseBackup } from '../../src/ops/backup-db.js';
import { createPgTools } from '../../src/ops/pg-tools.js';
import { loadManifest, restoreDatabase, urlForDatabase } from '../../src/ops/restore-db.js';
import { describeDb } from '../db/db-test-helpers.js';
import {
  type BackupFolder,
  backupFolder,
  defaultLaneStore,
  opsEnv,
  recordingNotifier,
  restoreTargetName,
  runOpsCli,
  type SourceDatabase,
  seededSource,
  TEST_KEY,
} from './ops-test-helpers.js';
describeDb('audit-log completeness check (S7)', () => {
  let source: SourceDatabase;
  let folder: BackupFolder;
  let manifest: DatabaseManifest;
  const targets: string[] = [];
  const tools = createPgTools();
  const store = () => defaultLaneStore(folder);
  beforeAll(async () => {
    source = await seededSource();
    folder = backupFolder();
    const s = store();
    const result = await runDatabaseBackup({
      env: opsEnv(source.url, s.dir),
      store: s,
      tools,
      notifier: recordingNotifier(),
      getKey: () => TEST_KEY,
    });
    if (result.status !== 'complete') throw new Error('expected a complete backup');
    manifest = result.manifest;
  }, 120000);
  afterAll(async () => {
    for (const name of targets) await tools.dropDatabase(source.url, name);
    folder.cleanup();
    await source.drop();
  });
  /** A new throwaway restore of the backup. */
  async function restoreCopy(): Promise<{ name: string; url: string }> {
    const name = restoreTargetName();
    targets.push(name);
    const s = store();
    await restoreDatabase(
      { env: opsEnv(source.url, s.dir), store: s, tools, getKey: () => TEST_KEY },
      { backup: 'latest', target: name },
    );
    return { name, url: urlForDatabase(source.url, name) };
  }
  /** Changes the copy as its owner. The append-only triggers fire only for origin sessions, so replica mode steps around them. */
  async function asOwner(url: string, sql: string, params: unknown[] = []): Promise<void> {
    const pool = createPool(url, 1);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local session_replication_role = replica');
      await client.query(sql, params);
      await client.query('commit');
    } finally {
      client.release();
      await pool.end();
    }
  }
  async function firstEntryId(url: string, withValues = false): Promise<string> {
    const pool = createPool(url, 1);
    try {
      const res = await pool.query<{ id: string }>(
        `select id from audit_entries order by ${withValues ? '(after_value is null), ' : ''}at, id limit 1`,
      );
      return res.rows[0].id;
    } finally {
      await pool.end();
    }
  }
  const check = (url: string, sourceUrl?: string): Promise<AuditCheckResult> =>
    checkAuditAfterRestore({ manifest, targetUrl: url, sourceUrl });
  const problem = (r: AuditCheckResult, check: string) => r.problems.filter((p) => p.check === check);
  it('passes on an intact restore, alone and against the source', async () => {
    const copy = await restoreCopy();
    const alone = await check(copy.url);
    expect(alone).toMatchObject({ ok: true, problems: [], auditEntries: manifest.stats.audit.count });
    expect(alone.tables).toBe(Object.keys(manifest.stats.tables).length);
    expect(manifest.stats.audit.count).toBeGreaterThan(0);
    expect(await check(copy.url, source.url)).toMatchObject({ ok: true, problems: [] });
  }, 60000);
  it('fails when one audit entry was deleted, naming only that id', async () => {
    const copy = await restoreCopy();
    const id = await firstEntryId(copy.url);
    await asOwner(copy.url, 'delete from audit_entries where id = $1', [id]);
    const result = await check(copy.url);
    expect(result.ok).toBe(false);
    expect(problem(result, 'entries')).toEqual([expect.objectContaining({ ids: [id], message: expect.stringContaining('missing') })]);
    expect(problem(result, 'audit-count')).toHaveLength(1);
    expect(problem(result, 'audit-checksum')).toHaveLength(1);
    expect(problem(result, 'tables').map((p) => p.message)).toContain(
      `table audit_entries has ${manifest.stats.audit.count - 1} rows, the backup had ${manifest.stats.audit.count}`,
    );
  }, 60000);
  it('fails when one audit entry was changed, naming only that id and not its content', async () => {
    const copy = await restoreCopy();
    const id = await firstEntryId(copy.url);
    await asOwner(copy.url, `update audit_entries set summary = 'SECRET-REWRITTEN-SUMMARY' where id = $1`, [id]);
    const result = await check(copy.url);
    expect(result.ok).toBe(false);
    expect(problem(result, 'entries')).toEqual([expect.objectContaining({ ids: [id] })]);
    expect(JSON.stringify(result)).not.toContain('SECRET-REWRITTEN-SUMMARY');
  }, 60000);
  it('fails when a weight inside an entry changed', async () => {
    const copy = await restoreCopy();
    const id = await firstEntryId(copy.url, true);
    await asOwner(copy.url, `update audit_entries set after_value = '{"grossG": 486501}'::jsonb where id = $1`, [id]);
    const result = await check(copy.url);
    expect(result.ok).toBe(false);
    expect(problem(result, 'entries')[0].ids).toEqual([id]);
  }, 60000);
  it('fails when an entry was added that the backup does not hold', async () => {
    const copy = await restoreCopy();
    await asOwner(
      copy.url,
      `insert into audit_entries (shop_id, at, actor_name, actor_role, kind, summary, entity_type, entity_id)
       select shop_id, at, 'System (test)', 'system', 'setting_changed', 'extra', 'setting', 'X' from audit_entries limit 1`,
    );
    const result = await check(copy.url);
    expect(result.ok).toBe(false);
    expect(problem(result, 'entries')[0]).toMatchObject({ message: expect.stringContaining('not in the backup') });
    expect(problem(result, 'entries')[0].ids).toHaveLength(1);
  }, 60000);
  it.each(['audit_entries_no_change', 'audit_entries_no_truncate'])('fails the append-only check when %s is disabled', async (trigger) => {
    const copy = await restoreCopy();
    const pool = createPool(copy.url, 1);
    try {
      await pool.query(`alter table audit_entries disable trigger ${trigger}`);
    } finally {
      await pool.end();
    }
    const result = await check(copy.url);
    expect(result.ok).toBe(false);
    expect(result.problems.map((p) => [p.check, p.message])).toEqual([
      ['append-only', `Trigger ${trigger} is not enabled on audit_entries`],
    ]);
  }, 60000);
  it('fails the append-only check when a trigger is gone', async () => {
    const copy = await restoreCopy();
    const pool = createPool(copy.url, 1);
    try {
      await pool.query('drop trigger audit_entries_no_truncate on audit_entries');
    } finally {
      await pool.end();
    }
    const result = await check(copy.url);
    expect(result.problems).toEqual([
      { check: 'append-only', message: 'Trigger audit_entries_no_truncate does not exist on audit_entries' },
    ]);
  }, 60000);
  it('fails when goldsmith_app can change audit entries', async () => {
    const copy = await restoreCopy();
    const pool = createPool(copy.url, 1);
    try {
      await pool.query('grant update, delete, truncate on audit_entries to goldsmith_app');
    } finally {
      await pool.end();
    }
    const result = await check(copy.url);
    expect(result.problems.map((p) => p.message)).toEqual([
      'goldsmith_app holds UPDATE on audit_entries',
      'goldsmith_app holds DELETE on audit_entries',
      'goldsmith_app holds TRUNCATE on audit_entries',
    ]);
  }, 60000);
  it('with a source, names an entry the source lost or changed since the backup', async () => {
    const copy = await restoreCopy();
    const lostSource = await restoreCopy();
    const changedSource = await restoreCopy();
    const id = await firstEntryId(copy.url);
    await asOwner(lostSource.url, 'delete from audit_entries where id = $1', [id]);
    await asOwner(changedSource.url, `update audit_entries set reason = 'edited' where id = $1`, [id]);
    const lost = await check(copy.url, lostSource.url);
    expect(lost.ok).toBe(false);
    expect(problem(lost, 'source')).toEqual([expect.objectContaining({ ids: [id], message: expect.stringContaining('no longer in the source') })]);
    expect(problem(lost, 'entries')).toEqual([]);
    const changed = await check(copy.url, changedSource.url);
    expect(problem(changed, 'source')).toEqual([expect.objectContaining({ ids: [id], message: expect.stringContaining('differ') })]);
    // The restore that lost the entry is the other direction: in the source but not in the restore.
    const gap = await check(lostSource.url, copy.url);
    expect(problem(gap, 'source')).toEqual([expect.objectContaining({ ids: [id], message: expect.stringContaining('not in the restore') })]);
  }, 120000);
  it('check-audit exits 0 on an intact restore and 1 naming the deleted entry', async () => {
    const intact = await restoreCopy();
    const broken = await restoreCopy();
    const id = await firstEntryId(broken.url);
    await asOwner(broken.url, 'delete from audit_entries where id = $1', [id]);
    const cli = (target: string, extra: string[] = []) =>
      runOpsCli(['check-audit', '--backup', 'latest', '--target', target, ...extra], {
        databaseUrl: source.url,
        backupRoot: dirname(folder.dir),
      });
    const ok = await cli(intact.name, ['--source']);
    expect(ok).toMatchObject({ code: 0, stderr: '' });
    expect(ok.stdout).toContain('Audit check passed');
    const bad = await cli(broken.name);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain(id);
    expect(bad.stderr.trim()).toMatch(/^Error: Audit check failed with \d+ problem\(s\), listed above$/);
    // A name that is not a throwaway restore database is refused before anything is read.
    const refused = await cli('goldsmith_dev_c');
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('not a throwaway restore database');
    expect((await loadManifest(store(), 'latest')).id).toBe(manifest.id);
  }, 120000);
});
