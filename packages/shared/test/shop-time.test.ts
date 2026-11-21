import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addShopDays,
  formatShopTime,
  SHOP_TIME_ZONE,
  shopDate,
  shopDateTime,
  shopDaysBetween,
  shopStartOfDay,
} from '../src/index.js';

// shared has no Node types; the tests only need process.env.TZ.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const originalTz = env.TZ;
const restoreTz = (): void => {
  if (originalTz === undefined) delete env.TZ;
  else env.TZ = originalTz;
};

const at = (iso: string): number => Date.parse(iso);

function shopTimeChecks(): void {
  it('S10 AC1: 2026-11-01T18:45Z is 2 November in the shop', () => {
    expect(shopDate(at('2026-11-01T18:45:00Z'))).toBe('2026-11-02');
    expect(shopDate(at('2026-11-01T18:29:59Z'))).toBe('2026-11-01');
    expect(shopDate(at('2026-11-01T18:30:00Z'))).toBe('2026-11-02');
  });
  it('S10 AC2: 09:00 Asia/Kolkata on 1 November is 03:30 UTC', () => {
    expect(new Date(shopDateTime('2026-11-01', 9, 0)).toISOString()).toBe('2026-11-01T03:30:00.000Z');
    expect(new Date(shopDateTime('2026-11-02', 0, 5)).toISOString()).toBe('2026-11-01T18:35:00.000Z');
  });
  it('finds the start of the shop day across the UTC day boundary', () => {
    expect(new Date(shopStartOfDay(at('2026-11-01T18:45:00Z'))).toISOString()).toBe('2026-11-01T18:30:00.000Z');
    expect(new Date(shopStartOfDay(at('2026-11-01T10:00:00Z'))).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
  it('adds calendar days across month and year ends', () => {
    expect(addShopDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addShopDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addShopDays('2026-11-01', -1)).toBe('2026-10-31');
  });
  it('counts whole shop days between two moments', () => {
    expect(shopDaysBetween(at('2026-11-01T18:45:00Z'), at('2026-11-01T10:00:00Z'))).toBe(1);
    expect(shopDaysBetween(at('2026-11-01T18:00:00Z'), at('2026-11-01T00:00:00Z'))).toBe(0);
    expect(shopDaysBetween(at('2026-11-01T00:00:00Z'), at('2026-11-03T00:00:00Z'))).toBe(-2);
  });
  it('formats a moment in shop time with its +05:30 offset', () => {
    expect(formatShopTime(at('2026-11-01T03:30:00Z'))).toBe('2026-11-01T09:00:00.000+05:30');
    expect(formatShopTime(at('2026-11-01T18:45:12.345Z'))).toBe('2026-11-02T00:15:12.345+05:30');
  });
}

describe('shop time (EP-10-S10)', () => {
  it('uses Asia/Kolkata', () => {
    expect(SHOP_TIME_ZONE).toBe('Asia/Kolkata');
  });
  describe('in the machine zone', shopTimeChecks);
});

// S10 AC4: the same answers whatever zone the server runs in.
describe.each([
  ['UTC', 0],
  ['America/New_York', 300],
])('shop time with the machine zone TZ=%s (EP-10-S10 AC4)', (tz, offsetMinutes) => {
  beforeEach(() => {
    env.TZ = tz;
  });
  afterEach(restoreTz);
  it('runs in that zone', () => {
    expect(new Date(at('2026-11-02T12:00:00Z')).getTimezoneOffset()).toBe(offsetMinutes);
  });
  shopTimeChecks();
});
