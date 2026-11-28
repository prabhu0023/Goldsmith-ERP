/**
 * Which operations change state and the audit kinds each writes (EP-06-S2 AC4, S7 AC6). A read
 * or list operation maps to null; every other operation lists its kinds, the always-written one
 * first. The api wraps each non-null operation so it cannot commit without one of these entries.
 *
 * Adding an operation to `contract` or `authContract` without an entry here fails
 * `npm run typecheck` with "Property '<name>' is missing", and the guard test
 * (packages/api/test/audit/every-operation-audits.test.ts) fails until the operation has a case.
 */
import { z } from 'zod';
import { AUDIT_ACTIONS, AUDIT_ACTOR_ROLES, AUDIT_GROUP_IDS, type AuditAction } from '../domain/audit-log.js';
import type { AuthOperationName } from './auth-contract.js';
import type { OperationName } from './contract.js';
import { pageInput, pageResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';
/**
 * One entry as the security log lists it (EP-06-S9). `at` is UTC ISO, `atLocal` shop time with
 * its offset; `ref` is the reference column (the tag, batch, job or run code, or the id of the
 * entry a correction corrects). `tokenUsed` says a token authorised the change, never which.
 * Entries written before EP-06 may have no entity or summary.
 */
const auditEntryItem = z.object({
  id: z.string(),
  at: z.string(),
  atLocal: z.string(),
  kind: z.enum(AUDIT_ACTIONS),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  ref: z.string().nullable(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  actorRole: z.enum(AUDIT_ACTOR_ROLES),
  summary: z.string().nullable(),
  tokenUsed: z.boolean(),
});
const auditValues = z.record(z.string(), z.unknown()).nullable();
/**
 * The owner's security log (EP-06-S9 to S12): newest first by cursor, filtered on the server by
 * group, entity (its code or the reference), actor and shop dates (`from` and `to` inclusive).
 * There is no operation that changes or removes an entry (S1 AC3).
 */
export const auditOperations = {
  listAuditEntries: defineOperation({
    name: 'listAuditEntries',
    kind: 'list',
    input: z.object({
      ...pageInput,
      group: z.enum(AUDIT_GROUP_IDS).optional(),
      entity: z.string().trim().min(1).max(64).optional(),
      actorId: z.uuid().optional(),
      actorRole: z.enum(AUDIT_ACTOR_ROLES).optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
    }),
    result: pageResult(auditEntryItem),
    errors: ERROR_CODES,
  }),
  readAuditEntry: defineOperation({
    name: 'readAuditEntry',
    kind: 'read',
    input: z.object({ id: z.string().trim().min(1) }),
    result: z.object({
      ok: z.literal(true),
      entry: auditEntryItem.extend({
        before: auditValues,
        after: auditValues,
        reason: z.string().nullable(),
        detail: z.string().nullable(),
        tokenReference: z.string().nullable(),
        /** The earlier entry this one corrects, when its reference is an entry of the same shop. */
        corrects: z.object({ id: z.string(), kind: z.enum(AUDIT_ACTIONS), at: z.string() }).nullable(),
      }),
    }),
    errors: ERROR_CODES,
  }),
} as const;

export const OPERATION_AUDIT_KINDS = {
  markLeadLost: ['lead_lost'],
  listJobRuns: null,
  retryJobRun: ['job_run_retried'],
  createUser: ['user_added', 'activation_link_sent'],
  resendActivation: ['activation_link_sent'],
  updateUserProfile: ['user_edited'],
  updateUserRole: ['role_changed', 'sessions_ended'],
  deactivateUser: ['user_deactivated', 'sessions_ended'],
  reactivateUser: ['user_reactivated'],
  unlockUser: ['account_unlocked'],
  linkKarigar: ['karigar_linked'],
  onboardKarigar: ['karigar_onboarded'],
  updateKarigarDetails: ['karigar_edited', 'user_edited'],
  updateKarigarWastage: ['karigar_wastage_changed'],
  updateKarigarStatus: ['karigar_deactivated', 'karigar_reactivated', 'user_deactivated', 'sessions_ended'],
  listUsers: null,
  listMyJobs: null,
  readMyJob: null,
  readPiece: null,
  setSetting: ['setting_changed'],
  listAuditEntries: null,
  readAuditEntry: null,
  readFileLinks: null,
  createAttachment: ['file_attached'],
  deleteAttachment: ['file_detached'],
  listAttachments: null,
  // The live channel (EP-07): exempt with a reason in AUDIT_EXEMPT_OPERATIONS; readRailBadges reads.
  subscribeLiveChannel: null,
  unsubscribeLiveChannel: null,
  joinParcelPresence: null,
  leaveParcelPresence: null,
  readRailBadges: null,
} as const satisfies Readonly<Record<OperationName, readonly AuditAction[] | null>>;

/**
 * Commands that write no audit entry, each with the reason. They change no stored state: the live
 * channel's subscriptions and parcel presence (join, which is also the heartbeat, and leave) live
 * in memory with the open stream and end with it (EP-07).
 */
export const AUDIT_EXEMPT_OPERATIONS: Readonly<Partial<Record<OperationName, string>>> = {
  subscribeLiveChannel: 'adds a channel to the open live stream, in memory only; no stored state changes',
  unsubscribeLiveChannel: 'removes a channel from the open live stream, in memory only; no stored state changes',
  joinParcelPresence: 'records presence (join or heartbeat) in memory for the open stream; no stored state changes',
  leaveParcelPresence: 'removes in-memory presence for the open stream; no stored state changes',
};
/**
 * The sign-in operations (EP-04), served by the auth router (not wrapped). A reset request for an
 * unknown phone and a sign-out of an already ended session change nothing and write nothing.
 */
export const AUTH_OPERATION_AUDIT_KINDS = {
  signIn: ['signed_in', 'sign_in_failed', 'sign_in_locked'],
  readCurrentSession: null,
  signOut: ['signed_out'],
  requestPasswordReset: ['password_reset_requested'],
  checkPasswordLink: null,
  activateAccount: ['password_set'],
  resetPassword: ['password_reset'],
  createFirstOwner: ['first_owner_created', 'activation_link_sent'],
} as const satisfies Readonly<Record<AuthOperationName, readonly AuditAction[] | null>>;

/** The operations of `M` whose entry is not null. */
export type StateChangingIn<M> = { [K in keyof M]: M[K] extends null ? never : K }[keyof M];

/** Every operation, of either contract, that must write an audit entry. */
export type StateChangingOperation =
  | StateChangingIn<typeof OPERATION_AUDIT_KINDS>
  | StateChangingIn<typeof AUTH_OPERATION_AUDIT_KINDS>;
