import { describe, expect, it } from 'vitest';
import { isSignInFormValid, validateSignInForm } from './sign-in-form';
describe('validateSignInForm', () => {
  it('gives a phone error for "12345"', () => {
    const errors = validateSignInForm({ phone: '12345', password: 'counter-2026' });
    expect(errors.phoneError).toBe('Enter a 10-digit mobile number.');
    expect(isSignInFormValid(errors)).toBe(false);
  });
  it('accepts "98410 11111" with a password', () => {
    const errors = validateSignInForm({ phone: '98410 11111', password: 'counter-2026' });
    expect(errors).toEqual({});
    expect(isSignInFormValid(errors)).toBe(true);
  });
  it('gives a password error for an empty password', () => {
    const errors = validateSignInForm({ phone: '98410 11111', password: '' });
    expect(errors.passwordError).toBe('Enter your password.');
    expect(errors.phoneError).toBeUndefined();
  });
});
