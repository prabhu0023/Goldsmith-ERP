/**
 * The production service functions, one per contract operation (see README.md in this folder).
 * The app registers exactly these; a name the contract does not declare stops it at startup.
 */
import type { contract } from '@goldsmith/shared';
import type { Handlers } from '../pipeline/registry.js';
import { listJobRuns } from './list-job-runs.js';
import { listMyJobs } from './list-my-jobs.js';
import { markLeadLost } from './mark-lead-lost.js';
import { readMyJob } from './read-my-job.js';
import { retryJobRun } from './retry-job-run.js';

export const handlers: Handlers<typeof contract> = {
  markLeadLost,
  listJobRuns,
  retryJobRun,
  listMyJobs,
  readMyJob,
};
