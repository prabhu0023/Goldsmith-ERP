/**
 * Recorded match cases from the real prototype seed (EP-40-S3, gap G11). The seed is read through
 * loadPrototypeState and never edited. Every figure is an integer in units of 0.00001 g, so no
 * assertion uses a float tolerance. Each name starts with the section 6 case it covers (batch, scale or pool figure).
 *
 * Q5d: a gap inside the ceiling is last_digit; the prototype releases and logs it. No new rule.
 * Only the match arithmetic is covered here. Tag save, release, clear and scrap operations
 * belong to EP-21 to EP-27 (docs/followups.md).
 */
import {
  type AppState,
  computeCeiling,
  evaluateParcel,
  gramsToUnits,
  type Parcel,
  type Piece,
  STORED_UNITS_PER_G,
  toU,
  unitsToGrams,
} from '@goldsmith/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrototypeState } from '../../src/db/seed/prototype-loader.js';
let state: AppState;
beforeAll(async () => {
  state = await loadPrototypeState();
}, 60_000);
function parcel(code: string): Parcel {
  const found = state.parcels.find((p) => p.id === code);
  if (!found) throw new Error(`prototype seed has no parcel ${code}`);
  return found;
}
const stored = (text: string): number => {
  const r = gramsToUnits(text);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};
/** Evaluate `code` against the seed pieces, with the first of its tags changed by `bumpU` units of 0.00001 g. */
function evaluateWithBump(code: string, bumpU = 0) {
  const p = parcel(code);
  const pieces = state.pieces.map((x) => ({ ...x })) as Piece[];
  const first = pieces.find((x) => x.parcelId === p.id && x.status !== 'scrapped');
  if (!first) throw new Error(`${code} has no tags`);
  first.grossG = (toU(first.grossG) + bumpU) / 100000;
  return evaluateParcel(p, pieces, state.scales);
}
describe('prototype seed match cases (EP-40-S3, epic section 6)', () => {
  it('Seed weights (EP-40-S2 AC6): every parcel, weighing and piece weight round-trips through stored units', () => {
    const weights = [
      ...state.parcels.flatMap((p) => p.weighings.flatMap((w) => [w.grossG, w.stoneG])),
      ...state.pieces.flatMap((x) => [x.grossG, x.stoneG]),
    ];
    expect(weights.length).toBeGreaterThan(0);
    for (const g of weights) {
      const text = unitsToGrams(stored(String(g)));
      expect(stored(text), `${g}`).toBe(stored(String(g)));
      expect(Number(text), `${g}`).toBe(g);
    }
  });
  it('BATCH-2026-044 mismatch: it is 0.1380 g short, over the 0.00065 g ceiling of 13 weighings', () => {
    const e = evaluateWithBump('BATCH-2026-044');
    expect(e.verdict).toBe('mismatch');
    expect(e.gap.netU).toBe(-13800);
    expect(e.ceiling.weighings).toBe(13);
    expect(e.ceiling.ceilingU).toBe(65);
    expect(e.worstU).toBeGreaterThan(e.ceiling.ceilingU);
  });
  it('BATCH-2026-046 exact: it has a gap of zero on gross, stones and net, ceiling 25 units from 5 weighings', () => {
    const e = evaluateWithBump('BATCH-2026-046');
    expect(e.verdict).toBe('exact');
    expect(e.gap).toEqual({ grossU: 0, stoneU: 0, netU: 0 });
    expect(e.ceiling.weighings).toBe(5);
    expect(e.ceiling.ceilingU).toBe(25);
  });
  it('BATCH-2026-046 last_digit: one tag 0.0001 g heavy is inside the ceiling', () => {
    const e = evaluateWithBump('BATCH-2026-046', 10);
    expect(e.gap.grossU).toBe(10);
    expect(e.worstU).toBe(10);
    expect(e.verdict).toBe('last_digit');
  });
  it('BATCH-2026-046 last_digit: one tag 0.0002 g heavy is still inside the 25 unit ceiling', () => {
    const e = evaluateWithBump('BATCH-2026-046', 20);
    expect(e.worstU).toBe(20);
    expect(e.verdict).toBe('last_digit');
  });
  it('BATCH-2026-046 last_digit: a tag 0.0002 g light is also last_digit', () => {
    const e = evaluateWithBump('BATCH-2026-046', -20);
    expect(e.gap.grossU).toBe(-20);
    expect(e.verdict).toBe('last_digit');
  });
  it('BATCH-2026-046 mismatch: one tag 0.0003 g heavy is 30 units, over the ceiling of 25', () => {
    const e = evaluateWithBump('BATCH-2026-046', 30);
    expect(e.worstU).toBe(30);
    expect(e.ceiling.ceilingU).toBe(25);
    expect(e.verdict).toBe('mismatch');
  });
  it('Ceiling grows by half a step for each extra weighing on the same scale', () => {
    const base = evaluateWithBump('BATCH-2026-044').ceiling;
    const scaleId = base.rows[0].scaleId;
    const more = computeCeiling([...Array.from({ length: base.weighings }, () => ({ scaleId })), { scaleId }], state.scales);
    expect(base.rows).toHaveLength(1);
    expect(more.ceilingU).toBe(base.ceilingU + toU(base.rows[0].readabilityG) / 2);
  });
  it('Scrap arithmetic reference (EP-27 owns the operation): pool 812.58 g plus TAG-7701 net 78.4 g is 890.98 g in stored units', () => {
    const piece = state.pieces.find((x) => x.id === 'TAG-7701');
    if (!piece) throw new Error('prototype seed has no TAG-7701');
    expect(piece.grossG).toBe(84.5);
    expect(piece.stoneG).toBe(6.1);
    const netU = stored(String(piece.grossG)) - stored(String(piece.stoneG));
    expect(netU).toBe(784000);
    expect(stored(String(state.pool.balanceG))).toBe(8125800);
    expect(stored(String(state.pool.balanceG)) + netU).toBe(8909800);
    expect((8909800 / STORED_UNITS_PER_G).toFixed(2)).toBe('890.98');
  });
});
