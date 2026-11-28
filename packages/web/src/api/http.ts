/**
 * The one HTTP core of the web app (EP-08-S1): `POST <url>` with a JSON body on the same origin,
 * so the session cookie travels with it. `/api/ops` (api-client.ts) and `/api/auth` (auth-api.ts)
 * both go through here, so they time out, map errors and report a lost connection the same way.
 */
import type { ErrorCode } from '@goldsmith/shared';

/** A read or an action that has not answered after this long fails (decision D-F, S4 AC5). */
export const REQUEST_TIMEOUT_MS = 15_000;
export const NETWORK_MESSAGE = 'Cannot reach the server. Check the connection and try again.';
const UNREADABLE_MESSAGE = 'The server gave an answer that could not be read. Try again.';

/** The error envelope of a failed call. `network` is set when no definitive answer arrived. */
export interface HttpFailure {
  ok: false;
  code: ErrorCode;
  message: string;
  field?: string;
  /**
   * True when the request may not have reached the server, or its answer did not come back
   * (thrown fetch, time-out, unreadable body). A write that fails this way may or may not be saved.
   */
  network?: true;
}
export type HttpAnswer<T> = { ok: true; data: T } | HttpFailure;
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface PostJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Looked up at call time when absent, so a test may stub `fetch` after import. */
  fetchFn?: FetchFn;
  signal?: AbortSignal;
}

const networkFailure = (message = NETWORK_MESSAGE): HttpFailure => ({ ok: false, code: 'internal', message, network: true });

export async function postJson<T>(url: string, body: unknown, opts: PostJsonOptions = {}): Promise<HttpAnswer<T>> {
  const { headers = {}, timeoutMs = REQUEST_TIMEOUT_MS, signal } = opts;
  const fetchFn: FetchFn = opts.fetchFn ?? ((u, init) => globalThis.fetch(u, init));
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<HttpFailure>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(networkFailure());
    }, timeoutMs);
  });
  const exchange = async (): Promise<HttpAnswer<T>> => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      return networkFailure();
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return networkFailure(UNREADABLE_MESSAGE);
    }
    if (res.ok) return { ok: true, data: json as T };
    const err = (json ?? {}) as { code?: ErrorCode; message?: string; field?: string };
    return {
      ok: false,
      code: err.code ?? 'internal',
      message: err.message ?? NETWORK_MESSAGE,
      ...(err.field ? { field: err.field } : {}),
    };
  };
  try {
    return await Promise.race([exchange(), timedOut]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
