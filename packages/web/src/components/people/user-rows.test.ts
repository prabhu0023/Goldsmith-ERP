import { describe, expect, it } from 'vitest';
import { addUserFieldErrors, addUserRefusal, drawerNotice, rowActions, statusLabel } from './user-rows';
import type { UserRow } from './user-rows';
const row = (over: Partial<UserRow>): UserRow => ({
  id: 'u1',
  name: 'Deepak Rao',
  phone: '+919003071145',
  email: 'deepak@example.com',
  role: 'staff',
  status: 'active',
  karigarId: null,
  lockedUntil: null,
  lockedUntilLocal: null,
  version: 1,
  ...over,
});
describe('statusLabel (EP-05-S11)', () => {
  it('names each status', () => {
    expect(statusLabel(row({ status: 'pending_activation' }))).toBe('Awaiting activation');
    expect(statusLabel(row({ status: 'active' }))).toBe('Active');
    expect(statusLabel(row({ lockedUntil: '2026-11-22T10:15:00.000Z', lockedUntilLocal: '15:45' }))).toBe('Locked until 15:45');
    expect(statusLabel(row({ status: 'deactivated' }))).toBe('Deactivated');
  });
});
describe('rowActions', () => {
  it('offers resend and deactivate for a pending user', () => {
    expect(rowActions(row({ status: 'pending_activation' }))).toEqual(['resend', 'deactivate']);
  });
  it('offers deactivate for an active user and unlock when locked', () => {
    expect(rowActions(row({}))).toEqual(['deactivate']);
    expect(rowActions(row({ lockedUntilLocal: '15:45' }))).toEqual(['deactivate', 'unlock']);
  });
  it('offers only reactivate for a deactivated user', () => {
    expect(rowActions(row({ status: 'deactivated' }))).toEqual(['reactivate']);
  });
  it('never offers to deactivate the owner', () => {
    expect(rowActions(row({ role: 'owner' }))).toEqual([]);
    expect(rowActions(row({ role: 'owner', lockedUntilLocal: '15:45' }))).toEqual(['unlock']);
  });
});

describe('drawerNotice (EP-08-S9 AC3)', () => {
  it('says nothing while the row is at the version the drawer was opened with', () => {
    expect(drawerNotice(3, 3)).toBeNull();
  });
  it('tells the owner the person was changed and the edits are kept', () => {
    expect(drawerNotice(3, 4)).toBe('This person was changed by someone else. Your edits are kept.');
  });
});
describe('addUserRefusal (EP-08-S5 AC2, S18 AC5)', () => {
  it('puts a validation refusal on the field the server names', () => {
    const sentence = 'A user with this phone number already exists.';
    expect(addUserRefusal({ code: 'validation', message: sentence, field: 'phone' })).toEqual({ field: 'phone', message: sentence });
  });
  it('shows any other refusal as one sentence beside the button', () => {
    expect(addUserRefusal({ code: 'forbidden', message: 'Only the owner can add staff.' })).toEqual({ notice: 'Only the owner can add staff.' });
    expect(addUserRefusal({ code: 'validation', message: 'Bad.', field: 'role' })).toEqual({ notice: 'Bad.' });
  });
  it('shows nothing without a refusal', () => {
    expect(addUserRefusal(null)).toBeNull();
  });
});
describe('addUserFieldErrors (EP-05-S4 AC5)', () => {
  const ok = { name: 'Deepak Rao', phone: '+91 90030 71145', email: 'deepak@example.com', role: 'staff' as const, karigarId: '' };
  it('accepts a complete form', () => {
    expect(addUserFieldErrors(ok)).toEqual({});
  });
  it('names each missing or wrong field', () => {
    expect(addUserFieldErrors({ ...ok, name: ' ', phone: '12345', email: '' })).toEqual({
      name: 'Add the name.',
      phone: 'Enter a 10-digit mobile number.',
      email: 'Add the email address. The activation link goes there.',
    });
  });
  it('asks a karigar for the karigar code', () => {
    expect(addUserFieldErrors({ ...ok, role: 'karigar' })).toEqual({ karigarId: 'Add the karigar code, e.g. KG-04.' });
  });
});
