import type { PieceEdit } from '../types/jewellery.js';
import { MIN } from './clock.js';

export const TOKEN_TTL_MS = 10 * MIN;

/** Six digits, derived from the store's counter so transitions stay pure. */
export function makeToken(seq: number): string {
  return String(((seq * 7919 + 480913) % 900000) + 100000);
}

/** "480913" -> "480 913". */
export const formatToken = (t: string): string => `${t.slice(0, 3)} ${t.slice(3)}`;

const clean = (t: string): string => t.replace(/\s+/g, '');

export type TokenCheck = 'ok' | 'wrong' | 'expired' | 'none';

export function checkToken(edit: PieceEdit, entered: string, now: number): TokenCheck {
  if (!edit.token || edit.tokenIssuedAt === null) return 'none';
  if (now - edit.tokenIssuedAt > TOKEN_TTL_MS) return 'expired';
  return clean(entered) === edit.token ? 'ok' : 'wrong';
}

export const tokenValid = (edit: PieceEdit, entered: string, now: number): boolean => checkToken(edit, entered, now) === 'ok';
