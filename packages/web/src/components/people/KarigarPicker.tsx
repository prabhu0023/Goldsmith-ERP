import type { OperationResult } from '@goldsmith/shared';
import { useId } from 'react';
import { defineQuery } from '../../query/query-client';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { QueryBoundary, Select } from '../ui';
import { bpToPercent } from './karigar-rows';
/** One active karigar for a picker: no phone, location or scorecard figure. */
export type KarigarPickerRow = OperationResult<'listKarigarPicker'>['items'][number];
/** The picker's read, for a screen that wants to seed or refetch it. */
export const karigarPickerQuery = defineQuery({ op: 'listKarigarPicker', input: {} });
/** "Lakshmi Devi · KG-01" */
export const pickerOptionLabel = (k: KarigarPickerRow): string => `${k.name} · ${k.id}`;
/** "Chettinad specialist · 0.7% loss": the first specialty and the allowance, nothing about how they performed. */
export const pickerOptionHint = (k: KarigarPickerRow): string => {
  const allowance = `${bpToPercent(k.wastageBp).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}% loss`;
  return k.specialties.length > 0 ? `${k.specialties[0]} specialist · ${allowance}` : allowance;
};
/** A select over the active karigars (staff and owner). `value` and `onChange` carry the karigar code. */
export function KarigarPicker({ value, onChange, label = 'Karigar' }: { value: string; onChange: (karigarId: string) => void; label?: string }) {
  const list = usePagedQuery({ op: 'listKarigarPicker', input: {} });
  const selectId = useId();
  const chosen = list.items.find((k) => k.id === value);
  return (
    <QueryBoundary label="karigar list" query={pagedBoundaryQuery(list)}>
      <label htmlFor={selectId} className="mb-1 block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <Select id={selectId} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Pick a karigar</option>
        {list.items.map((k) => (
          <option key={k.id} value={k.id}>
            {pickerOptionLabel(k)}
          </option>
        ))}
      </Select>
      {chosen && <p className="mt-1 text-[13px] text-ink-3">{pickerOptionHint(chosen)}</p>}
      {list.hasMore && !list.loadingMore && (
        <button type="button" onClick={list.loadMore} className="mt-1 text-sm font-semibold text-gold-ink underline">
          Load more karigars
        </button>
      )}
    </QueryBoundary>
  );
}
