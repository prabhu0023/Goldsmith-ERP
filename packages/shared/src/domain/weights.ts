/**
 * Weights are grams as numbers. Every comparison is done on integers in "units" of 0.00001 g,
 * so a gap of exactly zero is really zero. Format only at the edge, with fmtG / fmtMg.
 *
 * Storage (gap G10, settled in EP-02): the database keeps every weight as an integer number of
 * 0.0001 g units (STORED_UNITS_PER_G). Convert typed text with gramsToUnits and back with
 * unitsToGrams; both are exact (no floating-point multiply).
 */

/**
 * Units per gram for in-memory comparison (1 unit = 0.00001 g = 0.01 mg). Four-decimal weights
 * are multiples of 10 units. It stays at 100000 for the match ceiling arithmetic, which needs
 * half-steps, until EP-23. Stored weights use STORED_UNITS_PER_G instead.
 */
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

/** Stored units per gram: the database keeps weights as integers of 0.0001 g (EP-02-S2). */
export const STORED_UNITS_PER_G = 10000;

export type WeightParse = { ok: true; units: number } | { ok: false; error: string };

/**
 * Exact conversion of a gram figure like "12.3456" or "-0.0400" to stored units (123456, -400).
 * Accepts up to four decimals; anything else (more decimals, commas, letters, "1.", ".5", "+1")
 * is rejected. Built digit by digit, never as Number(text) * 10000.
 */
export function gramsToUnits(text: string): WeightParse {
  const t = text.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(t);
  if (!m) return { ok: false, error: 'Enter grams with up to four decimals, e.g. 12.3456' };
  const [, sign, intPart, frac = ''] = m;
  const abs = Number(intPart) * STORED_UNITS_PER_G + Number(frac.padEnd(4, '0'));
  if (!Number.isSafeInteger(abs)) return { ok: false, error: 'Weight is too large' };
  const units = sign === '-' && abs !== 0 ? -abs : abs;
  return { ok: true, units };
}

/** Stored units back to a four-decimal gram string: 123456 -> "12.3456", -400 -> "-0.0400". */
export function unitsToGrams(units: number): string {
  if (!Number.isSafeInteger(units)) throw new RangeError(`Weight units must be an integer: ${units}`);
  const abs = Math.abs(units);
  const whole = Math.trunc(abs / STORED_UNITS_PER_G);
  const rest = String(abs % STORED_UNITS_PER_G).padStart(4, '0');
  return `${units < 0 ? '-' : ''}${whole}.${rest}`;
}

/** Net gold in stored units: gross minus stones, integer subtraction. */
export function netUnits(grossUnits: number, stoneUnits: number): number {
  return grossUnits - stoneUnits;
}
