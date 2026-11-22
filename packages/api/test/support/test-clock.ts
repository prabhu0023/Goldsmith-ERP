/** A server clock tests can move: lockout, rate-limit windows and session expiry (EP-04). */
import type { Clock } from '../../src/pipeline/server-clock.js';

export interface MutableClock extends Clock {
  advance(ms: number): void;
  set(date: Date): void;
}

export function mutableClock(start: Date): MutableClock {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance(ms) {
      t += ms;
    },
    set(date) {
      t = date.getTime();
    },
  };
}
