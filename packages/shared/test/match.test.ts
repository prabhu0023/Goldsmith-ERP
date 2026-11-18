import { describe, expect, it } from 'vitest';
import { computeCeiling, evaluateParcel, type Parcel, type Piece, type Scale } from '../src/index.js';

const fine: Scale = { id: 'fine', name: 'Fine scale', readabilityG: 0.0001, capacityG: 500 };

/** A parcel of twelve tagged pieces of 10 g each, weighed once as a whole on the fine scale. */
function parcelWith(parcelGrossG: number, tagged = 12): { parcel: Parcel; pieces: Piece[] } {
  const parcel = {
    id: 'P-044',
    manifest: [{ id: 'm1', kind: 'Ring', count: 12 }],
    weighings: [{ id: 'w1', label: 'Whole parcel', scaleId: fine.id, grossG: parcelGrossG, stoneG: 0 }],
  } as unknown as Parcel;
  const pieces = Array.from(
    { length: tagged },
    (_, i) =>
      ({ id: `TAG-${i}`, parcelId: parcel.id, status: 'draft', scaleId: fine.id, grossG: 10, stoneG: 0 }) as Piece,
  );
  return { parcel, pieces };
}

describe('match ceiling', () => {
  it('is half a step per weighing: 13 weighings on a 0.0001 g scale = 0.00065 g', () => {
    const weighings = Array.from({ length: 13 }, () => ({ scaleId: fine.id }));
    const c = computeCeiling(weighings, [fine]);
    expect(c.weighings).toBe(13);
    expect(c.ceilingU).toBe(65);
    expect(c.ceilingG).toBe(0.00065);
  });
});

describe('parcel verdict', () => {
  it('is a mismatch when the tags are 138 mg short', () => {
    const { parcel, pieces } = parcelWith(120.138);
    const e = evaluateParcel(parcel, pieces, [fine]);
    expect(e.ceiling.ceilingG).toBe(0.00065);
    expect(e.gap.netU).toBe(-13800);
    expect(e.verdict).toBe('mismatch');
  });

  it('is exact when the gap is zero', () => {
    const { parcel, pieces } = parcelWith(120);
    expect(evaluateParcel(parcel, pieces, [fine]).verdict).toBe('exact');
  });

  it('is last_digit when the gap is within the ceiling', () => {
    const { parcel, pieces } = parcelWith(120.0003);
    expect(evaluateParcel(parcel, pieces, [fine]).verdict).toBe('last_digit');
  });

  it('is incomplete until every manifest item is tagged', () => {
    const { parcel, pieces } = parcelWith(120, 11);
    expect(evaluateParcel(parcel, pieces, [fine]).verdict).toBe('incomplete');
  });
});
