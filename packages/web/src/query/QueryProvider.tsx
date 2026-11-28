import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { ApiClient } from '../api/api-client';
import { defaultApiClient } from '../api/ops-client';
import type { QueryClient } from './query-client';

interface QueryContextValue {
  client: QueryClient;
  api: ApiClient;
}
const QueryContext = createContext<QueryContextValue | null>(null);

/** Gives the screens below it one query cache and the api client its actions send through. */
export function QueryProvider({ client, api = defaultApiClient, children }: { client: QueryClient; api?: ApiClient; children: ReactNode }) {
  const value = useMemo(() => ({ client, api }), [client, api]);
  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
}

/** The cache, or null outside a provider (the sign-in screens have none). */
export const useOptionalQuery = (): QueryContextValue | null => useContext(QueryContext);

export function useQueryClient(): QueryClient {
  const value = useContext(QueryContext);
  if (!value) throw new Error('useQueryClient needs a QueryProvider above it.');
  return value.client;
}
