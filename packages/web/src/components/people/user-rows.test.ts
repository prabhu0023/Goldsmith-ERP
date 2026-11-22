import { describe, expect, it } from 'vitest';
import { addUserFieldErrors, afterListAnswer, rowActions, statusLabel } from './user-rows';
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

describe('afterListAnswer (EP-05-S11 AC3, AC4)', () => {
  const empty = { users: [], nextCursor: null, loadError: null };
  it('a failed load keeps the rows and shows the server message', () => {
    const prev = { users: [row({})], nextCursor: 'c1', loadError: null };
    const message = 'Cannot reach the server. Check the connection and try again.';
    expect(afterListAnswer(prev, { ok: false, code: 'internal', message })).toEqual({ ...prev, loadError: message });
  });
  it('a retry that succeeds clears the error and replaces the list', () => {
    const page = { ok: true as const, items: [row({ id: 'u2' })], nextCursor: null, pageSize: 50 };
    expect(afterListAnswer({ ...empty, loadError: 'x' }, { ok: true, data: page })).toEqual({
      users: page.items,
      nextCursor: null,
      loadError: null,
    });
  });
  it('Load more adds the next page after the rows so far', () => {
    const prev = { users: [row({ id: 'u1' })], nextCursor: 'c1', loadError: null };
    const next = afterListAnswer(prev, { ok: true, data: { ok: true as const, items: [row({ id: 'u2' })], nextCursor: 'c2', pageSize: 50 } }, 'c1');
    expect(next.users.map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(next.nextCursor).toBe('c2');
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
