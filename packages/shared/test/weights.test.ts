import { describe, expect, it } from 'vitest';
import { fmtG, fmtMg, fmtSignedG, netOf, parseWeight, sumG, toU, UNITS_PER_G } from '../src/index.js';

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
