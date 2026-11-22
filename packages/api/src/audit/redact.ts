/**
 * What never reaches an audit entry (EP-04-S14, EP-06-S3 AC4, AC5): secret-like keys, unmasked
 * phones and emails, and money. Both functions return a copy and work at any depth.
 */
import { maskEmail, maskPhone } from '../auth/mask.js';

const SECRET_KEY = /password|token|link|secret|code/i;
/** Keys that match SECRET_KEY but hold no secret: the shop rule "an edit needs a token" (EP-06-S8). */
const NOT_SECRET_KEYS: ReadonlySet<string> = new Set(['requireEditToken']);

const PHONE_KEY = /phone/i;

const EMAIL_KEY = /email/i;

/** A copy of `value` without secret-like keys at any depth, with phones and emails masked. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && !NOT_SECRET_KEYS.has(key)) continue;
    if (typeof child === 'string' && PHONE_KEY.test(key)) out[key] = maskPhone(child);
    else if (typeof child === 'string' && EMAIL_KEY.test(key)) out[key] = maskEmail(child);
    else out[key] = redactSecrets(child);
  }
  return out;
}

/** Money keys: amounts in rupees (`…INR`), prices and amounts. The app never logs money (BR-06). */
const isMoneyKey = (key: string): boolean => /INR$/.test(key) || /price|amount/i.test(key);

/** A copy of `value` without money keys at any depth. */
export function stripMoney(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMoney);
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isMoneyKey(key)) out[key] = stripMoney(child);
  }
  return out;
}
