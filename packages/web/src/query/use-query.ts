import type { OperationName, OperationResult } from '@goldsmith/shared';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from './QueryProvider';
import type { QueryDef, QueryError, QueryStatus } from './query-client';

export interface QueryResult<N extends OperationName> {
  status: QueryStatus;
  data: OperationResult<N> | undefined;
  error: QueryError | undefined;
  /** A fetch is running while data is already on screen. */
  refreshing: boolean;
  /** Try again: fetch now. */
  refetch: () => Promise<boolean>;
}

/** Reads one cached query and keeps it current; fetches on mount unless `enabled` is false. */
export function useQuery<N extends OperationName>(def: QueryDef<N>): QueryResult<N> {
  const client = useQueryClient();
  const latest = useRef(def);
  latest.current = def;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the query is identified by its key; `latest` holds the current definition
  const subscribe = useCallback((listener: () => void) => client.subscribe(latest.current, listener), [client, def.key, def.enabled]);
  const getSnapshot = () => client.getSnapshot(latest.current);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above
  const refetch = useCallback(() => client.refetch(latest.current), [client, def.key]);
  return { status: snapshot.status, data: snapshot.data, error: snapshot.error, refreshing: snapshot.refreshing, refetch };
}
