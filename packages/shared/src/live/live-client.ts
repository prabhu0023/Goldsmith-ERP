/**
 * The live channel client (EP-07-S3 AC1, S7, S8), shared by the web app and the api's two-client
 * test so both run the same reconnect, catch-up and presence logic. It holds exactly one stream at
 * a time. The stream itself comes from an injected LiveStreamSource (the browser wraps EventSource,
 * the tests a fetch reader), so D3's transport can change without touching this file or feature
 * code. Timers and the operation caller are injected too: no DOM or Node types here.
 *
 * - hello: records the stream's connectionId; a fresh stream also takes the starting seq. Entity
 *   subscriptions and joined parcels are re-sent for the new connectionId.
 * - An event whose seq is not above the last one received is dropped (S2 AC2, S7 AC3).
 * - A dropped stream is reopened with `since` = the last seq after a growing delay capped at the
 *   maximum, for as long as the client runs (S7 AC4).
 * - A refused open, or `closed` with session_ended / access_changed, asks checkSession(); when the
 *   session is gone the status becomes signed_out and the client stops (S7 AC5).
 * - While a parcel is joined, joinParcelPresence repeats every presenceHeartbeatMs (S8).
 * - A join (not a heartbeat) reports the answer's `others` through onPresence, so a user's second
 *   tab, whose join changes nobody's list and so is not broadcast, still shows who is there. A
 *   presence message that arrived while the join was on its way is newer and wins.
 *
 * D6 (offline karigar phone) stays open: there is no offline queue; a long gap ends in refetch_all.
 */
import type { LiveEnvelope } from './live-envelope.js';
import type { LivePresenceOther, LiveServerMessage } from './live-protocol.js';

export interface LiveStreamHandlers {
  onOpen(): void;
  onMessage(msg: LiveServerMessage): void;
  /** 'refused': the stream never opened (no session, server down). 'dropped': it was open and ended. */
  onError(kind: 'refused' | 'dropped'): void;
}

/** Opens one stream from `since` (null: from now). */
export interface LiveStreamSource {
  open(since: number | null, handlers: LiveStreamHandlers): { close(): void };
}

export type LiveClientOperation = 'subscribeLiveChannel' | 'unsubscribeLiveChannel' | 'joinParcelPresence' | 'leaveParcelPresence';

export interface LiveOpsCaller {
  call(
    op: LiveClientOperation,
    input: { connectionId: string; channel: string } | { connectionId: string; parcelId: string },
  ): Promise<{ ok: boolean; others?: LivePresenceOther[] }>;
}

export interface LiveTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface LiveBackoff {
  initialMs: number;
  factor: number;
  maxMs: number;
}

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'signed_out' | 'stopped';

export interface LiveClientOptions {
  source: LiveStreamSource;
  ops: LiveOpsCaller;
  timers: LiveTimers;
  /** True while the user still has a session (the web asks readCurrentSession). */
  checkSession(): Promise<boolean>;
  backoff?: LiveBackoff;
  presenceHeartbeatMs?: number;
}

export interface LiveClient {
  /** Open the stream (once; later calls do nothing). */
  start(): void;
  stop(): void;
  status(): LiveStatus;
  lastSeq(): number | null;
  connectionId(): string | null;
  onEvent(fn: (event: LiveEnvelope) => void): () => void;
  /** Too far behind to replay: reload the open screen's data. */
  onRefetchAll(fn: () => void): () => void;
  onPresence(fn: (parcelId: string, others: LivePresenceOther[]) => void): () => void;
  onStatus(fn: (status: LiveStatus) => void): () => void;
  /** Join an entity channel (`parcel:<code>`, `karigar_job:<code>`), kept across reconnects. */
  subscribe(channel: string): void;
  unsubscribe(channel: string): void;
  /** Show this user on a parcel's presence list until leavePresence (S8). */
  joinPresence(parcelId: string): void;
  leavePresence(parcelId: string): void;
}

export const DEFAULT_LIVE_BACKOFF: LiveBackoff = { initialMs: 500, factor: 2, maxMs: 15_000 };
export const DEFAULT_PRESENCE_HEARTBEAT_MS = 10_000;

function listeners<A extends unknown[]>() {
  const set = new Set<(...args: A) => void>();
  return {
    add(fn: (...args: A) => void): () => void {
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(...args: A): void {
      for (const fn of [...set]) fn(...args);
    },
  };
}

export function createLiveClient(opts: LiveClientOptions): LiveClient {
  const { source, ops, timers, checkSession } = opts;
  const backoff = opts.backoff ?? DEFAULT_LIVE_BACKOFF;
  const heartbeatMs = opts.presenceHeartbeatMs ?? DEFAULT_PRESENCE_HEARTBEAT_MS;
  const events = listeners<[LiveEnvelope]>();
  const refetches = listeners<[]>();
  const presences = listeners<[string, LivePresenceOther[]]>();
  const statuses = listeners<[LiveStatus]>();
  const channels = new Set<string>();
  const parcels = new Set<string>();

  let state: LiveStatus = 'idle';
  let seq: number | null = null;
  let connId: string | null = null;
  let stream: { close(): void } | null = null;
  /** Bumped whenever a stream is given up, so its late callbacks are ignored. */
  let generation = 0;
  let attempt = 0;
  let retryTimer: unknown = null;
  let heartbeat: unknown = null;

  const setStatus = (next: LiveStatus) => {
    if (state === next) return;
    state = next;
    statuses.emit(next);
  };
  const running = () => state !== 'idle' && state !== 'stopped' && state !== 'signed_out';
  const call = (op: LiveClientOperation, input: Parameters<LiveOpsCaller['call']>[1]) => {
    void ops.call(op, input).catch(() => {});
  };
  /** Presence messages received per parcel, so a join answer older than one of them is dropped. */
  const presenceSeen = new Map<string, number>();
  /** Join a parcel's presence and show the answer's list, unless something newer came meanwhile. */
  const join = (connectionId: string, parcelId: string) => {
    const seen = presenceSeen.get(parcelId) ?? 0;
    void ops
      .call('joinParcelPresence', { connectionId, parcelId })
      .then((answer) => {
        if (!answer.ok || !answer.others || connId !== connectionId || !parcels.has(parcelId)) return;
        if ((presenceSeen.get(parcelId) ?? 0) !== seen) return;
        presences.emit(parcelId, answer.others);
      })
      .catch(() => {});
  };

  const closeStream = () => {
    generation += 1;
    connId = null;
    if (stream) {
      const s = stream;
      stream = null;
      s.close();
    }
  };

  const open = () => {
    retryTimer = null;
    if (!running()) return;
    closeStream();
    const mine = generation;
    const current = () => mine === generation && running();
    stream = source.open(seq, {
      onOpen: () => {},
      onMessage: (msg) => {
        if (current()) receive(msg);
      },
      onError: (kind) => {
        if (!current()) return;
        closeStream();
        if (kind === 'dropped') scheduleReopen();
        else void recheck();
      },
    });
  };

  const scheduleReopen = () => {
    if (!running()) return;
    setStatus('reconnecting');
    const delay = Math.min(backoff.maxMs, backoff.initialMs * backoff.factor ** attempt);
    attempt += 1;
    retryTimer = timers.setTimeout(open, delay);
  };

  /** The stream was refused or ended for its session: carry on only while the session lives. */
  const recheck = async () => {
    setStatus('reconnecting');
    const mine = generation;
    let alive = true;
    try {
      alive = await checkSession();
    } catch {
      // The server cannot be reached to ask: keep retrying.
    }
    if (mine !== generation || !running()) return;
    if (alive) scheduleReopen();
    else {
      stopAll();
      setStatus('signed_out');
    }
  };

  const receive = (msg: LiveServerMessage) => {
    switch (msg.type) {
      case 'hello': {
        connId = msg.connectionId;
        if (seq === null) seq = msg.seq;
        attempt = 0;
        setStatus('open');
        for (const channel of channels) call('subscribeLiveChannel', { connectionId: msg.connectionId, channel });
        for (const parcelId of parcels) join(msg.connectionId, parcelId);
        return;
      }
      case 'event': {
        if (seq !== null && msg.event.seq <= seq) return;
        seq = msg.event.seq;
        events.emit(msg.event);
        return;
      }
      case 'refetch_all':
        seq = msg.seq;
        refetches.emit();
        return;
      case 'replayed':
        if (seq === null || msg.seq > seq) seq = msg.seq;
        return;
      case 'presence':
        presenceSeen.set(msg.parcelId, (presenceSeen.get(msg.parcelId) ?? 0) + 1);
        presences.emit(msg.parcelId, msg.others);
        return;
      case 'closed':
        closeStream();
        if (msg.reason === 'going_away') scheduleReopen();
        else void recheck();
        return;
    }
  };

  const syncHeartbeat = () => {
    if (parcels.size > 0 && heartbeat === null && running()) {
      heartbeat = timers.setInterval(() => {
        if (connId === null) return;
        for (const parcelId of parcels) call('joinParcelPresence', { connectionId: connId, parcelId });
      }, heartbeatMs);
    } else if ((parcels.size === 0 || !running()) && heartbeat !== null) {
      timers.clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  const stopAll = () => {
    if (retryTimer !== null) timers.clearTimeout(retryTimer);
    retryTimer = null;
    closeStream();
    if (heartbeat !== null) timers.clearInterval(heartbeat);
    heartbeat = null;
  };

  return {
    start() {
      if (state !== 'idle') return;
      setStatus('connecting');
      open();
      syncHeartbeat();
    },
    stop() {
      if (!running() && state !== 'idle') return;
      stopAll();
      setStatus('stopped');
    },
    status: () => state,
    lastSeq: () => seq,
    connectionId: () => connId,
    onEvent: events.add,
    onRefetchAll: refetches.add,
    onPresence: presences.add,
    onStatus: statuses.add,
    subscribe(channel) {
      if (channels.has(channel)) return;
      channels.add(channel);
      if (connId !== null) call('subscribeLiveChannel', { connectionId: connId, channel });
    },
    unsubscribe(channel) {
      if (!channels.delete(channel)) return;
      if (connId !== null) call('unsubscribeLiveChannel', { connectionId: connId, channel });
    },
    joinPresence(parcelId) {
      if (parcels.has(parcelId)) return;
      parcels.add(parcelId);
      if (connId !== null) join(connId, parcelId);
      syncHeartbeat();
    },
    leavePresence(parcelId) {
      if (!parcels.delete(parcelId)) return;
      if (connId !== null) call('leaveParcelPresence', { connectionId: connId, parcelId });
      syncHeartbeat();
    },
  };
}
