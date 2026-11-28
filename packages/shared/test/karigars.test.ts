import { describe, expect, it } from 'vitest';
import {
  assertWastageBp,
  averageUnits,
  contract,
  DomainError,
  daysLate,
  isWastageBp,
  KARIGAR_MESSAGES,
  karigarInactiveMessage,
  lossBp,
  openJobsMessage,
  unitsToGrams,
  WASTAGE_MAX_BP,
  WASTAGE_MIN_BP,
  wastageExampleUnits,
} from '../src/index.js';

describe('wastage allowance (EP-16-S3, S5)', () => {
  it('accepts 60 to 120 whole basis points and refuses the rest with the range sentence', () => {
    expect([WASTAGE_MIN_BP, WASTAGE_MAX_BP]).toEqual([60, 120]);
    for (const bp of [60, 70, 90, 120]) expect(() => assertWastageBp(bp)).not.toThrow();
    for (const bp of [59, 121, 50, 150, 70.5, Number.NaN]) {
      expect(isWastageBp(bp), String(bp)).toBe(false);
      expect(() => assertWastageBp(bp), String(bp)).toThrow(DomainError);
      expect(() => assertWastageBp(bp)).toThrow('The wastage allowance is between 0.6% and 1.2%.');
    }
  });
  it('S3 AC5: 0.70% on a 160 g job is 11200 units, shown 1.1200 g', () => {
    expect(wastageExampleUnits(70)).toBe(11200);
    expect(unitsToGrams(wastageExampleUnits(70))).toBe('1.1200');
    expect(wastageExampleUnits(80, 1_000_000)).toBe(8000);
    expect(wastageExampleUnits(65, 1)).toBe(0);
  });
});

describe('scorecard arithmetic (EP-16-S10)', () => {
  it('AC1: rounds a loss of 141.6 basis points to 142, half up', () => {
    expect(lossBp(2266, 160_000)).toBe(142);
    expect(lossBp(5, 10_000)).toBe(5);
    expect(lossBp(1, 20_000)).toBe(1);
    expect(lossBp(0, 20_000)).toBe(0);
  });
  it('has no loss until something was issued', () => {
    expect(lossBp(0, 0)).toBeNull();
  });
  it('averages whole numbers half up and has no average of an empty list', () => {
    expect(averageUnits([])).toBeNull();
    expect(averageUnits([1, 2])).toBe(2);
    expect(averageUnits([138, 20, 40, 0, 80, 100])).toBe(63);
    expect(averageUnits([5])).toBe(5);
  });
  it('counts whole shop days after the agreed date, never negative', () => {
    expect(daysLate('2026-11-10', '2026-11-13')).toBe(3);
    expect(daysLate('2026-11-10', '2026-11-10')).toBe(0);
    expect(daysLate('2026-11-10', '2026-11-08')).toBe(0);
    expect(daysLate('2026-02-27', '2026-03-02')).toBe(3);
    expect(() => daysLate('soon', '2026-03-02')).toThrow();
  });
});

describe('karigar messages', () => {
  it('names the karigar and the jobs', () => {
    expect(karigarInactiveMessage('Ravi Achari')).toBe('Ravi Achari is no longer active. Pick another karigar.');
    expect(openJobsMessage('KG-04', ['MO-2026-118', 'MO-2026-120'])).toBe(
      'KG-04 has open jobs: MO-2026-118, MO-2026-120. Hand them over before deactivating.',
    );
    expect(KARIGAR_MESSAGES.nameRequired).toBe('Add the karigar name.');
    expect(KARIGAR_MESSAGES.specialtyRequired).toBe('Pick at least one thing they are best at.');
  });
});

describe('karigar contract (EP-16)', () => {
  const details = {
    karigarId: 'KG-01',
    version: 1,
    name: 'Lakshmi Devi',
    phone: '98400 10101',
    email: 'kg-01@example.com',
    specialties: ['Chettinad'],
  };
  it('creates with a code id and normalises the phone', () => {
    const parsed = contract.onboardKarigar.input.parse({
      name: 'Ravi Achari',
      phone: '98400 50505',
      email: 'ravi.achari@example.com',
      specialties: ['Temple', 'Kundan'],
      wastageBp: 90,
    });
    expect(parsed.phone).toBe('+919840050505');
    expect(contract.onboardKarigar.kind).toBe('create');
  });
  it('lets an empty name or an empty specialty list through, for the handler to answer in a sentence', () => {
    const input = { name: '', phone: '98400 50505', email: 'a@example.com', specialties: [], wastageBp: 90 };
    expect(contract.onboardKarigar.input.safeParse(input).success).toBe(true);
  });
  it('refuses a fractional basis point and an email that is not one', () => {
    const base = { name: 'Ravi', phone: '98400 50505', email: 'a@example.com', specialties: ['Temple'] };
    expect(contract.onboardKarigar.input.safeParse({ ...base, wastageBp: 70.5 }).success).toBe(false);
    expect(contract.onboardKarigar.input.safeParse({ ...base, wastageBp: 70, email: 'nope' }).success).toBe(false);
  });
  it('S4 AC6: updateKarigarDetails refuses wastageBp, status and id keys', () => {
    expect(contract.updateKarigarDetails.input.safeParse(details).success).toBe(true);
    for (const extra of [{ wastageBp: 100 }, { status: 'deactivated' }, { id: 'x' }]) {
      expect(contract.updateKarigarDetails.input.safeParse({ ...details, ...extra }).success).toBe(false);
    }
  });
  it('takes only active or deactivated as a status', () => {
    const base = { karigarId: 'KG-01', version: 1 };
    expect(contract.updateKarigarStatus.input.safeParse({ ...base, status: 'deactivated' }).success).toBe(true);
    expect(contract.updateKarigarStatus.input.safeParse({ ...base, status: 'gone' }).success).toBe(false);
  });
});
