import { useState } from 'react';
import type { FormEvent } from 'react';
import { fmtG, fmtMg, fromU, trimNum } from '../../domain/weights';
import { evaluate } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Scale } from '../../types/jewellery';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, StatusChip } from '../ui';

const fmtCapacity = (g: number): string => (g >= 1000 ? `${trimNum(g / 1000)} kg` : `${trimNum(g)} g`);

function ScaleForm({ scale, onDone }: { scale?: Scale; onDone: () => void }) {
  const { actions } = useStore();
  const [name, setName] = useState(scale?.name ?? '');
  const [step, setStep] = useState(scale ? trimNum(scale.readabilityG) : '');
  const [cap, setCap] = useState(scale ? trimNum(scale.capacityG) : '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const readabilityG = Number(step);
    const capacityG = Number(cap);
    if (!name.trim()) return setError('Name the scale.');
    if (!(readabilityG > 0)) return setError('Enter the smallest step the scale reads, in grams, for example 0.0001.');
    if (!(capacityG > 0)) return setError('Enter the heaviest load the scale can take, in grams.');
    const r = actions.upsertScale({ scale: { id: scale?.id, name: name.trim(), readabilityG, capacityG } });
    if (!r.ok) return setError(r.error ?? 'That did not save.');
    onDone();
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-line-2 bg-paper p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Scale name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Smallest step (g)">
          <Input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" placeholder="0.0001" className="font-mono" />
        </Field>
        <Field label="Heaviest load (g)">
          <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" placeholder="600" className="font-mono" />
        </Field>
      </div>
      {error && (
        <div className="mt-3">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" variant="primary">
          {scale ? 'Save this scale' : 'Add this scale'}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function WorkedExample() {
  const { state } = useStore();
  const [parcelId, setParcelId] = useState(state.parcels.find((p) => p.status !== 'released' && p.weighings.length > 0)?.id ?? state.parcels[0]?.id ?? '');
  const parcel = state.parcels.find((p) => p.id === parcelId);
  const ev = parcel ? evaluate(state, parcel) : null;
  const karigar = parcel ? state.karigars.find((k) => k.id === parcel.karigarId)?.name : undefined;

  return (
    <Card>
      <SectionLabel>The same rule on a parcel in the shop</SectionLabel>
      <p className="mt-1 text-sm text-ink-3">Pick any parcel. The ceiling is worked out from the scales it was weighed on.</p>
      <div className="mt-3 max-w-md">
        <Field label="Parcel">
          <select
            value={parcelId}
            onChange={(e) => setParcelId(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-line-2 bg-surface px-3 text-sm text-ink focus:border-gold"
          >
            {state.parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} · {state.karigars.find((k) => k.id === p.karigarId)?.name ?? p.karigarId}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {parcel && ev && (
        <div className="mt-4 space-y-4">
          {ev.ceiling.weighings === 0 ? (
            <p className="text-[15px] text-ink-2">{parcel.id} has not been weighed yet, so there is nothing to work out.</p>
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Weighings</p>
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {ev.ceiling.rows.map((r) => (
                    <li key={r.scaleId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-ink-2">
                        {r.count} on {r.name} (reads to {trimNum(r.readabilityG)} g)
                      </span>
                      <span className="font-mono tabular text-ink-3">
                        {r.count} × ½ × {trimNum(r.readabilityG)} g = {fmtG(fromU(r.subtotalU))} g
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-ink-2">
                  {ev.ceiling.line}
                  <span className="block text-[13px] text-ink-3">{ev.ceiling.weighings} weighings in all. The most the instruments alone can explain.</span>
                </p>
                <div className="text-right">
                  <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Ceiling for this parcel</p>
                  <p className="font-mono text-[26px] font-semibold text-ink tabular">{fmtG(ev.ceiling.ceilingG)} g</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold uppercase tracking-[0.1em] text-ink-4">
                      <th className="py-2 pr-3">The gap today</th>
                      <th className="py-2 pr-3 text-right">Parcel said</th>
                      <th className="py-2 pr-3 text-right">Tags add to</th>
                      <th className="py-2 text-right">Gap</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular">
                    {(
                      [
                        ['Gross', ev.said.grossU, ev.tags.grossU, ev.gap.grossU],
                        ['Stones', ev.said.stoneU, ev.tags.stoneU, ev.gap.stoneU],
                        ['Pure gold', ev.said.netU, ev.tags.netU, ev.gap.netU],
                      ] as const
                    ).map(([label, said, tags, gap]) => (
                      <tr key={label} className="border-t border-line">
                        <td className="py-2 pr-3 font-sans font-semibold text-ink-2">{label}</td>
                        <td className="py-2 pr-3 text-right">{fmtG(fromU(said))}</td>
                        <td className="py-2 pr-3 text-right">{fmtG(fromU(tags))}</td>
                        <td className="py-2 text-right">{fmtG(fromU(Math.abs(gap)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StatusChip kind="verdict" value={ev.verdict} />
                <p className="text-sm text-ink-2">
                  {ev.verdict === 'incomplete' &&
                    `${ev.expected - ev.tagged} of ${ev.expected} pieces are still to tag${karigar ? ` from ${karigar}` : ''}. The rule waits until every item is tagged.`}
                  {ev.verdict === 'exact' && 'Every figure agrees to the last digit. Staff release it.'}
                  {ev.verdict === 'last_digit' &&
                    `The biggest gap is ${fmtMg(fromU(ev.worstU))}, inside the ${fmtMg(ev.ceiling.ceilingG)} the scales could cause. Staff release it.`}
                  {ev.verdict === 'mismatch' &&
                    `The biggest gap is ${fmtMg(fromU(ev.worstU))}, more than the ${fmtMg(ev.ceiling.ceilingG)} the scales could cause. Only the owner can clear it.`}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/** Screen 14. One match rule with no settings; the only thing set up is the scales in the shop. */
export function ScalesRules() {
  const { state, role } = useStore();
  const owner = role === 'owner';
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scales & rules"
        subtitle="One match rule for any parcel that ever arrives. It does not depend on the size of the parcel or the number of pieces. It is worked out from the scales used; nothing is set by hand."
      />

      <Card>
        <SectionLabel>The only rule · it has no settings</SectionLabel>
        <p className="mt-2 text-[15px] text-ink">A parcel matches when every item is tagged and the weight gap is no bigger than the scales could cause.</p>
        <p className="mt-3 rounded-lg bg-paper px-4 py-3 font-mono text-sm text-ink">
          ceiling = sum of ( ½ × the scale's smallest step ) for every weighing taken
        </p>
        <p className="mt-2 text-sm text-ink-3">
          Each weighing can be off by half a step. Add them up. That is the most the instruments alone can explain. The same ceiling applies to gross, stones and pure gold.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Set up once · the scales in the shop</SectionLabel>
            <p className="mt-1 text-sm text-ink-3">
              Each scale is named once with its smallest step. Every weighing remembers which scale it was on. Staff never retype it.
            </p>
          </div>
          {owner && editing === null && (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Add a scale
            </Button>
          )}
        </div>
        <ul className="mt-4 divide-y divide-line">
          {state.scales.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="text-[15px] font-semibold text-ink">{s.name}</p>
                  <p className="text-sm text-ink-3">
                    reads to <span className="font-mono">{trimNum(s.readabilityG)} g</span> · up to {fmtCapacity(s.capacityG)}
                  </p>
                </div>
                <span className="font-mono text-sm text-ink-3 tabular">½ step = {trimNum(s.readabilityG / 2)} g</span>
                {owner && (
                  <Button size="sm" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                    {editing === s.id ? 'Close' : 'Edit'}
                  </Button>
                )}
              </div>
              {editing === s.id && <ScaleForm key={s.id} scale={s} onDone={() => setEditing(null)} />}
            </li>
          ))}
        </ul>
        {editing === 'new' && <ScaleForm onDone={() => setEditing(null)} />}
        {!owner && <p className="mt-3 text-sm text-ink-3">Only the owner can add or change a scale.</p>}
      </Card>

      <WorkedExample />

      <p className="text-sm text-ink-3">
        No parcel size and no piece count appears in the rule, only grams and the scales used. Trays are never required, but because they sharpen the ceiling and pin a gap to one tray, they are worth using on big parcels.
      </p>
    </div>
  );
}
