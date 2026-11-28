/**
 * Operation coverage guard (EP-40-S5 AC3). Every operation in the production contract and the
 * sign-in contract is listed below with the existing test file that proves each of four things:
 * success, validation refusal, rule refusal (not_found, conflict, rule_refused or an expired
 * link) and permission. A cell is a path under test/, or `n/a` with the reason.
 *
 * The test fails when an operation is missing from the manifest, when a manifest row names an
 * operation that no longer exists, and when a cited file does not exist, does not name the
 * operation (a file marked GENERIC covers every operation by looping over the contract) or shows
 * none of the signals for its column.
 *
 * To add an operation: write its tests, then add one row. The row type is checked by typecheck.
 */
import { existsSync, readFileSync } from 'node:fs';
import { authContract, contract } from '@goldsmith/shared';
import { expect, it } from 'vitest';
const ROOT = new URL('../', import.meta.url);
type Cell = string | { na: string };
interface Row {
  success: Cell;
  validation: Cell;
  refusal: Cell;
  permission: Cell;
}
const MATRIX_VALIDATION = 'manifest/validation-matrix.test.ts';
const MATRIX_PERMISSION = 'permissions/role-matrix.test.ts';
/** Files that cover every operation by looping over the contract instead of naming each one. */
const GENERIC = [MATRIX_VALIDATION, MATRIX_PERMISSION];
const AUTH_PERMISSION = {
  na: 'sign-in operations are public or signed-in only (AUTH_OPERATION_ACCESS, shared/test/permissions.test.ts); no role rule',
};
const row = (success: Cell, validation: Cell, refusal: Cell, permission: Cell = MATRIX_PERMISSION): Row => ({
  success,
  validation,
  refusal,
  permission,
});
const ok = 'No input to validate.';
const MANIFEST: Record<string, Row> = {
  // Leads and jobs
  markLeadLost: row('services/mark-lead-lost.test.ts', 'services/mark-lead-lost.test.ts', 'services/mark-lead-lost.test.ts'),
  listJobRuns: row('services/job-runs.test.ts', MATRIX_VALIDATION, 'services/job-runs.test.ts'),
  retryJobRun: row('services/job-runs.test.ts', MATRIX_VALIDATION, 'services/job-runs.test.ts'),
  // Users
  createUser: row('users/add-user.test.ts', 'users/add-user.test.ts', 'users/add-user.test.ts'),
  resendActivation: row('users/add-user.test.ts', MATRIX_VALIDATION, 'users/add-user.test.ts'),
  updateUserProfile: row('users/edit-user.test.ts', MATRIX_VALIDATION, 'users/edit-user.test.ts'),
  updateUserRole: row('users/role-change.test.ts', MATRIX_VALIDATION, 'users/role-change.test.ts'),
  deactivateUser: row('users/deactivate-reactivate.test.ts', MATRIX_VALIDATION, 'users/deactivate-reactivate.test.ts'),
  reactivateUser: row('users/deactivate-reactivate.test.ts', MATRIX_VALIDATION, 'users/deactivate-reactivate.test.ts'),
  unlockUser: row('users/directory.test.ts', MATRIX_VALIDATION, 'users/directory.test.ts'),
  linkKarigar: row('users/link-karigar.test.ts', MATRIX_VALIDATION, 'users/link-karigar.test.ts'),
  listUsers: row('users/directory.test.ts', 'users/directory.test.ts', 'users/directory.test.ts'),
  // Karigar jobs
  listMyJobs: row('permissions/karigar-scope.test.ts', 'permissions/karigar-scope.test.ts', 'permissions/karigar-scope.test.ts'),
  readMyJob: row('permissions/karigar-scope.test.ts', MATRIX_VALIDATION, 'permissions/karigar-scope.test.ts'),
  // Files
  readFileLinks: row('files/file-links.test.ts', MATRIX_VALIDATION, 'files/file-links.test.ts'),
  createAttachment: row('files/attachments.test.ts', 'files/attachments.test.ts', 'files/attachments.test.ts'),
  deleteAttachment: row('files/attachments.test.ts', MATRIX_VALIDATION, 'files/attachments.test.ts'),
  listAttachments: row('files/attachments.test.ts', MATRIX_VALIDATION, 'files/attachments.test.ts'),
  // Pieces
  readPiece: row('services/read-piece.test.ts', MATRIX_VALIDATION, 'services/read-piece.test.ts'),
  // Settings and audit
  setSetting: row('audit/settings-audit.test.ts', 'audit/settings-audit.test.ts', 'audit/settings-audit.test.ts'),
  listAuditEntries: row('audit/audit-log-reads.test.ts', 'audit/audit-log-reads.test.ts', 'audit/audit-log-reads.test.ts'),
  readAuditEntry: row('audit/audit-log-reads.test.ts', MATRIX_VALIDATION, 'audit/audit-log-reads.test.ts'),
  // Live
  subscribeLiveChannel: row('live/channels.test.ts', 'live/channels.test.ts', 'live/channels.test.ts'),
  unsubscribeLiveChannel: row('live/channels.test.ts', MATRIX_VALIDATION, 'live/channels.test.ts'),
  joinParcelPresence: row('live/presence.test.ts', MATRIX_VALIDATION, 'live/presence.test.ts'),
  leaveParcelPresence: row('live/presence.test.ts', MATRIX_VALIDATION, 'live/presence.test.ts'),
  readRailBadges: row('live/rail-badges.test.ts', { na: ok }, { na: 'no business rule; a karigar refusal is the permission column (live/rail-badges.test.ts)' }),
  // Sign-in
  signIn: row('auth/sign-in.test.ts', 'auth/sign-in.test.ts', 'auth/lockout.test.ts', AUTH_PERMISSION),
  readCurrentSession: row('auth/current-session.test.ts', { na: ok }, 'auth/current-session.test.ts', AUTH_PERMISSION),
  signOut: row('auth/current-session.test.ts', { na: ok }, 'auth/current-session.test.ts', AUTH_PERMISSION),
  requestPasswordReset: row('auth/password-reset.test.ts', 'auth/password-reset.test.ts', 'auth/rate-limits.test.ts', AUTH_PERMISSION),
  checkPasswordLink: row('auth/activation.test.ts', MATRIX_VALIDATION, 'auth/activation.test.ts', AUTH_PERMISSION),
  activateAccount: row('auth/activation.test.ts', 'auth/activation.test.ts', 'auth/activation.test.ts', AUTH_PERMISSION),
  resetPassword: row('auth/password-reset.test.ts', MATRIX_VALIDATION, 'auth/password-reset.test.ts', AUTH_PERMISSION),
  createFirstOwner: row('auth/first-owner.test.ts', 'auth/first-owner.test.ts', 'auth/first-owner.test.ts', AUTH_PERMISSION),
};
/** What a file must show for the column it is cited in. */
const SIGNAL: Record<keyof Row, RegExp> = {
  success: /status\)?\.?toBe\(200\)|status: 200|\.ok\b|ok: true|toBe\(200\)/,
  validation: /validation|\b400\b/,
  refusal: /unauthenticated|not_found|conflict|rule_refused|rate_limited|\b40[0-9]\b|\b429\b|expired|locked|refus/i,
  permission: /forbidden|\b403\b/,
};
const COLUMNS = Object.keys(SIGNAL) as Array<keyof Row>;
const OPERATIONS = [...Object.keys(contract), ...Object.keys(authContract)];
const read = (path: string): string | null =>
  existsSync(new URL(path, ROOT)) ? readFileSync(new URL(path, ROOT), 'utf8') : null;
it('lists every operation of the production and sign-in contracts, and nothing else', () => {
  expect(OPERATIONS.filter((op) => !Object.hasOwn(MANIFEST, op)).sort(), 'operations with no manifest row').toEqual([]);
  expect(Object.keys(MANIFEST).filter((op) => !OPERATIONS.includes(op)).sort(), 'rows for unknown operations').toEqual([]);
});
it('gives every n/a cell a reason', () => {
  for (const [op, row] of Object.entries(MANIFEST)) {
    for (const column of COLUMNS) {
      const cell = row[column];
      if (typeof cell !== 'string') expect(cell.na.trim().length, `${op} ${column}`).toBeGreaterThan(10);
    }
  }
});
it.each(Object.entries(MANIFEST))('%s: every cited test file exists, names it and shows the column', (op, row) => {
  for (const column of COLUMNS) {
    const cell = row[column];
    if (typeof cell !== 'string') continue;
    const text = read(cell);
    expect(text, `${op} ${column}: ${cell} does not exist`).not.toBeNull();
    if (!GENERIC.includes(cell)) {
      expect(new RegExp(`\\b${op}\\b`).test(text ?? ''), `${op} ${column}: ${cell} never names ${op}`).toBe(true);
    }
    expect(SIGNAL[column].test(text ?? ''), `${op} ${column}: ${cell} shows no ${column} case`).toBe(true);
  }
});
it('cites the generic files only for the column they cover', () => {
  for (const [op, row] of Object.entries(MANIFEST)) {
    for (const column of COLUMNS) {
      const cell = row[column];
      if (cell === MATRIX_VALIDATION) expect(column, op).toBe('validation');
      if (cell === MATRIX_PERMISSION) expect(column, op).toBe('permission');
    }
  }
});
