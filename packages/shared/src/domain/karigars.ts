/**
 * Karigar master rules (EP-16): the wastage allowance range, the sentences the karigar
 * operations answer with and the integer arithmetic behind the allowance example and the
 * scorecard. The allowance is whole basis points (70 = 0.70%), weights are integer units of
 * 0.0001 g; no float percentage is ever stored or compared.
 */
import { DomainError } from './domain-error.js';

/** 0.6% of the gold issued. */
export const WASTAGE_MIN_BP = 60;
/** 1.2% of the gold issued. */
export const WASTAGE_MAX_BP = 120;

/** The sentences the karigar operations answer with. */
export const KARIGAR_MESSAGES = {
  ownerOnly: 'Only the owner can add a karigar or change their wastage allowance.',
  nameRequired: 'Add the karigar name.',
  specialtyRequired: 'Pick at least one thing they are best at.',
  wastageRange: 'The wastage allowance is between 0.6% and 1.2%.',
  phoneTaken: 'This phone number is already used by another account.',
  alreadyDeactivated: 'This karigar is already deactivated.',
  alreadyActive: 'This karigar is already active.',
  noKarigar: 'Say which karigar it came from.',
  deactivatedLoginFirst: 'This karigar is deactivated. Reactivate them before giving portal access.',
  phoneMissing: 'Add the karigar phone number before giving portal access.',
  userPhoneDiffers: "This user's phone number is not the karigar's phone number.",
} as const;

/** "Ravi Achari is no longer active. Pick another karigar." */
export const karigarInactiveMessage = (name: string): string => `${name} is no longer active. Pick another karigar.`;

/** "KG-04 has open jobs: MO-2026-118. Hand them over before deactivating." */
export const openJobsMessage = (karigarCode: string, jobCodes: readonly string[]): string =>
  `${karigarCode} has open jobs: ${jobCodes.join(', ')}. Hand them over before deactivating.`;

/** True for a whole number of basis points in the allowed range. */
export const isWastageBp = (bp: number): boolean =>
  Number.isInteger(bp) && bp >= WASTAGE_MIN_BP && bp <= WASTAGE_MAX_BP;

/** Refuse an allowance outside 0.6% to 1.2%, or one that is not a whole basis point. */
export function assertWastageBp(bp: number): void {
  if (!isWastageBp(bp)) throw new DomainError(KARIGAR_MESSAGES.wastageRange);
}

/** The most gold a job of `jobUnits` may lose at `bp`: `jobUnits * bp / 10000`, rounded half up. */
export function wastageExampleUnits(bp: number, jobUnits = 1_600_000): number {
  return Number(divideHalfUp(BigInt(jobUnits) * BigInt(bp), 10_000n));
}

/** Metal loss in whole basis points: lost / issued, half up. `null` when nothing was issued. */
export function lossBp(lossUnits: number, issuedUnits: number): number | null {
  if (issuedUnits <= 0) return null;
  return Number(divideHalfUp(BigInt(lossUnits) * 10_000n, BigInt(issuedUnits)));
}

/** The average of whole numbers, rounded half up to a whole number; `null` for an empty list. */
export function averageUnits(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((total, v) => total + BigInt(v), 0n);
  return Number(divideHalfUp(sum, BigInt(values.length)));
}

/** Whole shop calendar days a handover came after the agreed date (YYYY-MM-DD each); never negative. */
export function daysLate(agreedShopDate: string, handoverShopDate: string): number {
  const days = (Date.parse(`${handoverShopDate}T00:00:00Z`) - Date.parse(`${agreedShopDate}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(days)) throw new Error(`Not dates (YYYY-MM-DD): ${agreedShopDate}, ${handoverShopDate}`);
  return Math.max(0, Math.round(days));
}

/** `a / b` rounded half away from zero, for a positive `b`. */
function divideHalfUp(a: bigint, b: bigint): bigint {
  const negative = a < 0n;
  const abs = negative ? -a : a;
  const q = (2n * abs + b) / (2n * b);
  return negative ? -q : q;
}
