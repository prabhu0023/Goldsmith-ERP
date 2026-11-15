import { useState } from 'react';
import { fmtDateTime } from '../../domain/clock';
import { useStore } from '../../store/StoreProvider';
import type { AuditKind } from '../../types/jewellery';
import { Card, PageHeader, Pill, SectionLabel, cn } from '../ui';

type Group = 'all' | 'edits' | 'losses' | 'problems' | 'scrap' | 'stock-out' | 'rules';

const GROUPS: { id: Group; label: string; kinds: AuditKind[] }[] = [
  { id: 'all', label: 'Everything', kinds: [] },
  { id: 'edits', label: 'Tag edits', kinds: ['edit_applied', 'edit_refused'] },
  { id: 'losses', label: 'Parcels and losses', kinds: ['loss_accepted', 'parcel_sent_back', 'parcel_last_digit'] },
  { id: 'problems', label: 'Problems', kinds: ['problem_cleared'] },
  { id: 'scrap', label: 'Scrap', kinds: ['scrap_marked', 'scrap_declined'] },
  { id: 'stock-out', label: 'Stock-out', kinds: ['stock_out'] },
  { id: 'rules', label: 'Rules', kinds: ['setting_changed'] },
];

const KIND_WORDS: Record<AuditKind, string> = {
  edit_applied: 'Edit applied',
  edit_refused: 'Edit refused',
  loss_accepted: 'Loss accepted',
  parcel_sent_back: 'Parcel sent back',
  parcel_last_digit: 'Released at the last digit',
  problem_cleared: 'Problem cleared',
  scrap_marked: 'Scrapped',
  scrap_declined: 'Scrap declined',
  stock_out: 'Stock-out',
  setting_changed: 'Rule changed',
};

/** Owner only. Every edit, accepted loss, cleared problem, scrap and rule change: who, when and why. */
export function SecurityLog() {
  const { state, role } = useStore();
  const [group, setGroup] = useState<Group>('all');
  if (role !== 'owner') {
    return (
      <div>
        <PageHeader title="Security log" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can read the security log.</p>
        </Card>
      </div>
    );
  }
  const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0];
  const rows = [...state.audit].filter((a) => g.kinds.length === 0 || g.kinds.includes(a.kind)).sort((a, b) => b.at - a.at);

  return (
    <div>
      <PageHeader title="Security log" subtitle="Everything that changed the books and who did it. Entries are never edited or removed." />
      <div role="group" aria-label="Kind of entry" className="mb-4 flex flex-wrap gap-2">
        {GROUPS.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={group === x.id}
            onClick={() => setGroup(x.id)}
            className={cn(
              'min-h-10 rounded-full border px-3 text-sm font-semibold',
              group === x.id ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <SectionLabel className="mb-3">{rows.length} entries</SectionLabel>
      {rows.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">Nothing has been logged under this heading.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Pill>{KIND_WORDS[a.kind]}</Pill>
                <span className="font-mono text-sm text-ink-3">{a.ref}</span>
                <span className="ml-auto text-sm text-ink-3">
                  {fmtDateTime(a.at)} · {a.actorName} ({a.actorRole})
                </span>
              </div>
              <p className="mt-2 text-[15px] font-semibold text-ink">{a.summary}</p>
              {a.detail && <p className="mt-0.5 text-sm text-ink-2">{a.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
