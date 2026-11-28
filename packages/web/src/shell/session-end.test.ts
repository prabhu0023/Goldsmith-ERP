import type { LiveHandle } from './signed-in-runtime';
import { describe, expect, it, vi } from 'vitest';
import { deferred, fakeLive, fakeTimers, flush } from '../query/test-support';
import { defineQuery } from '../query/query-client';
import { createSignedInRuntime } from './signed-in-runtime';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const listUsers = defineQuery({ op: 'listUsers', input: {} });
function setup(answer: () => Response = () => json(200, { ok: true, items: [], nextCursor: null, pageSize: 25 })) {
  const clock = fakeTimers();
  const onSessionEnded = vi.fn();
  const fetchFn = vi.fn(async () => answer());
  const runtime = createSignedInRuntime({
    userId: 'u-me',
    onSessionEnded,
    timers: clock.timers,
    now: clock.now,
    fetchFn,
    windowLike: { navigator: { onLine: true }, addEventListener: () => {}, removeEventListener: () => {} },
  });
  const l = fakeLive('open');
  const detach = runtime.attach(l.live as LiveHandle);
  return { clock, onSessionEnded, fetchFn, runtime, l, detach };
}
/** What SignedInApp does when it unmounts. */
const unmount = ({ runtime, detach }: ReturnType<typeof setup>) => {
  detach();
  runtime.dispose();
};
describe('session end (EP-08-S14 AC4, S15)', () => {
  it('S8 AC1: the runtime listens to one live client and nothing else', () => {
    const s = setup();
    expect(s.l.counts()).toEqual({ status: 1, event: 1, refetch: 1 });
  });
  it('S1 AC5: a 401 from any call ends the session', async () => {
    const s = setup(() => json(401, { ok: false, code: 'unauthenticated', message: 'Sign in to continue.' }));
    await s.runtime.api.call('listUsers', {});
    expect(s.onSessionEnded).toHaveBeenCalledTimes(1);
  });
  it('S10 AC4: a signed_out live status ends the session', () => {
    const s = setup();
    s.l.setStatus('signed_out');
    expect(s.onSessionEnded).toHaveBeenCalledTimes(1);
  });
  it('S15 AC1-2: the own user.access_changed ends the session', () => {
    const s = setup();
    s.l.push('user.access_changed', { entityId: 'u-me' });
    expect(s.onSessionEnded).toHaveBeenCalledTimes(1);
  });
  it("S15 AC5: another user's event keeps the session and refetches the staff list", async () => {
    const s = setup();
    s.runtime.queries.subscribe(listUsers, () => {});
    await flush();
    expect(s.fetchFn).toHaveBeenCalledTimes(1);
    s.l.push('user.list_changed', { entityId: 'u-other' });
    s.l.push('user.access_changed', { entityId: 'u-other' });
    await s.clock.advance(300);
    expect(s.onSessionEnded).not.toHaveBeenCalled();
    expect(s.fetchFn).toHaveBeenCalledTimes(2);
  });
  it('S15 AC4, S14 AC4: afterwards the cache is empty, the live client is stopped and no listener is left', async () => {
    const s = setup();
    s.runtime.queries.subscribe(listUsers, () => {});
    await flush();
    expect(s.runtime.queries.inspectAll()).toHaveLength(1);
    s.l.push('user.access_changed', { entityId: 'u-me' });
    unmount(s);
    expect(s.runtime.queries.inspectAll()).toHaveLength(0);
    expect(s.l.stops()).toBe(1);
    expect(s.l.counts()).toEqual({ status: 0, event: 0, refetch: 0 });
  });
  it('an answer that comes back after the session ended does not refill the cache', async () => {
    const gate = deferred<Response>();
    const s = setup();
    const slow = createSignedInRuntime({
      userId: 'u-me',
      onSessionEnded: () => {},
      timers: s.clock.timers,
      now: s.clock.now,
      fetchFn: () => gate.promise,
      windowLike: null,
    });
    slow.queries.subscribe(listUsers, () => {});
    await flush();
    slow.dispose();
    gate.resolve(json(200, { ok: true, items: [{ id: 'u-x' }], nextCursor: null, pageSize: 25 }));
    await flush();
    expect(slow.queries.inspectAll()).toHaveLength(0);
  });
});
