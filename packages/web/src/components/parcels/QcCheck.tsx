import { Check, Circle } from 'lucide-react';
import { useState } from 'react';
import { ago } from '@goldsmith/shared';
import { fmtG, fmtMg, netOf, parseWeight, toU } from '@goldsmith/shared';
import { parcelPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Parcel, Piece } from '@goldsmith/shared';
import { Button, Card, Notice, PageHeader, QueueReview, SectionLabel, cn } from '../ui';
import { WeightField } from './ScaleAndWeights';

/** Screen 07: three things to confirm for each piece, then on to the next. */
export function QcCheck() {
  const { state, route, go } = useStore();
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  if (!parcel) {
    return (
      <div>
        <PageHeader title="Check this piece" subtitle="Choose a parcel first." />
        <Button onClick={() => go('parcels')}>Back to parcels</Button>
      </div>
    );
  }
  const pieces = parcelPieces(state, parcel.id).sort((a, b) => a.taggedAt - b.taggedAt);
  if (pieces.length === 0) {
    return (
      <div>
        <PageHeader title="Check this piece" subtitle="Nothing has been tagged on this parcel yet." />
        <Button onClick={() => go('parcel-tag', { parcelId: parcel.id })}>Tag the first item</Button>
      </div>
    );
  }
  const wanted = route.params?.pieceId;
  const index = Math.max(
    0,
    wanted ? pieces.findIndex((p) => p.id === wanted) : pieces.findIndex((p) => !parcel.qcDone.includes(p.id)),
  );
  return <Check1 key={pieces[index].id} parcel={parcel} pieces={pieces} index={index} />;
}

function Check1({ parcel, pieces, index }: { parcel: Parcel; pieces: Piece[]; index: number }) {
  const { actions, go, now } = useStore();
  const piece = pieces[index];
  const done = parcel.qcDone.includes(piece.id);
  const locked = parcel.status !== 'open';
  const [reweigh, setReweigh] = useState('');
  const [hallmark, setHallmark] = useState(done);
  const [deductions, setDeductions] = useState(done);
  const [error, setError] = useState<string | null>(null);

  const typed = parseWeight(reweigh);
  const agrees = done || (typed !== null && toU(typed) === toU(piece.grossG));
  const differs = !done && typed !== null && !agrees;
  const share = piece.grossG > 0 ? (piece.stoneG / piece.grossG) * 100 : 0;
  const ready = agrees && hallmark && deductions;
  const at = (i: number) => go('parcel-qc', { parcelId: parcel.id, pieceId: pieces[i].id });

  const finish = () => {
    setError(null);
    const r = actions.qcTick({ parcelId: parcel.id, pieceId: piece.id });
    if (!r.ok) return setError(r.error ?? 'Could not save the check.');
    const nextIdx = pieces.findIndex((p, i) => i !== index && !parcel.qcDone.includes(p.id) && p.id !== piece.id);
    if (nextIdx >= 0) at(nextIdx);
    else go('parcel-match', { parcelId: parcel.id });
  };

  const tagger = piece.taggedBy.split(' ')[0];
  return (
    <div>
      <PageHeader
        title="Check this piece before the parcel is matched"
        subtitle={`Piece ${index + 1} of ${pieces.length} in ${parcel.id}. Three things to confirm, then on to the next.`}
        actions={
          <Button onClick={() => go('parcel-match', { parcelId: parcel.id })}>Back to the match</Button>
        }
      />
      {locked && (
        <div className="mb-4">
          <Notice tone="wait">{parcel.status === 'stopped' ? 'This parcel is stopped, so checks are paused.' : 'This parcel has been released.'}</Notice>
        </div>
      )}
      <QueueReview
        index={index}
        total={pieces.length}
        noun="Piece"
        title={`${parcel.qcDone.length} of ${pieces.length} checked`}
        onPrev={() => at(index - 1)}
        onNext={() => at(index + 1)}
      >
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          <div>
            {piece.photos[0] ? (
              <img src={piece.photos[0]} alt={`${piece.name} at tagging`} className="aspect-square w-full rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-closed-soft text-sm text-ink-3">No photo</div>
            )}
            <p className="mt-2 text-sm text-ink-3">Photo at tagging</p>
            <h2 className="mt-3 text-lg font-semibold text-ink">{piece.name}</h2>
            <p className="text-sm text-ink-2">
              <span className="font-mono">{piece.id}</span> · {piece.purity}
              {piece.style && <> · {piece.style}</>}
            </p>
            <p className="text-sm text-ink-3">
              Tagged by {piece.taggedBy} {ago(piece.taggedAt, now)}
            </p>
          </div>

          <div className="space-y-4">
            <SectionLabel>Three things to confirm</SectionLabel>

            <Card>
              <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Step n={1} ok={agrees} /> Does the scale agree?
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-sm font-semibold text-ink-2">Tag says</p>
                  <p className="font-mono text-xl font-medium text-ink tabular">{fmtG(piece.grossG)} g</p>
                </div>
                <WeightField label="You re-weigh" value={done ? fmtG(piece.grossG) : reweigh} onChange={setReweigh} />
              </div>
              {agrees && <p className="mt-2 text-sm font-semibold text-live">Matches</p>}
              {differs && typed !== null && (
                <p className="mt-2 text-sm font-semibold text-stop">
                  Differs by {fmtMg((toU(typed) - toU(piece.grossG)) / 100000)}. Send the tag back to be weighed again.
                </p>
              )}
            </Card>

            <Card>
              <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Step n={2} ok={hallmark} /> Is the hallmark on the piece?
              </p>
              <p className="text-sm text-ink-2">
                HUID on the tag <span className="font-mono font-semibold text-ink">{piece.huid || 'none entered'}</span> · purity {piece.purity}
              </p>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px] text-ink">
                <input type="checkbox" className="h-5 w-5" checked={hallmark} disabled={done || locked} onChange={(e) => setHallmark(e.target.checked)} />
                I read the hallmark on the piece and it matches
              </label>
            </Card>

            <Card>
              <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Step n={3} ok={deductions} /> Do the deductions look honest?
              </p>
              <p className="text-sm text-ink-2">
                Stones, kemp and lac <span className="font-mono font-semibold text-ink tabular">{fmtG(piece.stoneG)} g</span> of{' '}
                <span className="font-mono tabular">{fmtG(piece.grossG)} g</span> ({share.toFixed(1)}% of the piece) · pure gold{' '}
                <span className="font-mono font-semibold text-ink tabular">{fmtG(netOf(piece))} g</span>
              </p>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px] text-ink">
                <input type="checkbox" className="h-5 w-5" checked={deductions} disabled={done || locked} onChange={(e) => setDeductions(e.target.checked)} />
                I looked at the stones and lac, and they look right
              </label>
            </Card>

            {error && <Notice tone="stop">{error}</Notice>}
            <div className="flex flex-wrap gap-3">
              {done ? (
                <Notice tone="live">This piece is checked.</Notice>
              ) : (
                <Button variant="primary" size="lg" disabled={!ready || locked} onClick={finish}>
                  {index + 1 < pieces.length ? `Checked · on to piece ${index + 2}` : 'Checked'}
                </Button>
              )}
              {!locked && (
                <Button size="lg" onClick={() => go('parcel-tag', { parcelId: parcel.id, pieceId: piece.id })}>
                  Send this tag back to {tagger}
                </Button>
              )}
            </div>
            <p className="text-sm text-ink-3">
              Checking a piece does not put it on the floor. Once all {pieces.length} are checked, the parcel goes to the match step, and if the weights add up you release it there. There is no separate QC manager. You run the checks.
            </p>
          </div>
        </div>
      </QueueReview>
    </div>
  );
}

function Step({ n, ok }: { n: number; ok: boolean }) {
  return (
    <span className={cn('flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold', ok ? 'bg-live text-white' : 'bg-closed-soft text-ink-3')}>
      {ok ? <Check size={14} /> : n}
    </span>
  );
}

/** A compact checklist for the match screen: which pieces are checked, and the way in to check more. */
export function QcPanel({ parcel, pieces }: { parcel: Parcel; pieces: Piece[] }) {
  const { go } = useStore();
  const checked = pieces.filter((p) => parcel.qcDone.includes(p.id)).length;
  const all = pieces.length > 0 && checked === pieces.length;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Checks before release</SectionLabel>
          <p className="mt-1 text-[15px] font-semibold text-ink">
            {checked} of {pieces.length} pieces checked
          </p>
          <p className="text-sm text-ink-3">Scale, hallmark and deductions, one piece at a time.</p>
        </div>
        {parcel.status === 'open' && !all && (
          <Button variant="primary" onClick={() => go('parcel-qc', { parcelId: parcel.id })}>
            {checked === 0 ? 'Start checking' : 'Keep checking'}
          </Button>
        )}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {pieces.map((p) => {
          const ok = parcel.qcDone.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => go('parcel-qc', { parcelId: parcel.id, pieceId: p.id })}
                className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-sm text-ink-2 hover:bg-closed-soft"
              >
                {ok ? <Check size={16} className="shrink-0 text-live" /> : <Circle size={16} className="shrink-0 text-ink-4" />}
                <span className="font-mono">{p.id}</span>
                <span className="truncate text-ink-3">{ok ? 'checked' : 'still to check'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
