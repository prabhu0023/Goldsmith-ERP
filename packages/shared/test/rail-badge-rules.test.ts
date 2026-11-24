import { describe, expect, it } from 'vitest';
import { ownerDecisionCount, type RailBadgeTallies, railBadgeCounts } from '../src/index.js';

const none: RailBadgeTallies = {
  openParcels: 0,
  inStock: 0,
  mismatchedParcels: 0,
  openProblems: 0,
  pendingEdits: 0,
  pendingScrap: 0,
  lateLeads: 0,
  overdueJobs: 0,
  leadsNeedingGlance: 0,
};

describe('EP-07-S9 rail badge rules', () => {
  it('owner: decisions total, late leads, open parcels and in-stock count', () => {
    const t = { ...none, openParcels: 2, inStock: 42, mismatchedParcels: 1, openProblems: 1, pendingEdits: 3, lateLeads: 2 };
    // 1 mismatched + 1 problem + 1 card for all pending edits + 1 card for late leads.
    expect(railBadgeCounts('owner', t)).toEqual({ decisions: 4, leads: 2, parcels: 2, stock: 42 });
  });

  it('owner decisions count pending edits, pending scrap, late leads and overdue jobs as one card each', () => {
    expect(ownerDecisionCount({ ...none, pendingEdits: 5, pendingScrap: 2, lateLeads: 7, overdueJobs: 3 })).toBe(4);
    expect(ownerDecisionCount({ ...none, mismatchedParcels: 2, openProblems: 3 })).toBe(5);
    expect(ownerDecisionCount(none)).toBe(0);
  });

  it('staff: leads needing a glance, open parcels and in-stock count, no decisions', () => {
    const t = { ...none, openParcels: 2, inStock: 42, lateLeads: 4, leadsNeedingGlance: 3, mismatchedParcels: 1 };
    expect(railBadgeCounts('staff', t)).toEqual({ leads: 3, parcels: 2, stock: 42 });
  });

  it('karigar: no badges', () => {
    expect(railBadgeCounts('karigar', { ...none, openParcels: 2, inStock: 42 })).toEqual({});
  });
});
