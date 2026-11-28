import { normaliseIndianMobile } from '@goldsmith/shared';
import type { OperationResult, RoleId } from '@goldsmith/shared';
/** One row of the server's user directory (listUsers). */
export type UserRow = OperationResult<'listUsers'>['items'][number];
export type RowAction = 'resend' | 'deactivate' | 'reactivate' | 'unlock';
/** What the directory says about a user's access (EP-05-S11). */
export function statusLabel(user: Pick<UserRow, 'status' | 'lockedUntilLocal'>): string {
  if (user.status === 'deactivated') return 'Deactivated';
  if (user.lockedUntilLocal) return `Locked until ${user.lockedUntilLocal}`;
  return user.status === 'pending_activation' ? 'Awaiting activation' : 'Active';
}
/** The buttons a row offers the owner. The owner's own row can never be deactivated (S9). */
export function rowActions(user: Pick<UserRow, 'status' | 'role' | 'lockedUntilLocal'>): RowAction[] {
  const actions: RowAction[] = [];
  if (user.status === 'pending_activation') actions.push('resend');
  if (user.status !== 'deactivated' && user.role !== 'owner') actions.push('deactivate');
  if (user.status === 'deactivated') actions.push('reactivate');
  if (user.status !== 'deactivated' && user.lockedUntilLocal) actions.push('unlock');
  return actions;
}

/** The sentence over a drawer whose person was changed by someone else since it was opened (EP-08-S9 AC3). */
export const DRAWER_CHANGED_NOTICE = 'This person was changed by someone else. Your edits are kept.';
/** The drawer keeps what was typed and the version it was opened with; a newer row version shows the notice. */
export function drawerNotice(openedVersion: number, currentVersion: number): string | null {
  return currentVersion > openedVersion ? DRAWER_CHANGED_NOTICE : null;
}
export type AddUserField = 'name' | 'phone' | 'email' | 'karigarId';

/** The add form's own checks before it calls createUser (EP-05-S4 AC5). */
export function addUserFieldErrors(form: {
  name: string;
  phone: string;
  email: string;
  role: RoleId;
  karigarId: string;
}): Partial<Record<AddUserField, string>> {
  const found: Partial<Record<AddUserField, string>> = {};
  if (!form.name.trim()) found.name = 'Add the name.';
  if (normaliseIndianMobile(form.phone) === null) found.phone = 'Enter a 10-digit mobile number.';
  if (!form.email.trim()) found.email = 'Add the email address. The activation link goes there.';
  if (form.role === 'karigar' && !form.karigarId.trim()) found.karigarId = 'Add the karigar code, e.g. KG-04.';
  return found;
}

const ADD_USER_FIELDS: readonly string[] = ['name', 'phone', 'email', 'karigarId'];
/**
 * Where a refusal of createUser is shown: on its field when the server names one of the form's
 * fields with a validation refusal (the duplicate-phone sentence sits on the phone), else as one
 * sentence beside the button. What was typed is never touched (EP-08-S5 AC2, S18 AC5).
 */
export function addUserRefusal(
  refusal: { code: string; message: string; field?: string } | null,
): { field: AddUserField; message: string } | { notice: string } | null {
  if (!refusal) return null;
  if (refusal.code === 'validation' && refusal.field && ADD_USER_FIELDS.includes(refusal.field)) {
    return { field: refusal.field as AddUserField, message: refusal.message };
  }
  return { notice: refusal.message };
}
