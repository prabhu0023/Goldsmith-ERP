import { Plus } from 'lucide-react';
import { useState } from 'react';
import { fmtDate } from '@goldsmith/shared';
import { fmtG } from '@goldsmith/shared';
import { agreedDate, goldWithKarigar, jobOverdueDays, jobsForKarigar, openJobsForKarigar } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Karigar } from '@goldsmith/shared';
import { Button, Card, PageHeader, Pill, StatusChip, WeightReadout } from '../ui';
import { avgGapMg, plural } from '../home/util';

function Ledger({ k }: { k: Karigar }) {
  const { state, now } = useStore();
  const jobs = jobsForKarigar(state, k.id);
  const parcels = state.parcels.filter((p) => p.karigarId === k.id);
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Open ledger · jobs</p>
      {jobs.length === 0 ? (
        <p className="text-sm text-ink-2">No jobs have been sent to {k.name} yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {jobs.map((j) => {
            const late = jobOverdueDays(j, now);
            return (
              <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-[12rem] flex-1">
                  <span className="block font-semibold text-ink">{j.title}</span>
                  <span className="block font-mono text-[13px] text-ink-3">{j.id}</span>
                </span>
                {j.stopped ? <StatusChip kind="job" value="stopped" /> : <StatusChip kind="job" value={j.status} />}
                {late > 0 && <StatusChip kind="job" value="overdue" label={`${plural(late, 'day')} over`} />}
                <span className="w-32 text-ink-3">due {fmtDate(agreedDate(j))}</span>
                <span className="w-32 text-right font-mono tabular text-ink-2">{fmtG(j.goldIssuedG)} g issued</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Parcels back</p>
      {parcels.length === 0 ? (
        <p className="text-sm text-ink-2">No parcels yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {parcels.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="min-w-[10rem] flex-1 font-mono font-semibold text-ink">{p.id}</span>
              {p.status === 'released' ? <StatusChip kind="parcel" value="released" /> : <StatusChip kind="parcel" value={p.status === 'stopped' ? 'stopped' : 'open'} />}
              {p.verdict !== 'incomplete' && <StatusChip kind="verdict" value={p.verdict} />}
              {p.lossG !== null && <span className="text-ink-3">loss accepted: {fmtG(p.lossG)} g</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KarigarCard({ k, open, onToggle }: { k: Karigar; open: boolean; onToggle: () => void }) {
  const { state, now } = useStore();
  const openJobs = openJobsForKarigar(state, k.id);
  const late = openJobs.filter((j) => jobOverdueDays(j, now) > 0).length;
  const inside = k.metalLossPct <= k.wastagePct;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[12rem]">
          <p className="text-[17px] font-semibold text-ink">
            {k.name} · <span className="font-mono">{k.id}</span>
          </p>
          <p className="text-sm text-ink-3">
            {k.specialty} · {k.language} · {k.phone}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill>allows {k.wastagePct.toFixed(2)}% loss</Pill>
            {k.finishedJobs > 0 &&
              (inside ? <StatusChip tone="live" label="Inside allowance" /> : <StatusChip tone="stop" label="Over allowance" />)}
            {late > 0 && <StatusChip tone="wait" label={`${plural(late, 'job')} past the date`} />}
          </div>
        </div>
        <Button onClick={onToggle} aria-expanded={open}>
          {open ? 'Close ledger' : 'Open ledger'}
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <dt className="text-sm text-ink-3">Gold with them</dt>
          <dd className="mt-1">
            <WeightReadout g={goldWithKarigar(state, k.id)} size="body" />
          </dd>
          <dd className="text-[13px] text-ink-3">{plural(openJobs.length, 'open job')}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Metal loss</dt>
          <dd className={`font-mono text-lg font-medium tabular ${inside ? 'text-ink' : 'text-stop'}`}>{k.finishedJobs > 0 ? `${k.metalLossPct.toFixed(2)}%` : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Delivers</dt>
          <dd className="font-mono text-lg font-medium text-ink tabular">{k.finishedJobs > 0 ? `${k.lateDays > 0 ? '+' : ''}${k.lateDays.toFixed(1)} days` : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Rating</dt>
          <dd className="font-mono text-lg font-medium text-ink tabular">{k.finishedJobs > 0 ? `${k.rating.toFixed(1)} / 5` : 'None yet'}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Last parcel gaps</dt>
          <dd className="font-mono text-sm font-medium text-ink tabular">{k.gapsMg.length ? `${k.gapsMg.join(', ')} mg` : 'None yet'}</dd>
          <dd className="text-[13px] text-ink-3">{k.gapsMg.length ? `average ${avgGapMg(k)} mg` : `${k.finishedJobs} jobs finished`}</dd>
        </div>
      </dl>
      {open && <Ledger k={k} />}
    </Card>
  );
}

/** Owner only: every karigar with the figures that judge them, worst first, and a ledger of their jobs. */
export function Karigars() {
  const { state, go, role, route } = useStore();
  const [openId, setOpenId] = useState<string | null>(route.params?.karigarId ?? null);
  if (role !== 'owner') {
    return (
      <div>
        <PageHeader title="Karigars" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner sees the karigar ledger.</p>
        </Card>
      </div>
    );
  }
  const ranked = [...state.karigars].sort((a, b) => b.metalLossPct - b.wastagePct - (a.metalLossPct - a.wastagePct));
  return (
    <div>
      <PageHeader
        title="Karigars"
        subtitle="The artisans you issue gold to, worst first. The allowance is what every one of their parcels is judged against."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('karigar-new')}>
            Add a karigar
          </Button>
        }
      />
      <div className="space-y-3">
        {ranked.map((k) => (
          <KarigarCard key={k.id} k={k} open={openId === k.id} onToggle={() => setOpenId(openId === k.id ? null : k.id)} />
        ))}
      </div>
    </div>
  );
}
