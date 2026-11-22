/**
 * The operation contract shared by web and api (EP-03-S1). `OperationInput` types what the web
 * sends, `OperationArgs` what the api handler receives after validation, `OperationResult` the
 * success body.
 */
import { z } from 'zod';
import { okResult, pageInput, pageResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';
import { settingsOperations } from './settings-contract.js';
import { userOperations } from './users-contract.js';
import { filesContract } from './files-contract.js';

/** Bumped when an operation's input or result changes shape. */
export const CONTRACT_VERSION = '1.0.0';

export const contract = {
  markLeadLost: defineOperation({
    name: 'markLeadLost',
    kind: 'command',
    input: z.object({
      leadId: z.string().trim().min(1),
      reason: z.string().optional(),
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  listJobRuns: defineOperation({
    name: 'listJobRuns',
    kind: 'list',
    input: z.object({
      ...pageInput,
      result: z.enum(['ok', 'retrying', 'failed']).optional(),
      jobName: z.string().trim().min(1).max(64).optional(),
    }),
    result: pageResult(
      z.object({
        id: z.string(),
        jobName: z.string(),
        scheduledAt: z.string(),
        scheduledAtLocal: z.string(),
        startedAt: z.string(),
        startedAtLocal: z.string(),
        finishedAt: z.string().nullable(),
        finishedAtLocal: z.string().nullable(),
        attempts: z.number().int(),
        result: z.enum(['ok', 'retrying', 'failed']).nullable(),
        errorText: z.string().nullable(),
      }),
    ),
    errors: ERROR_CODES,
  }),
  retryJobRun: defineOperation({
    name: 'retryJobRun',
    kind: 'command',
    input: z.object({
      runId: z.string().trim().min(1),
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  ...userOperations,
  ...filesContract,
  ...settingsOperations,
} as const;

export type OperationName = keyof typeof contract;
export type OperationInput<N extends OperationName> = z.input<(typeof contract)[N]['input']>;
export type OperationArgs<N extends OperationName> = z.output<(typeof contract)[N]['input']>;
export type OperationResult<N extends OperationName> = z.output<(typeof contract)[N]['result']>;
