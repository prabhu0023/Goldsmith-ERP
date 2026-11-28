/**
 * Guards for everything that creates or drops a database or bucket (EP-38-S6): a restore goes
 * only into a new throwaway `goldsmith_restore*` database that belongs to this lane, never
 * overwrites, and is refused outright in production. The same guards protect the drop command.
 * Pure functions: they run before any connection is opened.
 */
import type { AppEnv } from '../config.js';
export class OpsGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpsGuardError';
  }
}
const RESTORE_DATABASE = /^goldsmith_restore[a-z0-9_]*$/;
const RESTORE_BUCKET = /^goldsmith-restore[a-z0-9-]*$/;
/** Production is always refused; staging only with the explicit --allow-staging flag. */
export function assertEnvironmentAllowed(appEnv: AppEnv, allowStaging: boolean): void {
  if (appEnv === 'production') throw new OpsGuardError('Refused: APP_ENV=production never allows a restore or drop');
  if (appEnv === 'staging' && !allowStaging) {
    throw new OpsGuardError('Refused: APP_ENV=staging needs the --allow-staging flag for a restore or drop');
  }
}
export interface RestoreGuardInput {
  /** The database to create or drop. */
  name: string;
  /** The database DATABASE_URL names (lane applied): the live one. */
  liveDatabase: string;
  appEnv: AppEnv;
  lane: string | undefined;
  allowStaging?: boolean;
}
/** Does `name` carry the lane as its own segment after `goldsmith_restore` (`_c`, `_c_ab12cd`)? */
function hasLaneSegment(name: string, lane: string, separator: '_' | '-'): boolean {
  return name.split(separator).slice(2).includes(lane);
}
/** Throws OpsGuardError unless `name` is a database this lane may create or drop. */
export function assertRestoreTarget(input: RestoreGuardInput): void {
  const { name, liveDatabase, appEnv, lane } = input;
  assertEnvironmentAllowed(appEnv, input.allowStaging ?? false);
  if (!RESTORE_DATABASE.test(name)) {
    throw new OpsGuardError(`Refused: database "${name}" is not a throwaway restore database (goldsmith_restore...)`);
  }
  if (name === liveDatabase) throw new OpsGuardError(`Refused: "${name}" is the database DATABASE_URL names`);
  if (lane !== undefined && !hasLaneSegment(name, lane, '_')) {
    throw new OpsGuardError(`Refused: database "${name}" does not belong to lane ${lane} (needs _${lane} or _${lane}_)`);
  }
}
/** Throws OpsGuardError unless `name` is a throwaway restore bucket of this lane. */
export function assertRestoreBucket(input: Omit<RestoreGuardInput, 'liveDatabase'>): void {
  const { name, appEnv, lane } = input;
  assertEnvironmentAllowed(appEnv, input.allowStaging ?? false);
  if (!RESTORE_BUCKET.test(name)) {
    throw new OpsGuardError(`Refused: bucket "${name}" is not a throwaway restore bucket (goldsmith-restore...)`);
  }
  if (lane !== undefined && !hasLaneSegment(name, lane, '-')) {
    throw new OpsGuardError(`Refused: bucket "${name}" does not belong to lane ${lane} (needs -${lane} or -${lane}-)`);
  }
}
/** A restore never overwrites: refuse a target that already exists. */
export function assertTargetAbsent(name: string, exists: boolean): void {
  if (exists) throw new OpsGuardError(`Refused: database "${name}" already exists; a restore never overwrites`);
}
