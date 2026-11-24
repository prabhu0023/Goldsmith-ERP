/**
 * The one server-side seam between the live channel and its wire format (D3). The hub, filter
 * and presence only see a LiveSink; sse-transport.ts is the one implementation (D3 decided by
 * the owner: Server-Sent Events over HTTP, no WebSocket).
 */
import type { LiveServerMessage } from '@goldsmith/shared';
import type { Request, Router } from 'express';
import type { ApiError } from '../pipeline/api-errors.js';
import type { Session } from '../pipeline/session-resolver.js';

/** One open stream to one browser tab. */
export interface LiveSink {
  send(msg: LiveServerMessage): void;
  /** End the stream from the server side. */
  end(): void;
  /** Called once when the stream ends, from either side. */
  onClose(cb: () => void): void;
  readonly closed: boolean;
}

export type LiveAuthResult = { ok: true; session: Session } | { ok: false; error: ApiError };

export interface LiveStreamHandlers {
  /** The request's live session, or the error to answer before any stream opens. */
  authenticate(req: Request): Promise<LiveAuthResult>;
  /** A stream opened for `session`, resuming after `since` (null: start from now). */
  open(sink: LiveSink, session: Session, since: number | null): void;
}

export interface LiveTransport {
  /** The Express routes that serve the stream. */
  router(handlers: LiveStreamHandlers): Router;
}
