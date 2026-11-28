import type { OperationInput, OperationName, OperationResult } from '@goldsmith/shared';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from './QueryProvider';
import { defineQuery, type QueryDef, type QueryError, type QuerySnapshot, type QueryStatus } from './query-client';
import { stableStringify } from './query-keys';

/** The list operations whose result is `{ items, nextCursor }`. */
export type PagedOperationName = {
  [N in OperationName]: OperationResult<N> extends { items: unknown[]; nextCursor: string | null } ? N : never;
}[OperationName];
export type PagedItem<N extends PagedOperationName> = OperationResult<N> extends { items: Array<infer T> } ? T : never;

export interface PagedQueryResult<N extends PagedOperationName> {
  items: PagedItem<N>[];
  /** The first page's status: a later page that fails does not take the list away. */
  status: QueryStatus;
  error: QueryError | undefined;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  /** Set when the page after the last shown one failed; `loadMore` tries that page again. */
  loadMoreError: QueryError | undefined;
  /** Refetch every page shown. */
  refetch: () => Promise<boolean>;
}

type PageInput<N extends PagedOperationName> = Omit<OperationInput<N>, 'cursor'>;

/** A list read page by page. Each page is its own cache entry, keyed by input and cursor. */
export function usePagedQuery<N extends PagedOperationName>(args: { op: N; input: PageInput<N> }): PagedQueryResult<N> {
  const client = useQueryClient();
  const inputKey = stableStringify(args.input);
  const [chain, setChain] = useState<{ inputKey: string; cursors: Array<string | undefined> }>({ inputKey, cursors: [undefined] });
  // A changed input starts a new chain of pages.
  const cursors = chain.inputKey === inputKey ? chain.cursors : [undefined];
  const defs: QueryDef[] = cursors.map((cursor) =>
    defineQuery({ op: args.op as OperationName, input: (cursor === undefined ? args.input : { ...args.input, cursor }) as never }),
  );
  const defsRef = useRef(defs);
  defsRef.current = defs;
  const cache = useRef<QuerySnapshot[]>([]);
  const keys = defs.map((d) => d.key).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the pages are identified by their keys; `defsRef` holds the current definitions
  const subscribe = useCallback(
    (listener: () => void) => {
      const offs = defsRef.current.map((d) => client.subscribe(d, listener));
      return () => {
        for (const off of offs) off();
      };
    },
    [client, keys],
  );
  const getSnapshot = (): QuerySnapshot[] => {
    const next = defsRef.current.map((d) => client.getSnapshot(d));
    const same = next.length === cache.current.length && next.every((s, i) => s === cache.current[i]);
    if (!same) cache.current = next;
    return cache.current;
  };
  const pages = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const first = pages[0];
  const last = pages[pages.length - 1];
  const lastIndex = pages.length - 1;
  const items: PagedItem<N>[] = [];
  for (const page of pages) {
    const data = page?.data as { items?: PagedItem<N>[] } | undefined;
    if (data?.items) items.push(...data.items);
  }
  const lastData = last?.data as { nextCursor?: string | null } | undefined;
  const nextCursor = lastData?.nextCursor ?? null;
  const lastFailed = lastIndex > 0 && last?.status === 'failed';

  const loadMore = useCallback(() => {
    const shown = defsRef.current;
    const lastDef = shown[shown.length - 1];
    if (lastIndex > 0 && last?.status === 'failed' && lastDef) {
      void client.refetch(lastDef);
      return;
    }
    if (nextCursor !== null) setChain({ inputKey, cursors: [...cursors, nextCursor] });
  }, [client, inputKey, cursors, nextCursor, lastIndex, last?.status]);
  const refetch = useCallback(async () => {
    const results = await Promise.all(defsRef.current.map((d) => client.refetch(d)));
    return results.every(Boolean);
  }, [client]);

  return {
    items,
    status: first?.status ?? 'loading',
    error: first?.error,
    hasMore: nextCursor !== null || lastFailed,
    loadMore,
    loadingMore: lastIndex > 0 && last?.status === 'loading',
    loadMoreError: lastFailed ? last?.error : undefined,
    refetch,
  };
}
