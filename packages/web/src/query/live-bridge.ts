/**
 * Connects the one live channel to the query cache and the connection state (EP-08-S8, S9, S10,
 * S11 AC4, S15 AC1-2 and AC5). The LiveClient (EP-07) stays the only live connection; this file
 * only listens to it.
 *
 * - Status: copied to the connection store. A drop marks the cached reads "possibly out of date".
 * - A catalogue event invalidates the reads `EVENT_QUERIES` names for it (coalesced, S8 AC5). The
 *   signed-in user's own `user.access_changed` ends the session instead (S15 AC1-2).
 * - `refetch_all` (the gap was too long to replay): every observed read is refetched.
 * - When the connection returns, actions are enabled at once; reads that failed during the cut are
 *   fetched again, and the "possibly out of date" mark is removed only after the catch-up
 *   refetches have settled (S10 AC2, S11 AC4).
 */
import type { LiveClient, LiveTimers } from '@goldsmith/shared';
import type { ConnectionStore } from './connection';
import { type EventMe, queriesForEvent, topicOfEvent } from './event-query-map';
import { DEFAULT_COALESCE_MS, type QueryClient } from './query-client';

export interface LiveBridgeOptions {
  live: Pick<LiveClient, 'status' | 'onStatus' | 'onEvent' | 'onRefetchAll'>;
  queries: Pick<QueryClient, 'invalidate' | 'markPossiblyStale' | 'markFresh' | 'refetchFailedObserved' | 'refetchAllObserved' | 'whenIdle'>;
  connection: Pick<ConnectionStore, 'setLiveStatus' | 'subscribe' | 'getSnapshot'>;
  me: EventMe;
  onSessionEnded: () => void;
  timers: Pick<LiveTimers, 'setTimeout' | 'clearTimeout'>;
  coalesceMs?: number;
}

/** Returns the disposer. */
export function connectLiveBridge(opts: LiveBridgeOptions): () => void {
  const { live, queries, connection, me, onSessionEnded, timers, coalesceMs = DEFAULT_COALESCE_MS } = opts;
  let disposed = false;
  /** The connection broke and the reads have not been confirmed current since. */
  let dropped = false;
  /** Bumped on every break and on dispose, so a catch-up that was waiting gives up. */
  let round = 0;
  let waitTimer: unknown = null;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      waitTimer = timers.setTimeout(resolve, ms);
    });

  const catchUp = async () => {
    const mine = round;
    queries.refetchFailedObserved();
    await queries.whenIdle();
    await wait(coalesceMs);
    // Events replayed after the reconnect start their own coalescing timers; wait for those too.
    await queries.whenIdle();
    if (disposed || mine !== round || !dropped) return;
    dropped = false;
    queries.markFresh();
  };

  const onConnection = () => {
    if (disposed) return;
    const { state } = connection.getSnapshot();
    if (state === 'reconnecting' || state === 'offline') {
      round += 1;
      dropped = true;
      queries.markPossiblyStale();
    } else if (state === 'connected' && dropped) {
      round += 1;
      void catchUp();
    }
  };

  connection.setLiveStatus(live.status());
  const offConnection = connection.subscribe(onConnection);
  onConnection();

  const offStatus = live.onStatus((status) => {
    connection.setLiveStatus(status);
    if (status === 'signed_out') onSessionEnded();
  });
  const offEvent = live.onEvent((e) => {
    if (topicOfEvent(e) === 'user.access_changed' && e.entityId === me.userId) {
      onSessionEnded();
      return;
    }
    const refs = queriesForEvent(e, me);
    if (refs.length > 0) queries.invalidate(refs, { entity: { id: e.entityId, version: e.entityVersion } });
  });
  const offRefetchAll = live.onRefetchAll(() => {
    void queries.refetchAllObserved().then(() => {
      if (disposed || connection.getSnapshot().state === 'reconnecting' || connection.getSnapshot().state === 'offline') return;
      dropped = false;
      queries.markFresh();
    });
  });

  return () => {
    disposed = true;
    round += 1;
    if (waitTimer !== null) timers.clearTimeout(waitTimer);
    offConnection();
    offStatus();
    offEvent();
    offRefetchAll();
  };
}
