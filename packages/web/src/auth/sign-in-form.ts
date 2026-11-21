import { normaliseIndianMobile } from '@goldsmith/shared';
export interface SignInFormErrors {
  phoneError?: string;
  passwordError?: string;
}
/** Field errors for the sign-in form; an empty object means the form may be sent. */
export function validateSignInForm({ phone, password }: { phone: string; password: string }): SignInFormErrors {
  const errors: SignInFormErrors = {};
  if (normaliseIndianMobile(phone) === null) errors.phoneError = 'Enter a 10-digit mobile number.';
  if (password.length === 0) errors.passwordError = 'Enter your password.';
  return errors;
}
/** True when the form has no field errors. */
export const isSignInFormValid = (errors: SignInFormErrors): boolean => !errors.phoneError && !errors.passwordError;
