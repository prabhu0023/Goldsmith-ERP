/**
 * The framework-free read cache of the web app (EP-08-S2, S3, S4, S7, S8, S9, S10, S11). It holds
 * one entry per (operation, input) and no React: `useQuery` (use-query.ts) is a thin binding.
 *
 * - One in-flight request per key; two readers of one key send one request (S2 AC1).
 * - An entry holds its data, when it was fetched, the entity versions seen, and a status. A
 *   result that carries an older version of an entity than the entry already holds is dropped, so
 *   a slow answer never replaces a newer one (S2 AC4, S9 AC5).
 * - A refresh of data already on screen keeps `ready` and sets `refreshing`: no loading flash (S3).
 * - A live event invalidates keys. Observed keys refetch after one coalescing window (the first
 *   event starts the timer, later ones join it), so 5 events in 300 ms give one fetch (S8 AC5).
 *   Cached keys nobody observes only get marked, and refetch the next time a screen mounts.
 * - After the user's own action `refetchNow` refetches at once and absorbs the event the same
 *   change is about to cause (S7 AC4).
 * - Nothing is persisted or queued: the cache is memory-only and `clear()` empties it at sign-out.
 */
import type { ErrorCode, LiveTimers, OperationInput, OperationName, OperationResult } from '@goldsmith/shared';
import type { ApiClient } from '../api/api-client';
import { keyOf, type QueryRef, refMatches } from './query-keys';

/** The entity versions an entry has seen, by entity id. They only grow. */
export type VersionMap = Readonly<Record<string, number>>;
export interface EntityVersion {
  id: string;
  version: number;
}
export type QueryStatus = 'loading' | 'ready' | 'failed' | 'possibly_stale';
export interface QueryError {
  code: ErrorCode;
  message: string;
  field?: string;
}

export interface QueryDef<N extends OperationName = OperationName> {
  readonly key: string;
  readonly op: N;
  readonly input: OperationInput<N>;
  /** The entity versions inside a result, so an older result can be dropped. */
  readonly versionsOf?: (data: OperationResult<N>) => VersionMap;
  /** False: the query never fetches (a karigar has no rail badges, S16 AC5). */
  readonly enabled?: boolean;
}

export function defineQuery<N extends OperationName>(def: {
  op: N;
  input: OperationInput<N>;
  versionsOf?: (data: OperationResult<N>) => VersionMap;
  enabled?: boolean;
}): QueryDef<N> {
  return { ...def, key: keyOf(def.op, def.input) };
}

export interface QuerySnapshot<D = unknown> {
  readonly key: string;
  readonly data: D | undefined;
  /** `now()` when the held data arrived; null before the first result. */
  readonly fetchedAt: number | null;
  readonly versions: VersionMap;
  readonly status: QueryStatus;
  readonly error: QueryError | undefined;
  /** A fetch is running while data is already held (no loading state is shown for it). */
  readonly refreshing: boolean;
}

export interface QueryClientOptions {
  api: Pick<ApiClient, 'call'>;
  now: () => number;
  timers: Pick<LiveTimers, 'setTimeout' | 'clearTimeout'>;
  coalesceMs?: number;
}

export const DEFAULT_COALESCE_MS = 300;

export interface QueryClient {
  defineQuery: typeof defineQuery;
  /** Start observing; fetches when the entry has no data yet or was invalidated. Returns the unsubscribe. */
  subscribe(def: QueryDef, listener: () => void): () => void;
  getSnapshot<N extends OperationName>(def: QueryDef<N>): QuerySnapshot<OperationResult<N>>;
  /** Fetch now (Try again); resolves true when the read succeeded. */
  refetch(def: QueryDef): Promise<boolean>;
  /** After the user's own action: refetch observed matches now, mark the others stale. */
  refetchNow(refs: QueryRef | readonly QueryRef[]): Promise<boolean>[];
  /** A live event: refetch observed matches after the coalescing window, mark the others stale. */
  invalidate(refs: readonly QueryRef[], opts?: { entity?: EntityVersion }): void;
  markPossiblyStale(): void;
  markFresh(): void;
  /** The connection is back: refetch every observed read whose last fetch failed. */
  refetchFailedObserved(): void;
  /** A gap too long to replay: refetch every observed read, mark the others stale. */
  refetchAllObserved(): Promise<void>;
  clear(): void;
  inspectAll(): Array<QuerySnapshot & { op: string; input: unknown }>;
  /** Resolves when no fetch is running or queued and no coalescing timer is pending. */
  whenIdle(): Promise<void>;
}

interface Entry {
  key: string;
  op: OperationName;
  input: unknown;
  versionsOf: ((data: unknown) => VersionMap) | undefined;
  enabled: boolean;
  data: unknown;
  fetchedAt: number | null;
  versions: VersionMap;
  status: QueryStatus;
  error: QueryError | undefined;
  refreshing: boolean;
  invalidated: boolean;
  inflight: Promise<boolean> | null;
  queued: Promise<boolean> | null;
  timer: unknown;
  hasTimer: boolean;
  coalescedUntil: number;
  listeners: Set<() => void>;
  snapshot: QuerySnapshot;
}

const covers = (held: VersionMap, entity: EntityVersion): boolean => {
  const version = held[entity.id];
  return version !== undefined && version >= entity.version;
};

const olderThanHeld = (held: VersionMap, incoming: VersionMap): boolean =>
  Object.entries(incoming).some(([id, version]) => {
    const have = held[id];
    return have !== undefined && have > version;
  });

const mergeVersions = (held: VersionMap, incoming: VersionMap): VersionMap => {
  const out: Record<string, number> = { ...held };
  for (const [id, version] of Object.entries(incoming)) out[id] = Math.max(out[id] ?? version, version);
  return out;
};

export function createQueryClient(options: QueryClientOptions): QueryClient {
  const { api, now, timers, coalesceMs = DEFAULT_COALESCE_MS } = options;
  const entries = new Map<string, Entry>();
  /** Bumped by clear(): an answer that comes back after it is dropped. */
  let epoch = 0;
  /** Fetches running or queued. */
  let outstanding = 0;
  let timerCount = 0;
  let idleWaiters: Array<() => void> = [];

  const checkIdle = () => {
    if (outstanding > 0 || timerCount > 0) return;
    const waiting = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiting) resolve();
  };

  const publish = (e: Entry) => {
    e.snapshot = {
      key: e.key,
      data: e.data,
      fetchedAt: e.fetchedAt,
      versions: e.versions,
      status: e.status,
      error: e.error,
      refreshing: e.refreshing,
    };
    for (const listener of [...e.listeners]) listener();
  };

  const ensure = (def: QueryDef): Entry => {
    let e = entries.get(def.key);
    if (!e) {
      e = {
        key: def.key,
        op: def.op,
        input: def.input,
        versionsOf: undefined,
        enabled: true,
        data: undefined,
        fetchedAt: null,
        versions: {},
        status: 'loading',
        error: undefined,
        refreshing: false,
        invalidated: false,
        inflight: null,
        queued: null,
        timer: null,
        hasTimer: false,
        coalescedUntil: 0,
        listeners: new Set(),
        snapshot: undefined as never,
      };
      e.snapshot = {
        key: e.key,
        data: undefined,
        fetchedAt: null,
        versions: e.versions,
        status: 'loading',
        error: undefined,
        refreshing: false,
      };
      entries.set(def.key, e);
    }
    e.versionsOf = def.versionsOf as Entry['versionsOf'];
    e.enabled = def.enabled !== false;
    return e;
  };

  const cancelTimer = (e: Entry) => {
    if (!e.hasTimer) return;
    timers.clearTimeout(e.timer);
    e.timer = null;
    e.hasTimer = false;
    timerCount -= 1;
  };

  const run = async (e: Entry, background: boolean): Promise<boolean> => {
    const generation = epoch;
    let answer: Awaited<ReturnType<ApiClient['call']>>;
    try {
      answer = await api.call(e.op, e.input as never, { background });
    } catch {
      answer = { ok: false, code: 'internal', message: 'Cannot reach the server. Check the connection and try again.', network: true };
    }
    outstanding -= 1;
    e.inflight = null;
    if (generation !== epoch) {
      checkIdle();
      return false;
    }
    e.refreshing = false;
    if (answer.ok) {
      const versions = e.versionsOf?.(answer.data) ?? {};
      if (!olderThanHeld(e.versions, versions)) {
        e.data = answer.data;
        e.versions = mergeVersions(e.versions, versions);
        e.fetchedAt = now();
      }
      e.status = 'ready';
      e.error = undefined;
    } else {
      e.status = 'failed';
      e.error = { code: answer.code, message: answer.message, ...(answer.field ? { field: answer.field } : {}) };
    }
    publish(e);
    checkIdle();
    return answer.ok;
  };

  /** Fetch unless one is already running (its answer will do). */
  const start = (e: Entry, background: boolean): Promise<boolean> => {
    if (e.inflight) return e.inflight;
    if (!e.enabled) return Promise.resolve(false);
    e.invalidated = false;
    const hadData = e.fetchedAt !== null;
    e.refreshing = hadData;
    if (!hadData) {
      e.status = 'loading';
      e.error = undefined;
    }
    outstanding += 1;
    publish(e);
    e.inflight = run(e, background);
    return e.inflight;
  };

  /** Fetch after any running fetch: its answer may predate the change that made us ask. */
  const force = (e: Entry, background: boolean): Promise<boolean> => {
    if (!e.inflight) return start(e, background);
    if (!e.queued) {
      outstanding += 1;
      e.queued = e.inflight.then(() => {
        e.queued = null;
        const next = entries.get(e.key) === e ? start(e, background) : Promise.resolve(false);
        outstanding -= 1;
        checkIdle();
        return next;
      });
    }
    return e.queued;
  };

  const schedule = (e: Entry) => {
    if (e.hasTimer) return;
    e.hasTimer = true;
    timerCount += 1;
    e.timer = timers.setTimeout(() => {
      e.timer = null;
      e.hasTimer = false;
      void force(e, true);
      timerCount -= 1;
      checkIdle();
    }, coalesceMs);
  };

  const matching = (refs: readonly QueryRef[]): Entry[] =>
    [...entries.values()].filter((e) => refs.some((r) => refMatches(r, e.op, e.key)));
  const observed = (e: Entry) => e.listeners.size > 0 && e.enabled;

  return {
    defineQuery,
    subscribe(def, listener) {
      const e = ensure(def);
      e.listeners.add(listener);
      if (e.enabled && !e.inflight && (e.fetchedAt === null || e.invalidated)) void start(e, false);
      return () => {
        e.listeners.delete(listener);
      };
    },
    getSnapshot(def) {
      return ensure(def).snapshot as never;
    },
    refetch(def) {
      const e = ensure(def);
      cancelTimer(e);
      return force(e, false);
    },
    refetchNow(refs) {
      const promises: Promise<boolean>[] = [];
      for (const e of matching(Array.isArray(refs) ? refs : [refs as QueryRef])) {
        if (observed(e)) {
          cancelTimer(e);
          e.coalescedUntil = now() + coalesceMs;
          promises.push(force(e, true));
        } else {
          e.invalidated = true;
        }
      }
      return promises;
    },
    invalidate(refs, opts = {}) {
      for (const e of matching(refs)) {
        if (opts.entity && covers(e.versions, opts.entity)) continue;
        if (now() < e.coalescedUntil) continue;
        e.invalidated = true;
        if (observed(e)) schedule(e);
      }
    },
    markPossiblyStale() {
      for (const e of entries.values()) {
        if (e.status !== 'ready') continue;
        e.status = 'possibly_stale';
        publish(e);
      }
    },
    markFresh() {
      for (const e of entries.values()) {
        if (e.status !== 'possibly_stale') continue;
        e.status = 'ready';
        publish(e);
      }
    },
    refetchFailedObserved() {
      for (const e of entries.values()) {
        if (e.status !== 'failed' || !observed(e)) continue;
        cancelTimer(e);
        void force(e, true);
      }
    },
    async refetchAllObserved() {
      const promises: Promise<boolean>[] = [];
      for (const e of entries.values()) {
        if (observed(e)) {
          cancelTimer(e);
          promises.push(force(e, true));
        } else {
          e.invalidated = true;
        }
      }
      await Promise.all(promises);
    },
    clear() {
      epoch += 1;
      const old = [...entries.values()];
      entries.clear();
      for (const e of old) cancelTimer(e);
      for (const e of old) for (const listener of [...e.listeners]) listener();
      checkIdle();
    },
    inspectAll() {
      return [...entries.values()].map((e) => ({ ...e.snapshot, op: e.op, input: e.input }));
    },
    whenIdle() {
      if (outstanding === 0 && timerCount === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    },
  };
}
