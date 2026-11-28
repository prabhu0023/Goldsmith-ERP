/**
 * The typed client for `POST /api/ops/<op>` (EP-08-S1). The operation name fixes the input and
 * result types from the shared contract, so a wrong argument fails `npm run typecheck`. The
 * contract's `kind` decides the headers: a create or command carries an `Idempotency-Key` (a
 * resend cannot add the record twice, EP-03-S8); a read or list carries none. The session is the
 * `gs_session` cookie; no token is read or stored here.
 */
import {
  BACKGROUND_REFRESH_HEADER,
  contract,
  type OperationInput,
  type OperationName,
  type OperationResult,
} from '@goldsmith/shared';
import { type FetchFn, type HttpFailure, postJson } from './http';

/** The answer of one operation call: the result, or the error envelope the web shows as is. */
export type ApiAnswer<N extends OperationName> = { ok: true; data: OperationResult<N> } | HttpFailure;

export interface CallOptions {
  /** A given key (a retry reuses it); absent: a fresh one for a create or command; `false`: none. */
  idempotencyKey?: string | false;
  /** A re-read nobody asked for (live event, timed refresh): the server does not extend the session. */
  background?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  call<N extends OperationName>(op: N, input: OperationInput<N>, opts?: CallOptions): Promise<ApiAnswer<N>>;
}

export interface ApiClientOptions {
  fetchFn?: FetchFn;
  newKey?: () => string;
  /** Called when the server answers 401 `unauthenticated`: the session is over. */
  onSessionEnded?: () => void;
  timeoutMs?: number;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const { fetchFn, onSessionEnded, timeoutMs } = options;
  const newKey = options.newKey ?? (() => globalThis.crypto.randomUUID());
  return {
    async call(op, input, opts = {}) {
      const kind = contract[op].kind;
      const headers: Record<string, string> = {};
      if (kind === 'create' || kind === 'command') {
        if (opts.idempotencyKey !== false) headers['Idempotency-Key'] = opts.idempotencyKey ?? newKey();
      } else if (opts.background) {
        headers[BACKGROUND_REFRESH_HEADER] = '1';
      }
      const answer = await postJson<OperationResult<typeof op>>(`/api/ops/${op}`, input, {
        headers,
        fetchFn,
        timeoutMs,
        signal: opts.signal,
      });
      if (!answer.ok && answer.code === 'unauthenticated') onSessionEnded?.();
      return answer;
    },
  };
}
