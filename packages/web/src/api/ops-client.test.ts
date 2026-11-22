import { afterEach, describe, expect, it, vi } from 'vitest';
import { opsCall } from './ops-client';
const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('opsCall', () => {
  it('posts JSON to /api/ops/<op> on the same origin and returns the data', async () => {
    const data = { ok: true, items: [], nextCursor: null, pageSize: 50 };
    const fetchStub = reply(200, data);
    vi.stubGlobal('fetch', fetchStub);
    expect(await opsCall('listUsers', {})).toEqual({ ok: true, data });
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ops/listUsers');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' } });
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
    expect(JSON.parse(init.body as string)).toEqual({});
  });
  it('sends the Idempotency-Key header when given', async () => {
    const fetchStub = reply(200, { ok: true, id: 'u1' });
    vi.stubGlobal('fetch', fetchStub);
    const body = { name: 'Deepak Rao', phone: '90030 71145', email: 'deepak@example.com', role: 'staff' as const };
    await opsCall('createUser', body, { idempotencyKey: 'key-1' });
    const [, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
    expect(JSON.parse(init.body as string)).toEqual(body);
  });
  it('maps the error envelope and keeps the field', async () => {
    const message = 'Another user already signs in with this phone number.';
    vi.stubGlobal('fetch', reply(400, { code: 'validation', message, field: 'phone' }));
    expect(await opsCall('listUsers', {})).toEqual({ ok: false, code: 'validation', message, field: 'phone' });
  });
  it('maps a refusal without a field', async () => {
    vi.stubGlobal('fetch', reply(422, { code: 'rule_refused', message: 'The shop needs its owner.' }));
    expect(await opsCall('listUsers', {})).toEqual({ ok: false, code: 'rule_refused', message: 'The shop needs its owner.' });
  });
  it('answers internal on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const answer = await opsCall('listUsers', {});
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.code).toBe('internal');
  });
});
