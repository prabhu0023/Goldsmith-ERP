/**
 * When recurring jobs are due (EP-10-S1, S10). `every` slots count N-minute steps since the
 * epoch in UTC; `daily` times are Asia/Kolkata wall times on a shop date.
 */
import { MIN, shopDateTime } from '@goldsmith/shared';

/** Start (UTC ms) of the N-minute slot containing `now`. */
export const everySlot = (now: number, minutes: number): number => Math.floor(now / (minutes * MIN)) * minutes * MIN;

/** UTC ms of `hour:minute` Asia/Kolkata on shop date `date` (YYYY-MM-DD). */
export const dailyOccurrence = (date: string, hour: number, minute: number): number => shopDateTime(date, hour, minute);
