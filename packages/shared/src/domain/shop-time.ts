/**
 * Shop time (EP-10-S10). Times are stored and passed in UTC; the shop's calendar day and wall
 * clock are those of Asia/Kolkata, whatever zone the machine runs in. Nothing here reads the
 * machine's local zone (unlike `startOfDay`, `sameDay` and `daysBetween` in clock.ts, which the
 * prototype screens use).
 */
import { DAY, MIN } from './clock.js';

export const SHOP_TIME_ZONE = 'Asia/Kolkata';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: SHOP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallTime(at: number): WallTime {
  const p: Record<string, number> = {};
  for (const part of parts.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}

/** Offset of the shop zone from UTC at `at`, in ms (Asia/Kolkata: +5 h 30 min). */
function offsetMs(at: number): number {
  const w = wallTime(at);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - (at - (((at % 1000) + 1000) % 1000));
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

function parseDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Not a date (YYYY-MM-DD): ${JSON.stringify(date)}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** The shop's calendar date at `at`, as YYYY-MM-DD. */
export function shopDate(at: number): string {
  const w = wallTime(at);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** The UTC moment (ms) of wall time `hour:minute` on shop date `date`. */
export function shopDateTime(date: string, hour: number, minute: number): number {
  const { year, month, day } = parseDate(date);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(guess);
  // Re-read the offset at the result, so a zone whose offset changes near the guess still lands right.
  return guess - offsetMs(first);
}

/** The UTC moment (ms) the shop's day containing `at` began (midnight Asia/Kolkata). */
export const shopStartOfDay = (at: number): number => shopDateTime(shopDate(at), 0, 0);

/** Shop date `n` calendar days after `date` (negative = before). */
export function addShopDays(date: string, n: number): string {
  const { year, month, day } = parseDate(date);
  const d = new Date(Date.UTC(year, month - 1, day) + n * DAY);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole shop calendar days from `earlier` to `later` (later on a following shop day = positive). */
export function shopDaysBetween(later: number, earlier: number): number {
  const a = parseDate(shopDate(later));
  const b = parseDate(shopDate(earlier));
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY);
}

/** ISO 8601 in shop time with its offset, e.g. 2026-11-01T09:00:00.000+05:30. */
export function formatShopTime(at: number): string {
  const w = wallTime(at);
  const ms = ((at % 1000) + 1000) % 1000;
  const offsetMin = Math.round(offsetMs(at) / MIN);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  return (
    `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}.${pad(ms, 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
