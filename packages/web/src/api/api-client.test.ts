import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api-client';
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

const okBody = { ok: true };
const sent = (fetchFn: ReturnType<typeof reply>) => {
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};
describe('createApiClient (EP-08-S1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('AC1: a wrong argument does not compile', async () => {
    vi.stubGlobal('fetch', reply(200, okBody));
    const api = createApiClient({ fetchFn: reply(200, okBody) });
    // @ts-expect-error leadId is a string; a number is refused by the type
    await api.call('markLeadLost', { leadId: 5 });
    // @ts-expect-error opsCall is typed the same way
    await opsCall('markLeadLost', { leadId: 5 });
  });
  it('AC2: sends the cookie, reads no token', async () => {
    const fetchFn = reply(200, okBody);
    await createApiClient({ fetchFn }).call('markLeadLost', { leadId: 'L-1' });
    const { url, init, headers } = sent(fetchFn);
    expect(url).toBe('/api/ops/markLeadLost');
    expect(init.credentials).toBe('same-origin');
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization');
  });
  it('AC3: a command carries a fresh Idempotency-Key, a given key is kept, false sends none', async () => {
    const fresh = reply(200, okBody);
    await createApiClient({ fetchFn: fresh, newKey: () => 'key-fresh' }).call('markLeadLost', { leadId: 'L-1' });
    expect(sent(fresh).headers['Idempotency-Key']).toBe('key-fresh');
    const given = reply(200, okBody);
    await createApiClient({ fetchFn: given }).call('markLeadLost', { leadId: 'L-1' }, { idempotencyKey: 'key-given' });
    expect(sent(given).headers['Idempotency-Key']).toBe('key-given');
    const none = reply(200, okBody);
    await createApiClient({ fetchFn: none }).call('markLeadLost', { leadId: 'L-1' }, { idempotencyKey: false });
    expect(sent(none).headers).not.toHaveProperty('Idempotency-Key');
  });
  it('AC3: a read and a list carry no key, even when one is given', async () => {
    for (const [op, input] of [
      ['readRailBadges', {}],
      ['listUsers', {}],
    ] as const) {
      const fetchFn = reply(200, okBody);
      await createApiClient({ fetchFn }).call(op, input, { idempotencyKey: 'key-given' });
      expect(sent(fetchFn).headers).not.toHaveProperty('Idempotency-Key');
    }
  });
  it('a background read sends X-Background-Refresh: 1; a foreground read and a command do not', async () => {
    const background = reply(200, okBody);
    await createApiClient({ fetchFn: background }).call('listUsers', {}, { background: true });
    expect(sent(background).headers['X-Background-Refresh']).toBe('1');
    const foreground = reply(200, okBody);
    await createApiClient({ fetchFn: foreground }).call('listUsers', {});
    expect(sent(foreground).headers).not.toHaveProperty('X-Background-Refresh');
    const command = reply(200, okBody);
    await createApiClient({ fetchFn: command }).call('markLeadLost', { leadId: 'L-1' }, { background: true });
    expect(sent(command).headers).not.toHaveProperty('X-Background-Refresh');
  });
  it('AC4: a refusal answers { ok:false, code, message } as the server wrote it', async () => {
    const message = 'A converted lead cannot be marked lost.';
    const api = createApiClient({ fetchFn: reply(422, { code: 'rule_refused', message }) });
    expect(await api.call('markLeadLost', { leadId: 'L-1' })).toEqual({ ok: false, code: 'rule_refused', message });
  });
  it('AC5: a 401 unauthenticated calls onSessionEnded and still returns the answer', async () => {
    const onSessionEnded = vi.fn();
    const body = { code: 'unauthenticated', message: 'Your session has ended. Sign in again.' };
    const api = createApiClient({ fetchFn: reply(401, body), onSessionEnded });
    expect(await api.call('listUsers', {})).toEqual({ ok: false, ...body });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    const forbidden = createApiClient({ fetchFn: reply(403, { code: 'forbidden', message: 'No.' }), onSessionEnded });
    await forbidden.call('listUsers', {});
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });
  it('a thrown fetch is a network failure', async () => {
    const api = createApiClient({ fetchFn: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });
    expect(await api.call('listUsers', {})).toMatchObject({ ok: false, code: 'internal', network: true });
  });
  it('a body that is not JSON answers internal, flagged as unconfirmed', async () => {
    const api = createApiClient({ fetchFn: vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })) });
    expect(await api.call('listUsers', {})).toMatchObject({ ok: false, code: 'internal', network: true });
  });
  it('S4 AC5: a call with no answer after 15 s fails as a network failure', async () => {
    vi.useFakeTimers();
    const hangs = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = createApiClient({ fetchFn: hangs }).call('listUsers', {});
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ ok: false, code: 'internal', network: true });
  });
  it('a fetch that ignores the abort signal still times out', async () => {
    vi.useFakeTimers();
    const deaf = vi.fn(() => new Promise<Response>(() => {}));
    const pending = createApiClient({ fetchFn: deaf, timeoutMs: 1000 }).call('listUsers', {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ ok: false, network: true });
  });
});
