import type { LiveEnvelope, LiveTimers, RailBadges } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import { createBadgeRefresher, mergeRailBadges, SERVER_BACKED_BADGES, startLiveRailBadges } from './rail-badges-live';

/** Timers moved by hand. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: LiveTimers = {
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => void pending.delete(id as number),
    setInterval: () => 0,
    clearInterval: () => {},
  };
  return {
    timers,
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        for (let i = 0; i < 5; i += 1) await Promise.resolve();
      }
      now = end;
    },
  };
}

/** A live client stand-in whose events the test pushes. */
function fakeLive() {
  const onEvent = new Set<(e: LiveEnvelope) => void>();
  const onRefetch = new Set<() => void>();
  return {
    live: {
      onEvent: (fn: (e: LiveEnvelope) => void) => {
        onEvent.add(fn);
        return () => void onEvent.delete(fn);
      },
      onRefetchAll: (fn: () => void) => {
        onRefetch.add(fn);
        return () => void onRefetch.delete(fn);
      },
    },
    push: (name: string, seq: number) => {
      const e: LiveEnvelope = {
        seq,
        name,
        entityType: 'piece',
        entityId: 'TAG-8841',
        entityVersion: 2,
        emittedAt: '2026-11-21T10:00:00.000Z',
        audience: { channels: ['role:staff'] },
      };
      for (const fn of onEvent) fn(e);
    },
    refetchAll: () => {
      for (const fn of onRefetch) fn();
    },
  };
}

describe('EP-07-S9 live rail badges (web)', () => {
  it('S9 AC4: Lakshmi Devi on the karigar app gets no badges and no badge read, whatever arrives', async () => {
    const t = fakeTimers();
    const l = fakeLive();
    let fetches = 0;
    const seen: RailBadges[] = [];
    const stop = startLiveRailBadges({
      role: 'karigar',
      live: l.live,
      timers: t.timers,
      fetchCounts: async () => {
        fetches += 1;
        return { leads: 1 };
      },
      onCounts: (b) => seen.push(b),
    });
    l.push('Karigar job status changed', 1);
    l.push('Piece billed by one staff member', 2);
    l.refetchAll();
    await t.advance(5_000);
    expect(fetches).toBe(0);
    expect(seen).toEqual([]);
    stop();
  });

  it('S9 AC5: a burst of 5 badge events in one second leads to one count read after the burst, not 5', async () => {
    const t = fakeTimers();
    const l = fakeLive();
    let fetches = 0;
    const seen: RailBadges[] = [];
    const stop = startLiveRailBadges({
      role: 'owner',
      live: l.live,
      timers: t.timers,
      fetchCounts: async () => {
        fetches += 1;
        return { decisions: 3 + fetches, leads: 1 };
      },
      onCounts: (b) => seen.push(b),
    });
    await t.advance(0);
    expect(fetches).toBe(1); // the read on mount
    for (let i = 0; i < 5; i += 1) {
      l.push('Parcel stopped (mismatch or raised problem)', 10 + i);
      await t.advance(i < 4 ? 250 : 0);
    }
    expect(fetches).toBe(1);
    await t.advance(1_000);
    expect(fetches).toBe(2);
    expect(seen.at(-1)).toEqual({ decisions: 5, leads: 1 });
    stop();
  });

  it('events that do not move a badge (tag saved, metal pool) do not cause a read', async () => {
    const t = fakeTimers();
    let fetches = 0;
    const r = createBadgeRefresher({
      timers: t.timers,
      fetchCounts: async () => {
        fetches += 1;
      },
    });
    r.onEvent({ name: 'Tag saved on a shared parcel' });
    r.onEvent({ name: 'Metal pool changed' });
    await t.advance(2_000);
    expect(fetches).toBe(0);
    r.onEvent({ name: 'Lead arrived / passed its SLA' });
    await t.advance(2_000);
    expect(fetches).toBe(1);
  });

  it('no badge is server-backed until its screen reads server data (EP-08): every badge keeps its in-memory value', () => {
    expect(SERVER_BACKED_BADGES).toEqual([]);
    const memory = { decisions: 3, leads: 0, parcels: 2, stock: 42 };
    const server = { decisions: 9, leads: 2, parcels: 7, stock: 1 };
    expect(mergeRailBadges(memory, server)).toEqual(memory);
  });

  it('merge takes the server count only for a server-backed badge the role shows', () => {
    const memory = { decisions: 3, leads: 0, parcels: 2, stock: 42 };
    const server = { decisions: 9, leads: 2, parcels: 7, stock: 1 };
    expect(mergeRailBadges(memory, server, ['leads'])).toEqual({ decisions: 3, leads: 2, parcels: 2, stock: 42 });
    // No server answer yet: the in-memory counts as they are.
    expect(mergeRailBadges(memory, {}, ['leads'])).toEqual(memory);
    // A role without the badge does not gain it.
    expect(mergeRailBadges({}, server, ['leads'])).toEqual({});
  });
});
