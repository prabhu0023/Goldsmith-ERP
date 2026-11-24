/**
 * The hub (EP-07-S3, S4, S7, S8, S10): the open streams of this process and what each one gets.
 * In memory only; the outbox rows are the record. Each stream has the channels its session gave
 * it plus the entity channels it subscribed to, and the last sequence number it was given, so
 * nothing is sent twice. On open a stream resumes after `since` (or starts from now): it gets
 * `hello`, then either the missed events through the same receiver filter and `replayed`, or one
 * `refetch_all` when `since` is outside what the outbox still holds. Events delivered while it
 * resumes wait in its queue and follow in order.
 */
import { randomUUID } from 'node:crypto';
import {
  entityChannel,
  type LiveCloseReason,
  type LiveEnvelope,
  type LiveServerMessage,
  parseChannel,
  type RoleId,
} from '@goldsmith/shared';
import type pg from 'pg';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Session } from '../pipeline/session-resolver.js';
import { baseChannels } from './channels.js';
import { type LiveConnectionHandle, registerLiveConnection, unregisterLiveConnection } from './live-registry.js';
import { createPresence } from './presence.js';
import type { LivePublisher, LiveRow } from './publisher.js';
import { type FilterTarget, prepareFilter } from './receiver-filter.js';
import type { LiveSink } from './transport.js';

/** At most this many channels per stream (2 from the session, the rest entity channels). */
export const MAX_CHANNELS = 50;

export interface ConnectionView {
  id: string;
  userId: string;
  shopId: string;
  sessionId: string;
  role: RoleId;
  name: string;
  channels: string[];
  lastSeq: number;
  openedAt: Date;
}

interface Connection extends FilterTarget {
  id: string;
  userId: string;
  shopId: string;
  sessionId: string;
  role: RoleId;
  name: string;
  channels: Set<string>;
  lastSeq: number;
  openedAt: Date;
  replaying: boolean;
  queue: LiveRow[];
  sink: LiveSink;
}

export interface HubDeps {
  pool: pg.Pool;
  publisher: LivePublisher;
  log: ErrorLog;
  /** Wall time for openedAt. */
  clockNow: () => Date;
  /** Monotonic milliseconds for presence heartbeats. */
  now: () => number;
  /** A resume with more missed events than this gets refetch_all. */
  maxReplay?: number;
}

export interface Hub {
  open(sink: LiveSink, session: Session, since: number | null): void;
  /** Send `rows` (one shop's, in sequence order) to every stream that may have them. */
  deliver(shopId: string, rows: readonly LiveRow[]): Promise<void>;
  /** Shops with open streams and the position the hub has delivered up to. */
  cursors(): Array<[shopId: string, seq: number]>;
  closeUser(userId: string, reason: LiveCloseReason): void;
  closeSessions(sessionIds: readonly string[], reason: LiveCloseReason): void;
  closeAll(reason: LiveCloseReason): void;
  expirePresence(timeoutMs: number): void;
  list(): ConnectionView[];
  /** Resolves when every stream has finished resuming (tests). */
  settled(): Promise<void>;
}

const presenceKey = (shopId: string, parcelId: string) => `${shopId}\u0000${parcelId}`;

export function createHub({ pool, publisher, log, clockNow, now, maxReplay = 1000 }: HubDeps): Hub {
  const connections = new Map<string, Connection>();
  const cursorByShop = new Map<string, number>();
  const presence = createPresence();
  const resuming = new Set<Promise<void>>();
  let stopped = false;

  const inShop = (shopId: string) => [...connections.values()].filter((c) => c.shopId === shopId);
  const send = (conn: Connection, msg: LiveServerMessage) => conn.sink.send(msg);

  function broadcastPresence(shopId: string, parcelId: string): void {
    const channel = entityChannel('parcel', parcelId);
    const key = presenceKey(shopId, parcelId);
    for (const conn of inShop(shopId)) {
      if (conn.channels.has(channel)) {
        send(conn, { type: 'presence', parcelId, others: presence.othersFor(key, conn.userId) });
      }
    }
  }

  function broadcastKeys(keys: readonly string[]): void {
    for (const key of keys) {
      const [shopId, parcelId] = key.split('\u0000');
      broadcastPresence(shopId, parcelId);
    }
  }

  function cleanup(conn: Connection): void {
    if (!connections.delete(conn.id)) return;
    unregisterLiveConnection(conn.id);
    broadcastKeys(presence.dropConnection(conn.id));
    if (inShop(conn.shopId).length === 0) cursorByShop.delete(conn.shopId);
  }

  function close(conn: Connection, reason: LiveCloseReason): void {
    send(conn, { type: 'closed', reason });
    conn.sink.end();
    cleanup(conn);
  }

  /** Send the rows this stream may have, after its position, through the receiver filter. */
  async function sendFiltered(conn: Connection, rows: readonly LiveRow[]): Promise<void> {
    const fresh = rows.filter((r) => r.seq > conn.lastSeq);
    if (fresh.length === 0) return;
    const filter = await prepareFilter(pool, conn.shopId, fresh, [conn]);
    for (const row of fresh) {
      if (row.seq <= conn.lastSeq) continue;
      conn.lastSeq = row.seq;
      const event = filter.may(conn, row) ? publisher.toEnvelope(row) : null;
      if (event) send(conn, { type: 'event', event });
    }
  }

  async function resume(conn: Connection, since: number | null): Promise<void> {
    const state = await publisher.streamState(conn.shopId);
    if (!cursorByShop.has(conn.shopId)) cursorByShop.set(conn.shopId, state.lastSeq);
    const start = since ?? state.lastSeq;
    send(conn, {
      type: 'hello',
      connectionId: conn.id,
      userId: conn.userId,
      role: conn.role,
      channels: [...conn.channels],
      seq: start,
    });
    conn.lastSeq = start;
    if (since !== null && (since > state.lastSeq || since < state.prunedThrough)) {
      conn.lastSeq = state.lastSeq;
      send(conn, { type: 'refetch_all', seq: state.lastSeq });
    } else {
      const missed = await publisher.tail(conn.shopId, start, maxReplay + 1);
      if (missed.length > maxReplay) {
        const latest = (await publisher.streamState(conn.shopId)).lastSeq;
        conn.lastSeq = latest;
        send(conn, { type: 'refetch_all', seq: latest });
      } else {
        await sendFiltered(conn, missed);
        if (since !== null) send(conn, { type: 'replayed', seq: conn.lastSeq });
      }
    }
    // Events delivered meanwhile, in order; more may queue while these are checked.
    while (conn.queue.length > 0) await sendFiltered(conn, conn.queue.splice(0));
    conn.replaying = false;
  }

  function handleFor(conn: Connection): LiveConnectionHandle {
    const key = (parcelId: string) => presenceKey(conn.shopId, parcelId);
    return {
      id: conn.id,
      userId: conn.userId,
      shopId: conn.shopId,
      role: conn.role,
      channels: () => conn.channels,
      subscribe(channel) {
        if (connections.has(conn.id)) conn.channels.add(channel);
      },
      unsubscribe(channel) {
        conn.channels.delete(channel);
        const parsed = parseChannel(channel);
        if (parsed?.kind === 'entity' && parsed.entity === 'parcel' && presence.leave(key(parsed.code), conn.id)) {
          broadcastPresence(conn.shopId, parsed.code);
        }
      },
      presenceOthers: (parcelId) => presence.othersFor(key(parcelId), conn.userId),
      joinPresence(parcelId) {
        if (!connections.has(conn.id)) return;
        conn.channels.add(entityChannel('parcel', parcelId));
        if (presence.join(key(parcelId), conn.id, { userId: conn.userId, name: conn.name }, now())) {
          broadcastPresence(conn.shopId, parcelId);
        }
      },
      leavePresence(parcelId) {
        if (presence.leave(key(parcelId), conn.id)) broadcastPresence(conn.shopId, parcelId);
      },
    };
  }

  return {
    open(sink, session, since) {
      if (stopped) {
        sink.send({ type: 'closed', reason: 'going_away' });
        sink.end();
        return;
      }
      const conn: Connection = {
        id: randomUUID(),
        userId: session.userId,
        shopId: session.shopId,
        sessionId: session.sessionId,
        role: session.role,
        name: session.name,
        channels: new Set(baseChannels(session.userId, session.role)),
        lastSeq: 0,
        openedAt: clockNow(),
        replaying: true,
        queue: [],
        sink,
      };
      connections.set(conn.id, conn);
      registerLiveConnection(handleFor(conn));
      sink.onClose(() => cleanup(conn));
      const done = resume(conn, since)
        .catch((err: unknown) => {
          log('[live] resume failed; stream closed', err);
          if (connections.has(conn.id)) close(conn, 'going_away');
        })
        .finally(() => resuming.delete(done));
      resuming.add(done);
    },

    async deliver(shopId, rows) {
      if (rows.length === 0) return;
      const targets = inShop(shopId).filter((c) => !c.replaying);
      const filter = await prepareFilter(pool, shopId, rows, targets);
      const last = rows[rows.length - 1].seq;
      if (cursorByShop.has(shopId)) cursorByShop.set(shopId, Math.max(cursorByShop.get(shopId) as number, last));
      const envelopes = new Map<LiveRow, LiveEnvelope | null>();
      const envelopeOf = (row: LiveRow) => {
        if (!envelopes.has(row)) envelopes.set(row, publisher.toEnvelope(row));
        return envelopes.get(row) ?? null;
      };
      const checked = new Set<Connection>(targets);
      const late: Array<Promise<void>> = [];
      for (const conn of inShop(shopId)) {
        if (conn.replaying) {
          conn.queue.push(...rows.filter((r) => r.seq > conn.lastSeq));
          continue;
        }
        // A stream that finished resuming during the check: give it its own check.
        if (!checked.has(conn)) {
          late.push(sendFiltered(conn, rows));
          continue;
        }
        for (const row of rows) {
          if (row.seq <= conn.lastSeq) continue;
          conn.lastSeq = row.seq;
          const event = filter.may(conn, row) ? envelopeOf(row) : null;
          if (event) send(conn, { type: 'event', event });
        }
      }
      await Promise.all(late);
    },

    cursors: () => [...cursorByShop],

    closeUser(userId, reason) {
      for (const conn of [...connections.values()]) if (conn.userId === userId) close(conn, reason);
    },

    closeSessions(sessionIds, reason) {
      const ids = new Set(sessionIds);
      for (const conn of [...connections.values()]) if (ids.has(conn.sessionId)) close(conn, reason);
    },

    closeAll(reason) {
      stopped = true;
      for (const conn of [...connections.values()]) close(conn, reason);
    },

    expirePresence(timeoutMs) {
      broadcastKeys(presence.expire(now(), timeoutMs));
    },

    list: () =>
      [...connections.values()].map((c) => ({
        id: c.id,
        userId: c.userId,
        shopId: c.shopId,
        sessionId: c.sessionId,
        role: c.role,
        name: c.name,
        channels: [...c.channels],
        lastSeq: c.lastSeq,
        openedAt: c.openedAt,
      })),

    async settled() {
      while (resuming.size > 0) await Promise.all([...resuming]);
    },
  };
}
