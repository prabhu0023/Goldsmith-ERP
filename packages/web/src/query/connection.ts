/**
 * The connection state the screens show (EP-08-S10, S11, decision D-C): the browser's online or
 * offline flag combined with the live channel's status. D6 (online only): while `reconnecting` or
 * `offline` an action is refused with a reason and nothing is queued. `connecting` (the first
 * open) does not block.
 */
import type { LiveStatus } from '@goldsmith/shared';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export const OFFLINE_REASON = 'You are offline. The server cannot be reached.';
export const RECONNECTING_REASON = 'Reconnecting to the server. Try again when the connection is back.';

export interface ConnectionSnapshot {
  readonly state: ConnectionState;
  /** Why an action is disabled; null when it is not. */
  readonly reason: string | null;
  readonly blocksActions: boolean;
  /** True from the moment the connection returns after a break until the next break. */
  readonly recovered: boolean;
}

/** The parts of `window` the store uses, so a test can stand in for it. */
export interface WindowLike {
  navigator?: { onLine: boolean };
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

export interface ConnectionStore {
  getSnapshot(): ConnectionSnapshot;
  subscribe(listener: () => void): () => void;
  /** Fed by the live bridge from the LiveClient's status. */
  setLiveStatus(status: LiveStatus): void;
  blocksActions(): boolean;
  /** The sentence that says why actions are disabled; '' when they are not. */
  readonly reason: string;
  dispose(): void;
}

const blocked = (state: ConnectionState) => state === 'reconnecting' || state === 'offline';

export function createConnectionStore(
  opts: { windowLike?: WindowLike | null; liveStatus?: LiveStatus } = {},
): ConnectionStore {
  const windowLike = opts.windowLike === undefined ? (typeof window === 'undefined' ? null : window) : opts.windowLike;
  let online = windowLike?.navigator?.onLine ?? true;
  let live: LiveStatus = opts.liveStatus ?? 'idle';
  const listeners = new Set<() => void>();

  const stateOf = (): ConnectionState => {
    if (!online) return 'offline';
    if (live === 'reconnecting') return 'reconnecting';
    if (live === 'open') return 'connected';
    return 'connecting';
  };
  const reasonOf = (state: ConnectionState): string | null =>
    state === 'offline' ? OFFLINE_REASON : state === 'reconnecting' ? RECONNECTING_REASON : null;
  const build = (previous: ConnectionSnapshot | null): ConnectionSnapshot => {
    const state = stateOf();
    const wasBlocked = previous ? previous.blocksActions : false;
    return {
      state,
      reason: reasonOf(state),
      blocksActions: blocked(state),
      recovered: blocked(state) ? false : wasBlocked || (previous?.recovered ?? false),
    };
  };
  let snapshot = build(null);

  const update = () => {
    const next = build(snapshot);
    if (next.state === snapshot.state && next.recovered === snapshot.recovered) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const goOnline = () => {
    online = true;
    update();
  };
  const goOffline = () => {
    online = false;
    update();
  };
  windowLike?.addEventListener('online', goOnline);
  windowLike?.addEventListener('offline', goOffline);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setLiveStatus(status) {
      live = status;
      update();
    },
    blocksActions: () => snapshot.blocksActions,
    get reason() {
      return snapshot.reason ?? '';
    },
    dispose() {
      windowLike?.removeEventListener('online', goOnline);
      windowLike?.removeEventListener('offline', goOffline);
      listeners.clear();
    },
  };
}
