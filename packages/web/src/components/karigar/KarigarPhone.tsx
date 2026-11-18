import { ArrowLeft, Briefcase, Check, Coins, TriangleAlert, User } from 'lucide-react';
import { useState } from 'react';
import { daysBetween, fmtDayMonth } from '@goldsmith/shared';
import { fmtG } from '@goldsmith/shared';
import { agreedDate, goldWithKarigar, jobsForKarigar } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { JobStatus, Karigar, KarigarJob } from '@goldsmith/shared';
import { RaiseProblem } from '../problems/RaiseProblem';
import { Button, Notice, StatusChip, Textarea, cn } from '../ui';
import { fromDateInput, toDateInput } from '../leads/util';

type Tab = 'jobs' | 'gold' | 'me';

const tabs: { id: Tab; label: string; icon: typeof Briefcase }[] = [
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'gold', label: 'Gold', icon: Coins },
  { id: 'me', label: 'Me', icon: User },
];

function dueLabel(job: KarigarJob, now: number): { text: string; late: boolean } {
  const d = daysBetween(agreedDate(job), now);
  if (d === 0) return { text: 'Due today', late: false };
  if (d > 0) return { text: `Due in ${d} day${d === 1 ? '' : 's'}`, late: false };
  return { text: `${-d} day${d === -1 ? '' : 's'} late`, late: true };
}

export function KarigarPhone() {
  const { state, identity } = useStore();
  const karigar = state.karigars.find((k) => k.id === identity.karigarId);
  if (!karigar) {
    return (
      <div className="p-5">
        <Notice tone="wait">Sign in as a karigar from the switcher to see the bench.</Notice>
      </div>
    );
  }
  return <Phone karigar={karigar} />;
}

function Phone({ karigar }: { karigar: Karigar }) {
  const { state, now } = useStore();
  const [tab, setTab] = useState<Tab>('jobs');
  const [openId, setOpenId] = useState<string | null>(null);

  const all = jobsForKarigar(state, karigar.id);
  const open = all.filter((j) => j.status !== 'handed_over');
  const done = all.filter((j) => j.status === 'handed_over');
  const openJob = openId ? all.find((j) => j.id === openId) : undefined;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {karigar.name} · {karigar.id}
          </p>
          <p className="text-[13px] text-ink-3">{openJob ? 'Job sheet' : tab === 'jobs' ? 'My jobs' : tab === 'gold' ? 'Gold with me' : 'About me'}</p>
        </div>
        <span className="rounded-full border border-line-2 px-3 py-1 text-[15px] font-semibold text-ink-2">हिन्दी</span>
      </header>

      <div className="flex-1 space-y-4 p-4">
        {tab === 'jobs' && openJob && <JobSheet key={openJob.id} job={openJob} onBack={() => setOpenId(null)} />}
        {tab === 'jobs' && !openJob && (
          <>
            <GoldCard karigar={karigar} />
            <section aria-label="My jobs" className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">My jobs · {open.length}</h2>
              {open.length === 0 && <p className="rounded-xl border border-line bg-surface p-4 text-[15px] text-ink-2">Nothing on your bench. New work from the desk shows up here.</p>}
              {open.map((j) => {
                const due = dueLabel(j, now);
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setOpenId(j.id)}
                    className="block min-h-14 w-full rounded-xl border border-line bg-surface p-4 text-left shadow-sm active:bg-paper"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-[17px] font-semibold text-ink">{j.title}</span>
                      <span className={cn('whitespace-nowrap text-sm font-semibold', due.late ? 'text-stop' : 'text-ink-3')}>{due.text}</span>
                    </span>
                    <span className="mt-0.5 block text-[15px] text-ink-3">
                      {j.qty} piece{j.qty === 1 ? '' : 's'}
                      {j.style ? ` · ${j.style}` : ''}
                    </span>
                    <span className="mt-2 block text-[15px] text-ink-2">
                      Make it weigh <b className="font-mono">{fmtG(j.targetGrossG)}</b> g · gold inside <b className="font-mono">{fmtG(j.targetNetG)}</b> g
                    </span>
                    <span className="mt-2 block">
                      <StatusChip kind="job" value={j.stopped ? 'stopped' : j.status} />
                    </span>
                  </button>
                );
              })}
            </section>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[15px] font-semibold text-ink">Finished jobs</p>
              <p className="text-[15px] text-ink-3">
                {karigar.finishedJobs + done.length} delivered this year
              </p>
              {done.length > 0 && (
                <ul className="mt-2 space-y-1 text-[15px] text-ink-2">
                  {done.map((j) => (
                    <li key={j.id} className="flex items-center gap-2">
                      <Check size={16} className="text-live" aria-hidden /> {j.title} · {j.id}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        {tab === 'gold' && <GoldTab karigar={karigar} />}
        {tab === 'me' && <MeTab karigar={karigar} />}
      </div>

      <nav aria-label="Phone tabs" className="sticky bottom-0 grid grid-cols-3 border-t border-line bg-surface">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                setTab(t.id);
                setOpenId(null);
              }}
              className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[15px] font-semibold', on ? 'text-gold-ink' : 'text-ink-3')}
            >
              <Icon size={20} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function GoldCard({ karigar }: { karigar: Karigar }) {
  const { state } = useStore();
  const n = state.jobs.filter((j) => j.karigarId === karigar.id && j.status !== 'handed_over').length;
  return (
    <div className="rounded-xl bg-closed p-4 text-white">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/70">Gold with me</p>
      <p className="mt-1 font-mono text-3xl font-semibold text-gold">{fmtG(goldWithKarigar(state, karigar.id))} g</p>
      <p className="mt-1 text-[15px] text-white/80">
        across {n} job{n === 1 ? '' : 's'} · {karigar.wastagePct}% wastage allowed
      </p>
    </div>
  );
}

function GoldTab({ karigar }: { karigar: Karigar }) {
  const { state } = useStore();
  const open = jobsForKarigar(state, karigar.id).filter((j) => j.status !== 'handed_over');
  return (
    <>
      <GoldCard karigar={karigar} />
      <ul className="space-y-2">
        {open.map((j) => (
          <li key={j.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
            <span>
              <span className="block text-[15px] font-semibold text-ink">{j.title}</span>
              <span className="block text-[13px] text-ink-3">{j.id}</span>
            </span>
            <span className="font-mono text-[15px] font-semibold text-ink">{fmtG(j.goldIssuedG)} g</span>
          </li>
        ))}
        {open.length === 0 && <li className="rounded-xl border border-line bg-surface p-4 text-[15px] text-ink-2">No gold with you right now.</li>}
      </ul>
    </>
  );
}

function MeTab({ karigar }: { karigar: Karigar }) {
  const rows: [string, string][] = [
    ['Name', karigar.name],
    ['Number', karigar.id],
    ['Phone', karigar.phone],
    ['Work I do', karigar.specialty],
    ['Wastage allowed', `${karigar.wastagePct}%`],
    ['Delivered this year', String(karigar.finishedJobs)],
  ];
  return (
    <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 p-4">
          <dt className="text-[15px] text-ink-3">{k}</dt>
          <dd className="text-[15px] font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const ladder: { label: string; reached: JobStatus[] }[] = [
  { label: 'Gold received', reached: ['accepted', 'on_bench', 'ready', 'handed_over'] },
  { label: 'Working on it', reached: ['on_bench', 'ready', 'handed_over'] },
  { label: 'Ready for checking', reached: ['ready', 'handed_over'] },
  { label: 'Sent to the showroom', reached: ['handed_over'] },
];

function JobSheet({ job, onBack }: { job: KarigarJob; onBack: () => void }) {
  const { actions, now } = useStore();
  const [date, setDate] = useState(toDateInput(job.confirmedDate ?? job.dueDate));
  const [note, setNote] = useState('');
  const [big, setBig] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const due = dueLabel(job, now);
  const tolMg = Math.round(job.toleranceG * 1000);

  const report = (r: { ok: boolean; error?: string }) => setError(r.ok ? null : (r.error ?? 'That did not go through.'));

  const accept = () => {
    const d = fromDateInput(date);
    if (d === null) return setError('Pick the date you will deliver by.');
    report(actions.acceptJob({ jobId: job.id, confirmedDate: d }));
  };

  /** Next step on the ladder, or null when the job is done. */
  const nextStep = (): (() => void) | null => {
    if (job.status === 'accepted') return () => report(actions.startJob({ jobId: job.id, benchNote: note.trim() || undefined }));
    if (job.status === 'on_bench') return () => report(actions.markJobReady({ jobId: job.id, benchNote: note.trim() || undefined }));
    if (job.status === 'ready')
      return () => {
        const r = actions.handOver({ jobId: job.id });
        report(r);
        if (r.ok) setSent(true);
      };
    return null;
  };
  const advance = nextStep();
  // The ladder's next rung: the first one this job has not reached.
  const nextIndex = ladder.findIndex((l) => !l.reached.includes(job.status));

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex min-h-14 items-center gap-2 text-[15px] font-semibold text-gold-ink">
        <ArrowLeft size={20} aria-hidden /> My jobs
      </button>

      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-sm font-semibold', due.late ? 'text-stop' : 'text-ink-3')}>{due.text}</span>
        <StatusChip kind="job" value={job.stopped ? 'stopped' : job.status} />
      </div>

      {job.stopped && <Notice tone="stop">This job is stopped. Only the owner can start it again.</Notice>}

      {job.refImage && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.1em] text-ink-4">What it should look like</p>
          <img src={job.refImage} alt={job.title} className={cn('w-full rounded-xl border border-line object-cover', big ? 'aspect-auto' : 'aspect-[4/3]')} />
          <button type="button" onClick={() => setBig(!big)} className="mt-1 min-h-14 text-[15px] font-semibold text-gold-ink">
            {big ? 'See smaller' : 'See bigger'}
          </button>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-ink">{job.title}</h2>
        <p className="text-[15px] text-ink-3">
          {job.qty} piece{job.qty === 1 ? '' : 's'} · {job.purity}
          {job.style ? ` · ${job.style}` : ''} · {job.id}
        </p>
      </div>

      <dl className="divide-y divide-line rounded-xl border border-line bg-surface">
        <div className="p-4">
          <dt className="text-[15px] text-ink-3">Finished piece must weigh</dt>
          <dd className="font-mono text-2xl font-semibold text-ink">{fmtG(job.targetGrossG)} g</dd>
        </div>
        <div className="p-4">
          <dt className="text-[15px] text-ink-3">Gold inside it, after stones</dt>
          <dd className="font-mono text-2xl font-semibold text-ink">{fmtG(job.targetNetG)} g</dd>
        </div>
        <div className="p-4">
          <dt className="text-[15px] text-ink-3">Allowed to be off by</dt>
          <dd className="text-xl font-semibold text-ink">± {tolMg} mg</dd>
        </div>
      </dl>

      {job.note && (
        <div className="rounded-xl border border-gold/40 bg-gold-soft p-4 text-[15px] text-ink-2">
          <b className="text-ink">Note from the desk:</b> {job.note}
        </div>
      )}

      {job.status === 'sent' && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-[17px] font-semibold text-ink">Will you make this?</h3>
          <label className="block">
            <span className="mb-1 block text-[15px] font-semibold text-ink-2">I will deliver by</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-14 w-full rounded-lg border border-line-2 bg-surface px-3 text-[15px] text-ink"
            />
          </label>
          <Button variant="primary" size="lg" block onClick={accept}>
            Accept this job
          </Button>
          {job.confirmedDate === null && <p className="text-[13px] text-ink-3">The desk asked for {fmtDayMonth(job.dueDate)}.</p>}
        </section>
      )}

      {job.status !== 'sent' && (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-[17px] font-semibold text-ink">Where is it now?</h3>
          <p className="text-[15px] text-ink-3">Tap the next one. The desk sees it at once.</p>
          <ol className="space-y-2">
            {ladder.map((step, i) => {
              const reached = step.reached.includes(job.status);
              const isNext = i === nextIndex;
              return (
                <li key={step.label}>
                  <Button
                    size="lg"
                    block
                    variant={isNext ? 'primary' : 'secondary'}
                    disabled={reached || !isNext || job.stopped || advance === null}
                    onClick={() => advance?.()}
                    className="justify-start"
                    icon={reached ? <Check size={20} className="text-live" aria-hidden /> : undefined}
                  >
                    {step.label}
                  </Button>
                </li>
              );
            })}
          </ol>
          {job.status !== 'handed_over' && (
            <label className="block">
              <span className="mb-1 block text-[15px] font-semibold text-ink-2">Anything to tell the desk?</span>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type here" className="text-[15px]" />
            </label>
          )}
          {sent && <Notice tone="live">Sent. The desk will weigh it when it arrives.</Notice>}
        </section>
      )}

      {error && <Notice tone="stop">{error}</Notice>}

      {job.status !== 'handed_over' && !job.stopped && (
        <Button variant="danger" size="lg" block icon={<TriangleAlert size={20} aria-hidden />} onClick={() => setProblemOpen(true)}>
          Raise a problem
        </Button>
      )}

      <RaiseProblem open={problemOpen} onClose={() => setProblemOpen(false)} target={{ kind: 'job', id: job.id }} large />
    </div>
  );
}
