/**
 * The server clock (EP-03-S3). Every operation's `at` comes from here, in UTC; never from the
 * request. Tests pass a fixed clock.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** A clock that always answers `date` (tests). */
export function fixedClock(date: Date): Clock {
  return { now: () => new Date(date.getTime()) };
}
