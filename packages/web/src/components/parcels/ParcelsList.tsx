import { Plus } from 'lucide-react';
import { ago } from '@goldsmith/shared';
import { fmtG, fromU } from '@goldsmith/shared';
import { evaluate } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Parcel } from '@goldsmith/shared';
import { Button, Card, PageHeader, Pill, SectionLabel, StatusChip } from '../ui';
import { parcelTarget } from './util';

export function ParcelsList() {
  const { state, go, role, now } = useStore();
  const open = state.parcels
    .filter((p) => p.status !== 'released')
    .sort((a, b) => Number(b.status === 'stopped') - Number(a.status === 'stopped') || a.arrivedAt - b.arrivedAt);
  const done = state.parcels.filter((p) => p.status === 'released').sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0)).slice(0, 4);
  const karigarName = (id: string) => state.karigars.find((k) => k.id === id)?.name ?? id;

  const progress = (p: Parcel): string => {
    if (p.weighings.length === 0) return 'Not weighed yet';
    const ev = evaluate(state, p);
    if (ev.tagged < ev.expected) return `${ev.tagged} of ${ev.expected} tagged · ${ev.expected - ev.tagged} to tag`;
    return `All ${ev.expected} tagged`;
  };

  return (
    <div>
      <PageHeader
        title="Parcels in"
        subtitle="Finished work coming back from karigars. Each parcel is weighed, tagged piece by piece, and matched before anything reaches the showcase."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('parcel-arrival')}>
            A parcel has arrived
          </Button>
        }
      />

      <SectionLabel className="mb-3">Open parcels · {open.length}</SectionLabel>
      {open.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">No parcel is waiting. When a karigar hands a job over, it appears here.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {open.map((p) => {
            const ev = evaluate(state, p);
            const target = parcelTarget(state, p, role);
            const sentBack = p.resolution === 'sent_back';
            const stopped = p.status === 'stopped';
            return (
              <li key={p.id}>
                <Card className={`flex flex-wrap items-center gap-4 border-l-4 ${stopped ? 'border-l-stop' : 'border-l-wait'}`}>
                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[15px] font-semibold text-ink">{p.id}</span>
                      <StatusChip kind="parcel" value={sentBack ? 'sent_back' : stopped ? 'stopped' : 'open'} />
                      {!stopped && ev.verdict === 'exact' && <StatusChip kind="verdict" value="exact" />}
                      {!stopped && ev.verdict === 'last_digit' && <StatusChip kind="verdict" value="last_digit" />}
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {karigarName(p.karigarId)}
                      {p.jobId && <> · job {p.jobId}</>}
                      {p.poRef && <> · {p.poRef}</>} · arrived {ago(p.arrivedAt, now)}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-3">
                      {sentBack ? 'Sent back to the karigar. Waiting for his hand-over.' : progress(p)}
                      {p.weighings.length > 0 && !sentBack && (
                        <>
                          {' '}
                          · said {fmtG(fromU(ev.said.netU))} g pure gold
                        </>
                      )}
                    </p>
                  </div>
                  {p.jobId && <Pill>{state.jobs.find((j) => j.id === p.jobId)?.title ?? p.jobId}</Pill>}
                  <Button
                    variant={stopped ? 'secondary' : 'primary'}
                    disabled={sentBack}
                    onClick={() => go(target.id, target.params)}
                  >
                    {p.weighings.length === 0 ? 'Weigh it' : stopped ? 'Open' : ev.tagged < ev.expected ? 'Keep tagging' : 'Match and release'}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <div className="mt-8">
          <SectionLabel className="mb-3">Released lately</SectionLabel>
          <ul className="space-y-2">
            {done.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-2">
                <span className="font-mono font-semibold text-ink">{p.id}</span>
                <span>{karigarName(p.karigarId)}</span>
                <span className="text-ink-3">released {p.releasedAt ? ago(p.releasedAt, now) : ''}</span>
                <Button variant="quiet" size="sm" className="ml-auto" onClick={() => go('parcel-match', { parcelId: p.id })}>
                  View
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
