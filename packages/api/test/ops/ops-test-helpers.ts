/** Shared fixtures for the ops tests: a migrated and seeded temporary source database, a backup folder. */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { seedPrototype } from '../../src/db/seed/seed-database.js';
import { LocalFolderStore } from '../../src/ops/backup-store.js';
import { createOperatorNotifier, type OperatorAlert, type OperatorNotifier } from '../../src/ops/notify-operator.js';
import type { OpsEnv } from '../../src/ops/ops-env.js';
import { createTempDatabase } from '../db/db-test-helpers.js';
export const TEST_KEY = Buffer.alloc(32, 0x5a);
export const TEST_KEY_HEX = TEST_KEY.toString('hex');
export interface SourceDatabase {
  url: string;
  drop(): Promise<void>;
}
/** A fresh temporary database with every migration applied and the prototype data seeded. */
export async function seededSource(): Promise<SourceDatabase> {
  const db = await createTempDatabase();
  const pool = createPool(db.url, 1);
  try {
    await migrate(pool, new URL('../../migrations/', import.meta.url));
    await seedPrototype(pool, { appEnv: 'development' });
  } finally {
    await pool.end();
  }
  return db;
}
/** A fresh temporary database with every migration applied and no data. */
export async function migratedSource(): Promise<SourceDatabase> {
  const db = await createTempDatabase();
  const pool = createPool(db.url, 1);
  try {
    await migrate(pool, new URL('../../migrations/', import.meta.url));
  } finally {
    await pool.end();
  }
  return db;
}
export interface BackupFolder {
  dir: string;
  store: LocalFolderStore;
  cleanup(): void;
}
export function backupFolder(): BackupFolder {
  const root = mkdtempSync(join(tmpdir(), 'gs-backups-'));
  const dir = join(root, 'c');
  return { dir, store: new LocalFolderStore(dir), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
export const opsEnv = (databaseUrl: string, laneDir: string): OpsEnv => ({
  databaseUrl,
  appEnv: 'development',
  lane: 'c',
  laneDir,
  retentionDays: 30,
  graceHours: 2,
  alertGroupMinutes: 60,
  pgContainer: undefined,
});
/** A notifier that only remembers alerts (no stderr, file or database). */
export function recordingNotifier(): OperatorNotifier & { alerts: OperatorAlert[] } {
  const alerts: OperatorAlert[] = [];
  return {
    alerts,
    async notify(alert) {
      alerts.push(alert);
      return { sent: true };
    },
  };
}
export { createOperatorNotifier };
/** A throwaway restore database name this lane may create: `goldsmith_restore_c_<hex>`. */
export const restoreTargetName = (): string => `goldsmith_restore_c_${randomBytes(4).toString('hex')}`;
/** The `default` lane folder next to a backupFolder(): where the CLI looks when LANE is empty. */
export const defaultLaneStore = (folder: BackupFolder): LocalFolderStore =>
  new LocalFolderStore(join(dirname(folder.dir), 'default'));
const run = promisify(execFile);
const apiDir = fileURLToPath(new URL('../../', import.meta.url));
export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}
/**
 * Runs `src/ops/cli.ts` in a subprocess against `databaseUrl`. LANE is empty, so backups are read
 * from the `default` folder under `backupRoot` and any `goldsmith_restore*` name passes the guard.
 */
export async function runOpsCli(
  args: string[],
  options: { databaseUrl: string; backupRoot: string; env?: Record<string, string> },
): Promise<CliResult> {
  const env = {
    ...process.env,
    LANE: '',
    DATABASE_URL: options.databaseUrl,
    APP_ENV: 'development',
    BACKUP_DIR: options.backupRoot,
    BACKUP_ENCRYPTION_KEY: TEST_KEY_HEX,
    BACKUP_PG_CONTAINER: '',
    ...options.env,
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
