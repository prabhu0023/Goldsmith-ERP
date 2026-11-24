/**
 * The one hook feature code uses for the live channel (EP-07, D3): useLiveChannel(). It hides the
 * transport (Server-Sent Events today) behind the shared LiveClient that LiveProvider creates.
 * Outside a provider (or in a static render) it returns an idle client that never connects.
 */
import type { LiveClient, LivePresenceOther, LiveStatus } from '@goldsmith/shared';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

const noop = () => {};

/** A client that never connects: the context default. */
export const idleLiveClient: LiveClient = {
  start: noop,
  stop: noop,
  status: () => 'idle',
  lastSeq: () => null,
  connectionId: () => null,
  onEvent: () => noop,
  onRefetchAll: () => noop,
  onPresence: () => noop,
  onStatus: () => noop,
  subscribe: noop,
  unsubscribe: noop,
  joinPresence: noop,
  leavePresence: noop,
};

export const LiveContext = createContext<LiveClient>(idleLiveClient);

export interface LiveChannel {
  status: LiveStatus;
  client: LiveClient;
  onEvent: LiveClient['onEvent'];
  onRefetchAll: LiveClient['onRefetchAll'];
  subscribe: LiveClient['subscribe'];
  unsubscribe: LiveClient['unsubscribe'];
}

export function useLiveChannel(): LiveChannel {
  const client = useContext(LiveContext);
  const status = useSyncExternalStore(
    (changed) => client.onStatus(changed),
    () => client.status(),
    () => client.status(),
  );
  return useMemo(
    () => ({
      status,
      client,
      onEvent: client.onEvent,
      onRefetchAll: client.onRefetchAll,
      subscribe: client.subscribe,
      unsubscribe: client.unsubscribe,
    }),
    [client, status],
  );
}

/** Who else has `parcelId` open (S8); joins while mounted, with the heartbeat, and leaves on unmount. */
export function useParcelPresence(parcelId: string | null): LivePresenceOther[] {
  const client = useContext(LiveContext);
  const [others, setOthers] = useState<LivePresenceOther[]>([]);
  useEffect(() => {
    setOthers([]);
    if (parcelId === null) return;
    const off = client.onPresence((p, list) => {
      if (p === parcelId) setOthers(list);
    });
    client.joinPresence(parcelId);
    return () => {
      off();
      client.leavePresence(parcelId);
    };
  }, [client, parcelId]);
  return others;
}
