import { afterEach, describe, expect, it, vi } from 'vitest';
import { authCall } from './auth-api';
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('authCall', () => {
  it('posts JSON to /api/auth/<op> on the same origin and returns the data', async () => {
    const data = { ok: true, user: { userId: 'u1', name: 'Rajesh Verma', role: 'staff' }, landingRoute: 'today' };
    const fetchStub = reply(200, data);
    vi.stubGlobal('fetch', fetchStub);
    const answer = await authCall('signIn', { phone: '98410 11111', password: 'counter-2026' });
    expect(answer).toEqual({ ok: true, data });
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/signIn');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(init.body as string)).toEqual({ phone: '98410 11111', password: 'counter-2026' });
  });
  it('maps a 401 body', async () => {
    vi.stubGlobal('fetch', reply(401, { code: 'unauthenticated', message: 'Phone number or password is wrong.' }));
    expect(await authCall('signIn', { phone: '98410 11111', password: 'x' })).toEqual({
      ok: false,
      code: 'unauthenticated',
      message: 'Phone number or password is wrong.',
    });
  });
  it('maps a 422 body', async () => {
    const message = 'Too many wrong passwords. Try again after 15:45.';
    vi.stubGlobal('fetch', reply(422, { code: 'rule_refused', message }));
    expect(await authCall('signIn', { phone: '98410 11111', password: 'x' })).toEqual({ ok: false, code: 'rule_refused', message });
  });
  it('keeps the field of a validation error', async () => {
    vi.stubGlobal('fetch', reply(400, { code: 'validation', message: 'phone is not valid.', field: 'phone' }));
    expect(await authCall('requestPasswordReset', { phone: '1' })).toEqual({
      ok: false,
      code: 'validation',
      message: 'phone is not valid.',
      field: 'phone',
    });
  });
  it('answers internal on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const answer = await authCall('readCurrentSession', {});
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.code).toBe('internal');
  });
});
