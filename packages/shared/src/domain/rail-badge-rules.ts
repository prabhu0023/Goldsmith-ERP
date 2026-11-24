/**
 * Rail badge counts (EP-07-S9): one rule for the server's readRailBadges and the web's in-memory
 * `railBadges` selector, so the two cannot drift. The caller supplies the tallies from its own
 * data; this function only decides which badge shows which tally for a role.
 */
import type { RoleId } from '../types/jewellery.js';
export type RailBadgeKey = 'decisions' | 'leads' | 'parcels' | 'stock';
export type RailBadges = Partial<Record<RailBadgeKey, number>>;
/** The counts the rail is built from, for one shop at one moment. */
export interface RailBadgeTallies {
  /** Parcels not yet released. */
  openParcels: number;
  /** Pieces in stock. */
  inStock: number;
  /** Stopped parcels with a mismatch verdict, no resolution and no open problem of their own. */
  mismatchedParcels: number;
  openProblems: number;
  /** Piece edits proposed or with a token sent. */
  pendingEdits: number;
  pendingScrap: number;
  /** Leads past their SLA. */
  lateLeads: number;
  overdueJobs: number;
  leadsNeedingGlance: number;
}
/**
 * The owner's Decisions total: the cards under "Nothing moves until you answer" (each mismatched
 * parcel and open problem, plus one card for all pending edits and one for all pending scrap) and
 * under "Running late" (one card for late leads, one for overdue jobs).
 */
export function ownerDecisionCount(t: RailBadgeTallies): number {
  const blocking = t.mismatchedParcels + t.openProblems + (t.pendingEdits ? 1 : 0) + (t.pendingScrap ? 1 : 0);
  const late = (t.lateLeads ? 1 : 0) + (t.overdueJobs ? 1 : 0);
  return blocking + late;
}
/** Owner: decisions, late leads, parcels, stock. Staff: leads needing a glance, parcels, stock. Karigar: none. */
export function railBadgeCounts(role: RoleId, t: RailBadgeTallies): RailBadges {
  if (role === 'owner') {
    return { decisions: ownerDecisionCount(t), leads: t.lateLeads, parcels: t.openParcels, stock: t.inStock };
  }
  if (role === 'staff') return { leads: t.leadsNeedingGlance, parcels: t.openParcels, stock: t.inStock };
  return {};
}
