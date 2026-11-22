import { describe, expect, it } from 'vitest';
import { rowActions, statusLabel } from './user-rows';
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
