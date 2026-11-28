/**
 * The browser's side of the D3 transport (Server-Sent Events, decided by the owner): EventSource
 * adapted to the shared LiveStreamSource, plus the operation caller and timers the shared
 * LiveClient needs. Feature code never touches these; it uses useLiveChannel (use-live.ts).
 *
 * EventSource reconnects by itself, but this source closes it on the first error and reports
 * 'refused' (it never opened: no session, server down) or 'dropped', so the shared client's
 * backoff and session check decide what happens next. The reopen passes `?since=<last seq>`.
 * Same origin through the Vite /api proxy, so the gs_session cookie travels with it.
 */
import {
  LIVE_STREAM_PATH,
  type LiveOpsCaller,
  type LivePresenceOther,
  type LiveServerMessageType,
  type LiveStreamSource,
  type LiveTimers,
  liveServerMessageSchema,
} from '@goldsmith/shared';
import { createApiClient } from '../api/api-client';

const MESSAGE_TYPES: readonly LiveServerMessageType[] = ['hello', 'event', 'refetch_all', 'replayed', 'presence', 'closed'];

/** The URL of a stream starting after `since` (null: from now). */
export const liveStreamUrl = (since: number | null): string =>
  since === null ? LIVE_STREAM_PATH : `${LIVE_STREAM_PATH}?since=${since}`;

export function browserStreamSource(
  create: (url: string) => EventSource = (url) => new EventSource(url, { withCredentials: true }),
): LiveStreamSource {
  return {
    open(since, h) {
      const es = create(liveStreamUrl(since));
      let opened = false;
      let done = false;
      es.onopen = () => {
        opened = true;
        h.onOpen();
      };
      for (const type of MESSAGE_TYPES) {
        es.addEventListener(type, (e) => {
          if (done) return;
          let data: unknown;
          try {
            data = JSON.parse((e as MessageEvent<string>).data);
          } catch {
            return;
          }
          const parsed = liveServerMessageSchema.safeParse(data);
          if (parsed.success) h.onMessage(parsed.data);
        });
      }
      es.onerror = () => {
        if (done) return;
        done = true;
        es.close();
        h.onError(opened ? 'dropped' : 'refused');
      };
      return {
        close: () => {
          done = true;
          es.close();
        },
      };
    },
  };
}

const liveApi = createApiClient();
/** The live operations through the ordinary `POST /api/ops` pipeline; none carries an idempotency key. */
export const browserLiveOps: LiveOpsCaller = {
  call: async (op, input) => {
    const answer = await liveApi.call(op, input as never, { idempotencyKey: false });
    if (!answer.ok) return { ok: false };
    // A join answers who else is on the parcel; the shared client shows it (S8).
    const others = (answer.data as { others?: LivePresenceOther[] }).others;
    return others ? { ok: true, others } : { ok: true };
  },
};

export const browserTimers: LiveTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
};
