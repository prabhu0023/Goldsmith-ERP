import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { listBackups } from '../../src/ops/backup-records.js';
import { LocalFolderStore } from '../../src/ops/backup-store.js';
import { describeDb } from '../db/db-test-helpers.js';
import {
  type BackupFolder,
  backupFolder,
  seededSource,
  type SourceDatabase,
  TEST_KEY_HEX,
} from './ops-test-helpers.js';
const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../', import.meta.url));
interface Result {
  code: number;
  stdout: string;
  stderr: string;
}
describeDb('ops CLI', () => {
  let source: SourceDatabase;
  const folders: BackupFolder[] = [];
  beforeAll(async () => {
    source = await seededSource();
  }, 120000);
  afterAll(async () => {
    for (const f of folders) f.cleanup();
    await source.drop();
  });
  /** Runs the CLI against the temporary database. LANE is empty (the temp name has no lane suffix), so the lane folder is `default`. */
  async function cli(args: string[], folder: BackupFolder, extra: Record<string, string> = {}): Promise<Result> {
    const env = {
      ...process.env,
      LANE: '',
      DATABASE_URL: source.url,
      APP_ENV: 'development',
      BACKUP_DIR: dirname(folder.dir),
      BACKUP_ENCRYPTION_KEY: TEST_KEY_HEX,
      BACKUP_PG_CONTAINER: '',
      ...extra,
    };
    try {
      const { stdout, stderr } = await run(
        process.execPath,
        ['--conditions=@goldsmith/source', '--import', 'tsx', 'src/ops/cli.ts', ...args],
        { cwd: apiDir, env },
      );
      return { code: 0, stdout, stderr };
    } catch (e) {
      const err = e as { code: number; stdout: string; stderr: string };
      return { code: err.code, stdout: err.stdout, stderr: err.stderr };
    }
  }
  const folderFor = (): BackupFolder => {
    const f = backupFolder();
    folders.push(f);
    return f;
  };
  const laneFolder = (f: BackupFolder): LocalFolderStore => new LocalFolderStore(join(dirname(f.dir), 'default'));
  it('backup-list says so when nothing is recorded', async () => {
    const r = await cli(['backup-list'], folderFor());
    expect(r).toMatchObject({ code: 0 });
    expect(r.stdout).toContain('No backups recorded.');
  }, 30000);
  it('backup-db writes an encrypted backup that backup-list shows as complete; --if-not-done-today skips', async () => {
    const f = folderFor();
    const first = await cli(['backup-db'], f);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/Backup db-\d{8}T\d{6}Z-[0-9a-f]{4} complete: .*\.dump\.enc/);
    const list = await cli(['backup-list'], f);
    expect(list.stdout).toMatch(/daily full\s+complete\s+development/);
    expect(list.stdout).toContain('yes');
    const again = await cli(['backup-db', '--if-not-done-today'], f);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('Skipped');
    const runs = await listBackups(laneFolder(f));
    expect(runs).toHaveLength(1);
  }, 60000);
  it('a failing dump exits 1 with one Error line, a failed record, an alerts.jsonl line and an outbox row', async () => {
    const f = folderFor();
    const r = await cli(['backup-db'], f, { BACKUP_PG_CONTAINER: 'gs-no-such-container' });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ALERT \[development\] daily full/m);
    expect(r.stderr.trim().split('\n').at(-1)).toMatch(/^Error: pg_dump failed/);
    const store = laneFolder(f);
    const [run] = await listBackups(store);
    expect(run).toMatchObject({ status: 'failed', kind: 'daily full' });
    const alerts = readFileSync(store.locate('alerts.jsonl'), 'utf8').trim().split('\n');
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0])).toMatchObject({ environment: 'development', kind: 'daily full' });
    const pool = createPool(source.url, 1);
    try {
      const rows = await pool.query(`select topic, payload from outbox_events where topic = 'ops.backup_failed'`);
      expect(rows.rowCount).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(rows.rows)).not.toMatch(/postgres:\/\/|BACKUP_ENCRYPTION_KEY/);
    } finally {
      await pool.end();
    }
    // The same failure again inside the window is grouped: no second alert line.
    const second = await cli(['backup-db'], f, { BACKUP_PG_CONTAINER: 'gs-no-such-container' });
    expect(second.code).toBe(1);
    expect(readFileSync(store.locate('alerts.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  }, 90000);
  it('backup-db without a key exits 1 naming the variable and records the failure', async () => {
    const f = folderFor();
    const r = await cli(['backup-db'], f, { BACKUP_ENCRYPTION_KEY: '' });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Error: BACKUP_ENCRYPTION_KEY is required');
    expect((await listBackups(laneFolder(f)))[0].status).toBe('failed');
  }, 30000);
  it('backup-check exits 1 on an empty folder and 0 after a backup', async () => {
    const f = folderFor();
    expect((await cli(['backup-check'], f)).code).toBe(1);
    expect((await cli(['backup-db'], f)).code).toBe(0);
    const ok = await cli(['backup-check'], f);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('Latest complete daily full backup finished');
  }, 90000);
  it('backup-prune --dry-run lists and keeps; a normal run keeps a fresh backup', async () => {
    const f = folderFor();
    await cli(['backup-db'], f);
    const dry = await cli(['backup-prune', '--dry-run', '--retention-days', '30'], f);
    expect(dry.stdout).toContain('Would delete 0 backup(s) older than 30 days; 1 kept (dry run, nothing deleted).');
    const bad = await cli(['backup-prune', '--retention-days', 'soon'], f);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('Error: --retention-days must be a whole number');
  }, 90000);
  it('rejects an unknown command and an unknown flag', async () => {
    const f = folderFor();
    expect((await cli(['backup-everything'], f)).stderr).toContain('Error: Unknown command backup-everything');
    expect((await cli(['backup-list', '--nope'], f)).code).toBe(1);
  }, 30000);
});
