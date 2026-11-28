import { describe, expect, it } from 'vitest';
import { accountLabel, isoDateLabel, jobStatusLabel, againstAllowance, bpToPercent, karigarFieldErrors, karigarRefusal, lossLabel, percentToBp, wastageInRange } from './karigar-rows';
describe('karigar rows (EP-16)', () => {
  it('percent text becomes whole basis points by integer math', () => {
    expect(percentToBp('0.7')).toBe(70);
    expect(percentToBp('1.2')).toBe(120);
    expect(percentToBp('0.6')).toBe(60);
    expect(percentToBp('1.12')).toBe(112);
    expect(percentToBp('1')).toBe(100);
    expect(percentToBp('0.705')).toBeNull();
    expect(percentToBp('abc')).toBeNull();
    expect(percentToBp('')).toBeNull();
    expect(percentToBp('-1')).toBeNull();
  });
  it('basis points show as percent with two decimals', () => {
    expect(bpToPercent(70)).toBe('0.70');
    expect(bpToPercent(142)).toBe('1.42');
    expect(bpToPercent(5)).toBe('0.05');
    expect(lossLabel(142)).toBe('1.42%');
    expect(lossLabel(null)).toBe('None yet');
  });
  it('the loss against the allowance carries its sign', () => {
    expect(againstAllowance(142, 80)).toBe('+0.62%');
    expect(againstAllowance(70, 80)).toBe('-0.10%');
    expect(againstAllowance(80, 80)).toBe('0.00%');
  });
  it('the allowance range is 0.6% to 1.2%', () => {
    expect(wastageInRange(60)).toBe(true);
    expect(wastageInRange(120)).toBe(true);
    expect(wastageInRange(59)).toBe(false);
    expect(wastageInRange(121)).toBe(false);
  });
  it('the form checks name, phone, email and specialties', () => {
    expect(karigarFieldErrors({ name: ' ', phone: '123', email: '', specialties: [] })).toEqual({
      name: 'Add the karigar name.',
      phone: 'Enter a 10-digit mobile number. Their job portal logs in with it.',
      email: 'Add the email address. The activation link goes there.',
      specialties: 'Pick at least one thing they are best at.',
    });
    expect(karigarFieldErrors({ name: 'Lakshmi Devi', phone: '+91 94431 55082', email: 'l@example.com', specialties: ['Temple'] })).toEqual({});
  });
  it('a validation refusal on a form field shows on the field; anything else is a notice', () => {
    expect(karigarRefusal(null)).toBeNull();
    expect(karigarRefusal({ code: 'validation', message: 'Taken.', field: 'phone' })).toEqual({ field: 'phone', message: 'Taken.' });
    expect(karigarRefusal({ code: 'validation', message: 'Bad.', field: 'cursor' })).toEqual({ notice: 'Bad.' });
    expect(karigarRefusal({ code: 'rule_refused', message: 'The wastage allowance is between 0.6% and 1.2%.' })).toEqual({
      notice: 'The wastage allowance is between 0.6% and 1.2%.',
    });
  });
  it('dates and job statuses read as words', () => {
    expect(isoDateLabel('2026-11-06T00:00:00.000Z')).toBe('6 Nov 2026');
    expect(isoDateLabel('not a date')).toBe('not a date');
    expect(jobStatusLabel('on_bench')).toBe('On the bench');
  });
  it('the account status has a sentence each', () => {
    expect(accountLabel('none')).toBe('No portal access');
    expect(accountLabel('pending_activation')).toBe('Awaiting activation');
  });
});
