/**
 * Issue gold from the pool to a job (EP-18-S3). Internal: no contract operation and no route;
 * the order-copy operation of EP-19 calls it in its own transaction.
 */
import { ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';
import { type PostedEntry, postPoolEntry } from './post-pool-entry.js';

export interface IssueInput {
  /** The job's code (MO-2026-122 style). */
  jobCode: string;
  /** Gold issued, a whole number of units above zero. */
  amountUnits: number;
}

export async function postIssue(tx: Tx, ctx: OperationCtx, input: IssueInput): Promise<PostedEntry> {
  if (!input.jobCode) throw new Error('postIssue needs a job code');
  if (!Number.isSafeInteger(input.amountUnits) || input.amountUnits <= 0) {
    throw new ValidationError('goldIssuedG', 'Gold issued must be a weight above zero, with up to four decimals.');
  }
  return postPoolEntry(tx, ctx, {
    kind: 'issued',
    deltaUnits: -input.amountUnits,
    note: `Issued for job ${input.jobCode}`,
    ref: { type: 'job', id: input.jobCode },
  });
}
