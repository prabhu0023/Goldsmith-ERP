import { describe, expect, it } from 'vitest';
import {
  fmtG,
  fmtMg,
  fmtSignedG,
  gramsToUnits,
  netOf,
  netUnits,
  parseWeight,
  STORED_UNITS_PER_G,
  sumG,
  toU,
  UNITS_PER_G,
  unitsToGrams,
} from '../src/index.js';

describe('weights', () => {
  it('keeps the unit constant at 100000 per gram (gap G10, settled in EP-02)', () => {
    expect(UNITS_PER_G).toBe(100000);
    expect(toU(0.0001)).toBe(10);
  });

  it('formats grams to four decimals with thousands separators', () => {
    expect(fmtG(447.3)).toBe('447.3000');
    expect(fmtG(9480.5158)).toBe('9,480.5158');
    expect(fmtG(-0)).toBe('0.0000');
  });

  it('formats signed gaps and milligram gaps', () => {
    expect(fmtSignedG(0.0003)).toBe('+0.0003');
    expect(fmtSignedG(-0.138)).toBe('-0.1380');
    expect(fmtMg(0.138)).toBe('138 mg');
    expect(fmtMg(0.00065)).toBe('0.65 mg');
  });

  it('subtracts and sums on integer units, without float drift', () => {
    expect(netOf({ grossG: 10.3, stoneG: 0.1 })).toBe(10.2);
    expect(sumG([0.1, 0.2])).toBe(0.3);
  });

  it('parses typed weights and rejects unusable input', () => {
    expect(parseWeight('1,234.5678')).toBe(1234.5678);
    expect(parseWeight('1.23456')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
  });
});

describe('stored weight units (0.0001 g, EP-02-S2)', () => {
  const units = (text: string): number => {
    const r = gramsToUnits(text);
    if (!r.ok) throw new Error(`rejected ${text}: ${r.error}`);
    return r.units;
  };
  it('uses 10000 stored units per gram', () => {
    expect(STORED_UNITS_PER_G).toBe(10000);
  });
  it('converts 12.3456 g to 123456 units and back', () => {
    expect(units('12.3456')).toBe(123456);
    expect(unitsToGrams(123456)).toBe('12.3456');
  });
  it('round-trips the S2 example values', () => {
    expect(unitsToGrams(units('48.65'))).toBe('48.6500');
    expect(unitsToGrams(units('0.0001'))).toBe('0.0001');
    expect(unitsToGrams(units('0'))).toBe('0.0000');
    expect(unitsToGrams(units('146.3632'))).toBe('146.3632');
    expect(unitsToGrams(units('30000'))).toBe('30000.0000');
  });
  it('rejects text that is not an exact four-decimal gram figure', () => {
    for (const bad of ['12.34567', '12,3a', '', '1.', '.5', '+1']) {
      expect(gramsToUnits(bad).ok).toBe(false);
    }
  });
  it('handles negative weights and minus zero', () => {
    expect(units('-0.0400')).toBe(-400);
    expect(unitsToGrams(-400)).toBe('-0.0400');
    expect(units('-0')).toBe(0);
    expect(unitsToGrams(units('-0'))).toBe('0.0000');
  });
  it('rejects non-integer units', () => {
    expect(() => unitsToGrams(1.5)).toThrow();
  });
  it('subtracts stones from gross on integers', () => {
    // TAG-8841: 48.6500 g gross - 7.0600 g stones = 41.5900 g net.
    expect(netUnits(486500, 70600)).toBe(415900);
  });
  it('round-trips every unit from 0 to 20000', () => {
    for (let u = 0; u <= 20000; u++) {
      expect(units(unitsToGrams(u))).toBe(u);
    }
  });
});
describe('net weight and match ceiling on integer units (EP-40-S2)', () => {
  it('AC2: gross 485.5000 g less stones 38.2000 g is 447.3000 g net', () => {
    const net = netUnits(4855000, 382000);
    expect(net).toBe(4473000);
    expect(unitsToGrams(net)).toBe('447.3000');
  });
  it('names both units: 1 stored unit is 0.0001 g and is 10 comparison units of 0.00001 g', () => {
    expect(STORED_UNITS_PER_G).toBe(10000);
    expect(UNITS_PER_G / STORED_UNITS_PER_G).toBe(10);
  });
  it('refuses five decimals and a bare sign instead of rounding', () => {
    for (const bad of ['1.23456', '-1.23456', '0.00005', '-']) {
      expect(gramsToUnits(bad).ok, bad).toBe(false);
    }
    expect(gramsToUnits('-1')).toEqual({ ok: true, units: -10000 });
  });
});
