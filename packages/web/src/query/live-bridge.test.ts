import type { LiveStatus } from '@goldsmith/shared';
import { describe, expect, it, vi } from 'vitest';
import { createConnectionStore, type WindowLike } from './connection';
import { connectLiveBridge } from './live-bridge';
import { createQueryClient, defineQuery } from './query-client';
import { deferred, fakeApi, fakeLive, fakeTimers, flush, networkFail, ok } from './test-support';

const listUsers = defineQuery({ op: 'listUsers', input: {} });
const emptyWindow: WindowLike = { navigator: { onLine: true }, addEventListener: () => {}, removeEventListener: () => {} };

function setup(initial: LiveStatus = 'open') {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  const connection = createConnectionStore({ windowLike: emptyWindow });
  const l = fakeLive(initial);
  const onSessionEnded = vi.fn();
  const dispose = connectLiveBridge({ live: l.live, queries, connection, me: { userId: 'u-me' }, onSessionEnded, timers: clock.timers });
  return { fake, clock, queries, connection, l, onSessionEnded, dispose };
}

describe('live bridge (S8, S9, S10, S11 AC4)', () => {
  it('S9 AC2: an event invalidates the mapped read, which refetches once for a burst', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    for (let i = 0; i < 5; i += 1) {
      l.push('user.list_changed');
      await clock.advance(50);
    }
    await clock.advance(300);
    expect(fake.callsOf('listUsers')).toHaveLength(2);
  });

  it('S15 AC1-2: the signed-in user\'s own access event ends the session and refetches nothing', async () => {
    const { fake, clock, queries, l, onSessionEnded } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.push('user.access_changed', { entityId: 'u-me' });
    await clock.advance(300);
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(fake.callsOf('listUsers')).toHaveLength(1);
  });

  it('S10 AC4: a signed_out status ends the session', () => {
    const { l, onSessionEnded } = setup();
    l.setStatus('signed_out');
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('S10 AC1: a drop shows reconnecting and marks cached reads possibly out of date', async () => {
    const { fake, queries, connection, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: ['a'] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.setStatus('reconnecting');
    expect(connection.getSnapshot()).toMatchObject({ state: 'reconnecting', blocksActions: true });
    expect(queries.getSnapshot(listUsers)).toMatchObject({ status: 'possibly_stale', data: { items: ['a'] } });
  });

  it('S10 AC2 and S11 AC4: after a cut, 4 replayed events refetch once; actions are enabled at once and the out-of-date mark clears only after the refetch settles', async () => {
    const { fake, clock, queries, connection, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.setStatus('reconnecting');
    await clock.advance(3000);
    expect(queries.getSnapshot(listUsers).status).toBe('possibly_stale');

    const gate = deferred<ReturnType<typeof ok>>();
    fake.on('listUsers', () => gate.promise);
    l.setStatus('open');
    expect(connection.getSnapshot()).toMatchObject({ state: 'connected', blocksActions: false, recovered: true });
    for (let i = 0; i < 4; i += 1) l.push('user.list_changed');
    await clock.advance(299);
    expect(queries.getSnapshot(listUsers).status).toBe('possibly_stale');
    await clock.advance(1); // window ends: one refetch starts
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    expect(queries.getSnapshot(listUsers)).toMatchObject({ status: 'possibly_stale', refreshing: true });
    gate.resolve(ok({ ok: true, items: ['fresh'] }));
    await clock.advance(0);
    await clock.advance(300);
    expect(queries.getSnapshot(listUsers)).toMatchObject({ status: 'ready', data: { items: ['fresh'] } });
    expect(fake.callsOf('listUsers')).toHaveLength(2);
  });

  it('S10 AC2: a read that failed during the cut is fetched again when the connection returns', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: ['a'] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.setStatus('reconnecting');
    fake.on('listUsers', () => networkFail());
    queries.invalidate([{ op: 'listUsers' }]);
    await clock.advance(300);
    expect(queries.getSnapshot(listUsers).status).toBe('failed');
    fake.on('listUsers', () => ok({ ok: true, items: ['b'] }));
    l.setStatus('open');
    await clock.advance(300);
    await clock.advance(300);
    expect(queries.getSnapshot(listUsers)).toMatchObject({ status: 'ready', data: { items: ['b'] } });
  });
  it('a second drop during the catch-up cancels it: nothing is marked fresh', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.setStatus('reconnecting');
    l.setStatus('open');
    await clock.advance(100);
    l.setStatus('reconnecting');
    await clock.advance(1000);
    expect(queries.getSnapshot(listUsers).status).toBe('possibly_stale');
  });

  it('S10 AC3: refetch_all refetches every observed read and clears the mark', async () => {
    const { fake, queries, l } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    l.setStatus('reconnecting');
    l.setStatus('open');
    l.refetchAll();
    await flush();
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    expect(queries.getSnapshot(listUsers).status).toBe('ready');
  });

  it('S11 AC2: the browser going offline blocks actions and marks the data, with no live status change', async () => {
    const fake = fakeApi();
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
    const handlers: Record<string, Array<() => void>> = { online: [], offline: [] };
    const win: WindowLike = {
      navigator: { onLine: true },
      addEventListener: (t, fn) => void handlers[t]?.push(fn),
      removeEventListener: () => {},
    };
    const connection = createConnectionStore({ windowLike: win });
    const l = fakeLive('open');
    connectLiveBridge({ live: l.live, queries, connection, me: { userId: 'u-me' }, onSessionEnded: () => {}, timers: clock.timers });
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    for (const fn of handlers.offline ?? []) fn();
    expect(connection.getSnapshot()).toMatchObject({ state: 'offline', blocksActions: true });
    expect(queries.getSnapshot(listUsers).status).toBe('possibly_stale');
  });

  it('dispose removes every listener and ignores later events', async () => {
    const { fake, clock, queries, l, dispose } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    queries.subscribe(listUsers, () => {});
    await flush();
    dispose();
    expect(l.counts()).toEqual({ status: 0, event: 0, refetch: 0 });
    l.push('user.list_changed');
    await clock.advance(1000);
    expect(fake.callsOf('listUsers')).toHaveLength(1);
  });
});
