import { fmtDateTime } from '@goldsmith/shared';
import { fmtG, fmtSignedG } from '@goldsmith/shared';
import { useStore } from '../../store/StoreProvider';
import { Card, SectionLabel, WeightReadout } from '../ui';

/** The metal pool: gold held back for issuing to karigars. Balance on top, every movement below. */
export function MetalPool({ limit = 8 }: { limit?: number }) {
  const { state } = useStore();
  const { pool } = state;
  const rows = pool.ledger.slice(0, limit);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Metal pool</SectionLabel>
          <p className="mt-1 text-sm text-ink-3">Gold free to issue to a karigar. Scrap marked by the owner comes back here.</p>
        </div>
        <WeightReadout g={pool.balanceG} size="hero" />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-2">No movements yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-28 shrink-0 text-ink-3">{fmtDateTime(e.at)}</span>
              <span className="min-w-[10rem] flex-1 text-ink-2">
                {e.note} <span className="font-mono text-ink-3">{e.ref}</span>
              </span>
              <span className={`font-mono tabular font-semibold ${e.deltaG < 0 ? 'text-ink-2' : 'text-live'}`}>{fmtSignedG(e.deltaG)} g</span>
            </li>
          ))}
        </ul>
      )}
      {pool.ledger.length > rows.length && <p className="mt-2 text-sm text-ink-3">Showing the latest {rows.length} of {pool.ledger.length}. Balance {fmtG(pool.balanceG)} g.</p>}
    </Card>
  );
}
