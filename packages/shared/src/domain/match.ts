import type { Parcel, Piece, Scale, Verdict } from '../types/jewellery.js';
import { fromU, fmtG, netOf, toU, trimNum } from './weights.js';

export interface CeilingRow {
  scaleId: string;
  name: string;
  readabilityG: number;
  count: number;
  subtotalU: number;
}

export interface Ceiling {
  ceilingU: number;
  ceilingG: number;
  weighings: number;
  rows: CeilingRow[];
  /** Plain English, e.g. "13 weighings × ½ × 0.0001 g = 0.0007 g". */
  line: string;
}

/** ceiling = Σ ½ × readability of the scale used, over every weighing taken. No settings. */
export function computeCeiling(weighings: { scaleId: string }[], scales: Scale[]): Ceiling {
  const byId = new Map(scales.map((s) => [s.id, s]));
  const rows = new Map<string, CeilingRow>();
  for (const w of weighings) {
    const s = byId.get(w.scaleId);
    if (!s) continue;
    const row = rows.get(s.id) ?? { scaleId: s.id, name: s.name, readabilityG: s.readabilityG, count: 0, subtotalU: 0 };
    row.count += 1;
    // half a step, in units of 0.00001 g
    row.subtotalU += toU(s.readabilityG) / 2;
    rows.set(s.id, row);
  }
  const list = [...rows.values()].sort((a, b) => a.readabilityG - b.readabilityG);
  const ceilingU = Math.round(list.reduce((a, r) => a + r.subtotalU, 0));
  const total = list.reduce((a, r) => a + r.count, 0);
  const ceilingG = fromU(ceilingU);
  let line: string;
  if (list.length === 0) line = 'No weighings yet';
  else if (list.length === 1) {
    line = `${total} weighing${total === 1 ? '' : 's'} × ½ × ${trimNum(list[0].readabilityG)} g = ${fmtG(ceilingG)} g`;
  } else {
    const parts = list.map((r) => `${r.count} × ${trimNum(r.readabilityG / 2)}`);
    line = `${parts.join(' + ')} = ${fmtG(ceilingG)} g`;
  }
  return { ceilingU, ceilingG, weighings: total, rows: list, line };
}

export interface ParcelEvaluation {
  verdict: Verdict;
  expected: number;
  tagged: number;
  said: { grossU: number; stoneU: number; netU: number };
  tags: { grossU: number; stoneU: number; netU: number };
  /** Signed, tags minus parcel. Negative = the tags are short. */
  gap: { grossU: number; stoneU: number; netU: number };
  /** Largest absolute gap of the three, in units. */
  worstU: number;
  ceiling: Ceiling;
}

export const manifestTotal = (parcel: Parcel): number => parcel.manifest.reduce((a, r) => a + r.count, 0);

/**
 * Every weighing counts: one per tagged piece (on its own scale) plus the parcel's weighing(s),
 * a single reading or one per tray. Verdicts: incomplete, exact (gap 0), last_digit (0 < gap ≤ ceiling)
 * or mismatch (gap > ceiling). The same ceiling applies to gross, stone and net.
 */
export function evaluateParcel(parcel: Parcel, pieces: Piece[], scales: Scale[]): ParcelEvaluation {
  const mine = pieces.filter((p) => p.parcelId === parcel.id && p.status !== 'scrapped');
  const expected = manifestTotal(parcel);
  const said = parcel.weighings.reduce(
    (a, w) => ({ grossU: a.grossU + toU(w.grossG), stoneU: a.stoneU + toU(w.stoneG) }),
    { grossU: 0, stoneU: 0 },
  );
  const saidAll = { ...said, netU: said.grossU - said.stoneU };
  const tags = mine.reduce(
    (a, p) => ({ grossU: a.grossU + toU(p.grossG), stoneU: a.stoneU + toU(p.stoneG), netU: a.netU + toU(netOf(p)) }),
    { grossU: 0, stoneU: 0, netU: 0 },
  );
  const gap = {
    grossU: tags.grossU - saidAll.grossU,
    stoneU: tags.stoneU - saidAll.stoneU,
    netU: tags.netU - saidAll.netU,
  };
  const worstU = Math.max(Math.abs(gap.grossU), Math.abs(gap.stoneU), Math.abs(gap.netU));
  const ceiling = computeCeiling([...mine, ...parcel.weighings], scales);
  let verdict: Verdict;
  if (parcel.weighings.length === 0 || expected === 0 || mine.length !== expected) verdict = 'incomplete';
  else if (worstU === 0) verdict = 'exact';
  else if (worstU <= ceiling.ceilingU) verdict = 'last_digit';
  else verdict = 'mismatch';
  return { verdict, expected, tagged: mine.length, said: saidAll, tags, gap, worstU, ceiling };
}
