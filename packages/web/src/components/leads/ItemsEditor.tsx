import { Plus, X } from 'lucide-react';
import { parseWeight } from '@goldsmith/shared';
import type { LeadItem } from '@goldsmith/shared';
import { Button, Field, Input } from '../ui';

export interface ItemRow {
  key: string;
  /** Present when the row came from an existing lead line. */
  id: string | null;
  name: string;
  style: string;
  qty: string;
  weight: string;
}

let rowSeq = 0;
export const blankRow = (): ItemRow => ({ key: `row-${(rowSeq += 1)}`, id: null, name: '', style: '', qty: '1', weight: '' });

export const rowsFromItems = (items: LeadItem[]): ItemRow[] =>
  items.length === 0
    ? [blankRow()]
    : items.map((i) => ({
        key: `row-${(rowSeq += 1)}`,
        id: i.id,
        name: i.name,
        style: i.style,
        qty: String(i.qty),
        weight: i.approxWeightG === null ? '' : String(i.approxWeightG),
      }));

export interface ParsedRows {
  items: { id: string | null; name: string; style: string; qty: number; approxWeightG: number | null }[];
  error: string | null;
}

/** Blank rows are dropped. Anything half-filled is an error a person can read. */
export function parseRows(rows: ItemRow[]): ParsedRows {
  const items: ParsedRows['items'] = [];
  for (const r of rows) {
    if (!r.name.trim() && !r.weight.trim()) continue;
    if (!r.name.trim()) return { items, error: 'Say what each line is.' };
    const qty = Number(r.qty);
    if (!Number.isInteger(qty) || qty < 1) return { items, error: `How many “${r.name.trim()}”? Enter a whole number.` };
    let approxWeightG: number | null = null;
    if (r.weight.trim()) {
      approxWeightG = parseWeight(r.weight);
      if (approxWeightG === null) return { items, error: `The weight for “${r.name.trim()}” should be a number in grams, up to four decimals.` };
    }
    items.push({ id: r.id, name: r.name.trim(), style: r.style.trim(), qty, approxWeightG });
  }
  return { items, error: null };
}

interface Props {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  /** Flag the weight column ("check this") when the system was unsure. */
  weightFlagged?: boolean;
}

/** One line per thing the customer wants: name, style, how many, about how heavy. */
export function ItemsEditor({ rows, onChange, weightFlagged }: Props) {
  const set = (key: string, patch: Partial<ItemRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.key} className="grid grid-cols-[1fr_5rem] gap-2 rounded-lg border border-line bg-paper p-3 sm:grid-cols-[1fr_9rem_5rem_9rem_auto]">
          <Field label={i === 0 ? 'Item' : 'Item ' + (i + 1)} className="col-span-2 sm:col-span-1">
            <Input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="Temple Haram" />
          </Field>
          <Field label="Style" className="col-span-2 sm:col-span-1">
            <Input value={r.style} onChange={(e) => set(r.key, { style: e.target.value })} placeholder="Chettinad" />
          </Field>
          <Field label="How many">
            <Input inputMode="numeric" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} />
          </Field>
          <Field label="About, each (g)" hint={weightFlagged ? 'check this' : undefined}>
            <Input inputMode="decimal" value={r.weight} onChange={(e) => set(r.key, { weight: e.target.value })} placeholder="80.0000" className="font-mono" />
          </Field>
          {rows.length > 1 && (
            <div className="flex items-end">
              <Button variant="ghost" aria-label={`Remove line ${i + 1}`} onClick={() => onChange(rows.filter((x) => x.key !== r.key))} icon={<X size={16} />} />
            </div>
          )}
        </div>
      ))}
      <Button variant="quiet" icon={<Plus size={16} />} onClick={() => onChange([...rows, blankRow()])}>
        Add another item
      </Button>
    </div>
  );
}
