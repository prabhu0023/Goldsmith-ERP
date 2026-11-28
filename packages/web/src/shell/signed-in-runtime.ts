import type { LiveClient, LiveTimers } from '@goldsmith/shared';
import { type ApiClient, createApiClient } from '../api/api-client';
import type { FetchFn } from '../api/http';
import { type ConnectionStore, createConnectionStore, type WindowLike } from '../query/connection';
import { connectLiveBridge } from '../query/live-bridge';
import { createQueryClient, type QueryClient } from '../query/query-client';
/** The parts of the one LiveClient the runtime uses. */
export type LiveHandle = Pick<LiveClient, 'status' | 'onStatus' | 'onEvent' | 'onRefetchAll' | 'stop'>;
export interface SignedInRuntime {
  api: ApiClient;
  queries: QueryClient;
  connection: ConnectionStore;
  /** Connects the one live client to the cache; the returned function detaches it and stops the client. */
  attach(live: LiveHandle): () => void;
  /** Empties the cache and stops listening to the browser (EP-08-S14 AC4, S15 AC4). */
  dispose(): void;
}
export interface SignedInRuntimeOptions {
  userId: string;
  /** Called for a 401, a `signed_out` live status and the person's own `user.access_changed`. */
  onSessionEnded: () => void;
  timers: LiveTimers;
  now?: () => number;
  fetchFn?: FetchFn;
  windowLike?: WindowLike | null;
}
/**
 * What one signed-in person owns (EP-08-S8 AC1, S15 AC4): one api client whose 401 ends the
 * session, one query cache, one connection state and, through `attach`, the bridge from the one
 * live client to them. Framework-free, so the session end is tested without a browser.
 */
export function createSignedInRuntime(options: SignedInRuntimeOptions): SignedInRuntime {
  const { userId, onSessionEnded, timers, now = Date.now, fetchFn, windowLike } = options;
  const api = createApiClient({ fetchFn, onSessionEnded });
  const queries = createQueryClient({ api, now, timers });
  const connection = createConnectionStore({ windowLike });
  return {
    api,
    queries,
    connection,
    attach(live) {
      const detach = connectLiveBridge({ live, queries, connection, me: { userId }, onSessionEnded, timers });
      return () => {
        detach();
        live.stop();
      };
    },
    dispose() {
      queries.clear();
      connection.dispose();
    },
  };
}
