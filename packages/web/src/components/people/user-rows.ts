import { normaliseIndianMobile } from '@goldsmith/shared';
import type { OperationResult, RoleId } from '@goldsmith/shared';
import type { OpsAnswer } from '../../api/ops-client';
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

/** The directory's list state: the rows so far, the next page cursor and a load error. */
export interface DirectoryList {
  users: UserRow[];
  nextCursor: string | null;
  loadError: string | null;
}

/**
 * The list after a listUsers answer (EP-05-S11 AC3, AC4): a page is added after "Load more" or
 * replaces the list; a failure keeps the rows and shows the server's message (with Retry).
 */
export function afterListAnswer(prev: DirectoryList, answer: OpsAnswer<'listUsers'>, cursor?: string): DirectoryList {
  if (!answer.ok) return { ...prev, loadError: answer.message };
  return {
    users: cursor ? [...prev.users, ...answer.data.items] : answer.data.items,
    nextCursor: answer.data.nextCursor,
    loadError: null,
  };
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
