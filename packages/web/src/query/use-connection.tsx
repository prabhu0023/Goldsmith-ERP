import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from 'react';
import { type ConnectionSnapshot, type ConnectionStore, createConnectionStore } from './connection';

const ConnectionContext = createContext<ConnectionStore | null>(null);
let browserOnly: ConnectionStore | null = null;
/** Outside a provider only the browser's online flag counts (the sign-in screens). */
const fallbackStore = (): ConnectionStore => {
  browserOnly ??= createConnectionStore();
  return browserOnly;
};

export function ConnectionProvider({ store, children }: { store: ConnectionStore; children: ReactNode }) {
  return <ConnectionContext.Provider value={store}>{children}</ConnectionContext.Provider>;
}

/** The store itself, for the action hook. */
export const useConnectionStore = (): ConnectionStore => useContext(ConnectionContext) ?? fallbackStore();

export interface ConnectionView {
  state: ConnectionSnapshot['state'];
  /** Why actions are disabled; null when they are not. */
  reason: string | null;
  recovered: boolean;
  blocksActions(): boolean;
}

export function useConnection(): ConnectionView {
  const store = useConnectionStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(
    () => ({ state: snapshot.state, reason: snapshot.reason, recovered: snapshot.recovered, blocksActions: () => snapshot.blocksActions }),
    [snapshot],
  );
}
