/**
 * Who has a parcel open (EP-07-S8). The server keeps one entry per stream and parcel, with the
 * user's name from the session (never from the client) and the time of the last heartbeat. A
 * heartbeat is the client calling joinParcelPresence again; an entry without one for timeoutMs
 * expires. An entry goes when its stream leaves the parcel, unsubscribes from it or closes.
 * Each listener gets the others, never itself, one line per user.
 */
import type { LivePresenceOther } from '@goldsmith/shared';

interface Entry {
  userId: string;
  name: string;
  lastSeen: number;
}

export interface Presence {
  /** Add or refresh; true when the parcel's list of names changed. */
  join(key: string, connId: string, who: { userId: string; name: string }, now: number): boolean;
  leave(key: string, connId: string): boolean;
  /** Remove a stream from every parcel; returns the parcels whose list changed. */
  dropConnection(connId: string): string[];
  /** Remove entries older than the timeout; returns the parcels whose list changed. */
  expire(now: number, timeoutMs: number): string[];
  othersFor(key: string, userId: string): LivePresenceOther[];
}

export function createPresence(): Presence {
  const parcels = new Map<string, Map<string, Entry>>();
  const names = (key: string) =>
    [...new Set([...(parcels.get(key)?.values() ?? [])].map((e) => `${e.userId}\u0000${e.name}`))].sort().join('|');
  const remove = (key: string, connId: string): boolean => {
    const entries = parcels.get(key);
    if (!entries?.has(connId)) return false;
    const before = names(key);
    entries.delete(connId);
    if (entries.size === 0) parcels.delete(key);
    return names(key) !== before;
  };
  return {
    join(key, connId, who, now) {
      const before = names(key);
      const entries = parcels.get(key) ?? new Map<string, Entry>();
      parcels.set(key, entries);
      entries.set(connId, { userId: who.userId, name: who.name, lastSeen: now });
      return names(key) !== before;
    },
    leave: remove,
    dropConnection(connId) {
      return [...parcels.keys()].filter((key) => remove(key, connId));
    },
    expire(now, timeoutMs) {
      const changed = new Set<string>();
      for (const [key, entries] of [...parcels]) {
        for (const [connId, e] of [...entries]) {
          if (now - e.lastSeen > timeoutMs && remove(key, connId)) changed.add(key);
        }
      }
      return [...changed];
    },
    othersFor(key, userId) {
      const seen = new Map<string, string>();
      for (const e of parcels.get(key)?.values() ?? []) if (e.userId !== userId) seen.set(e.userId, e.name);
      return [...seen]
        .map(([id, name]) => ({ userId: id, name }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
    },
  };
}
