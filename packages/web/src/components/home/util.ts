import { fmtMg, fromU } from '@goldsmith/shared';
import { evaluate } from '../../store/selectors';
import type { AppState, Karigar, Parcel } from '@goldsmith/shared';

const WORDS = ['Nothing', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
/** 0 to 12 as a word ("Six"), larger numbers as digits. */
export const numberWord = (n: number): string => WORDS[n] ?? String(n);

export const plural = (n: number, one: string, many: string = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const firstName = (name: string): string => name.split(/\s+/)[0] ?? name;

export const greetingFor = (at: number): string => {
  const h = new Date(at).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** How far the tags are from the parcel's pure gold: signed grams (negative = the tags are short). */
export const netGapG = (s: AppState, p: Parcel): number => fromU(evaluate(s, p).gap.netU);

/** "138 mg short" / "12 mg over". */
export function gapPhrase(s: AppState, p: Parcel): string {
  const g = netGapG(s, p);
  return `${fmtMg(g)} ${g < 0 ? 'short' : 'over'}`;
}

/** Average of the karigar's recent parcel gaps, in mg. */
export const avgGapMg = (k: Karigar): number => (k.gapsMg.length ? Math.round(k.gapsMg.reduce((a, b) => a + b, 0) / k.gapsMg.length) : 0);
