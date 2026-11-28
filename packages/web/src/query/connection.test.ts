import { describe, expect, it, vi } from 'vitest';
import { createConnectionStore, OFFLINE_REASON, RECONNECTING_REASON, type WindowLike } from './connection';

function fakeWindow(onLine = true) {
  const handlers = { online: new Set<() => void>(), offline: new Set<() => void>() };
  const win: WindowLike = {
    navigator: { onLine },
    addEventListener: (type, fn) => void handlers[type].add(fn),
    removeEventListener: (type, fn) => void handlers[type].delete(fn),
  };
  return {
    win,
    handlers,
    fire(type: 'online' | 'offline') {
      for (const fn of [...handlers[type]]) fn();
    },
  };
}

describe('connection store (S10, S11)', () => {
  it('starts connecting, which does not block actions', () => {
    const store = createConnectionStore({ windowLike: fakeWindow().win });
    expect(store.getSnapshot()).toMatchObject({ state: 'connecting', blocksActions: false, reason: null });
    expect(store.blocksActions()).toBe(false);
    expect(store.reason).toBe('');
  });

  it('S10 AC1: the offline event sets the state at once and gives the reason', () => {
    const w = fakeWindow();
    const store = createConnectionStore({ windowLike: w.win });
    store.setLiveStatus('open');
    const changed = vi.fn();
    store.subscribe(changed);
    w.win.navigator = { onLine: false };
    w.fire('offline');
    expect(store.getSnapshot()).toMatchObject({ state: 'offline', blocksActions: true, reason: OFFLINE_REASON });
    expect(store.reason).toBe(OFFLINE_REASON);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('a live reconnect blocks actions with its own reason', () => {
    const store = createConnectionStore({ windowLike: fakeWindow().win });
    store.setLiveStatus('open');
    store.setLiveStatus('reconnecting');
    expect(store.getSnapshot()).toMatchObject({ state: 'reconnecting', blocksActions: true, reason: RECONNECTING_REASON });
  });

  it('offline wins over the live status', () => {
    const w = fakeWindow(false);
    const store = createConnectionStore({ windowLike: w.win });
    store.setLiveStatus('open');
    expect(store.getSnapshot().state).toBe('offline');
  });

  it('S11 AC4: when the connection is back actions are enabled and the recovery is flagged once', () => {
    const w = fakeWindow();
    const store = createConnectionStore({ windowLike: w.win });
    store.setLiveStatus('open');
    expect(store.getSnapshot().recovered).toBe(false);
    store.setLiveStatus('reconnecting');
    expect(store.getSnapshot().recovered).toBe(false);
    store.setLiveStatus('open');
    expect(store.getSnapshot()).toMatchObject({ state: 'connected', blocksActions: false, recovered: true });
    store.setLiveStatus('reconnecting');
    expect(store.getSnapshot().recovered).toBe(false);
  });

  it('online after offline waits for the live channel when it is still reconnecting', () => {
    const w = fakeWindow();
    const store = createConnectionStore({ windowLike: w.win });
    store.setLiveStatus('reconnecting');
    w.fire('offline');
    w.fire('online');
    expect(store.getSnapshot().state).toBe('reconnecting');
  });

  it('does not notify when nothing changed, and stops listening on dispose', () => {
    const w = fakeWindow();
    const store = createConnectionStore({ windowLike: w.win });
    const changed = vi.fn();
    store.subscribe(changed);
    store.setLiveStatus('idle');
    expect(changed).not.toHaveBeenCalled();
    store.dispose();
    expect(w.handlers.online.size + w.handlers.offline.size).toBe(0);
  });

  it('works with no window (a static render)', () => {
    const store = createConnectionStore({ windowLike: null });
    expect(store.getSnapshot().blocksActions).toBe(false);
  });
});
