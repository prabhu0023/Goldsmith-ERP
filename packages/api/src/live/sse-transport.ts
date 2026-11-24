/**
 * Server-Sent Events transport (D3, decided by the owner). `GET /api/live` answers
 * `text/event-stream`; each message is `event: <type>` + `data: <JSON>`, and a message that moves
 * the stream position also carries `id: <seq>`. The browser's EventSource sends the last id back
 * as `Last-Event-ID` when it reconnects, so catch-up needs no client code; a client that opens a
 * fresh stream may pass `?since=<seq>` instead (a stream position, not a secret). A comment line
 * every heartbeatMs keeps proxies from closing an idle stream. A refused request answers the
 * API's JSON error (401 or 403) and no stream opens, so EventSource stops retrying.
 */
import { LIVE_STREAM_PATH, type LiveServerMessage, liveMessageSeq } from '@goldsmith/shared';
import express, { type Request, type Router } from 'express';
import type { LiveSink, LiveTransport } from './transport.js';

export interface SseTransportOptions {
  /** Interval of the keep-alive comment. */
  heartbeatMs?: number;
  /** The reconnect delay the browser is told to use. */
  retryMs?: number;
}

const SEQ = /^\d{1,15}$/;

/** The position a request resumes after: Last-Event-ID, else ?since=; null when absent or not a whole number. */
export function resumeSeqOf(req: Request): number | null {
  const header = req.get('last-event-id');
  const query = typeof req.query.since === 'string' ? req.query.since : undefined;
  const text = header?.trim() || query;
  return text !== undefined && SEQ.test(text) ? Number(text) : null;
}

/** One SSE frame. JSON has no raw newlines, so `data` is one line. */
export function sseFrame(msg: LiveServerMessage): string {
  const seq = liveMessageSeq(msg);
  return `${seq === null ? '' : `id: ${seq}\n`}event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`;
}

export function sseTransport({ heartbeatMs = 15_000, retryMs = 1_000 }: SseTransportOptions = {}): LiveTransport {
  return {
    router(handlers) {
      const router: Router = express.Router();
      router.get(LIVE_STREAM_PATH, async (req, res, next) => {
        try {
          const auth = await handlers.authenticate(req);
          if (!auth.ok) throw auth.error;
          req.socket.setTimeout(0);
          req.socket.setNoDelay(true);
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
          });
          res.write(`retry: ${retryMs}\n\n`);
          let closed = false;
          const listeners: Array<() => void> = [];
          const timer = setInterval(() => {
            if (!closed) res.write(': ping\n\n');
          }, heartbeatMs);
          timer.unref();
          const finish = () => {
            if (closed) return;
            closed = true;
            clearInterval(timer);
            for (const cb of listeners.splice(0)) cb();
          };
          res.on('close', finish);
          const sink: LiveSink = {
            send(msg) {
              if (!closed) res.write(sseFrame(msg));
            },
            end() {
              if (closed) return;
              res.end();
              finish();
            },
            onClose(cb) {
              if (closed) cb();
              else listeners.push(cb);
            },
            get closed() {
              return closed;
            },
          };
          handlers.open(sink, auth.session, resumeSeqOf(req));
        } catch (err) {
          next(err);
        }
      });
      return router;
    },
  };
}
