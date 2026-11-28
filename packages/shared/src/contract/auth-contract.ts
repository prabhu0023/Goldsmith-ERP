/**
 * The sign-in operations (EP-04), served by `POST /api/auth/:operation`. A separate object from
 * `contract`: these calls may run without a session and set or clear the session cookie, so the
 * generic operation router never serves them. The shop is never sent; the server finds it.
 */
import { z } from 'zod';
import { normaliseIndianMobile } from '../domain/sign-in-rules.js';
import { okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';
/** A typed mobile number; the handler receives it in E.164 form ("+919841011111"). */
export const phoneField = z.string().transform((text, ctx) => {
  const phone = normaliseIndianMobile(text);
  if (phone === null) {
    ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number.' });
    return z.NEVER;
  }
  return phone;
});
/** The signed-in person and the screen they open. */
export const sessionResult = z.object({
  ok: z.literal(true),
  user: z.object({
    userId: z.string(),
    name: z.string(),
    role: z.enum(['owner', 'staff', 'karigar']),
  }),
  landingRoute: z.enum(['today', 'decisions', 'k-jobs']),
  /** The role's permission list (EP-05-S12 AC5); the web hides what the role may not do. */
  permissions: z.array(z.string()),
  /** The shop's name, for the shell header (EP-08-S12). */
  shopName: z.string(),
  /** The server's time (ISO), so the web can show shop-day dates without trusting the device clock (EP-08-S14). */
  serverTime: z.iso.datetime(),
});
const passwordLinkInput = z.object({ token: z.string().min(1), password: z.string() });
export const authContract = {
  signIn: defineOperation({
    name: 'signIn',
    kind: 'command',
    input: z.object({
      phone: phoneField,
      password: z.string(),
      deviceLabel: z.string().trim().max(80).optional(),
    }),
    result: sessionResult,
    errors: ERROR_CODES,
  }),
  readCurrentSession: defineOperation({
    name: 'readCurrentSession',
    kind: 'read',
    input: z.object({}),
    result: sessionResult,
    errors: ERROR_CODES,
  }),
  signOut: defineOperation({
    name: 'signOut',
    kind: 'command',
    input: z.object({}),
    result: okResult,
    errors: ERROR_CODES,
  }),
  requestPasswordReset: defineOperation({
    name: 'requestPasswordReset',
    kind: 'command',
    input: z.object({ phone: phoneField }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  checkPasswordLink: defineOperation({
    name: 'checkPasswordLink',
    kind: 'read',
    input: z.object({ token: z.string().min(1), purpose: z.enum(['activation', 'reset']) }),
    result: z.object({ ok: z.literal(true), state: z.enum(['valid', 'used', 'expired']) }),
    errors: ERROR_CODES,
  }),
  activateAccount: defineOperation({
    name: 'activateAccount',
    kind: 'command',
    input: passwordLinkInput,
    result: okResult,
    errors: ERROR_CODES,
  }),
  resetPassword: defineOperation({
    name: 'resetPassword',
    kind: 'command',
    input: passwordLinkInput,
    result: okResult,
    errors: ERROR_CODES,
  }),
  createFirstOwner: defineOperation({
    name: 'createFirstOwner',
    kind: 'command',
    input: z.object({
      name: z.string().trim().min(1),
      phone: phoneField,
      email: z.email(),
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
} as const;
export type AuthOperationName = keyof typeof authContract;
export type AuthInput<N extends AuthOperationName> = z.input<(typeof authContract)[N]['input']>;
export type AuthArgs<N extends AuthOperationName> = z.output<(typeof authContract)[N]['input']>;
export type AuthResult<N extends AuthOperationName> = z.output<(typeof authContract)[N]['result']>;
