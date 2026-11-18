import { useState } from 'react';
import { fmtG, fmtMg, fromU } from '@goldsmith/shared';
import { evaluate, parcelPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import { ProblemBanner } from '../problems/ProblemBanner';
import { Button, Card, Notice, PageHeader, SectionLabel, Select, Textarea } from '../ui';
import { gapText } from './util';

/** Screen 22: a parcel that will not add up. Three ways out, and only the owner can take them. */
export function OwnerClearMismatch() {
  const { state, route, go, actions, role } = useStore();
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  const [recheckId, setRecheckId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!parcel) {
    const waiting = state.parcels.filter((p) => p.status === 'stopped');
    return (
      <div>
        <PageHeader title="A parcel that will not add up" subtitle="Choose a stopped parcel." />
        <Card>
          {waiting.length === 0 ? (
            <p className="text-[15px] text-ink-2">No parcel is stopped.</p>
          ) : (
            <ul className="space-y-2">
              {waiting.map((p) => (
                <li key={p.id}>
                  <Button onClick={() => go('parcel-clear', { parcelId: p.id })}>{p.id}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  const ev = evaluate(state, parcel);
  const pieces = parcelPieces(state, parcel.id).sort((a, b) => a.taggedAt - b.taggedAt);
  const karigar = state.karigars.find((k) => k.id === parcel.karigarId);
  const first = karigar?.name.split(' ')[0] ?? 'the karigar';
  const owner = role === 'owner';
  const netGapG = fromU(ev.gap.netU);
  const gapMg = Math.round(Math.abs(netGapG) * 1000);
  const times = ev.ceiling.ceilingU > 0 ? Math.round(ev.worstU / ev.ceiling.ceilingU) : 0;
  const hist = karigar?.gapsMg ?? [];
  const usual = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
  const ratio = usual > 0 ? gapMg / usual : 0;
  const stonesAgree = ev.gap.stoneU === 0;
  const problemOpen = state.problems.some((p) => p.status === 'open' && p.target.kind === 'parcel' && p.target.id === parcel.id);
  const stillWaiting = parcel.status === 'stopped' && ev.verdict === 'mismatch';

  const run = (fn: () => { ok: boolean; error?: string }, after: () => void) => {
    setError(null);
    const r = fn();
    if (!r.ok) return setError(r.error ?? 'That did not work.');
    after();
  };

  if (!stillWaiting && !problemOpen) {
    return (
      <div>
        <PageHeader title={`${parcel.id} is not waiting for you`} subtitle="It does not have a gap that needs the owner." />
        <Button variant="primary" onClick={() => go('parcel-match', { parcelId: parcel.id })}>
          Open the match screen
        </Button>
      </div>
    );
  }

  const rows = [
    { label: 'On the scale', said: fromU(ev.said.grossU), tags: fromU(ev.tags.grossU), gap: fromU(ev.gap.grossU) },
    { label: 'Stones and other', said: fromU(ev.said.stoneU), tags: fromU(ev.tags.stoneU), gap: fromU(ev.gap.stoneU) },
    { label: 'Pure gold', said: fromU(ev.said.netU), tags: fromU(ev.tags.netU), gap: netGapG, bold: true },
  ];

  return (
    <div>
      <PageHeader
        title={stillWaiting ? `${parcel.id} will not add up` : `${parcel.id} is stopped`}
        subtitle={
          stillWaiting
            ? `${karigar?.name ?? 'The karigar'} · all ${ev.expected} items tagged, but the gold is ${fmtMg(netGapG)} ${netGapG < 0 ? 'short of' : 'over'} the parcel. Staff cannot release it. This is yours.`
            : 'A problem was raised on this parcel. Read it and clear it when it is dealt with.'
        }
        actions={<Button onClick={() => go('parcels')}>Back to parcels</Button>}
      />
      {!owner && (
        <div className="mb-5">
          <Notice tone="stop">Only the owner can clear a parcel. This page is for reading.</Notice>
        </div>
      )}
      <div className="mb-5">
        <ProblemBanner target={{ kind: 'parcel', id: parcel.id }} />
      </div>
      {problemOpen && stillWaiting && <p className="mb-5 text-sm text-ink-2">Clear the raised problem first. The three ways out open once it is cleared.</p>}

      {stillWaiting && (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <SectionLabel className="mb-3">What does not match</SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left">
                  <thead>
                    <tr className="border-b border-line text-xs font-bold uppercase tracking-[0.1em] text-ink-4">
                      <th className="py-2 pr-3" />
                      <th className="py-2 pr-3 text-right font-bold">Parcel said</th>
                      <th className="py-2 pr-3 text-right font-bold">{ev.expected} tags say</th>
                      <th className="py-2 text-right font-bold">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-b border-line last:border-0">
                        <td className={`py-3 pr-3 text-[15px] text-ink ${r.bold ? 'font-semibold' : ''}`}>{r.label}</td>
                        <td className="py-3 pr-3 text-right font-mono text-lg tabular">{fmtG(r.said)}</td>
                        <td className="py-3 pr-3 text-right font-mono text-lg tabular">{fmtG(r.tags)}</td>
                        <td className={`py-3 text-right font-mono text-lg tabular ${r.gap === 0 ? 'text-live' : 'font-semibold text-stop'}`}>{gapText(r.gap)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[15px] text-ink-2">
                {stonesAgree ? 'The stones match. All the gap is in the gold.' : 'The stones do not match either.'} The scales could only explain {fmtMg(ev.ceiling.ceilingG)}.{' '}
                {times > 1 ? `This is ${times} times that. ` : ''}Real gold, not rounding.
              </p>
            </Card>

            <Card>
              <SectionLabel className="mb-3">Is this like him?</SectionLabel>
              <p className="text-[15px] font-semibold text-ink">
                {karigar?.name} · {karigar?.id}
              </p>
              <p className="mb-3 text-sm text-ink-3">
                {karigar?.specialty} · gold issued this job {fmtG(state.jobs.find((j) => j.id === parcel.jobId)?.goldIssuedG ?? fromU(ev.said.netU))} g
              </p>
              {hist.length > 0 ? (
                <>
                  <p className="mb-2 text-sm font-semibold text-ink-2">His last {hist.length} parcels, gold gap</p>
                  <ul className="mb-3 flex flex-wrap gap-2">
                    {hist.map((h, i) => (
                      <li key={i} className="rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-sm tabular text-ink-2">
                        {h} mg
                      </li>
                    ))}
                  </ul>
                  <p className="text-[15px] font-semibold text-ink">
                    Today: {gapMg} mg{ratio >= 2 ? `. Over ${Math.floor(ratio)} times his usual.` : '. Close to his usual.'}
                  </p>
                  {ratio >= 2 && <p className="text-sm text-ink-2">This is not his normal polishing loss.</p>}
                </>
              ) : (
                <p className="text-sm text-ink-2">No earlier parcels to compare with.</p>
              )}
            </Card>
          </div>

          <SectionLabel className="mb-3 mt-8">Your three ways out</SectionLabel>
          {error && (
            <div className="mb-3">
              <Notice tone="stop">{error}</Notice>
            </div>
          )}
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-ink">Send the parcel back to {first}</h3>
              <p className="mt-1 text-sm text-ink-2">
                He finds the missing {fmtMg(netGapG)} and returns the parcel. All {ev.expected} pieces stay off the floor until he does. The expected answer when the gold is genuinely missing.
              </p>
              <Button
                className="mt-auto self-start"
                variant="primary"
                disabled={!owner || problemOpen}
                onClick={() => run(() => actions.ownerSendBack({ parcelId: parcel.id }), () => go('parcels'))}
              >
                Send it back
              </Button>
            </Card>

            <Card className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-ink">Have staff re-check a tag</h3>
              <p className="mt-1 text-sm text-ink-2">
                If one piece looks mis-weighed, send it back to tagging. Often a single figure typed wrong closes the whole gap. The parcel stays stopped; only that tag reopens.
              </p>
              <Select className="my-3" aria-label="Tag to redo" value={recheckId} onChange={(e) => setRecheckId(e.target.value)} disabled={!owner || problemOpen}>
                <option value="">Point to a tag to redo</option>
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name} · {fmtG(p.grossG)} g
                  </option>
                ))}
              </Select>
              <Button
                className="mt-auto self-start"
                disabled={!owner || problemOpen || !recheckId}
                onClick={() => run(() => actions.ownerRecheckTag({ parcelId: parcel.id, pieceId: recheckId }), () => go('parcels'))}
              >
                Send this tag back
              </Button>
            </Card>

            <Card className="flex flex-col">
              <h3 className="text-[15px] font-semibold text-ink">Accept the loss and release anyway</h3>
              <p className="mt-1 text-sm text-ink-2">
                You judge the {gapMg} mg is genuine wastage, not an error. The parcel goes live and the loss is booked against {first}. Needs a reason, kept against your name. This is the only way a mismatched parcel ever reaches stock.
              </p>
              <label className="mt-3 block text-sm font-semibold text-ink-2" htmlFor="loss-reason">
                Reason: why this loss is acceptable
              </label>
              <Textarea id="loss-reason" className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!owner || problemOpen} />
              <Button
                className="mt-3 self-start"
                variant="danger"
                disabled={!owner || problemOpen || reason.trim().length < 3}
                onClick={() => run(() => actions.ownerAcceptLoss({ parcelId: parcel.id, reason }), () => go('stock'))}
              >
                Release with the loss booked
              </Button>
            </Card>
          </div>
          <p className="mt-4 text-sm text-ink-3">Releasing a parcel that does not add up is logged against you, with your reason. Nothing here can be done by staff.</p>
        </>
      )}
    </div>
  );
}
