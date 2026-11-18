import { OctagonAlert } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDate, fmtTime } from '@goldsmith/shared';
import { fmtG, fmtMg, fromU, netOf } from '@goldsmith/shared';
import { evaluate, parcelPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Verdict } from '@goldsmith/shared';
import { ProblemBanner } from '../problems/ProblemBanner';
import { RaiseProblem } from '../problems/RaiseProblem';
import { Button, Card, MatchGauge, Notice, SectionLabel, StatusChip, StepFrame, cn } from '../ui';
import { QcPanel } from './QcCheck';
import { gapText } from './util';

/** Step 3: parcel said vs tags say, the gauge, and the only three answers this screen can give. */
export function ParcelMatch() {
  const { state, route, go, actions, role } = useStore();
  const [raising, setRaising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parcel = state.parcels.find((p) => p.id === route.params?.parcelId);
  if (!parcel) {
    return (
      <StepFrame step={3} title="Match and release" subtitle="Choose a parcel first.">
        <Button onClick={() => go('parcels')}>Back to parcels</Button>
      </StepFrame>
    );
  }
  const ev = evaluate(state, parcel);
  const pieces = parcelPieces(state, parcel.id).sort((a, b) => a.taggedAt - b.taggedAt);
  const karigar = state.karigars.find((k) => k.id === parcel.karigarId);
  const scaleNames = [...new Set(parcel.weighings.map((w) => state.scales.find((s) => s.id === w.scaleId)?.name).filter(Boolean))].join(', ');
  const released = parcel.status === 'released';
  const stopped = parcel.status === 'stopped';
  const sentBack = parcel.resolution === 'sent_back';
  const checked = pieces.filter((p) => parcel.qcDone.includes(p.id)).length;
  const allChecked = pieces.length > 0 && checked === pieces.length;
  const canRelease = !released && !stopped && (ev.verdict === 'exact' || ev.verdict === 'last_digit') && allChecked;
  const netGapG = fromU(ev.gap.netU);
  const times = ev.ceiling.ceilingU > 0 ? Math.round(ev.worstU / ev.ceiling.ceilingU) : 0;
  const missing = ev.expected - ev.tagged;

  const release = () => {
    setError(null);
    const r = actions.releaseParcel({ parcelId: parcel.id });
    if (!r.ok) setError(r.error ?? 'Could not release the parcel.');
  };

  const verdictNow: Verdict = ev.verdict;
  const rows = [
    { label: 'On the scale', note: 'everything together', said: fromU(ev.said.grossU), tags: fromU(ev.tags.grossU), gap: fromU(ev.gap.grossU) },
    { label: 'Stones, pearls, lac', note: 'anything not gold', said: fromU(ev.said.stoneU), tags: fromU(ev.tags.stoneU), gap: fromU(ev.gap.stoneU) },
    { label: 'Pure gold', note: 'what we are really counting', said: fromU(ev.said.netU), tags: fromU(ev.tags.netU), gap: netGapG, bold: true },
  ];

  return (
    <StepFrame
      step={3}
      maxStep={3}
      onStep={(st) => (st === 1 ? go('parcel-arrival', { parcelId: parcel.id }) : go('parcel-tag', { parcelId: parcel.id }))}
      title={`${parcel.id} · ${karigar?.name ?? parcel.karigarId}`}
      subtitle={
        <>
          {parcel.poRef ? `Order ${parcel.poRef} · ` : ''}arrived {fmtDate(parcel.arrivedAt)} {fmtTime(parcel.arrivedAt)} · {ev.expected} items · weighed on {scaleNames || 'no scale yet'}
        </>
      }
      actions={
        !released && (
          <Button variant="danger" icon={<OctagonAlert size={16} />} onClick={() => setRaising(true)}>
            Raise a problem
          </Button>
        )
      }
    >
      <div className="space-y-5">
        <ProblemBanner target={{ kind: 'parcel', id: parcel.id }} />

        {released && (
          <Notice tone="live">
            Released by {parcel.releasedBy} on {parcel.releasedAt ? `${fmtDate(parcel.releasedAt)} ${fmtTime(parcel.releasedAt)}` : ''}. {pieces.length} pieces are in stock.
            {parcel.resolution === 'loss_accepted' && parcel.lossG !== null && ` The owner accepted a loss of ${fmtMg(parcel.lossG)}.`}
          </Notice>
        )}

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionLabel>Every item on the list must be tagged</SectionLabel>
            <p className="text-[15px] font-semibold text-ink">
              {ev.tagged} of {ev.expected} tagged <span className="font-normal text-ink-3">· no allowance here</span>
            </p>
          </div>
          {pieces.length > 0 && (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {pieces.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm">
                  <span className="min-w-0 truncate text-ink-2">
                    <span className="font-mono text-ink">{p.id}</span> · {p.name}
                  </span>
                  <span className="font-mono tabular text-ink-2">{fmtG(netOf(p))}</span>
                </li>
              ))}
            </ul>
          )}
          {missing > 0 && !stopped && !released && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Notice tone="wait">
                {missing} item{missing === 1 ? '' : 's'} still to tag.
              </Notice>
              <Button variant="primary" onClick={() => go('parcel-tag', { parcelId: parcel.id })}>
                Keep tagging
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <SectionLabel className="mb-3">And all three weights must agree</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-line text-xs font-bold uppercase tracking-[0.1em] text-ink-4">
                  <th className="py-2 pr-3 font-bold" />
                  <th className="py-2 pr-3 text-right font-bold">The parcel said</th>
                  <th className="py-2 pr-3 text-right font-bold">The {ev.expected} tags say</th>
                  <th className="py-2 text-right font-bold">Gap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-line last:border-0">
                    <td className="py-3 pr-3">
                      <p className={cn('text-[15px] text-ink', r.bold && 'font-semibold')}>{r.label}</p>
                      <p className="text-sm text-ink-3">{r.note}</p>
                    </td>
                    <td className="py-3 pr-3 text-right font-mono text-lg tabular text-ink">{fmtG(r.said)}</td>
                    <td className="py-3 pr-3 text-right font-mono text-lg tabular text-ink">{ev.tagged > 0 ? fmtG(r.tags) : '—'}</td>
                    <td
                      className={cn(
                        'py-3 text-right font-mono text-lg tabular',
                        verdictNow === 'incomplete' ? 'text-ink-4' : r.gap === 0 ? 'text-live' : verdictNow === 'mismatch' ? 'font-semibold text-stop' : 'text-wait',
                      )}
                    >
                      {verdictNow === 'incomplete' ? '—' : gapText(r.gap)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {verdictNow !== 'incomplete' && (
            <div className="mt-5 max-w-2xl">
              <SectionLabel className="mb-3">The gap on pure gold, either way</SectionLabel>
              <MatchGauge
                gapG={netGapG}
                ceilingG={ev.ceiling.ceilingG}
                caption={`The faint band is ±${fmtMg(ev.ceiling.ceilingG)}. All that ${ev.ceiling.weighings} weighings of rounding could ever explain: ${ev.ceiling.line}.`}
              />
            </div>
          )}
        </Card>

        {verdictNow === 'exact' && (
          <Notice tone="live">
            Matches exactly. {ev.tagged} of {ev.expected} items tagged, gross, stones and pure gold all agree to the last digit. Nothing needs the owner.
          </Notice>
        )}
        {verdictNow === 'last_digit' && (
          <Notice tone="wait">
            Off by the last digit only. Matches to the scale's last digit: the largest gap is {fmtMg(fromU(ev.worstU))}, and rounding across {ev.ceiling.weighings} weighings can produce up to {fmtMg(ev.ceiling.ceilingG)} with no gold lost. You can release it, and the release is logged.
          </Notice>
        )}
        {verdictNow === 'mismatch' && (
          <Notice tone="stop">
            Gold unaccounted for: {fmtMg(netGapG)} {netGapG < 0 ? 'short' : 'over'}, {times} times what rounding could explain. Stopped. Only the owner can clear it.
          </Notice>
        )}

        {ev.tagged > 0 && <QcPanel parcel={parcel} pieces={pieces} />}

        {!released && (
          <Card>
            {stopped ? (
              <div className="space-y-3">
                <p className="text-[15px] font-semibold text-stop">Stopped. Only the owner can clear it.</p>
                {sentBack && <p className="text-sm text-ink-2">The owner sent this parcel back to {karigar?.name ?? 'the karigar'}. It reopens at the weighing step when he hands it over again.</p>}
                {parcel.resolution === 'rechecking' && parcel.recheckPieceId && (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-ink-2">
                      The owner asked for <span className="font-mono font-semibold">{parcel.recheckPieceId}</span> to be weighed again.
                    </p>
                    <Button variant="primary" onClick={() => go('parcel-tag', { parcelId: parcel.id, pieceId: parcel.recheckPieceId ?? '' })}>
                      Re-tag {parcel.recheckPieceId}
                    </Button>
                  </div>
                )}
                {role === 'owner' && (
                  <Button variant="primary" onClick={() => go('parcel-clear', { parcelId: parcel.id })}>
                    Open the owner's screen
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-xl text-sm text-ink-2">
                  Releasing also closes {karigar?.name ?? "the karigar"}'s job and settles the gold issued against it. Each piece must be checked first.
                </p>
                <Button variant="primary" size="lg" disabled={!canRelease} onClick={release}>
                  Release {pieces.length} piece{pieces.length === 1 ? '' : 's'} into stock
                </Button>
              </div>
            )}
            {!stopped && (verdictNow === 'exact' || verdictNow === 'last_digit') && !allChecked && (
              <p className="mt-3 text-sm font-semibold text-wait">Check every piece first. {pieces.length - checked} still to check.</p>
            )}
            {error && (
              <div className="mt-3">
                <Notice tone="stop">{error}</Notice>
              </div>
            )}
          </Card>
        )}

        {released && (
          <Button variant="primary" onClick={() => go('stock')}>
            See them in showroom stock
          </Button>
        )}

        <Card className="bg-paper">
          <SectionLabel className="mb-3">The only three answers this screen can give</SectionLabel>
          <div className="grid gap-3 md:grid-cols-3">
            <Answer chip={<StatusChip kind="verdict" value="exact" />} now={verdictNow === 'exact'} title="0 mg">
              Staff release it. The owner never sees the parcel at all. The normal day.
            </Answer>
            <Answer chip={<StatusChip kind="verdict" value="last_digit" />} now={verdictNow === 'last_digit'} title={`Up to ${fmtMg(ev.ceiling.ceilingG)} here`}>
              Rounding across {ev.ceiling.weighings || 'all the'} weighings can produce this with no gold lost. Staff can release it, and the release is logged.
            </Answer>
            <Answer chip={<StatusChip kind="verdict" value="mismatch" />} now={verdictNow === 'mismatch'} title={`More than ${fmtMg(ev.ceiling.ceilingG)}`}>
              More than rounding could explain. The parcel stops dead. Only the owner can clear it.
            </Answer>
          </div>
          <p className="mt-3 text-sm text-ink-3">
            {ev.ceiling.weighings > 0
              ? `Ceiling: ${ev.ceiling.line}. It follows the scales used; there is nothing to set.`
              : 'The ceiling comes from the scales used. There is nothing to set.'}
          </p>
        </Card>
      </div>
      <RaiseProblem open={raising} onClose={() => setRaising(false)} target={{ kind: 'parcel', id: parcel.id }} />
    </StepFrame>
  );
}

function Answer({ chip, title, now, children }: { chip: ReactNode; title: string; now: boolean; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-surface p-4', now ? 'border-gold ring-2 ring-gold/40' : 'border-line')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {chip}
        {now && <span className="text-xs font-bold uppercase tracking-[0.1em] text-gold-ink">This parcel</span>}
      </div>
      <p className="font-mono text-lg font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </div>
  );
}
