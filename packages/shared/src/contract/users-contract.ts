/**
 * The user operations (EP-05) and the karigar's own-job reads (EP-05-S3). Spread into `contract`,
 * so they go through `POST /api/ops/:operation` and the central permission check like every
 * other operation. `userId` is the user's uuid; `karigarId` is the karigar code ("KG-04").
 */
import { z } from 'zod';
import { phoneField } from './auth-contract.js';
import { createdResult, okResult, pageInput, pageResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

/** The sentences the user operations answer with. */
export const USER_MESSAGES = {
  ownerOnlyUsers: 'Only the owner can add staff or change a role.',
  shopHasOwner: 'The shop already has an owner.',
  shopNeedsOwner: 'The shop needs its owner.',
  linkFirst: 'Link this user to a karigar record first.',
  karigarTaken: 'This karigar already has an account.',
  onlyKarigarLinks: 'Only a karigar user can be linked to a karigar record.',
  alreadyDeactivated: 'This user is already deactivated.',
  alreadyActive: 'This user is already active.',
  phoneTaken: 'Another user already signs in with this phone number.',
  notPending: 'This user has already activated their account.',
} as const;

const userId = z.uuid();
const version = z.number().int().min(1);
const name = z.string().trim().min(1);
const role = z.enum(['owner', 'staff', 'karigar']);
const karigarId = z.string().trim().min(1);

/** One karigar job as its karigar sees it: no customer, price or weight fields. */
const myJob = z.object({
  code: z.string(),
  title: z.string().nullable(),
  style: z.string().nullable(),
  qty: z.number().int().nullable(),
  purity: z.string().nullable(),
  status: z.enum(['sent', 'accepted', 'on_bench', 'ready', 'handed_over']),
  dueDate: z.string().nullable(),
  confirmedDate: z.string().nullable(),
  stopped: z.boolean(),
  referenceImageKey: z.string().nullable(),
});

export const userOperations = {
  createUser: defineOperation({
    name: 'createUser',
    kind: 'create',
    input: z.object({
      name,
      phone: phoneField,
      email: z.email(),
      role,
      karigarId: karigarId.optional(),
    }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  resendActivation: defineOperation({
    name: 'resendActivation',
    kind: 'command',
    input: z.object({ userId }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  updateUserProfile: defineOperation({
    name: 'updateUserProfile',
    kind: 'command',
    input: z.object({ userId, version, name, phone: phoneField, email: z.email() }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  updateUserRole: defineOperation({
    name: 'updateUserRole',
    kind: 'command',
    input: z.object({ userId, version, role, karigarId: karigarId.optional() }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  deactivateUser: defineOperation({
    name: 'deactivateUser',
    kind: 'command',
    input: z.object({ userId, version, reason: z.string().trim().max(200).optional() }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  reactivateUser: defineOperation({
    name: 'reactivateUser',
    kind: 'command',
    input: z.object({ userId, version }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  unlockUser: defineOperation({
    name: 'unlockUser',
    kind: 'command',
    input: z.object({ userId }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  linkKarigar: defineOperation({
    name: 'linkKarigar',
    kind: 'command',
    input: z.object({ userId, version, karigarId }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  listUsers: defineOperation({
    name: 'listUsers',
    kind: 'list',
    input: z.object({ ...pageInput }),
    result: pageResult(
      z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        email: z.string(),
        role,
        status: z.enum(['pending_activation', 'active', 'deactivated']),
        karigarId: z.string().nullable(),
        lockedUntil: z.string().nullable(),
        lockedUntilLocal: z.string().nullable(),
        version: z.number().int(),
      }),
    ),
    errors: ERROR_CODES,
  }),
  listMyJobs: defineOperation({
    name: 'listMyJobs',
    kind: 'list',
    input: z.object({ ...pageInput }),
    result: pageResult(myJob),
    errors: ERROR_CODES,
  }),
  readMyJob: defineOperation({
    name: 'readMyJob',
    kind: 'read',
    input: z.object({ jobId: z.string().trim().min(1) }),
    result: z.object({ ok: z.literal(true), job: myJob }),
    errors: ERROR_CODES,
  }),
} as const;
