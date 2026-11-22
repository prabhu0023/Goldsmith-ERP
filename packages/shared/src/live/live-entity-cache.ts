/**
 * Client-side records kept current by live events (EP-07-S2 AC4/AC5, S11 AC4). An event carries
 * only the entity's id and version, never business values (FR-07-4), so the cache refetches the
 * record through the injected, permission-checked read and stores what that read returns. An
 * event for a version the cache already holds (or an older one arriving late) does nothing.
 */
import type { LiveEntityType, LiveEnvelope } from './live-envelope.js';

export interface LiveCachedRecord {
  version: number;
}

export interface LiveEntityCacheOptions<T extends LiveCachedRecord> {
  /** The current record, or null when it is gone or no longer readable by this user. */
  fetchEntity(type: LiveEntityType, id: string): Promise<T | null>;
}

export interface LiveEntityCache<T extends LiveCachedRecord> {
  /** Seed a record a screen loaded itself. */
  put(type: LiveEntityType, id: string, record: T): void;
  get(type: LiveEntityType, id: string): T | undefined;
  /** Every record held for a type. */
  values(type: LiveEntityType): T[];
  /** Apply one event: refetch when it is newer than the record held. Resolves true when it refetched. */
  apply(event: Pick<LiveEnvelope, 'entityType' | 'entityId' | 'entityVersion'>): Promise<boolean>;
  /** Called after a refetch with the new record, or null when it was removed. */
  onChange(fn: (type: LiveEntityType, id: string, record: T | null) => void): () => void;
}

export function createLiveEntityCache<T extends LiveCachedRecord>(opts: LiveEntityCacheOptions<T>): LiveEntityCache<T> {
  const records = new Map<string, { type: LiveEntityType; record: T }>();
  const inFlight = new Map<string, Promise<unknown>>();
  const changes = new Set<(type: LiveEntityType, id: string, record: T | null) => void>();
  const key = (type: LiveEntityType, id: string) => `${type}\u0000${id}`;

  const apply: LiveEntityCache<T>['apply'] = async (event) => {
    const k = key(event.entityType, event.entityId);
    // Let a fetch already running for this record land first, then judge the event against it.
    while (inFlight.has(k)) await inFlight.get(k);
    const held = records.get(k);
    if (held && event.entityVersion <= held.record.version) return false;
    const fetching = opts.fetchEntity(event.entityType, event.entityId);
    inFlight.set(k, fetching.catch(() => {}));
    try {
      const fresh = await fetching;
      if (fresh === null) records.delete(k);
      else records.set(k, { type: event.entityType, record: fresh });
      for (const fn of [...changes]) fn(event.entityType, event.entityId, fresh);
      return true;
    } finally {
      inFlight.delete(k);
    }
  };

  return {
    put(type, id, record) {
      records.set(key(type, id), { type, record });
    },
    get: (type, id) => records.get(key(type, id))?.record,
    values: (type) => [...records.values()].filter((r) => r.type === type).map((r) => r.record),
    apply,
    onChange(fn) {
      changes.add(fn);
      return () => changes.delete(fn);
    },
  };
}
