/**
 * Which operations change state and the audit kinds each writes (EP-06-S2 AC4, S7 AC6). A read
 * or list operation maps to null; every other operation lists its kinds, the always-written one
 * first. The api wraps each non-null operation so it cannot commit without one of these entries.
 *
 * Adding an operation to `contract` or `authContract` without an entry here fails
 * `npm run typecheck` with "Property '<name>' is missing", and the guard test
 * (packages/api/test/audit/every-operation-audits.test.ts) fails until the operation has a case.
 */
import type { AuditAction } from '../domain/audit-log.js';
import type { AuthOperationName } from './auth-contract.js';
import type { OperationName } from './contract.js';

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
  listUsers: null,
  listMyJobs: null,
  readMyJob: null,
  setSetting: ['setting_changed'],
} as const satisfies Readonly<Record<OperationName, readonly AuditAction[] | null>>;

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
