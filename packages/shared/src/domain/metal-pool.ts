/**
 * The metal pool rules (EP-18): the ledger kinds, the sentences a person reads, and the integer
 * arithmetic the server and the screens share. Every figure is an integer number of 0.0001 g
 * (STORED_UNITS_PER_G); nothing here uses floating point for weight.
 */
import { gramsToUnits } from './weights.js';

/** The kinds of ledger entry. Issued is negative; opening, returned and recovered are positive; adjustment is either. */
export const POOL_ENTRY_KINDS = ['opening', 'issued', 'returned', 'recovered', 'adjustment'] as const;
export type PoolEntryKind = (typeof POOL_ENTRY_KINDS)[number];

/** What an entry's reference points at: a karigar job or a piece. */
export const POOL_REF_TYPES = ['job', 'piece'] as const;
export type PoolRefType = (typeof POOL_REF_TYPES)[number];

export const POOL_MESSAGES = {
  insufficient: 'The metal pool does not have that much gold to issue.',
  openingExists: 'The metal pool already has entries. Record an adjustment instead.',
  returnTooMuch: 'That is more gold than was issued for this job and not yet returned.',
  alreadyRecovered: 'The gold of this piece is already back in the metal pool.',
} as const;

/** The balance after one entry. Both figures must be safe integers; a result below zero is refused. */
export function poolBalanceAfter(balanceUnits: number, deltaUnits: number): number {
  if (!Number.isSafeInteger(balanceUnits) || !Number.isSafeInteger(deltaUnits)) {
    throw new RangeError('Pool figures must be whole units of 0.0001 g');
  }
  const after = balanceUnits + deltaUnits;
  if (!Number.isSafeInteger(after)) throw new RangeError('Pool figure is too large');
  if (after < 0) throw new RangeError(POOL_MESSAGES.insufficient);
  return after;
}

/** Gold of a job that can still be returned: issued less returned so far, never below zero. */
export function returnRoomUnits(issuedUnits: number, returnedUnits: number): number {
  return Math.max(0, issuedUnits - returnedUnits);
}

/** True when the ledger sum equals the stored balance. */
export function ledgerMatchesBalance(sumUnits: number, balanceUnits: number): boolean {
  return Number.isSafeInteger(sumUnits) && Number.isSafeInteger(balanceUnits) && sumUnits === balanceUnits;
}

/** For the client warning: true when `enteredGrams` is a valid weight above the pool balance. */
export function isOverPool(balanceUnits: number, enteredGrams: string): boolean {
  const parsed = gramsToUnits(enteredGrams);
  return parsed.ok && parsed.units > balanceUnits;
}
