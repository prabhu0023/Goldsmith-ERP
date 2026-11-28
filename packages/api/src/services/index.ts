/**
 * The production service functions, one per contract operation (see README.md in this folder).
 * The app registers exactly these; a name the contract does not declare stops it at startup.
 */
import type { contract } from '@goldsmith/shared';
import { listAuditEntries } from '../audit/list-audit-entries.js';
import { readAuditEntry } from '../audit/read-audit-entry.js';
import { liveHandlers } from '../live/live-operations.js';
import { readRailBadges } from '../live/read-rail-badges.js';
import type { Handlers } from '../pipeline/registry.js';
import { setSetting } from '../settings/set-setting.js';
import { createUserHandlers, type UserHandlerDeps } from '../users/index.js';
import { listJobRuns } from './list-job-runs.js';
import { listMyJobs } from './list-my-jobs.js';
import { markLeadLost } from './mark-lead-lost.js';
import { readMyJob } from './read-my-job.js';
import { readPiece } from './read-piece.js';
import { retryJobRun } from './retry-job-run.js';

export const handlers: Handlers<typeof contract> = {
  markLeadLost,
  listJobRuns,
  retryJobRun,
  listMyJobs,
  readMyJob,
  readPiece,
  setSetting,
  listAuditEntries,
  readAuditEntry,
  readRailBadges,
};

/**
 * Every production handler, including the user operations, which need the account mailer (EP-05),
 * and the live channel's operations (EP-07).
 */
export function createServiceHandlers(deps: UserHandlerDeps): Handlers<typeof contract> {
  return { ...handlers, ...createUserHandlers(deps), ...liveHandlers };
}
