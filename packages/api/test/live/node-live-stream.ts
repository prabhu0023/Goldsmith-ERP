/**
 * A Server-Sent Events stream for Node clients (the S12 two-client test and the live demo
 * script), adapted to the shared LiveStreamSource so the shared LiveClient runs on it exactly as
 * it runs on the browser's EventSource. It sends the gs_session cookie itself and, on a resume,
 * Last-Event-ID as EventSource does. `cutOff(ms)` stands in for a network cut: it aborts the open
 * stream and makes every open (and `isCut()` callers) fail until the time is up.
 */
import { LIVE_STREAM_PATH, type LiveServerMessage, type LiveStreamSource, liveServerMessageSchema } from '@goldsmith/shared';

/** One parsed SSE frame: its `id` (if any) and its message (null for a comment or keep-alive). */
export interface SseFrame {
  id: number | null;
  msg: LiveServerMessage | null;
}

/** Read an SSE body to its end, calling `onFrame` for every frame; each message is checked against the shared schema. */
export async function readSseFrames(body: ReadableStream<Uint8Array>, onFrame: (frame: SseFrame) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    for (let at = buffer.indexOf('\n\n'); at >= 0; at = buffer.indexOf('\n\n')) {
      const frame = buffer.slice(0, at);
      buffer = buffer.slice(at + 2);
      let id: number | null = null;
      let data: string | null = null;
      for (const line of frame.split('\n')) {
        if (line.startsWith('id: ')) id = Number(line.slice(4));
        if (line.startsWith('data: ')) data = line.slice(6);
      }
      onFrame({ id, msg: data === null ? null : liveServerMessageSchema.parse(JSON.parse(data)) });
    }
  }
}

export interface NodeLiveStream {
  source: LiveStreamSource;
  /** The `since` of every open, in order (null: a fresh stream). */
  opens: Array<number | null>;
  /** Abort the open stream and refuse opens for `ms`. */
  cutOff(ms: number): void;
  isCut(): boolean;
}

export function nodeLiveStream(opts: { base: string; cookie: string; origin?: string }): NodeLiveStream {
  let cutUntil = 0;
  const active = new Set<AbortController>();
  const opens: Array<number | null> = [];
  const isCut = () => Date.now() < cutUntil;
  const source: LiveStreamSource = {
    open(since, h) {
      opens.push(since);
      const abort = new AbortController();
      let closed = false;
      const fail = (kind: 'refused' | 'dropped') => {
        active.delete(abort);
        if (!closed) h.onError(kind);
      };
      if (isCut()) {
        setTimeout(() => fail('refused'), 0);
      } else {
        active.add(abort);
        const headers: Record<string, string> = { accept: 'text/event-stream', cookie: opts.cookie };
        if (since !== null) headers['last-event-id'] = String(since);
        if (opts.origin) headers.origin = opts.origin;
        void (async () => {
          let res: Response;
          try {
            res = await fetch(`${opts.base}${LIVE_STREAM_PATH}`, { headers, signal: abort.signal });
          } catch {
            fail('refused');
            return;
          }
          if (res.status !== 200 || !res.body) {
            await res.body?.cancel();
            fail('refused');
            return;
          }
          h.onOpen();
          try {
            await readSseFrames(res.body, ({ msg }) => {
              if (msg && !closed) h.onMessage(msg);
            });
          } catch {
            // Aborted (cut off or closed).
          }
          fail('dropped');
        })();
      }
      return {
        close() {
          closed = true;
          active.delete(abort);
          abort.abort();
        },
      };
    },
  };
  return {
    source,
    opens,
    cutOff(ms) {
      cutUntil = Date.now() + ms;
      for (const a of [...active]) a.abort();
    },
    isCut,
  };
}
