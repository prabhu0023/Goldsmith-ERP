import { shopDate } from '@goldsmith/shared';
/** The shop's clock as the server reports it, so a wrong device clock changes nothing on screen. */
export interface ServerClock {
  /** The server's time now, in ms since the epoch. */
  now(): number;
  /** The shop's calendar date now (Asia/Kolkata), YYYY-MM-DD. */
  shopToday(): string;
}
/**
 * `serverTimeIso` is the server's time in the session answer. The offset between it and the
 * browser clock is fixed when the answer arrives; `now()` is the browser clock plus that offset,
 * so time keeps moving without another request (EP-08-S12 AC3, AC5).
 */
export function createServerClock(serverTimeIso: string, nowFn: () => number = Date.now): ServerClock {
  const offset = Date.parse(serverTimeIso) - nowFn();
  const now = () => nowFn() + offset;
  return { now, shopToday: () => shopDate(now()) };
}
