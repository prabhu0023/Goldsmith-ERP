/**
 * The environment the backup commands need (EP-38). Errors name the variable, never its value.
 * DATABASE_URL, APP_ENV and LANE come through readDbEnv (so the lane's database name is applied);
 * the BACKUP_* variables are read here. The encryption key is read apart (readBackupKey), so
 * commands that never touch it (backup:list, backup:prune) work without it.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppEnv } from '../config.js';
import { readDbEnv } from '../db/db-env.js';
type Env = Record<string, string | undefined>;
export const DEFAULT_RETENTION_DAYS = 30;
export const DEFAULT_GRACE_HOURS = 2;
export const DEFAULT_ALERT_GROUP_MINUTES = 60;
/** Works from src/ops (tsx) and dist/ops (built): the repository root is four folders up. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export interface OpsEnv {
  /** The lane's database (lane applied), read as the owner. */
  databaseUrl: string;
  appEnv: AppEnv;
  lane: string | undefined;
  /** Folder of this lane's backups: `<BACKUP_DIR>/<lane or default>`. */
  laneDir: string;
  retentionDays: number;
  graceHours: number;
  alertGroupMinutes: number;
  /** BACKUP_PG_CONTAINER, or undefined to look the container up from the DATABASE_URL port. */
  pgContainer: string | undefined;
}
function readInteger(env: Env, name: string, fallback: number, min: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min) throw new Error(`${name} must be a whole number of at least ${min}`);
  return Number(raw);
}
export function readOpsEnv(env: Env = process.env): OpsEnv {
  const { databaseUrl, appEnv, lane } = readDbEnv(env);
  const base = env.BACKUP_DIR?.trim() ? resolve(env.BACKUP_DIR.trim()) : join(REPO_ROOT, '.backups');
  return {
    databaseUrl,
    appEnv,
    lane,
    laneDir: join(base, lane ?? 'default'),
    retentionDays: readInteger(env, 'BACKUP_RETENTION_DAYS', DEFAULT_RETENTION_DAYS, 1),
    graceHours: readInteger(env, 'BACKUP_GRACE_HOURS', DEFAULT_GRACE_HOURS, 0),
    alertGroupMinutes: readInteger(env, 'BACKUP_ALERT_GROUP_MINUTES', DEFAULT_ALERT_GROUP_MINUTES, 0),
    pgContainer: env.BACKUP_PG_CONTAINER?.trim() || undefined,
  };
}
/** BACKUP_ENCRYPTION_KEY: 64 hex characters = 32 bytes. There is no unencrypted mode. */
export function readBackupKey(env: Env = process.env): Buffer {
  const raw = env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('BACKUP_ENCRYPTION_KEY is required but missing or empty');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be 64 hex characters (32 bytes), e.g. from `openssl rand -hex 32`');
  }
  return Buffer.from(raw, 'hex');
}
