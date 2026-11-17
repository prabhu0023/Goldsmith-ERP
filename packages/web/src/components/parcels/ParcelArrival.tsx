import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { fmtG, fromU, parseWeight, toU } from '../../domain/weights';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, Field, Input, Notice, SectionLabel, Select, StepFrame } from '../ui';
import { ScalePicker, WeightField } from './ScaleAndWeights';
import { parcelTarget } from './util';

interface Row {
  scaleId: string;
  gross: string;
  stone: string;
}
interface Kind {
  kind: string;
  count: string;
}

/** Step 1: weigh the whole parcel, then say what is inside. */
export function ParcelArrival() {
  const { state, route, go, role } = useStore();
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  if (parcel && parcel.weighings.length > 0) {
    const t = parcelTarget(state, parcel, role);
    return (
      <StepFrame step={1} title={`${parcel.id} is already weighed`} subtitle="Its weights and list are saved. Carry on from where it got to.">
        <Card>
          <Button variant="primary" onClick={() => go(t.id === 'parcel-arrival' ? 'parcel-tag' : t.id, t.params)}>
            Carry on with this parcel
          </Button>
        </Card>
      </StepFrame>
    );
  }
  return <Form key={parcel?.id ?? 'new'} />;
}

function Form() {
  const { state, actions, route, go } = useStore();
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  const job = parcel?.jobId ? state.jobs.find((j) => j.id === parcel.jobId) : undefined;
  const [karigarId, setKarigarId] = useState(parcel?.karigarId ?? '');
  const [poRef, setPoRef] = useState(parcel?.poRef ?? '');
  const [trays, setTrays] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ scaleId: state.lastScaleId, gross: '', stone: '' }]);
  const [kinds, setKinds] = useState<Kind[]>([{ kind: '', count: '' }]);
  const [error, setError] = useState<string | null>(null);

  const karigar = state.karigars.find((k) => k.id === (parcel?.karigarId ?? karigarId));
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setKind = (i: number, patch: Partial<Kind>) => setKinds(kinds.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const parsed = rows.map((r) => ({ g: parseWeight(r.gross), s: parseWeight(r.stone) }));
  const allTyped = parsed.every((p) => p.g !== null && p.s !== null);
  const grossU = parsed.reduce((a, p) => a + (p.g === null ? 0 : toU(p.g)), 0);
  const stoneU = parsed.reduce((a, p) => a + (p.s === null ? 0 : toU(p.s)), 0);
  const netU = grossU - stoneU;
  const total = kinds.reduce((a, k) => a + (Number.isInteger(Number(k.count)) && Number(k.count) > 0 ? Number(k.count) : 0), 0);

  const start = () => {
    setError(null);
    if (!parcel && !karigarId) return setError('Say which karigar it came from.');
    const weighings: { label: string; scaleId: string; grossG: number; stoneG: number }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const label = trays ? `Tray ${i + 1}` : 'Whole parcel';
      const g = parsed[i].g;
      const s = parsed[i].s;
      if (g === null || g <= 0) return setError(`${label}: type what is on the scale, in grams (up to four decimals).`);
      if (s === null) return setError(`${label}: type the stones, pearls and lac. Type 0 if there are none.`);
      if (toU(s) > toU(g)) return setError(`${label}: the stones cannot weigh more than everything together.`);
      weighings.push({ label, scaleId: rows[i].scaleId, grossG: g, stoneG: s });
    }
    const manifest = kinds.filter((k) => k.kind.trim() && Number(k.count) > 0).map((k) => ({ kind: k.kind.trim(), count: Number(k.count) }));
    if (kinds.some((k) => k.kind.trim() && !(Number.isInteger(Number(k.count)) && Number(k.count) > 0))) {
      return setError('Every kind of item needs a whole number of pieces.');
    }
    const r = actions.recordParcelArrival({
      parcelId: parcel?.id,
      karigarId: parcel ? undefined : karigarId,
      poRef: poRef.trim() || null,
      weighings,
      manifest,
    });
    if (!r.ok) return setError(r.error ?? 'Could not save the parcel.');
    go('parcel-tag', { parcelId: r.id ?? parcel?.id ?? '' });
  };

  const sameKinds = state.parcels.flatMap((p) => p.manifest.map((m) => m.kind));
  const suggestions = [...new Set(sameKinds)].sort();

  return (
    <StepFrame
      step={1}
      title={karigar ? `A parcel has arrived from ${karigar.name}` : 'A parcel has arrived'}
      subtitle={job ? `Against job ${job.id} · weigh the whole thing first, then say what is inside` : 'Weigh the whole thing first, then say what is inside'}
    >
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          {!parcel && (
            <Card>
              <SectionLabel className="mb-3">Who sent it</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Which karigar?">
                  <Select value={karigarId} onChange={(e) => setKarigarId(e.target.value)}>
                    <option value="">Choose a karigar</option>
                    {state.karigars.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name} · {k.id}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Order reference (if there is one)">
                  <Input value={poRef} onChange={(e) => setPoRef(e.target.value)} placeholder="PO-2026-915" />
                </Field>
              </div>
            </Card>
          )}

          <Card>
            <SectionLabel className="mb-3">Weigh the whole parcel · all three figures</SectionLabel>
            <div className="space-y-5">
              {rows.map((r, i) => (
                <div key={i} className={trays ? 'rounded-lg border border-line p-4' : ''}>
                  {trays && (
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[15px] font-semibold text-ink">Tray {i + 1}</p>
                      {rows.length > 1 && (
                        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove tray ${i + 1}`}>
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                  <ScalePicker value={r.scaleId} onChange={(scaleId) => setRow(i, { scaleId })} label={trays ? 'Which scale is this tray on?' : 'Which scale is this on?'} />
                  <p className="mb-3 mt-1 text-sm text-ink-3">The scale sets how exact the match must be. Pick the one you are really using.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <WeightField label={trays ? 'Everything on this tray together' : 'Everything on the scale together'} value={r.gross} onChange={(gross) => setRow(i, { gross })} />
                    <WeightField label="Of that, the stones, pearls, lac. Anything not gold" value={r.stone} onChange={(stone) => setRow(i, { stone })} />
                  </div>
                </div>
              ))}
            </div>
            {trays ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button icon={<Plus size={16} />} onClick={() => setRows([...rows, { scaleId: state.lastScaleId, gross: '', stone: '' }])}>
                  Add another tray
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setTrays(false);
                    setRows(rows.slice(0, 1));
                  }}
                >
                  Weigh it as one parcel
                </Button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-3">
                Too heavy for this balance?{' '}
                <button type="button" className="font-semibold text-gold-ink underline" onClick={() => setTrays(true)}>
                  Weigh it in trays
                </button>
                . Each tray is its own weighing on its own scale, and they add up.
              </p>
            )}
            <div className="mt-5 rounded-xl bg-gold-soft p-4">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-gold-ink">So the pure gold in this parcel is</p>
              <p className="mt-1 font-mono text-[26px] font-semibold text-ink tabular">{allTyped ? `${fmtG(fromU(netU))} g` : '—'}</p>
              {allTyped && (
                <p className="font-mono text-sm text-ink-2 tabular">
                  {fmtG(fromU(grossU))} − {fmtG(fromU(stoneU))}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <SectionLabel className="mb-1">Say what is inside · mixed is fine</SectionLabel>
            <p className="mb-3 text-sm text-ink-3">List the items. Counts add up as you go. You never set a total.</p>
            <datalist id="kinds">
              {suggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <div className="space-y-3">
              {kinds.map((k, i) => (
                <div key={i} className="flex items-end gap-3">
                  <Field label={i === 0 ? 'Kind of item' : 'Another kind'} className="flex-1">
                    <Input list="kinds" value={k.kind} onChange={(e) => setKind(i, { kind: e.target.value })} placeholder="Temple Haram · Chettinad" />
                  </Field>
                  <Field label="How many" className="w-28">
                    <Input inputMode="numeric" value={k.count} onChange={(e) => setKind(i, { count: e.target.value.replace(/\D/g, '') })} placeholder="0" />
                  </Field>
                  {kinds.length > 1 && (
                    <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => setKinds(kinds.filter((_, j) => j !== i))} aria-label={`Remove ${k.kind || 'this row'}`} />
                  )}
                </div>
              ))}
            </div>
            <Button className="mt-4" icon={<Plus size={16} />} onClick={() => setKinds([...kinds, { kind: '', count: '' }])}>
              Add another kind of item
            </Button>
            <p className="mt-4 text-[15px] font-semibold text-ink">That is {total} item{total === 1 ? '' : 's'} to tag in the next step</p>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionLabel className="mb-2">Open the parcel for tagging</SectionLabel>
            <p className="text-sm text-ink-2">
              The three weights above are what the {total || 'N'} tags will have to add up to, exactly, on this scale. Nothing can be released until every item is tagged and the sums match.
            </p>
            {error && (
              <div className="mt-4">
                <Notice tone="stop">{error}</Notice>
              </div>
            )}
            <Button variant="primary" size="lg" block className="mt-5" onClick={start}>
              Start tagging · 0 of {total || 0}
            </Button>
            <Button variant="quiet" block className="mt-2" onClick={() => go('parcels')}>
              Back to parcels
            </Button>
          </Card>
          {job && (
            <Card>
              <SectionLabel className="mb-2">The job it came back from</SectionLabel>
              <p className="text-[15px] font-semibold text-ink">{job.title}</p>
              <p className="text-sm text-ink-3">
                {job.id} · gold issued {fmtG(job.goldIssuedG)} g
              </p>
            </Card>
          )}
        </div>
      </div>
    </StepFrame>
  );
}
