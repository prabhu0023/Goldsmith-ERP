/**
 * The operation contract shared by web and api (EP-03-S1). `OperationInput` types what the web
 * sends, `OperationArgs` what the api handler receives after validation, `OperationResult` the
 * success body.
 */
import { z } from 'zod';
import { okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

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
} as const;

export type OperationName = keyof typeof contract;
export type OperationInput<N extends OperationName> = z.input<(typeof contract)[N]['input']>;
export type OperationArgs<N extends OperationName> = z.output<(typeof contract)[N]['input']>;
export type OperationResult<N extends OperationName> = z.output<(typeof contract)[N]['result']>;
