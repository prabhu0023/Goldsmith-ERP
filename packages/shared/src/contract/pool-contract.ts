/**
 * The metal pool operations (EP-18). Weights cross the contract as four-decimal gram strings:
 * inputs parse to integer units of 0.0001 g (`weightG`, `signedWeightG`), results carry grams as
 * strings. There is no price or money field. Postings of issued and recovered gold are not
 * operations; EP-19 and EP-27 call `postIssue` and `postRecovery` inside their own transaction.
 */
import { z } from 'zod';
import { POOL_ENTRY_KINDS, POOL_REF_TYPES } from '../domain/metal-pool.js';
import { createdResult, pageInput, pageResult, signedWeightG, weightG } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';
const note = z.string().trim().max(500).optional();
/** One ledger entry as the owner's list shows it; `deltaG` is signed ("-162.4000"). */
const poolEntryItem = z.object({
  id: z.string(),
  at: z.string(),
  atLocal: z.string(),
  kind: z.enum(POOL_ENTRY_KINDS),
  deltaG: z.string(),
  note: z.string().nullable(),
  refType: z.enum(POOL_REF_TYPES).nullable(),
  refId: z.string().nullable(),
  actorName: z.string(),
});
export const poolOperations = {
  readPoolBalance: defineOperation({
    name: 'readPoolBalance',
    kind: 'read',
    input: z.object({}),
    result: z.object({ ok: z.literal(true), balanceUnits: z.number().int(), balanceG: z.string(), version: z.number().int() }),
    errors: ERROR_CODES,
  }),
  listPoolEntries: defineOperation({
    name: 'listPoolEntries',
    kind: 'list',
    input: z.object({
      ...pageInput,
      kind: z.enum(POOL_ENTRY_KINDS).optional(),
      job: z.string().trim().min(1).max(64).optional(),
      piece: z.string().trim().min(1).max(64).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    }),
    result: pageResult(poolEntryItem),
    errors: ERROR_CODES,
  }),
  createOpeningEntry: defineOperation({
    name: 'createOpeningEntry',
    kind: 'create',
    input: z.object({ amountG: weightG, note }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  createReturnEntry: defineOperation({
    name: 'createReturnEntry',
    kind: 'create',
    input: z.object({ jobId: z.string().trim().min(1).max(64), amountG: weightG, note }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  createAdjustmentEntry: defineOperation({
    name: 'createAdjustmentEntry',
    kind: 'create',
    input: z.object({ adjustmentDeltaG: signedWeightG, reason: z.string().trim().min(3).max(500) }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  readCustodySummary: defineOperation({
    name: 'readCustodySummary',
    kind: 'read',
    input: z.object({}),
    result: z.object({
      ok: z.literal(true),
      poolG: z.string(),
      withKarigars: z.object({
        totalG: z.string(),
        openJobs: z.number().int(),
        karigars: z.array(
          z.object({ karigarId: z.string(), name: z.string(), openJobs: z.number().int(), goldG: z.string() }),
        ),
      }),
      inParcelsG: z.string(),
      inStockG: z.string(),
      goneG: z.string(),
    }),
    errors: ERROR_CODES,
  }),
  readGoldWithKarigar: defineOperation({
    name: 'readGoldWithKarigar',
    kind: 'read',
    input: z.object({ karigarId: z.string().trim().min(1).max(64).optional() }),
    result: z.object({
      ok: z.literal(true),
      karigarId: z.string(),
      karigarName: z.string(),
      goldG: z.string(),
      openJobs: z.number().int(),
      jobs: z.array(z.object({ jobId: z.string(), issuedG: z.string(), returnedG: z.string(), withKarigarG: z.string() })),
    }),
    errors: ERROR_CODES,
  }),
} as const;
