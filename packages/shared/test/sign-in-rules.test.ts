import { describe, expect, it } from 'vitest';
import { LANDING_ROUTES, normaliseIndianMobile, PASSWORD_MIN_LENGTH, passwordProblem } from '../src/index.js';
describe('normaliseIndianMobile (EP-04-S3, D4)', () => {
  it.each([
    ['+91 98410 11111', '+919841011111'],
    ['98410 11111', '+919841011111'],
    ['9841011111', '+919841011111'],
    ['09841011111', '+919841011111'],
    ['919841011111', '+919841011111'],
    ['+91-98400-10101', '+919840010101'],
    ['6000000000', '+916000000000'],
  ])('reads %s as %s', (text, e164) => {
    expect(normaliseIndianMobile(text)).toBe(e164);
  });
  it.each(['98410', '', '12345', '5841011111', '+1 98410 11111', '0091 98410 11111', '98410111112', 'abcdefghij'])(
    'refuses %j',
    (text) => {
      expect(normaliseIndianMobile(text)).toBeNull();
    },
  );
});
describe('passwordProblem (EP-04-S2)', () => {
  it('refuses a password shorter than 8 characters with the policy sentence', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(passwordProblem('gold26')).toBe('Use at least 8 characters.');
  });
  it('accepts 8 characters or more', () => {
    expect(passwordProblem('gold2026')).toBeNull();
    expect(passwordProblem('counter-2026')).toBeNull();
  });
});
describe('LANDING_ROUTES', () => {
  it('opens each role on its first screen', () => {
    expect(LANDING_ROUTES).toEqual({ staff: 'today', owner: 'decisions', karigar: 'k-jobs' });
  });
});
