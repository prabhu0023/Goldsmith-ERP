import { fmtAuditTime } from '@goldsmith/shared';
import { Card } from '../ui';
import { fmtSignedGrams, POOL_KIND_LABELS } from './pool-queries';
import type { PoolEntryItem } from './pool-queries';
/** "Job MO-2026-118", "Piece TAG-7701", or nothing for an entry without a reference. */
export function poolRefLabel(e: Pick<PoolEntryItem, 'refType' | 'refId'>): string | null {
  if (!e.refId) return null;
  return `${e.refType === 'piece' ? 'Piece' : 'Job'} ${e.refId}`;
}
/** The ledger rows, newest first: time, kind, signed grams, reference, who and the note. The boundary above shows loading and errors. */
export function PoolEntryRows({ entries, emptyText }: { entries: PoolEntryItem[]; emptyText: string }) {
  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-[15px] text-ink-2">{emptyText}</p>
      </Card>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => {
        const ref = poolRefLabel(e);
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <span className="w-40 shrink-0 text-ink-3">{fmtAuditTime(e.at)}</span>
            <span className="min-w-[10rem] flex-1 text-ink-2">
              <span className="font-semibold text-ink">{POOL_KIND_LABELS[e.kind]}</span>
              {ref && <span className="ml-2 font-mono text-ink-3">{ref}</span>}
              <span className="ml-2 text-ink-3">· {e.actorName}</span>
              {e.note && <span className="block text-ink-3">{e.note}</span>}
            </span>
            <span className={`font-mono tabular font-semibold ${e.deltaG.startsWith('-') ? 'text-ink-2' : 'text-live'}`}>{fmtSignedGrams(e.deltaG)}</span>
          </li>
        );
      })}
    </ul>
  );
}
