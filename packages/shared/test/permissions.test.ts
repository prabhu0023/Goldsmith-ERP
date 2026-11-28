import { describe, expect, it } from 'vitest';
import {
  AUTH_OPERATION_ACCESS,
  authContract,
  contract,
  OPERATION_RULES,
  PLANNED_OPERATIONS,
  permissionsFor,
  ROLE_IDS,
  ROLE_INFO,
  ROLE_PERMISSIONS,
  refusalFor,
  roleMay,
} from '../src/index.js';

const OWNER_EXTRAS = [
  'clearMismatch',
  'clearProblem',
  'applyEdit',
  'ownerScrap',
  'onboardStaff',
  'onboardKarigar',
  'updateKarigarDetails',
  'updateKarigarWastage',
  'updateKarigarStatus',
  'upsertScale',
  'setSetting',
  'listJobRuns',
  'retryJobRun',
  'listAuditEntries',
  'readAuditEntry',
  'createUser',
  'updateUserRole',
  'listUsers',
];

const KARIGAR_OWN_JOB_OPS = [
  'listMyJobs',
  'readMyJob',
  'acceptJob',
  'confirmDueDate',
  'startJob',
  'addBenchPhoto',
  'markJobReady',
  'handOver',
];

/** File operations a karigar may call; the file service limits them to own jobs (EP-09). */
const KARIGAR_OWN_JOB_FILE_OPS = ['readFileLinks', 'createAttachment', 'listAttachments'];
describe('permission list (EP-05-S1)', () => {
  it('AC1: has exactly the three roles', () => {
    expect([...ROLE_IDS].sort()).toEqual(['karigar', 'owner', 'staff']);
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(['karigar', 'owner', 'staff']);
  });

  it('AC2: staff may work leads, tag, release, sell, propose edits and request scrap, but not the owner extras', () => {
    const staff = ROLE_PERMISSIONS.staff;
    for (const op of [
      'createLead',
      'markLeadLost',
      'saveTag',
      'qcTick',
      'releaseParcel',
      'stockOut',
      'proposeEdit',
      'requestScrap',
      'raiseProblem',
    ]) {
      expect(staff, op).toContain(op);
    }
    for (const op of OWNER_EXTRAS) expect(staff, op).not.toContain(op);
    for (const op of KARIGAR_OWN_JOB_OPS) expect(staff, op).not.toContain(op);
    for (const op of [...KARIGAR_OWN_JOB_FILE_OPS, 'deleteAttachment']) expect(staff, op).toContain(op);
  });

  it('AC3: owner may do everything staff may, plus the owner extras', () => {
    const owner = ROLE_PERMISSIONS.owner;
    for (const op of ROLE_PERMISSIONS.staff) expect(owner, op).toContain(op);
    for (const op of OWNER_EXTRAS) expect(owner, op).toContain(op);
  });

  it('AC4: karigar may only work their own jobs and raise a problem', () => {
    expect([...ROLE_PERMISSIONS.karigar].sort()).toEqual(
      [...KARIGAR_OWN_JOB_OPS, ...KARIGAR_OWN_JOB_FILE_OPS, 'raiseProblem'].sort(),
    );
    const reads = ROLE_PERMISSIONS.karigar.filter((op) => /^(list|read)/.test(op));
    expect(reads.sort()).toEqual(['listAttachments', 'listMyJobs', 'readFileLinks', 'readMyJob']);
  });

  it('AC5: every contract operation has a rule', () => {
    for (const op of Object.keys(contract)) expect(Object.hasOwn(OPERATION_RULES, op), `${op} has no rule`).toBe(true);
  });

  it('gives every planned operation a rule', () => {
    for (const op of PLANNED_OPERATIONS) expect(Object.hasOwn(OPERATION_RULES, op), `${op} has no rule`).toBe(true);
  });

  it('refuses an operation without a rule for every role (deny by default)', () => {
    for (const role of ROLE_IDS) {
      expect(roleMay(role, 'noSuchOp')).toBe(false);
      expect(roleMay(role, 'toString')).toBe(false);
    }
    expect(refusalFor('noSuchOp')).toBe('You are not allowed to do this.');
  });

  it('lets every role raise a problem', () => {
    for (const role of ROLE_IDS) {
      expect(ROLE_PERMISSIONS[role], role).toContain('raiseProblem');
      expect(roleMay(role, 'raiseProblem')).toBe(true);
    }
  });

  it('lets only the owner clear a problem', () => {
    expect(roleMay('owner', 'clearProblem')).toBe(true);
    expect(roleMay('staff', 'clearProblem')).toBe(false);
    expect(roleMay('karigar', 'clearProblem')).toBe(false);
    expect(refusalFor('clearProblem')).toBe('Only the owner can clear a problem.');
  });

  it('lets only the owner call each owner-only prototype operation, and every role raise a problem (EP-40-S4 AC5, AC6)', () => {
    for (const op of [
      'clearMismatch',
      'ownerSendBack',
      'ownerRecheckTag',
      'ownerAcceptLoss',
      'clearProblem',
      'ownerAgreeEdit',
      'applyEdit',
      'refuseEdit',
      'ownerScrap',
      'ownerDeclineScrap',
      'onboardStaff',
      'onboardKarigar',
      'upsertScale',
    ] as const) {
      expect(roleMay('owner', op), `owner ${op}`).toBe(true);
      expect(roleMay('staff', op), `staff ${op}`).toBe(false);
      expect(roleMay('karigar', op), `karigar ${op}`).toBe(false);
    }
  });
  it('answers each refusal with its sentence', () => {
    expect(refusalFor('clearMismatch')).toBe('Only the owner can clear a mismatch.');
    expect(refusalFor('createUser')).toBe('Only the owner can add staff or change a role.');
    for (const op of ['onboardKarigar', 'updateKarigarDetails', 'updateKarigarWastage', 'updateKarigarStatus']) {
      expect(refusalFor(op)).toBe('Only the owner can add a karigar or change their wastage allowance.');
    }
    expect(refusalFor('listJobRuns')).toBe('Only the owner can see and retry job runs.');
    expect(refusalFor('markLeadLost')).toBe('A karigar can only work on their own jobs.');
    expect(refusalFor('listMyJobs')).toBe('Only a karigar can do this, on their own job.');
  });

  it('keeps roleMay, permissionsFor and the rules in step', () => {
    for (const role of ROLE_IDS) {
      expect(permissionsFor(role)).toBe(ROLE_PERMISSIONS[role]);
      for (const op of Object.keys(OPERATION_RULES)) {
        expect(roleMay(role, op), `${role} ${op}`).toBe(ROLE_PERMISSIONS[role].includes(op as never));
      }
    }
  });

  it('marks every sign-in operation as public or signed-in, and nothing else', () => {
    expect(Object.keys(AUTH_OPERATION_ACCESS).sort()).toEqual(Object.keys(authContract).sort());
    expect(AUTH_OPERATION_ACCESS.readCurrentSession).toBe('signed_in');
    expect(AUTH_OPERATION_ACCESS.signOut).toBe('signed_in');
    expect(AUTH_OPERATION_ACCESS.signIn).toBe('public');
  });

  it('describes each role once', () => {
    expect(ROLE_INFO.map((r) => r.id).sort()).toEqual(['karigar', 'owner', 'staff']);
  });
});
