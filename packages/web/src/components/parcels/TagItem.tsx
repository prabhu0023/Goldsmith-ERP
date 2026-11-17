import { Check } from 'lucide-react';
import { useState } from 'react';
import { imageList } from '../../data/images';
import { fmtG, fromU, parseWeight, toU } from '../../domain/weights';
import { evaluate, parcelPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Parcel, Piece } from '../../types/jewellery';
import { Button, Card, Field, Input, Notice, SectionLabel, Select, StepFrame, cn } from '../ui';
import { ScalePicker, WeightField } from './ScaleAndWeights';
import { PURITIES, nextTagNumber } from './util';

/** Step 2: tag one item. Every weight is typed off the scale; nothing is pre-filled. */
export function TagItem() {
  const { state, route, go } = useStore();
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  if (!parcel) {
    return (
      <StepFrame step={2} title="Tag one item" subtitle="Choose a parcel first.">
        <Button onClick={() => go('parcels')}>Back to parcels</Button>
      </StepFrame>
    );
  }
  if (parcel.weighings.length === 0) {
    return (
      <StepFrame step={1} title="Weigh the parcel first" subtitle="Tags are drawn against the parcel's weights, so it has to be weighed before anything is tagged.">
        <Button variant="primary" onClick={() => go('parcel-arrival', { parcelId: parcel.id })}>
          Weigh the parcel
        </Button>
      </StepFrame>
    );
  }
  const pieceId = route.params?.pieceId ?? '';
  const taggedCount = parcelPieces(state, parcel.id).length;
  return <TagForm key={`${parcel.id}:${pieceId}:${taggedCount}`} parcel={parcel} editing={parcelPieces(state, parcel.id).find((p) => p.id === pieceId)} />;
}

function TagForm({ parcel, editing }: { parcel: Parcel; editing?: Piece }) {
  const { state, actions, go } = useStore();
  const ev = evaluate(state, parcel);
  const pieces = parcelPieces(state, parcel.id).sort((a, b) => a.taggedAt - b.taggedAt);
  const karigar = state.karigars.find((k) => k.id === parcel.karigarId);
  const isRecheck = parcel.status === 'stopped' && parcel.resolution === 'rechecking' && parcel.recheckPieceId === editing?.id;
  const locked = parcel.status === 'released' || (parcel.status === 'stopped' && !isRecheck);

  // what is still to tag, by kind from the list
  const left = parcel.manifest.map((m) => ({
    ...m,
    left: m.count - pieces.filter((p) => p.kind === m.kind && p.id !== editing?.id).length,
  }));
  const choices = left.filter((m) => m.left > 0);
  const stillTo = left.filter((m) => m.left > 0);

  const [kind, setKind] = useState(editing?.kind ?? choices[0]?.kind ?? '');
  const [tagNo, setTagNo] = useState(editing?.id ?? nextTagNumber(state));
  const [huid, setHuid] = useState(editing?.huid ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [purity, setPurity] = useState(editing?.purity ?? '22K');
  const [size, setSize] = useState(editing?.size ?? '');
  const [stoneCount, setStoneCount] = useState(editing ? String(editing.stoneCount) : '');
  const [photos, setPhotos] = useState<string[]>(editing?.photos ?? []);
  const [scaleId, setScaleId] = useState(state.lastScaleId);
  const [gross, setGross] = useState('');
  const [stone, setStone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const g = parseWeight(gross);
  const s = parseWeight(stone);
  const netG = g !== null && s !== null && toU(s) <= toU(g) ? fromU(toU(g) - toU(s)) : null;
  const n = editing ? pieces.findIndex((p) => p.id === editing.id) + 1 : ev.tagged + 1;
  const pureSoFar = fromU(pieces.reduce((a, p) => a + toU(p.grossG) - toU(p.stoneG), 0));

  const save = (stop: boolean) => {
    setError(null);
    if (!kind) return setError('Pick the kind of item from the list.');
    if (g === null || g <= 0) return setError('Type what the piece weighs on the scale, in grams.');
    if (s === null) return setError('Type the stones, kemp and lac on this piece. Type 0 if there are none.');
    const count = stoneCount === '' ? undefined : Number(stoneCount);
    const r = actions.saveTag({
      parcelId: parcel.id,
      tag: {
        id: tagNo.trim(),
        kind,
        name: name.trim() || kind,
        huid,
        purity,
        size,
        stoneCount: count,
        photos,
        grossG: g,
        stoneG: s,
        scaleId,
      },
    });
    if (!r.ok) return setError(r.error ?? 'Could not save the tag.');
    const done = ev.tagged + (editing ? 0 : 1) >= ev.expected;
    if (stop) return go('parcels');
    if (done || isRecheck || editing) return go('parcel-match', { parcelId: parcel.id });
    go('parcel-tag', { parcelId: parcel.id });
  };

  const togglePhoto = (src: string) => setPhotos(photos.includes(src) ? photos.filter((x) => x !== src) : [...photos, src]);

  return (
    <StepFrame
      step={2}
      maxStep={ev.tagged >= ev.expected ? 3 : 2}
      onStep={(st) => (st === 1 ? go('parcel-arrival', { parcelId: parcel.id }) : go('parcel-match', { parcelId: parcel.id }))}
      title={editing ? `Re-tag ${editing.id}` : `Tag item ${Math.min(n, ev.expected)} of ${ev.expected}`}
      subtitle="Put the piece on the balance and read each figure off. Nothing is pre-filled. Every piece is its own weight."
    >
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="space-y-4">
          <Card>
            <SectionLabel className="mb-2">This parcel</SectionLabel>
            <p className="font-mono text-[15px] font-semibold text-ink">{parcel.id}</p>
            <p className="text-sm text-ink-2">{karigar?.name ?? parcel.karigarId}</p>
            <p className="mt-3 text-[26px] font-semibold text-ink">
              {ev.tagged} of {ev.expected}
            </p>
            <p className="text-sm text-ink-3">items tagged so far</p>
            <p className="mt-1 font-mono text-sm text-ink-2 tabular">pure gold so far {fmtG(pureSoFar)} g</p>
            <div className="mt-3 h-1.5 rounded-full bg-closed-soft" role="progressbar" aria-valuemin={0} aria-valuemax={ev.expected} aria-valuenow={ev.tagged}>
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${ev.expected ? (ev.tagged / ev.expected) * 100 : 0}%` }} />
            </div>
          </Card>
          <Card>
            <SectionLabel className="mb-2">Still to tag</SectionLabel>
            {stillTo.length === 0 ? (
              <p className="text-sm text-ink-2">Every item on the list has a tag.</p>
            ) : (
              <ul className="space-y-1 text-sm text-ink-2">
                {stillTo.map((m) => (
                  <li key={m.id}>
                    {m.kind} · {m.left} left
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {pieces.length > 0 && (
            <Card>
              <SectionLabel className="mb-2">Tagged</SectionLabel>
              <ul className="space-y-1">
                {pieces.map((p) => {
                  const canOpen = parcel.status === 'open' || (isRecheck && p.id === editing?.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={!canOpen}
                        onClick={() => go('parcel-tag', { parcelId: parcel.id, pieceId: p.id })}
                        className={cn(
                          'flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-sm',
                          p.id === editing?.id ? 'bg-gold-soft font-semibold text-ink' : 'text-ink-2',
                          canOpen && 'hover:bg-closed-soft',
                        )}
                      >
                        <Check size={14} className="shrink-0 text-live" />
                        <span className="font-mono">{p.id}</span>
                        <span className="truncate text-ink-3">{p.kind}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </aside>

        <div className="space-y-5">
          {locked && (
            <Notice tone="stop">
              {parcel.status === 'released' ? 'This parcel has been released, so its tags are closed.' : 'This parcel is stopped. Only the owner can start it again.'}
            </Notice>
          )}
          {isRecheck && <Notice tone="wait">The owner asked for {editing?.id} to be weighed again. Type the figures fresh off the scale.</Notice>}
          {!locked && ev.expected > 0 && ev.tagged >= ev.expected && !editing && (
            <Card>
              <p className="mb-3 text-[15px] text-ink-2">Every item on the list is tagged.</p>
              <Button variant="primary" onClick={() => go('parcel-match', { parcelId: parcel.id })}>
                Go to match and release
              </Button>
            </Card>
          )}
          {!locked && (editing || ev.tagged < ev.expected) && (
            <>
              <Card>
                <SectionLabel className="mb-3">What it is</SectionLabel>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kind of item" hint="Picked from the list on this parcel.">
                    <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                      {(editing ? left.filter((m) => m.left > 0 || m.kind === editing.kind) : choices).map((m) => (
                        <option key={m.id} value={m.kind}>
                          {m.kind} · {m.left} left to tag
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="New tag number" hint="Suggested. Change it if the tag on the piece differs.">
                    <Input value={tagNo} onChange={(e) => setTagNo(e.target.value)} disabled={!!editing} />
                  </Field>
                  <Field label="Hallmark HUID">
                    <Input value={huid} onChange={(e) => setHuid(e.target.value.toUpperCase())} placeholder="From the hallmark" className="font-mono" />
                  </Field>
                  <Field label="Name">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind || 'Name on the tag'} />
                  </Field>
                  <Field label="Purity">
                    <Select value={purity} onChange={(e) => setPurity(e.target.value)}>
                      {PURITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Size">
                    <Input value={size} onChange={(e) => setSize(e.target.value)} placeholder="28 inches" />
                  </Field>
                  <Field label="Number of stones">
                    <Input inputMode="numeric" value={stoneCount} onChange={(e) => setStoneCount(e.target.value.replace(/\D/g, ''))} placeholder="0" />
                  </Field>
                </div>
                <p className="mb-2 mt-4 text-sm font-semibold text-ink-2">Photos · {photos.length} added</p>
                <ul className="grid grid-cols-4 gap-2 sm:max-w-md">
                  {imageList.map((im) => (
                    <li key={im.id}>
                      <button
                        type="button"
                        aria-pressed={photos.includes(im.src)}
                        aria-label={`${photos.includes(im.src) ? 'Remove' : 'Add'} photo: ${im.label}`}
                        onClick={() => togglePhoto(im.src)}
                        className={cn('relative aspect-square w-full overflow-hidden rounded-lg border-2', photos.includes(im.src) ? 'border-gold' : 'border-line')}
                      >
                        <img src={im.src} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card>
                <SectionLabel className="mb-3">What it weighs · on the balance</SectionLabel>
                <ScalePicker value={scaleId} onChange={setScaleId} label="Which scale is this piece on?" />
                <p className="mb-3 mt-1 text-sm text-ink-3">Remembered for the next piece. Change it when you move to another scale.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <WeightField label="On the scale now" value={gross} onChange={setGross} hint={editing ? `Was ${fmtG(editing.grossG)} g` : undefined} />
                  <WeightField label="Stones, kemp, lac on this piece" value={stone} onChange={setStone} hint={editing ? `Was ${fmtG(editing.stoneG)} g` : undefined} />
                </div>
                <div className="mt-5 rounded-xl bg-gold-soft p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-gold-ink">Pure gold in this piece</p>
                  <p className="mt-1 font-mono text-[26px] font-semibold text-ink tabular">{netG === null ? '—' : `${fmtG(netG)} g`}</p>
                  {netG !== null && g !== null && s !== null && (
                    <p className="font-mono text-sm text-ink-2 tabular">
                      {fmtG(g)} − {fmtG(s)}
                    </p>
                  )}
                </div>
                <p className="mt-3 text-sm text-ink-3">This piece is drawn against the parcel total. It does not match until all {ev.expected} are in.</p>
                {error && (
                  <div className="mt-4">
                    <Notice tone="stop">{error}</Notice>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="primary" size="lg" onClick={() => save(false)}>
                    {editing ? 'Save tag' : ev.tagged + 1 >= ev.expected ? 'Save tag · go to match' : `Save tag · go to item ${ev.tagged + 2}`}
                  </Button>
                  {!editing && (
                    <Button size="lg" onClick={() => save(true)}>
                      Save and stop here
                    </Button>
                  )}
                  <Button variant="quiet" size="lg" onClick={() => go(editing ? 'parcel-match' : 'parcels', { parcelId: parcel.id })}>
                    Cancel
                  </Button>
                </div>
              </Card>
              <Card className="bg-paper">
                <SectionLabel className="mb-2">Why nothing is pre-filled</SectionLabel>
                <p className="text-sm text-ink-2">
                  Every piece weighs something different, so there is no standard piece. The scale figure is always typed fresh, never guessed from the last one.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
