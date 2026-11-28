/**
 * The karigar master write operations (EP-16). Spread into `contract`, so they go through
 * `POST /api/ops/:operation` and the central permission check (owner only) like every other
 * operation. `karigarId` is the karigar code ("KG-04"); the shop never comes from the client.
 * The name and specialty sentences ("Add the karigar name.") are the handler's: the schema lets
 * an empty name or list through so the owner gets those sentences, not a generic one.
 */
import { z } from 'zod';
import { phoneField } from './auth-contract.js';
import { createdResult, okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

const karigarId = z.string().trim().min(1);
const version = z.number().int().min(1);
/** Whole basis points (70 = 0.70%); the 60 to 120 range is the handler's, so it answers with a sentence. */
const wastageBp = z.number().int();
const specialties = z.array(z.string().trim().max(40)).max(20);
const reason = z.string().trim().max(200).optional();

export const karigarOperations = {
  onboardKarigar: defineOperation({
    name: 'onboardKarigar',
    kind: 'create',
    input: z.object({
      name: z.string(),
      phone: phoneField,
      email: z.email(),
      workshopLocation: z.string().trim().max(120).optional(),
      specialties,
      wastageBp,
    }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  /** Strict: a `wastageBp`, `status` or `id` key is a validation refusal (EP-16-S4 AC6). */
  updateKarigarDetails: defineOperation({
    name: 'updateKarigarDetails',
    kind: 'command',
    input: z.strictObject({
      karigarId,
      version,
      name: z.string(),
      phone: phoneField,
      email: z.email(),
      workshopLocation: z.string().trim().max(120).optional(),
      specialties,
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  updateKarigarWastage: defineOperation({
    name: 'updateKarigarWastage',
    kind: 'command',
    input: z.object({ karigarId, version, wastageBp, reason }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  updateKarigarStatus: defineOperation({
    name: 'updateKarigarStatus',
    kind: 'command',
    input: z.object({ karigarId, version, status: z.enum(['active', 'deactivated']), reason }),
    result: okResult,
    errors: ERROR_CODES,
  }),
} as const;
