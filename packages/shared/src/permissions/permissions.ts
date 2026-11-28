/**
 * The fixed permission list (EP-05-S1). The role decides what a person may do; nobody ticks
 * boxes. The server checks every operation against `OPERATION_RULES` in one place before it
 * validates input or opens a transaction; the web reads the same list to hide what a role may
 * not do. Anything without a rule is refused (deny by default).
 *
 * Adding an operation to `contract` without a rule here fails `npm run typecheck` with
 * "Property '<name>' is missing".
 */
import type { AuthOperationName } from '../contract/auth-contract.js';
import type { OperationName } from '../contract/contract.js';
import type { RoleId } from '../types/jewellery.js';

export const ROLE_IDS = ['owner', 'staff', 'karigar'] as const satisfies readonly RoleId[];

/**
 * Operations the prototype has (or mockup 11 names) that the contract does not declare yet. A
 * feature epic that ports one into the contract deletes it from here; its rule stays.
 */
export const PLANNED_OPERATIONS = [
  'createLead',
  'confirmLead',
  'startWorkingLead',
  'routeLeadItemToStock',
  'releaseHold',
  'createOrderCopyAndJob',
  'acceptJob',
  'confirmDueDate',
  'startJob',
  'addBenchPhoto',
  'markJobReady',
  'handOver',
  'recordParcelArrival',
  'saveTag',
  'qcTick',
  'releaseParcel',
  'clearMismatch',
  'ownerSendBack',
  'ownerRecheckTag',
  'ownerAcceptLoss',
  'raiseProblem',
  'clearProblem',
  'proposeEdit',
  'ownerAgreeEdit',
  'applyEdit',
  'refuseEdit',
  'stockOut',
  'requestScrap',
  'ownerScrap',
  'ownerDeclineScrap',
  'onboardCustomer',
  'onboardKarigar',
  'onboardStaff',
  'sendWishes',
  'sendBroadcast',
  'upsertScale',
  'setLeadTimer',
  'readReports',
] as const;

export type PermissionName = OperationName | (typeof PLANNED_OPERATIONS)[number];

export interface OperationRule {
  roles: readonly RoleId[];
  /** The sentence a refused caller gets. */
  refusal: string;
}

/** The sentence for an operation without a rule, or a rule without its own sentence. */
export const DEFAULT_REFUSAL = 'You are not allowed to do this.';

const SHOP_FLOOR = ['staff', 'owner'] as const;
const OWNER = ['owner'] as const;
const KARIGAR = ['karigar'] as const;
const KARIGAR_REFUSED = 'A karigar can only work on their own jobs.';
const KARIGAR_ONLY = 'Only a karigar can do this, on their own job.';
const USERS_REFUSED = 'Only the owner can add staff or change a role.';
const RULES_REFUSED = 'Only the owner can change the rules.';
const JOB_RUNS_REFUSED = 'Only the owner can see and retry job runs.';
const AUDIT_REFUSED = 'Only the owner can read the security log.';

const everyone = { roles: ['staff', 'owner', 'karigar'], refusal: DEFAULT_REFUSAL } as const;
const shopFloor = { roles: SHOP_FLOOR, refusal: KARIGAR_REFUSED } as const;
const karigarOnly = { roles: KARIGAR, refusal: KARIGAR_ONLY } as const;
const ownerOnly = <const S extends string>(refusal: S) => ({ roles: OWNER, refusal }) as const;
const usersRule = ownerOnly(USERS_REFUSED);

export const OPERATION_RULES = {
  // Staff and owner.
  createLead: shopFloor,
  confirmLead: shopFloor,
  startWorkingLead: shopFloor,
  markLeadLost: shopFloor,
  routeLeadItemToStock: shopFloor,
  releaseHold: shopFloor,
  createOrderCopyAndJob: shopFloor,
  recordParcelArrival: shopFloor,
  saveTag: shopFloor,
  qcTick: shopFloor,
  releaseParcel: shopFloor,
  proposeEdit: shopFloor,
  stockOut: shopFloor,
  // A permission-checked read of one piece, for the web's live entity cache (EP-08, FU-013).
  readPiece: shopFloor,
  requestScrap: shopFloor,
  onboardCustomer: shopFloor,
  sendWishes: shopFloor,
  sendBroadcast: shopFloor,
  // The default sentence, as the file service answered before the matrix (EP-09 file-roles.ts).
  deleteAttachment: { roles: SHOP_FLOOR, refusal: DEFAULT_REFUSAL },
  // The live channel (EP-07): entity channels and parcel presence are for the shop floor; a
  // karigar's stream carries only their own user channel (EP-07-S6, S8 AC4).
  subscribeLiveChannel: shopFloor,
  unsubscribeLiveChannel: shopFloor,
  joinParcelPresence: shopFloor,
  leaveParcelPresence: shopFloor,
  // Rail badge counts (EP-07-S9): the karigar app has no rail.
  readRailBadges: shopFloor,
  // Everyone.
  raiseProblem: everyone,
  // Everyone here; a karigar only on own jobs, which the file service decides (EP-09
  // file-roles.ts), so it can answer not_found or forbidden as S6, S7, S9 and S10 require.
  readFileLinks: everyone,
  createAttachment: everyone,
  listAttachments: everyone,
  // Karigar only, on their own jobs.
  listMyJobs: karigarOnly,
  readMyJob: karigarOnly,
  acceptJob: karigarOnly,
  confirmDueDate: karigarOnly,
  startJob: karigarOnly,
  addBenchPhoto: karigarOnly,
  markJobReady: karigarOnly,
  handOver: karigarOnly,
  // Owner only.
  clearMismatch: ownerOnly('Only the owner can clear a mismatch.'),
  ownerSendBack: ownerOnly('Only the owner can send a parcel back.'),
  ownerRecheckTag: ownerOnly('Only the owner can send a tag back for re-checking.'),
  ownerAcceptLoss: ownerOnly('Only the owner can accept a loss.'),
  clearProblem: ownerOnly('Only the owner can clear a problem.'),
  ownerAgreeEdit: ownerOnly('Only the owner can agree to an edit.'),
  applyEdit: ownerOnly('Only the owner can apply an edit.'),
  refuseEdit: ownerOnly('Only the owner can refuse an edit.'),
  ownerScrap: ownerOnly('Only the owner can mark a piece as scrap.'),
  ownerDeclineScrap: ownerOnly('Only the owner can decline a scrap request.'),
  onboardKarigar: ownerOnly('Only the owner can add a karigar.'),
  onboardStaff: ownerOnly('Only the owner can onboard staff.'),
  upsertScale: ownerOnly('Only the owner can change the scales.'),
  setSetting: ownerOnly(RULES_REFUSED),
  setLeadTimer: ownerOnly(RULES_REFUSED),
  readReports: ownerOnly('Only the owner can read the reports.'),
  listJobRuns: ownerOnly(JOB_RUNS_REFUSED),
  retryJobRun: ownerOnly(JOB_RUNS_REFUSED),
  listAuditEntries: ownerOnly(AUDIT_REFUSED),
  readAuditEntry: ownerOnly(AUDIT_REFUSED),
  createUser: usersRule,
  resendActivation: usersRule,
  updateUserProfile: usersRule,
  updateUserRole: usersRule,
  deactivateUser: usersRule,
  reactivateUser: usersRule,
  unlockUser: usersRule,
  linkKarigar: usersRule,
  listUsers: usersRule,
} as const satisfies Record<PermissionName, OperationRule>;

const RULES: Readonly<Record<string, OperationRule>> = OPERATION_RULES;

/** Each role's permission list, derived from `OPERATION_RULES`. */
export const ROLE_PERMISSIONS: Readonly<Record<RoleId, readonly PermissionName[]>> = Object.freeze(
  Object.fromEntries(
    ROLE_IDS.map((role) => [
      role,
      Object.freeze(
        (Object.keys(OPERATION_RULES) as PermissionName[]).filter((op) => RULES[op]?.roles.includes(role)),
      ),
    ]),
  ) as Record<RoleId, readonly PermissionName[]>,
);

/** Whether the role may run the operation. An operation without a rule is refused. */
export function roleMay(role: RoleId, operation: string): boolean {
  return Object.hasOwn(RULES, operation) && (RULES[operation]?.roles.includes(role) ?? false);
}

/** The sentence a refused caller of the operation gets. */
export function refusalFor(operation: string): string {
  return Object.hasOwn(RULES, operation) ? (RULES[operation]?.refusal ?? DEFAULT_REFUSAL) : DEFAULT_REFUSAL;
}

/** The role's permission list, as sent in sign-in and session results. */
export function permissionsFor(role: RoleId): readonly PermissionName[] {
  return ROLE_PERMISSIONS[role];
}

/**
 * The sign-in operations are not role-gated: `public` ones run without a session, `signed_in`
 * ones need any live session.
 */
export const AUTH_OPERATION_ACCESS: Readonly<Record<AuthOperationName, 'public' | 'signed_in'>> = {
  signIn: 'public',
  requestPasswordReset: 'public',
  checkPasswordLink: 'public',
  activateAccount: 'public',
  resetPassword: 'public',
  createFirstOwner: 'public',
  readCurrentSession: 'signed_in',
  signOut: 'signed_in',
};

export interface RoleInfo {
  id: RoleId;
  label: string;
  blurb: string;
  lands: string;
  can: string[];
  cannot: string[];
}

/** What each role is, in words (mockups 11 and 25). */
export const ROLE_INFO: RoleInfo[] = [
  {
    id: 'staff',
    label: 'Staff',
    blurb: 'Showroom desk: leads, tagging, selling, proposing edits',
    lands: 'Today',
    can: [
      'Work leads and convert them',
      'Tag pieces and run the checks',
      'Release a parcel that matches',
      'Sell from stock and stock-out',
      'Propose edits and request scrap',
      'Raise a problem to stop the line',
    ],
    cannot: ['Clear a mismatch', 'Apply an edit', 'Scrap a piece'],
  },
  {
    id: 'owner',
    label: 'Owner',
    blurb: 'Everything staff can do, plus clearing, applying edits and scrap',
    lands: 'Decisions',
    can: [
      'Everything staff can do',
      'Clear a mismatch or a raised problem',
      'Apply a proposed edit with a token',
      'Mark a piece as scrap',
      'Add staff and karigars, change the rules and scales',
    ],
    cannot: [],
  },
  {
    id: 'karigar',
    label: 'Karigar',
    blurb: 'Phone only: their own jobs, no prices, no customers',
    lands: 'My jobs',
    can: ['See and accept their own jobs', 'Move a job along the bench', 'Hand a job over', 'Raise a problem on their job'],
    cannot: ['See customers', 'See prices', 'See other karigars'],
  },
];
