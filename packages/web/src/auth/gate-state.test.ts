import { AUTH_MESSAGES } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import type { AuthAnswer } from './auth-api';
import { gateAfterCheck, gateAfterRecheck, gateAfterSignOut, gateFromLocation } from './gate-state';
const unauthenticated: AuthAnswer<'readCurrentSession'> = { ok: false, code: 'unauthenticated', message: 'Sign in to continue.' };
const session = { ok: true, user: { userId: 'u1', name: 'Rajesh Verma', role: 'staff' }, landingRoute: 'today', permissions: ['markLeadLost'] as string[] } as const;
describe('auth gate states (EP-04-S6, S11, S12)', () => {
  it('S6 AC5, S11 AC4: any app address without a session, also after sign-out and Back, checks first and then shows sign-in', () => {
    for (const path of ['/', '/stock', '/today']) {
      expect(gateFromLocation(path, '')).toEqual({ kind: 'checking' });
    }
    expect(gateAfterCheck(unauthenticated)).toEqual({ kind: 'signed-out', view: 'sign-in', notice: undefined });
    expect(gateAfterCheck({ ok: false, code: 'internal', message: 'x' })).toMatchObject({ kind: 'signed-out', view: 'sign-in' });
  });
  it('S6 AC4: a valid session after a reload shows the app without a password', () => {
    expect(gateAfterCheck({ ok: true, data: session })).toEqual({ kind: 'signed-in', session });
  });
  it('S7, S10: activation and reset links read the token from the hash', () => {
    expect(gateFromLocation('/activate', '#token=abc')).toEqual({ kind: 'link', purpose: 'activation', token: 'abc' });
    expect(gateFromLocation('/reset-password', '#token=xyz')).toEqual({ kind: 'link', purpose: 'reset', token: 'xyz' });
    expect(gateFromLocation('/activate', '')).toEqual({ kind: 'link', purpose: 'activation', token: '' });
  });
  it('S12 AC1, S13 AC2: a re-check answering unauthenticated shows sign-in with the session-ended sentence', () => {
    expect(gateAfterRecheck(unauthenticated)).toEqual({ kind: 'signed-out', view: 'sign-in', notice: AUTH_MESSAGES.sessionEnded });
  });
  it('S11 AC1: a sign-out the server answers ok shows the sign-in screen', () => {
    expect(gateAfterSignOut({ ok: true, data: { ok: true } })).toEqual({ kind: 'signed-out', view: 'sign-in', notice: undefined });
  });
  it('S11: a sign-out answered unauthenticated (the session had already ended) shows the sign-in screen', () => {
    expect(gateAfterSignOut({ ok: false, code: 'unauthenticated', message: 'Sign in to continue.' })).toEqual({
      kind: 'signed-out',
      view: 'sign-in',
      notice: undefined,
    });
  });
  it('S11: a sign-out that fails for another reason keeps the app open, so a reload cannot sign the same person back in', () => {
    expect(gateAfterSignOut({ ok: false, code: 'internal', message: 'Cannot reach the server. Check the connection and try again.' })).toBeNull();
    expect(gateAfterSignOut({ ok: false, code: 'rate_limited', message: 'Too many requests.' })).toBeNull();
  });
  it('a re-check that succeeds or fails for another reason keeps the app open', () => {
    expect(gateAfterRecheck({ ok: true, data: session })).toBeNull();
    expect(gateAfterRecheck({ ok: false, code: 'internal', message: 'Cannot reach the server.' })).toBeNull();
  });
});
