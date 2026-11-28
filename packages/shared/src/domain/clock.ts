/**
 * The demo "now": Sunday 1 November 2026, 11:06, then moving with real elapsed time since load.
 * Seed data is laid out around DEMO_BASE so the SLA and overdue states are the same every run.
 */
const localTime = (y: number, month: number, d: number, h: number, min: number, sec: number): number => new Date(y, month, d, h, min, sec).getTime();
// Marked pure so a build that never reads the demo clock (the production web bundle) drops it.
export const DEMO_BASE = /* @__PURE__ */ localTime(2026, 10, 1, 11, 6, 0);
const loadedAt = Date.now();

export const demoNow = (): number => DEMO_BASE + (Date.now() - loadedAt);

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const hoursAgo = (h: number, from: number = DEMO_BASE): number => from - h * HOUR;
export const daysAgo = (d: number, from: number = DEMO_BASE): number => from - d * DAY;
/** Midnight at the start of the day containing `at`. */
export const startOfDay = (at: number): number => {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** A due date: midnight, `d` days from today (negative = in the past). */
export const dueIn = (d: number, from: number = DEMO_BASE): number => startOfDay(from) + d * DAY;

export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fmtDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDayMonth(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtLongDate(at: number): string {
  const d = new Date(at);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDateTime(at: number): string {
  return `${fmtDayMonth(at)}, ${fmtTime(at)}`;
}

/** "40 min ago", "9 h ago", "3 days ago". */
export function ago(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Whole days between two moments (a later than b = positive). */
export const daysBetween = (a: number, b: number): number => Math.floor((startOfDay(a) - startOfDay(b)) / DAY);

/** True when an ISO date (YYYY-MM-DD) falls on today's month and day. */
export function isMonthDayToday(iso: string | null, now: number): boolean {
  if (!iso) return false;
  const d = new Date(now);
  const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return iso.slice(5) === md;
}
