/**
 * The live channel (EP-07): the one object the API process creates. It serves the stream through
 * the transport (Server-Sent Events, D3), and runs the publish loop:
 *   tick: stamp committed outbox rows (publisher) -> read each shop's new rows -> receiver
 *         filter -> deliver -> close the streams of a user whose access changed (S10).
 *   A commit that recorded a live event wakes the loop at once (onLiveCommit); the poll covers
 *   commits made by other processes.
 *   sweep: close streams whose session ended or expired; expire presence without heartbeats.
 *   prune: forget sent rows older than the replay window.
 * Events fan out to every API process, because each one tails the table. Presence is per process.
 */
import { LIVE_CATALOGUE, type LiveCatalogue } from '@goldsmith/shared';
import type { Router } from 'express';
import type pg from 'pg';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Clock } from '../pipeline/server-clock.js';
import type { SessionResolver } from '../pipeline/session-resolver.js';
import { streamAuthenticator } from './authenticate-stream.js';
import { type ConnectionView, createHub } from './hub.js';
import { onLiveCommit } from './live-wakeup.js';
import { createLivePublisher } from './publisher.js';
import { endedSessionIds } from './session-sweep.js';
import { sseTransport } from './sse-transport.js';
import type { LiveTransport } from './transport.js';

export interface LiveChannelOptions {
  pool: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  /** The web app's URL; a stream request from another origin is refused. */
  appUrl: string;
  log: ErrorLog;
  transport?: LiveTransport;
  pollMs?: number;
  sweepMs?: number;
  /** Keep-alive comment interval on each stream. */
  heartbeatMs?: number;
  /** A presence entry without a heartbeat for this long goes. */
  presenceTimeoutMs?: number;
  /** How long sent events stay replayable (EP-07-S7; 5 minutes until decided). */
  replayWindowMs?: number;
  pruneEveryMs?: number;
  catalogue?: LiveCatalogue;
  /** Only these shops' rows (tests share one database); every shop when unset. */
  shopIds?: readonly string[];
  /** Monotonic milliseconds for presence; Date.now when unset. */
  now?: () => number;
}

export interface LiveChannel {
  /** GET /api/live; mount it in the app. */
  router: Router;
  start(): void;
  /** End every stream (going_away) and stop the loops. */
  stop(): Promise<void>;
  /** One publish-and-deliver pass; concurrent calls share one pass. */
  tick(): Promise<void>;
  sweep(): Promise<void>;
  prune(): Promise<number>;
  connections(): ConnectionView[];
  /** Resolves when every opening stream has finished resuming (tests). */
  settled(): Promise<void>;
}

const BATCH = 200;
const PAGE = 500;

export function createLiveChannel({
  pool,
  sessions,
  clock,
  appUrl,
  log,
  transport,
  pollMs = 500,
  sweepMs = 1_000,
  heartbeatMs = 15_000,
  presenceTimeoutMs = 30_000,
  replayWindowMs = 300_000,
  pruneEveryMs = 60_000,
  catalogue = LIVE_CATALOGUE,
  shopIds,
  now = Date.now,
}: LiveChannelOptions): LiveChannel {
  const publisher = createLivePublisher({ pool, clock, catalogue, log, batchSize: BATCH, shopIds });
  const hub = createHub({ pool, publisher, log, clockNow: () => clock.now(), now });
  const authenticate = streamAuthenticator(sessions, appUrl);
  const router = (transport ?? sseTransport({ heartbeatMs })).router({
    authenticate,
    open: (sink, session, since) => hub.open(sink, session, since),
  });

  async function publishOnce(): Promise<void> {
    while ((await publisher.stamp()).length === BATCH) {
      // More committed rows are waiting.
    }
    for (const [shopId, from] of hub.cursors()) {
      let cursor = from;
      for (;;) {
        const rows = await publisher.tail(shopId, cursor, PAGE);
        if (rows.length === 0) break;
        await hub.deliver(shopId, rows);
        for (const row of rows) {
          if (row.topic === 'user.access_changed') hub.closeUser(row.entityId, 'access_changed');
        }
        cursor = rows[rows.length - 1].seq;
        if (rows.length < PAGE) break;
      }
    }
  }

  let running: Promise<void> | null = null;
  let again = false;
  function tick(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await publishOnce();
      } while (again);
    })()
      .catch((err: unknown) => log('[live] publish failed; retrying on the next poll', err))
      .finally(() => {
        running = null;
      });
    return running;
  }

  async function sweep(): Promise<void> {
    const ended = await endedSessionIds(
      pool,
      hub.list().map((c) => c.sessionId),
      clock.now(),
    );
    hub.closeSessions(ended, 'session_ended');
    hub.expirePresence(presenceTimeoutMs);
  }

  const timers: Array<ReturnType<typeof setInterval>> = [];
  let unsubscribe: (() => void) | null = null;
  const every = (ms: number, fn: () => Promise<unknown>, what: string) => {
    const t = setInterval(() => {
      fn().catch((err: unknown) => log(`[live] ${what} failed`, err));
    }, ms);
    t.unref();
    timers.push(t);
  };

  return {
    router,
    start() {
      if (unsubscribe) return;
      unsubscribe = onLiveCommit(() => {
        void tick();
      });
      every(pollMs, tick, 'poll');
      every(sweepMs, sweep, 'session sweep');
      every(pruneEveryMs, () => publisher.prune(replayWindowMs), 'prune');
      void tick();
    },
    async stop() {
      unsubscribe?.();
      unsubscribe = null;
      for (const t of timers.splice(0)) clearInterval(t);
      await running;
      hub.closeAll('going_away');
    },
    tick,
    sweep,
    prune: () => publisher.prune(replayWindowMs),
    connections: () => hub.list(),
    settled: () => hub.settled(),
  };
}
