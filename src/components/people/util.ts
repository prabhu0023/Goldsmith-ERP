import type { Customer } from '../../types/jewellery';
import { sumG } from '../../domain/weights';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A birthday or anniversary is stored as an ISO date. Only the day and month matter for wishes,
 * so the form asks for those two and stores them under the leap year 2000 (no real year is invented).
 */
export function dayMonthToIso(day: string, month: string): string | null {
  if (!day || !month) return null;
  return `2000-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** "14 Mar" from an ISO date, or an empty string. */
export function dayMonthLabel(iso: string | null): string {
  if (!iso) return '';
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return m >= 1 && m <= 12 && d >= 1 ? `${d} ${MONTHS[m - 1]}` : '';
}

/** Days in a month, counting 29 for February (the stored year is a leap year). */
export const daysInMonth = (month: number): number => new Date(2000, month, 0).getDate();

/** Pure gold the customer has taken home, in grams. */
export const takenHomeG = (c: Customer): number => sumG(c.history.map((h) => h.pureG));

/** Loose phone check: 10 digits at least, once the +91 and spaces are ignored. */
export const phoneLooksValid = (phone: string): boolean => phone.replace(/\D/g, '').length >= 10;
