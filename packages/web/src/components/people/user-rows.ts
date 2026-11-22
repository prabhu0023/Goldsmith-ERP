import type { OperationResult } from '@goldsmith/shared';
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
