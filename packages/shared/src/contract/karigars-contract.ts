/**
 * The karigar master operations (EP-16): the owner's writes, the account link and the reads. Spread into `contract`, so they go through
 * `POST /api/ops/:operation` and the central permission check (owner only) like every other
 * operation. `karigarId` is the karigar code ("KG-04"); the shop never comes from the client.
 * The name and specialty sentences ("Add the karigar name.") are the handler's: the schema lets
 * an empty name or list through so the owner gets those sentences, not a generic one.
 */
import { z } from 'zod';
import { phoneField } from './auth-contract.js';
import { createdResult, okResult, pageInput, pageResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

const karigarId = z.string().trim().min(1);
const version = z.number().int().min(1);
/** Whole basis points (70 = 0.70%); the 60 to 120 range is the handler's, so it answers with a sentence. */
const wastageBp = z.number().int();
const specialties = z.array(z.string().trim().max(40)).max(20);
const reason = z.string().trim().max(200).optional();

/** Weights cross the contract as four-decimal gram strings ("447.3000"); money and a rating never do. */
const grams = z.string();
const specialtyNames = z.array(z.string());
/** One karigar in the owner's directory. `id` is the karigar code ("KG-04"). */
const directoryItem = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string(),
  workshopLocation: z.string().nullable(),
  specialties: specialtyNames,
  wastageBp: z.number().int(),
  status: z.enum(['active', 'deactivated']),
  version: z.number().int(),
  accountStatus: z.enum(['none', 'pending_activation', 'active', 'deactivated']),
  openJobs: z.number().int(),
  goldWithG: grams,
  /** Whole basis points, or null before any job is finished ("None yet"). */
  metalLossBp: z.number().int().nullable(),
  finishedJobs: z.number().int(),
});
/** One active karigar for a picker: no phone, location or scorecard figure. */
const pickerItem = z.object({
  id: z.string(),
  name: z.string(),
  specialties: specialtyNames,
  wastageBp: z.number().int(),
});
const scorecardResult = z.object({
  ok: z.literal(true),
  karigar: z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['active', 'deactivated']),
    wastageBp: z.number().int(),
  }),
  scorecard: z.object({
    metalLossBp: z.number().int().nullable(),
    daysLate: z.number().int(),
    finishedJobs: z.number().int(),
    /** Absolute gaps of the last six released parcels, newest first. */
    lastGapsG: z.array(grams),
    averageGapG: grams.nullable(),
  }),
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      status: z.enum(['sent', 'accepted', 'on_bench', 'ready', 'handed_over']),
      goldIssuedG: grams,
      lossG: grams.nullable(),
      dueDate: z.string().nullable(),
    }),
  ),
});
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
  /** Give a karigar portal access: link an existing karigar user, or create one from the karigar's record. */
  linkKarigarAccount: defineOperation({
    name: 'linkKarigarAccount',
    kind: 'command',
    input: z.object({ karigarId, userId: z.uuid().optional() }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  /** Owner's directory, worst metal loss first; paged by an offset the cursor carries. */
  listKarigars: defineOperation({
    name: 'listKarigars',
    kind: 'list',
    input: z.object({ ...pageInput }),
    result: pageResult(directoryItem),
    errors: ERROR_CODES,
  }),
  listKarigarPicker: defineOperation({
    name: 'listKarigarPicker',
    kind: 'list',
    input: z.object({ ...pageInput }),
    result: pageResult(pickerItem),
    errors: ERROR_CODES,
  }),
  readKarigarScorecard: defineOperation({
    name: 'readKarigarScorecard',
    kind: 'read',
    input: z.object({ karigarId }),
    result: scorecardResult,
    errors: ERROR_CODES,
  }),
  /** The signed-in karigar's own record; takes no id, so no other record can be asked for. */
  readMyKarigarProfile: defineOperation({
    name: 'readMyKarigarProfile',
    kind: 'read',
    input: z.object({}),
    result: z.object({
      ok: z.literal(true),
      profile: z
        .object({
          id: z.string(),
          name: z.string(),
          phone: z.string().nullable(),
          workshopLocation: z.string().nullable(),
          specialties: specialtyNames,
          wastageBp: z.number().int(),
          finishedJobs: z.number().int(),
        })
        .nullable(),
    }),
    errors: ERROR_CODES,
  }),
} as const;
