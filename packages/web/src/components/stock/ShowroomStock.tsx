import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { fmtG, netOf } from '@goldsmith/shared';
import { daysInStock, pureGoldOnFloor } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Piece } from '@goldsmith/shared';
import { Button, Card, Input, PageHeader, StatusChip, cn } from '../ui';
import { ValueSlot } from '../ui/ValueSlot';
import { MetalPool } from './MetalPool';
import { PieceDrawer } from './PieceDrawer';

type Tab = 'sell' | 'checking' | 'billed' | 'scrapped';
const PAGE = 24;

const matchesTab = (p: Piece, tab: Tab): boolean =>
  tab === 'sell' ? p.status === 'in_stock' : tab === 'checking' ? p.status === 'draft' || p.status === 'with_owner' || p.status === 'stopped' : tab === 'billed' ? p.status === 'billed' : p.status === 'scrapped';

export function ShowroomStock() {
  const { state, go, role, now, route } = useStore();
  const [tab, setTab] = useState<Tab>('sell');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(route.params?.pieceId ?? null);
  const [showPool, setShowPool] = useState(false);

  const count = (t: Tab) => state.pieces.filter((p) => matchesTab(p, t)).length;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'sell', label: 'Can sell' },
    { id: 'checking', label: 'With QC' },
    { id: 'billed', label: 'Billed' },
    { id: 'scrapped', label: 'Scrapped' },
  ];
  const needle = q.trim().toLowerCase();
  const list = state.pieces
    .filter((p) => matchesTab(p, tab))
    .filter((p) => !needle || [p.id, p.huid, p.name, p.collection, p.style, p.kind].some((f) => f.toLowerCase().includes(needle)))
    .sort((a, b) => (b.soldAt ?? b.inStockAt ?? b.taggedAt) - (a.soldAt ?? a.inStockAt ?? a.taggedAt));
  const piece = selected ? (state.pieces.find((p) => p.id === selected) ?? null) : null;
  const onFloor = state.pieces.filter((p) => p.status === 'in_stock').length;

  return (
    <div>
      <PageHeader
        title="Showroom stock"
        subtitle={`${onFloor} pieces you can sell · ${fmtG(pureGoldOnFloor(state))} g pure gold on the floor`}
        actions={
          <>
            {role === 'owner' && (
              <Button onClick={() => setShowPool(!showPool)} aria-expanded={showPool}>
                {showPool ? 'Hide the metal pool' : 'Metal pool'}
              </Button>
            )}
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('parcels')}>
              Register new arrival
            </Button>
          </>
        }
      />

      {showPool && role === 'owner' && (
        <div className="mb-5">
          <MetalPool />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            aria-label="Search tag, HUID, name or collection"
            placeholder="Search tag, HUID, name or collection"
            className="pl-10"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
          />
        </div>
        <div role="tablist" aria-label="Stock lists" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setShown(PAGE);
              }}
              className={cn(
                'min-h-11 rounded-full border px-4 text-sm font-semibold',
                tab === t.id ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-2 hover:bg-paper',
              )}
            >
              {t.label} · {count(t.id)}
            </button>
          ))}
        </div>
        <span className="text-sm text-ink-3">Newest first</span>
      </div>

      {list.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">{needle ? 'No piece matches that search.' : 'Nothing in this list.'}</p>
        </Card>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.slice(0, shown).map((p) => {
              const held = !!p.heldForLeadId && p.status === 'in_stock';
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:border-gold hover:shadow-md"
                  >
                    <div className="flex gap-4 p-4">
                      {p.photos[0] ? (
                        <img src={p.photos[0]} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="h-24 w-24 shrink-0 rounded-lg bg-closed-soft" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <StatusChip kind="piece" value={held ? 'held' : p.status} />
                        <h2 className="mt-1.5 truncate text-[15px] font-semibold text-ink">{p.name}</h2>
                        <p className="truncate text-sm text-ink-3">
                          <span className="font-mono">{p.id}</span> · {p.purity}
                          {p.style && <> · {p.style}</>}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto space-y-1 border-t border-line px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-ink-3">Pure gold</span>
                        <span className="font-mono text-xl font-semibold tabular text-ink">{fmtG(netOf(p))} g</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-ink-3">Gross · stones</span>
                        <span className="font-mono text-sm tabular text-ink-2">
                          {fmtG(p.grossG)} g · {fmtG(p.stoneG)} g
                        </span>
                      </div>
                      <ValueSlot value={p.valueINR} label="Value" />
                      {p.status === 'in_stock' && <p className="text-sm text-ink-3">{daysInStock(p, now)} days old</p>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          {list.length > shown && (
            <div className="mt-5 text-center">
              <Button onClick={() => setShown(shown + PAGE)}>
                Show more · {list.length - shown} left
              </Button>
            </div>
          )}
        </>
      )}

      <PieceDrawer piece={piece} onClose={() => setSelected(null)} />
    </div>
  );
}
