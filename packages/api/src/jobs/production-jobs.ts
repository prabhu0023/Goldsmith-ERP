/** The jobs the api's scheduler runs (EP-10). */
import { editTokenExpiryJob } from './handlers/edit-token-expiry.js';
import { karigarOverdueJob } from './handlers/karigar-overdue.js';
import { leadSlaBreachJob, leadSlaTimersJob } from './handlers/lead-sla.js';
import { wishesJob } from './handlers/wishes-9am.js';
import type { JobDefinition } from './job-definition.js';

export const productionJobs: JobDefinition[] = [
  leadSlaTimersJob,
  leadSlaBreachJob,
  karigarOverdueJob,
  editTokenExpiryJob,
  wishesJob,
];
