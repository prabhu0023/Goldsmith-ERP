/**
 * One user action as a small state machine (EP-08-S5, S6, S7, S11 AC3). It sends the operation
 * once, shows the server's sentence when the answer is a refusal, refetches the reads the action
 * affects before it reports success, and survives a lost connection without saving twice:
 *
 * - `run` while `working` sends nothing (S6 AC3).
 * - While the connection blocks actions it refuses at once, sends nothing and stores nothing (D6).
 * - The Idempotency-Key is made at the first send and kept only after a network failure, when the
 *   write may or may not be saved. `retry()` resends the same input with the same key, so the
 *   server answers the first result instead of adding the record twice. A changed input gets a
 *   new key (S6 AC4). A definitive answer from the server drops the key.
 * - A refusal never invalidates anything, except `conflict`: another change got there first, so
 *   the affected reads are refetched and the server's sentence stays (S5 AC5).
 */
import type {
  AuthInput,
  AuthOperationName,
  AuthResult,
  ErrorCode,
  OperationInput,
  OperationName,
  OperationResult,
} from '@goldsmith/shared';
import type { ApiClient } from '../api/api-client';
import { authCall } from '../auth/auth-api';
import { stableStringify, type QueryRef } from './query-keys';
import type { QueryClient } from './query-client';

export const MAYBE_NOT_SAVED_MESSAGE = 'It may not have been saved. Check the connection and try again.';
const GENERIC_REFUSAL = 'Something went wrong. Try again.';

export type ActionStatus = 'idle' | 'working' | 'saved' | 'refused' | 'network_failed' | 'blocked';
export type ActionFailureCode = ErrorCode | 'offline' | 'busy';

export interface ActionDef<I = unknown, R = unknown> {
  readonly kind: 'ops' | 'auth';
  readonly op: string;
  /** The cached reads this action changes; `result` is undefined when the server refused with a conflict. */
  readonly affects?: (input: I, result: R | undefined) => readonly QueryRef[];
  /** Shown when a refusal carries no sentence of its own (S5 AC4). */
  readonly fallback?: string;
}

export function defineAction<N extends OperationName>(def: {
  op: N;
  affects?: (input: OperationInput<N>, result: OperationResult<N> | undefined) => readonly QueryRef[];
  fallback?: string;
}): ActionDef<OperationInput<N>, OperationResult<N>> {
  return { kind: 'ops', ...def };
}

/** A sign-in call to `/api/auth/<op>`: no key, no cached reads to refresh. */
export function defineAuthAction<N extends AuthOperationName>(def: {
  op: N;
  fallback?: string;
}): ActionDef<AuthInput<N>, AuthResult<N>> {
  return { kind: 'auth', ...def };
}

export type ActionResult<R> =
  | { ok: true; data: R; /** An affected read could not be refetched; the action itself is saved (S7 AC5). */ refetchFailed: boolean }
  | { ok: false; code: ActionFailureCode; message: string; field?: string; network?: true };

export interface ActionSnapshot {
  readonly status: ActionStatus;
  /** The server's sentence (or the fallback) for a refusal, shown beside the action. */
  readonly refusal: { code: ActionFailureCode; message: string; field?: string } | null;
  /** The write may or may not be saved: `retry()` resends it. */
  readonly maybeNotSaved: boolean;
}

export interface ActionController<I, R> {
  run(input: I): Promise<ActionResult<R>>;
  retry(): Promise<ActionResult<R>>;
  getSnapshot(): ActionSnapshot;
  subscribe(listener: () => void): () => void;
}

export interface ActionControllerDeps<I, R> {
  def: ActionDef<I, R>;
  api: Pick<ApiClient, 'call'>;
  /** Absent for sign-in, where there is no cache yet. */
  queries?: Pick<QueryClient, 'refetchNow' | 'invalidate'> | null;
  connection?: { blocksActions(): boolean; readonly reason: string } | null;
  newKey?: () => string;
  /** The `/api/auth` caller; the real one unless a test passes its own. */
  authFn?: (op: string, input: unknown) => ReturnType<typeof authCall>;
}

const IDLE: ActionSnapshot = { status: 'idle', refusal: null, maybeNotSaved: false };

export function createActionController<I, R>(deps: ActionControllerDeps<I, R>): ActionController<I, R> {
  const { def, api, queries = null, connection = null } = deps;
  const newKey = deps.newKey ?? (() => globalThis.crypto.randomUUID());
  const authFn = deps.authFn ?? ((op, input) => authCall(op as AuthOperationName, input as never));
  const listeners = new Set<() => void>();
  let snapshot: ActionSnapshot = IDLE;
  let working = false;
  let lastInput: { value: I } | null = null;
  /** The key of a write that may be saved, with the input it belongs to. */
  let pending: { key: string; hash: string } | null = null;

  const set = (next: ActionSnapshot) => {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const refuse = (code: ActionFailureCode, message: string, field?: string, network?: true): ActionResult<R> => {
    set({ status: 'refused', refusal: { code, message, ...(field ? { field } : {}) }, maybeNotSaved: false });
    return { ok: false, code, message, ...(field ? { field } : {}), ...(network ? { network } : {}) };
  };

  const run = async (input: I): Promise<ActionResult<R>> => {
    if (working) return { ok: false, code: 'busy', message: 'Still working on the last request.' };
    if (connection?.blocksActions()) {
      const message = connection.reason;
      set({ status: 'blocked', refusal: null, maybeNotSaved: pending !== null });
      return { ok: false, code: 'offline', message };
    }
    working = true;
    lastInput = { value: input };
    const hash = stableStringify(input);
    const key = pending && pending.hash === hash ? pending.key : newKey();
    set({ status: 'working', refusal: null, maybeNotSaved: false });
    try {
      const answer =
        def.kind === 'auth'
          ? await authFn(def.op, input)
          : await api.call(def.op as OperationName, input as never, { idempotencyKey: key });
      if (answer.ok) {
        pending = null;
        const data = answer.data as R;
        let refetchFailed = false;
        const refs = def.affects?.(input, data) ?? [];
        if (queries && refs.length > 0) {
          const settled = await Promise.allSettled(queries.refetchNow(refs));
          refetchFailed = settled.some((s) => s.status === 'rejected' || s.value === false);
        }
        set({ status: 'saved', refusal: null, maybeNotSaved: false });
        return { ok: true, data, refetchFailed };
      }
      if (answer.network && def.kind === 'ops') {
        pending = { key, hash };
        set({ status: 'network_failed', refusal: null, maybeNotSaved: true });
        return { ok: false, code: answer.code, message: MAYBE_NOT_SAVED_MESSAGE, network: true };
      }
      pending = null;
      if (answer.code === 'conflict' && queries) {
        const refs = def.affects?.(input, undefined) ?? [];
        if (refs.length > 0) queries.invalidate(refs);
      }
      return refuse(answer.code, answer.message || def.fallback || GENERIC_REFUSAL, answer.field, answer.network);
    } finally {
      working = false;
    }
  };

  return {
    run,
    async retry() {
      if (!lastInput || pending === null) {
        return { ok: false, code: 'busy', message: 'There is nothing to try again.' };
      }
      return run(lastInput.value);
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
