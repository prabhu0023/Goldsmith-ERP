import type { RailBadges, RoleId } from '@goldsmith/shared';
import { defineQuery, type QuerySnapshot } from '../query/query-client';
import { useQuery } from '../query/use-query';
const badgesQuery = defineQuery({ op: 'readRailBadges', input: {} });
/** A karigar has no rail, so the read is never made (EP-08-S16 AC5). */
const noBadgesQuery = defineQuery({ op: 'readRailBadges', input: {}, enabled: false });
/**
 * The counts to draw: the server's, once the read has answered. While it loads or after it failed
 * no number shows, never a 0 (S16 AC3, AC4).
 */
export function railBadgesFrom(snapshot: Pick<QuerySnapshot<{ badges: RailBadges }>, 'status' | 'data'>): RailBadges {
  const ready = snapshot.status === 'ready' || snapshot.status === 'possibly_stale';
  return ready && snapshot.data ? snapshot.data.badges : {};
}
/** The read for a role: none for a karigar. */
export const railBadgesQuery = (role: RoleId) => (role === 'karigar' ? noBadgesQuery : badgesQuery);
/** The rail badges for a role, from `readRailBadges` only; the live bridge refreshes them (S16 AC1, AC2). */
export function useRailBadges(role: RoleId): RailBadges {
  const query = useQuery(railBadgesQuery(role));
  return role === 'karigar' ? {} : railBadgesFrom(query);
}
