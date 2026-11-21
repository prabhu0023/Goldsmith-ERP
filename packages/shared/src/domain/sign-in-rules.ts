/**
 * Sign-in rules shared by web and api (EP-04, D4): the phone number format, the password policy,
 * where each role lands after sign-in, and every sentence a person sees.
 */
import type { RoleId } from '../types/jewellery.js';
/**
 * An Indian mobile number in E.164 form ("+919841011111"), or null. Only the digits count:
 * 10 digits starting 6 to 9, optionally after "91" or "0". The migration's users.phone_e164
 * column applies the same rule in SQL.
 */
export function normaliseIndianMobile(text: string): string | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  if (/^(91|0)[6-9][0-9]{9}$/.test(digits)) return `+91${digits.slice(-10)}`;
  return null;
}
export const PASSWORD_MIN_LENGTH = 8;
/** The sentence that refuses a password, or null when it follows the policy (EP-04-S2). */
export function passwordProblem(password: string): string | null {
  return password.length < PASSWORD_MIN_LENGTH ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : null;
}
/** The screen each role opens after sign-in. */
export const LANDING_ROUTES = {
  staff: 'today',
  owner: 'decisions',
  karigar: 'k-jobs',
} as const satisfies Record<RoleId, string>;
export type LandingRoute = (typeof LANDING_ROUTES)[RoleId];
/** Every sentence of the sign-in screens. `lockedPrefix` is followed by "HH:MM." (Asia/Kolkata). */
export const AUTH_MESSAGES = {
  wrongPassword: 'Phone number or password is wrong.',
  lockedPrefix: 'Too many wrong passwords. Try again after ',
  rateLimited: 'Too many requests. Wait a few minutes and try again.',
  resetRequested: "If that number is registered, we've sent an email",
  activationLinkUsed: 'This link has already been used.',
  activationLinkExpired: 'This link has expired. Ask the shop owner to send a new one.',
  resetLinkExpired: 'This link has expired. Ask for a new one.',
  passwordSet: 'Password set. Sign in with your phone number.',
  sessionEnded: 'Your session has ended. Sign in again.',
  firstOwnerExists: 'The first owner has already been created.',
} as const;
