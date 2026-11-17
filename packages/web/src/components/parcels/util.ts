import type { RouteId } from '../../nav';
import { evaluate } from '../../store/selectors';
import type { AppState, Parcel, RoleId } from '../../types/jewellery';

export interface Target {
  id: RouteId;
  params: Record<string, string>;
}

/** Where "open this parcel" should land, from what has been done so far. */
export function parcelTarget(s: AppState, p: Parcel, role: RoleId): Target {
  const params = { parcelId: p.id };
  if (p.status === 'released') return { id: 'parcel-match', params };
  if (role === 'owner' && p.status === 'stopped' && p.verdict === 'mismatch' && p.resolution === null) {
    return { id: 'parcel-clear', params };
  }
  if (p.weighings.length === 0) return { id: 'parcel-arrival', params };
  if (p.status === 'stopped') return { id: 'parcel-match', params };
  const ev = evaluate(s, p);
  if (ev.tagged < ev.expected) return { id: 'parcel-tag', params };
  return { id: 'parcel-match', params };
}

/** The next free tag number, one above the highest "TAG-n" already in use. */
export function nextTagNumber(s: AppState): string {
  let max = 0;
  for (const p of s.pieces) {
    const m = /^TAG-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TAG-${max + 1}`;
}

export const PURITIES = [
  { value: '24K', label: '24K (999)' },
  { value: '22K', label: '22K (916)' },
  { value: '18K', label: '18K (750)' },
  { value: '14K', label: '14K (585)' },
];

/** "gap" in milligrams with a sign: "0", "−138 mg", "+0.3 mg". */
export function gapText(gapG: number): string {
  if (gapG === 0) return '0';
  const mg = Math.round(Math.abs(gapG) * 1000 * 100) / 100;
  return `${gapG < 0 ? '−' : '+'}${mg.toLocaleString('en-US', { maximumFractionDigits: 2 })} mg`;
}
