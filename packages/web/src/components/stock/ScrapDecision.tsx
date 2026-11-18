import { useState } from 'react';
import { ago } from '@goldsmith/shared';
import { fmtG, netOf, round4 } from '@goldsmith/shared';
import { daysInStock } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { ScrapRequest } from '@goldsmith/shared';
import { Button, Card, Notice, PageHeader, SectionLabel, StatusChip } from '../ui';

/** The owner decides on a scrap request: mark it scrapped (gold back to the pool) or keep it in stock. */
export function ScrapDecision() {
  const { state, route, go } = useStore();
  const req = state.scrapRequests.find((r) => r.id === route.params?.requestId);
  if (!req) {
    const pending = state.scrapRequests.filter((r) => r.status === 'pending');
    return (
      <div>
        <PageHeader title="Scrap request" subtitle="Pieces staff asked to melt. Only the owner decides." />
        <Card>
          {pending.length === 0 ? (
            <p className="text-[15px] text-ink-2">Nothing is waiting. No scrap request is open.</p>
          ) : (
            <ul className="space-y-3">
              {pending.map((r) => {
                const p = state.pieces.find((x) => x.id === r.pieceId);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-[14rem] flex-1 text-[15px] text-ink">
                      <span className="font-mono font-semibold">{r.pieceId}</span> · {p?.name}
                      <span className="block text-sm text-ink-3">asked by {r.requestedBy}</span>
                    </span>
                    <Button variant="primary" onClick={() => go('scrap-decision', { requestId: r.id })}>
                      Open
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    );
  }
  return <Decide key={req.id} req={req} />;
}

function Decide({ req }: { req: ScrapRequest }) {
  const { state, actions, go, role, now } = useStore();
  const [error, setError] = useState<string | null>(null);
  const piece = state.pieces.find((p) => p.id === req.pieceId);
  const owner = role === 'owner';
  if (!piece) return <PageHeader title="Scrap request" subtitle="The piece was not found." />;
  const net = netOf(piece);
  const after = round4(state.pool.balanceG + net);

  const run = (fn: () => { ok: boolean; error?: string }) => {
    setError(null);
    const r = fn();
    if (!r.ok) return setError(r.error ?? 'That did not work.');
    go('stock');
  };

  return (
    <div>
      <PageHeader
        title="Scrap request"
        subtitle={`${req.requestedBy} asked ${ago(req.requestedAt, now)}. The piece is off the floor until you decide.`}
        actions={<Button onClick={() => go('stock')}>Back to showroom stock</Button>}
      />
      <div className="grid max-w-4xl gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex gap-4">
            {piece.photos[0] && <img src={piece.photos[0]} alt={piece.name} className="h-24 w-24 shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0">
              <StatusChip kind="piece" value={piece.status} />
              <h2 className="mt-1.5 text-lg font-semibold text-ink">{piece.name}</h2>
              <p className="text-sm text-ink-3">
                <span className="font-mono">{piece.id}</span> · {piece.purity} · {daysInStock(piece, now)} days in stock
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-ink-3">On the scale</dt>
              <dd className="font-mono text-[15px] tabular text-ink">{fmtG(piece.grossG)} g</dd>
            </div>
            <div>
              <dt className="text-ink-3">Stones, pearls, lac</dt>
              <dd className="font-mono text-[15px] tabular text-ink">{fmtG(piece.stoneG)} g</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl bg-gold-soft p-4">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-gold-ink">Pure gold in this piece</p>
            <p className="mt-1 font-mono text-[26px] font-semibold tabular text-ink">{fmtG(net)} g</p>
          </div>
        </Card>

        <Card>
          <SectionLabel className="mb-2">Why {req.requestedBy.split(' ')[0]} asked</SectionLabel>
          <p className="text-[15px] text-ink">“{req.reason}”</p>
          <SectionLabel className="mb-2 mt-5">If you mark it scrap</SectionLabel>
          <p className="text-sm text-ink-2">
            The piece closes for good. Its {fmtG(net)} g of pure gold goes into the metal pool, which then holds <span className="font-mono tabular">{fmtG(after)} g</span> (now{' '}
            <span className="font-mono tabular">{fmtG(state.pool.balanceG)} g</span>). The stones ({fmtG(piece.stoneG)} g) are recorded on the scrapped piece and do not join the pool.
          </p>
          <SectionLabel className="mb-2 mt-5">If you decline</SectionLabel>
          <p className="text-sm text-ink-2">The piece goes back on the floor and can be sold.</p>

          {req.status !== 'pending' && <div className="mt-4"><Notice tone="wait">This request is already decided: {req.status === 'scrapped' ? 'marked as scrap' : 'declined'}.</Notice></div>}
          {req.status === 'pending' && !owner && (
            <div className="mt-4">
              <Notice tone="wait">Only the owner can mark a piece as scrap.</Notice>
            </div>
          )}
          {error && (
            <div className="mt-4">
              <Notice tone="stop">{error}</Notice>
            </div>
          )}
          {req.status === 'pending' && owner && (
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={() => run(() => actions.ownerScrap({ requestId: req.id }))}>
                Mark it scrapped
              </Button>
              <Button size="lg" onClick={() => run(() => actions.ownerDeclineScrap({ requestId: req.id }))}>
                Decline, keep it in stock
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
