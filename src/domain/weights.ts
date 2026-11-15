/**
 * Weights are grams as numbers. Every comparison is done on integers in "units" of 0.00001 g,
 * so a gap of exactly zero is really zero. Format only at the edge, with fmtG / fmtMg.
 */

/** Units per gram (1 unit = 0.00001 g = 0.01 mg). Four-decimal weights are multiples of 10 units. */
export const UNITS_PER_G = 100000;

export const toU = (g: number): number => Math.round(g * UNITS_PER_G);
export const fromU = (u: number): number => u / UNITS_PER_G;

/** Round a gram figure to four decimals, without float drift. */
export const round4 = (g: number): number => Math.round(g * 10000) / 10000;

/** Net gold of a piece or parcel: gross minus stones, exact to the unit. */
export function netOf(w: { grossG: number; stoneG: number }): number {
  return fromU(toU(w.grossG) - toU(w.stoneG));
}

export function sumG(values: number[]): number {
  return fromU(values.reduce((a, v) => a + toU(v), 0));
}

/** "447.3000", with thousands separators from 1,000 up ("9,480.5158"). */
export function fmtG(g: number): string {
  const v = Math.round(g * 10000) / 10000 + 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Dashboard figure, one decimal: "1,847.2". */
export function fmtG1(g: number): string {
  const v = Math.round(g * 10) / 10 + 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Signed gram figure for gaps shown in grams: "+0.0003" / "-0.1380". */
export function fmtSignedG(g: number): string {
  const s = fmtG(Math.abs(g));
  return g > 0 ? `+${s}` : g < 0 ? `-${s}` : s;
}

/** Drop trailing zeros: 0.0001 -> "0.0001", 0.01 -> "0.01". */
export function trimNum(n: number): string {
  return String(Math.round(n * 1e8) / 1e8);
}

/** A gap in grams, shown in milligrams: 0.138 -> "138 mg", 0.00065 -> "0.65 mg". */
export function fmtMg(g: number): string {
  const mg = Math.round(Math.abs(g) * 1000 * 100) / 100;
  return `${mg.toLocaleString('en-US', { maximumFractionDigits: 2 })} mg`;
}

/** Parse what a person typed into a weight field. Returns null when it is not a usable weight. */
export function parseWeight(text: string): number | null {
  const t = text.replace(/,/g, '').trim();
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return null;
  return Number(t);
}
