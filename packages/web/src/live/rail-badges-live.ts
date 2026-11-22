/**
 * Live rail badges (EP-07-S9). A catalogue event with `refreshesBadges` triggers one
 * readRailBadges call after the burst it belongs to; the counts themselves come from the server.
 *
 * A badge is shown from the server only once its web screen reads server data. None does yet, so
 * SERVER_BACKED_BADGES is empty and every badge keeps its in-memory value until EP-08 (FU-012):
 * the Leads screen and its actions (LeadReview, ConvertLead) still run on the in-memory store and
 * judge lateness by the demo clock, so a server Leads count would disagree with the screen; pieces,
 * parcels, edits, problems and scrap have no server write path at all. While the list is empty
 * useLiveRailBadges reads nothing. The server read, the debounce and the karigar rule are in place
 * and tested, so a screen epic only adds its badge key here.
 */
import { LIVE_CATALOGUE, type LiveClient, type LiveEnvelope, type LiveTimers, type RailBadges, type RoleId } from '@goldsmith/shared';
import { useContext, useEffect, useState } from 'react';
import { opsCall } from '../api/ops-client';
import type { BadgeKey } from '../store/selectors';
import { browserTimers } from './browser-stream';
import { LiveContext } from './use-live';

/** The badges shown from server counts; the rest keep the in-memory value. Empty until EP-08. */
export const SERVER_BACKED_BADGES: readonly BadgeKey[] = [];

const BADGE_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(LIVE_CATALOGUE)
    .filter((e) => e.refreshesBadges)
    .map((e) => e.name),
);

/** Whether an event's catalogue entry asks for a badge refresh. */
export const refreshesBadges = (event: Pick<LiveEnvelope, 'name'>): boolean => BADGE_EVENT_NAMES.has(event.name);

/** The in-memory badges with the server's count for each server-backed badge the role shows. */
export function mergeRailBadges(
  memory: RailBadges,
  server: RailBadges,
  serverBacked: readonly BadgeKey[] = SERVER_BACKED_BADGES,
): RailBadges {
  const out: RailBadges = { ...memory };
  for (const key of serverBacked) {
    const value = server[key];
    if (key in memory && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Debounced badge reads: one fetch `debounceMs` after the last badge event of a burst, never two
 * at once (a request asked for while one runs follows it). 300 ms covers 5 events spread over one
 * second and keeps the badge within about a second of the last of them.
 */
export function createBadgeRefresher(opts: { fetchCounts: () => Promise<void>; timers: LiveTimers; debounceMs?: number }) {
  const { fetchCounts, timers, debounceMs = 300 } = opts;
  let timer: unknown = null;
  let running = false;
  let again = false;
  let stopped = false;

  const run = async () => {
    timer = null;
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await fetchCounts();
    } catch {
      // A failed read leaves the last counts; the next event or refetch tries again.
    } finally {
      running = false;
    }
    if (again && !stopped) {
      again = false;
      void run();
    }
  };

  return {
    /** Call for every live event; only badge events schedule a read. */
    onEvent(event: Pick<LiveEnvelope, 'name'>) {
      if (stopped || !refreshesBadges(event)) return;
      if (timer !== null) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => void run(), debounceMs);
    },
    /** Read now (on mount, after refetch_all). */
    refreshNow() {
      if (timer !== null) timers.clearTimeout(timer);
      void run();
    },
    stop() {
      stopped = true;
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Keep `onCounts` fed with the role's server badge counts while the returned stop is not called.
 * A karigar has no rail (S9 AC4): nothing is fetched and no counts are reported.
 */
export function startLiveRailBadges(opts: {
  role: RoleId;
  live: Pick<LiveClient, 'onEvent' | 'onRefetchAll'>;
  fetchCounts: () => Promise<RailBadges | null>;
  onCounts: (badges: RailBadges) => void;
  timers: LiveTimers;
  debounceMs?: number;
}): () => void {
  if (opts.role === 'karigar') return () => {};
  let active = true;
  const refresher = createBadgeRefresher({
    timers: opts.timers,
    debounceMs: opts.debounceMs,
    fetchCounts: async () => {
      const badges = await opts.fetchCounts();
      if (active && badges) opts.onCounts(badges);
    },
  });
  const offEvent = opts.live.onEvent((e) => refresher.onEvent(e));
  const offRefetch = opts.live.onRefetchAll(() => refresher.refreshNow());
  refresher.refreshNow();
  return () => {
    active = false;
    offEvent();
    offRefetch();
    refresher.stop();
  };
}

async function readRailBadges(): Promise<RailBadges | null> {
  const answer = await opsCall('readRailBadges', {});
  return answer.ok ? answer.data.badges : null;
}

/** The server's badge counts for the signed-in role, kept current by live events; {} for a karigar. */
export function useLiveRailBadges(role: RoleId): RailBadges {
  const live = useContext(LiveContext);
  const [server, setServer] = useState<RailBadges>({});
  useEffect(() => {
    setServer({});
    // No badge is server-backed yet: nothing to read.
    if (SERVER_BACKED_BADGES.length === 0) return;
    return startLiveRailBadges({ role, live, fetchCounts: readRailBadges, onCounts: setServer, timers: browserTimers });
  }, [role, live]);
  return role === 'karigar' ? {} : server;
}
