import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPgTools } from '../../src/ops/pg-tools.js';
import { drillNames, runDrill } from '../../src/ops/drill-run.js';
import { OpsGuardError } from '../../src/ops/ops-guards.js';
import { databaseExists, urlForDatabase } from '../../src/ops/restore-db.js';
import { describeDb } from '../db/db-test-helpers.js';
import {
  type BackupFolder,
  backupFolder,
  opsEnv,
  recordingNotifier,
  runOpsCli,
  type SourceDatabase,
  seededSource,
  TEST_KEY,
} from './ops-test-helpers.js';

describeDb('runDrill', () => {
  let source: SourceDatabase;
  const folders: BackupFolder[] = [];
  const tools = createPgTools();
  const fresh = (): BackupFolder => {
    const f = backupFolder();
    folders.push(f);
    return f;
  };
  beforeAll(async () => {
    source = await seededSource();
  }, 120000);
  afterAll(async () => {
    for (const f of folders) f.cleanup();
    await source.drop();
  });

  it('passes on an intact copy, fails on the damaged one, and leaves no throwaway database', async () => {
    const folder = fresh();
    const names = drillNames('c');
    expect(names.restore).toMatch(/^goldsmith_restore_c_drill_[0-9a-f]{6}$/);
    expect(names.damaged).toMatch(/^goldsmith_restore_c_drill_bad_[0-9a-f]{6}$/);
    const lines: string[] = [];
    const result = await runDrill({
      env: opsEnv(source.url, folder.dir),
      store: folder.store,
      tools,
      notifier: recordingNotifier(),
      getKey: () => TEST_KEY,
      names,
      runBy: 'test-user',
      log: (l) => lines.push(l),
    });
    expect(await databaseExists(source.url, names.restore)).toBe(false);
    expect(await databaseExists(source.url, names.damaged)).toBe(false);
    expect(result.tables).toBeGreaterThan(30);
    expect(result.auditEntries).toBeGreaterThan(0);
    expect(result.damagedEntryId).toMatch(/\S/);
    expect(result.damagedProblems.length).toBeGreaterThan(0);
    const t = result.timings;
    for (const ms of [t.backupMs, t.restoreMs, t.auditCheckMs, t.damagedCheckMs, t.dropMs]) {
      expect(ms).toBeGreaterThan(0);
    }
    expect(t.totalMs).toBeGreaterThanOrEqual(t.backupMs + t.restoreMs);
    expect(result.recordCommand).toContain('npm run drill:record --');
    expect(result.recordCommand).toContain(`backup ${result.backup} taken ${result.backupCreatedAt}`);
    expect(result.recordCommand).toContain('--step 3=pass');
    expect(result.recordCommand).toContain('--run-by "test-user"');
    expect(lines.some((l) => l.includes('failed on the damaged copy as it must'))).toBe(true);
  }, 180000);

  it('refuses a name outside the lane, production, and an existing database, before touching anything', async () => {
    const folder = fresh();
    const base = {
      store: folder.store,
      tools,
      notifier: recordingNotifier(),
      getKey: () => TEST_KEY,
    };
    const env = opsEnv(source.url, folder.dir);
    await expect(
      runDrill({ ...base, env, names: { restore: 'goldsmith_dev_c', damaged: 'goldsmith_restore_c_bad' } }),
    ).rejects.toThrow(OpsGuardError);
    await expect(
      runDrill({ ...base, env: { ...env, appEnv: 'production' }, names: drillNames('c') }),
    ).rejects.toThrow(/production/);
    await expect(
      runDrill({
        ...base,
        env: { ...env, databaseUrl: urlForDatabase(source.url, 'gs_unreachable_never') },
        names: { restore: 'goldsmith_restore_c_other', damaged: 'goldsmith_restore_c_other_bad' },
      }),
    ).rejects.toThrow(); // the live database does not exist: the drill stops before any backup
    expect(await databaseExists(source.url, 'goldsmith_restore_c_other')).toBe(false);
  }, 60000);

  it('drill-run through the CLI prints the timings and the ready drill:record command', async () => {
    const folder = fresh();
    const root = folder.dir.slice(0, folder.dir.lastIndexOf('/'));
    const result = await runOpsCli(['drill-run'], { databaseUrl: source.url, backupRoot: root });
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Drill passed in [\d.]+ s: backup/);
    expect(result.stdout).toContain('both throwaway databases are dropped');
    expect(result.stdout).toMatch(/npm run drill:record -- --date \d{4}-\d{2}-\d{2} --environment development /);
  }, 180000);

  it('drill-record through the CLI rejects a missing step with a one-line error and no change', async () => {
    const result = await runOpsCli(
      [
        'drill-record',
        '--date',
        '2026-11-30',
        '--restore-point',
        'backup x',
        '--duration-minutes',
        '5',
        ...['1', '2', '3', '4', '5', '6', '7'].flatMap((n) => ['--step', `${n}=pass`]),
      ],
      { databaseUrl: source.url, backupRoot: fresh().dir },
    );
    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toMatch(/^Error: Step 8 \(Tell staff and karigars\) has no result/);
  }, 60000);
});
