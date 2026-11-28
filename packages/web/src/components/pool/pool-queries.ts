import { gramsToUnits, METAL_POOL_ENTITY_ID, POOL_ENTRY_KINDS } from '@goldsmith/shared';
import type { OperationInput, OperationResult, PoolEntryKind } from '@goldsmith/shared';
import { defineAction } from '../../query/action-controller';
import { defineQuery } from '../../query/query-client';
import type { QueryRef } from '../../query/query-keys';
/**
 * The pool balance. An answer older than the one on screen never replaces it: the version of the
 * pool is the entity version (EP-18-S12 AC4).
 */
export const poolBalanceQuery = defineQuery({
  op: 'readPoolBalance',
  input: {},
  versionsOf: (d) => ({ [METAL_POOL_ENTITY_ID]: d.version }),
});
export const custodyQuery = defineQuery({ op: 'readCustodySummary', input: {} });
/** One ledger entry as the server answers it. */
export type PoolEntryItem = OperationResult<'listPoolEntries'>['items'][number];
/** The reads a posting changes. */
const POOL_READS: readonly QueryRef[] = [{ op: 'readPoolBalance' }, { op: 'listPoolEntries' }, { op: 'readCustodySummary' }];
export const createOpeningEntry = defineAction({ op: 'createOpeningEntry', affects: () => POOL_READS });
export const createReturnEntry = defineAction({ op: 'createReturnEntry', affects: () => POOL_READS });
export const createAdjustmentEntry = defineAction({ op: 'createAdjustmentEntry', affects: () => POOL_READS });
/** The ledger filters. Empty text means "not filtered". */
export interface PoolFilters {
  kind: PoolEntryKind | '';
  job: string;
  piece: string;
  /** Shop dates YYYY-MM-DD, both inclusive. */
  from: string;
  to: string;
}
export const NO_POOL_FILTERS: PoolFilters = { kind: '', job: '', piece: '', from: '', to: '' };
export const hasPoolFilters = (f: PoolFilters): boolean => Object.values(f).some((v) => v !== '');
/** The listPoolEntries input for the filters; the paged read adds the cursor of each page. */
export function poolListInput(filters: PoolFilters, pageSize?: number): Omit<OperationInput<'listPoolEntries'>, 'cursor'> {
  const job = filters.job.trim();
  const piece = filters.piece.trim();
  return {
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(filters.kind ? { kind: filters.kind } : {}),
    ...(job ? { job } : {}),
    ...(piece ? { piece } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
}
export const POOL_KIND_LABELS: Record<PoolEntryKind, string> = {
  opening: 'Opening balance',
  issued: 'Issued to a karigar',
  returned: 'Returned by a karigar',
  recovered: 'Recovered from scrap',
  adjustment: 'Adjustment',
};
export const POOL_KINDS = POOL_ENTRY_KINDS;
const MINUS = '\u2212';
/** A signed gram string from the server ("-162.4000", "78.4000") as "−162.4000 g" or "+78.4000 g". */
export function fmtSignedGrams(deltaG: string): string {
  const t = deltaG.trim();
  return t.startsWith('-') ? `${MINUS}${t.slice(1)} g` : `+${t.replace(/^\+/, '')} g`;
}
/** A four-decimal gram string with its unit. */
export const fmtGrams = (g: string): string => `${g} g`;
/** The sentence for a grams field that cannot be sent, or null when it can. Zero is refused; a minus sign only when `signed`. */
export function gramsFieldError(text: string, signed: boolean): string | null {
  const t = text.trim();
  if (!t) return 'Enter the weight in grams.';
  const parsed = gramsToUnits(t);
  if (!parsed.ok) return parsed.error;
  if (parsed.units === 0) return 'The weight cannot be zero.';
  if (!signed && parsed.units < 0) return 'Enter a weight above zero. A return or an opening balance cannot be negative.';
  return null;
}
