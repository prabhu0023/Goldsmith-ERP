import { useMemo, useSyncExternalStore } from 'react';
import { defaultApiClient } from '../api/ops-client';
import { type ActionController, type ActionDef, type ActionResult, type ActionSnapshot, createActionController } from './action-controller';
import { useOptionalQuery } from './QueryProvider';
import { useConnectionStore } from './use-connection';

export interface ActionHandle<I, R> {
  run: (input: I) => Promise<ActionResult<R>>;
  /** Resend the same input with the same key after "may not have been saved". */
  retry: () => Promise<ActionResult<R>>;
  busy: boolean;
  /** The server's sentence (or the fallback) to show beside the action. */
  refusal: ActionSnapshot['refusal'];
  maybeNotSaved: boolean;
}

/**
 * One user action. Outside a QueryProvider (the sign-in screens) there is no cache, so nothing is
 * refetched, and the connection is the browser's online flag only.
 */
export function useAction<I, R>(def: ActionDef<I, R>): ActionHandle<I, R> {
  const ctx = useOptionalQuery();
  const connection = useConnectionStore();
  const controller: ActionController<I, R> = useMemo(
    () => createActionController({ def, api: ctx?.api ?? defaultApiClient, queries: ctx?.client ?? null, connection }),
    [def, ctx, connection],
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return {
    run: controller.run,
    retry: controller.retry,
    busy: snapshot.status === 'working',
    refusal: snapshot.refusal,
    maybeNotSaved: snapshot.maybeNotSaved,
  };
}
