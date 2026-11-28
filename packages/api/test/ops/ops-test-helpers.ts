/** Shared fixtures for the ops tests: a migrated and seeded temporary source database, a backup folder. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
