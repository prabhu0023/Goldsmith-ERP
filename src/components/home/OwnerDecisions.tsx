import type { ReactNode } from 'react';
import { useState } from 'react';
import { ago, fmtLongDate, fmtTime, sameDay } from '../../domain/clock';
import { fmtG, fromU, netOf, sumG } from '../../domain/weights';
import {
  agreedDate,
  evaluate,
  goldWithKarigar,
  inStockPieces,
  jobOverdueDays,
  openJobsForKarigar,
  ownerQueues,
  piecesOutToday,
  pureGoldOnFloor,
} from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Karigar, Problem, Settings } from '../../types/jewellery';
import { fieldWords, showValue } from '../stock/PieceDrawer';
import { AttentionCard, Button, Card, Input, Notice, SectionLabel, StatusChip, WeightReadout, cn } from '../ui';
import { avgGapMg, firstName, gapPhrase, netGapG, numberWord, plural } from './util';

function Block({ label, count, note, children }: { label: string; count?: number; note?: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <SectionLabel className="mb-3">
        {label}
        {count !== undefined && ` · ${count}`}
        {note && <span className="ml-1 normal-case tracking-normal">· {note}</span>}
      </SectionLabel>
      {children}
    </section>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold',
        on ? 'border-live bg-live-soft text-live' : 'border-line-2 bg-surface text-ink-3',
      )}
    >
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', on ? 'bg-live' : 'bg-ink-4')} />
      {label}
    </button>
  );
}

function Segment<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-line-2 bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('min-h-10 rounded-md px-3 text-sm font-semibold', value === o.id ? 'bg-gold text-ink' : 'text-ink-3 hover:bg-paper')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RulesPanel() {
  const { state, actions, go } = useStore();
  const { settings } = state;
  const [hours, setHours] = useState(String(settings.leadSlaHours));
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(hours);
  const dirty = hours.trim() !== '' && parsed !== settings.leadSlaHours;
  const save = () => {
    if (!Number.isInteger(parsed) || parsed < 1) return setError('Enter a whole number of hours, 1 or more.');
    const r = actions.setSetting('leadSlaHours', parsed);
    setError(r.ok ? null : (r.error ?? 'That did not save.'));
  };
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const r = actions.setSetting(key, value);
    setError(r.ok ? null : (r.error ?? 'That did not save.'));
  };
  return (
    <Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-ink-2">A lead is late after</p>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              aria-label="Hours before a lead is late"
              className="w-24 font-mono"
            />
            <span className="text-sm text-ink-2">hours since it arrived</span>
            <Button type="submit" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty}>
              Set
            </Button>
          </form>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-2">A parcel comes to me when</p>
          <p className="mt-2 text-[15px] text-ink">the gap is bigger than the scales could cause.</p>
          <p className="mt-1 text-sm text-ink-3">
            Nothing for you to set. Every item tagged, and gross, stone and net all agree within what the scales can explain, or I see it.{' '}
            <button type="button" className="font-semibold text-gold-ink underline" onClick={() => go('scales')}>
              See the scales
            </button>
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-2">Who hears about a late lead</p>
          <div className="mt-2">
            <Segment
              value={settings.lateLeadAudience}
              options={[
                { id: 'staff_then_owner', label: 'Staff first, then me' },
                { id: 'owner_only', label: 'Only me' },
              ]}
              onChange={(v) => set('lateLeadAudience', v)}
            />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-2">How it reaches me</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Toggle on={settings.notifyChannels.whatsapp} label="WhatsApp" onChange={(v) => set('notifyChannels', { ...settings.notifyChannels, whatsapp: v })} />
            <Toggle on={settings.notifyChannels.app} label="In the app" onChange={(v) => set('notifyChannels', { ...settings.notifyChannels, app: v })} />
            <Toggle on={settings.notifyChannels.email} label="Email" onChange={(v) => set('notifyChannels', { ...settings.notifyChannels, email: v })} />
          </div>
        </div>
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold text-ink-2">Code before a tag edit</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Toggle on={settings.requireEditToken} label={settings.requireEditToken ? 'On' : 'Off'} onChange={(v) => set('requireEditToken', v)} />
            <span className="text-sm text-ink-3">Staff must get your WhatsApp code before a change is applied.</span>
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
    </Card>
  );
}

function ProblemCard({ p }: { p: Problem }) {
  const { state, actions, go, now } = useStore();
  const t = p.target;
  const job = t.kind === 'job' ? state.jobs.find((j) => j.id === t.id) : undefined;
  const what = t.kind === 'job' ? `${p.raisedByRole === 'karigar' ? 'his own ' : ''}job ${t.id}` : t.kind === 'piece' ? `piece ${t.id}` : `parcel ${t.id}`;
  const detail = (
    <>
      <span className="block italic">“{p.text}”</span>
      <span className="block">
        Raised {ago(p.raisedAt, now)} at {fmtTime(p.raisedAt)}
        {job && <> · due {fmtLongDate(agreedDate(job))}</>}
        {p.raisedByRole === 'karigar' && ' · a karigar can stop the line too'}
      </span>
    </>
  );
  const action =
    t.kind === 'parcel'
      ? { label: 'Open it', onClick: () => go('parcel-clear', { parcelId: t.id }) }
      : t.kind === 'piece'
        ? { label: 'Open it', onClick: () => go('stock', { pieceId: t.id }) }
        : { label: 'Clear it and start again', onClick: () => void actions.clearProblem({ problemId: p.id }) };
  return <AttentionCard tone="stop" title={`${p.raisedBy} stopped ${what}`} detail={detail} action={action} />;
}

function KarigarRow({ k }: { k: Karigar }) {
  const { state, go, now } = useStore();
  const open = openJobsForKarigar(state, k.id);
  const late = open.filter((j) => jobOverdueDays(j, now) > 0).length;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-ink">
            {k.name} · <span className="font-mono">{k.id}</span>
          </p>
          <p className="text-sm text-ink-3">
            {k.specialty} · {plural(open.length, 'open job')}
            {late > 0 && ` · ${late} past the date`}
          </p>
        </div>
        <Button onClick={() => go('karigars', { karigarId: k.id })}>Open ledger</Button>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-sm text-ink-3">Metal loss</dt>
          <dd className="font-mono text-xl font-medium text-stop tabular">{k.metalLossPct.toFixed(2)}%</dd>
          <dd className="text-[13px] text-ink-3">allowed {k.wastagePct.toFixed(2)}%</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Delivers</dt>
          <dd className="font-mono text-xl font-medium text-wait tabular">+{k.lateDays.toFixed(1)} days late</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-3">Rating</dt>
          <dd className="font-mono text-xl font-medium text-ink tabular">{k.rating.toFixed(1)} / 5</dd>
        </div>
      </dl>
    </Card>
  );
}

/** Screens 08 and 13. Only what nobody else may do; a parcel that matches never appears as a card. */
export function OwnerDecisions() {
  const { state, go, identity, now } = useStore();
  const q = ownerQueues(state, now);
  const sla = state.settings.leadSlaHours;
  const karigarOf = (id: string) => state.karigars.find((k) => k.id === id);

  // went through without the owner
  const releasedToday = state.parcels.filter((p) => p.status === 'released' && p.releasedAt !== null && sameDay(p.releasedAt, now) && p.lossG === null);
  const releasedIds = new Set(releasedToday.map((p) => p.id));
  const releasedPieces = state.pieces.filter((p) => p.parcelId !== null && releasedIds.has(p.parcelId));
  const outToday = piecesOutToday(state, now);
  const wishesToday = state.wishes.filter((w) => sameDay(w.at, now)).length;

  // karigars, worst first
  const ranked = [...state.karigars].sort((a, b) => b.metalLossPct - b.wastagePct - (a.metalLossPct - a.wastagePct));
  const over = ranked.filter((k) => k.metalLossPct > k.wastagePct);
  const inside = ranked.filter((k) => k.metalLossPct <= k.wastagePct);
  const goldWith = sumG(state.karigars.map((k) => goldWithKarigar(state, k.id)));
  const openJobs = state.jobs.filter((j) => j.status !== 'handed_over');
  const pastDate = openJobs.filter((j) => jobOverdueDays(j, now) > 0).length;
  const floor = inStockPieces(state);

  const edits = q.pendingEdits;
  const scrap = q.pendingScrap;
  const scrapPiece = scrap[0] ? state.pieces.find((p) => p.id === scrap[0].pieceId) : undefined;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">
          {q.total === 0 ? `Nothing needs you, ${firstName(identity.name)}` : `${numberWord(q.total)} ${q.total === 1 ? 'thing is' : 'things are'} waiting on you, ${firstName(identity.name)}`}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {fmtLongDate(now)} · Only what nobody else may do. A parcel that matches never appears as a card here.
        </p>
      </header>

      <Block label="Nothing moves until you answer" count={q.blocking}>
        {q.blocking === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">Nothing is stopped. Every parcel, job and tag is moving.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {q.mismatchedParcels.map((p) => {
              const ev = evaluate(state, p);
              const k = karigarOf(p.karigarId);
              return (
                <AttentionCard
                  key={p.id}
                  tone="stop"
                  title={`${p.id} will not weigh up · ${gapPhrase(state, p)}`}
                  detail={
                    <>
                      <span className="block">
                        {k?.name ?? p.karigarId} · {plural(ev.tagged, 'piece')} held back · tags say {fmtG(fromU(ev.tags.netU))} g vs {fmtG(fromU(ev.said.netU))} g expected
                        {p.stoppedAt && <> · submitted {fmtTime(p.stoppedAt)}</>}
                      </span>
                      {k && k.gapsMg.length > 0 && (
                        <span className="block">
                          His last {k.gapsMg.length} parcels averaged {avgGapMg(k)} mg. This one is {Math.round(Math.abs(netGapG(state, p)) * 1000)} mg. Staff cannot release it.
                        </span>
                      )}
                    </>
                  }
                  action={{ label: 'Open it', onClick: () => go('parcel-clear', { parcelId: p.id }) }}
                />
              );
            })}
            {q.raisedProblems.map((p) => (
              <ProblemCard key={p.id} p={p} />
            ))}
            {edits.length > 0 && (
              <AttentionCard
                tone="wait"
                title={`${plural(edits.length, 'edit')} proposed on tags in stock`}
                detail={
                  <>
                    <span className="block">
                      {edits
                        .slice(0, 3)
                        .map((e) => `${firstName(e.proposedBy)}: ${fieldWords[e.field]} on ${e.pieceId} (${showValue(e.field, e.from)} to ${showValue(e.field, e.to)})`)
                        .join(' · ')}
                    </span>
                    <span className="block">You read the change, a token comes to your WhatsApp, and you apply it. Staff never touch the field.</span>
                  </>
                }
                action={{ label: 'Read them', onClick: () => (edits.length === 1 ? go('edit-apply', { editId: edits[0].id }) : go('edit-apply')) }}
              />
            )}
            {scrap.length > 0 && (
              <AttentionCard
                tone="wait"
                title={scrap.length === 1 ? '1 piece to be marked as scrap' : `${scrap.length} pieces to be marked as scrap`}
                detail={
                  <>
                    <span className="block">
                      {scrap.length === 1 && scrapPiece
                        ? `${scrapPiece.name} · ${fmtG(netOf(scrapPiece))} g pure gold · asked by ${scrap[0].requestedBy}`
                        : scrap.map((r) => r.pieceId).join(', ')}
                    </span>
                    <span className="block">Marking it scrap closes the piece and puts its gold back in the metal pool to issue again.</span>
                  </>
                }
                action={{ label: 'Decide', onClick: () => (scrap.length === 1 ? go('scrap-decision', { requestId: scrap[0].id }) : go('scrap-decision')) }}
              />
            )}
          </div>
        )}
      </Block>

      <Block label="Running late" count={q.late} note="the clock told me, not a person">
        {q.late === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">No lead is past {sla} hours and no karigar is past a date.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {q.lateLeads.length > 0 && (
              <AttentionCard
                tone="wait"
                title={`${plural(q.lateLeads.length, 'lead')} nobody has opened for over ${sla} hours`}
                detail={q.lateLeads.map((l) => `${l.customerName} (${Math.floor((now - l.arrivedAt) / 3600000)} h)`).join(' · ')}
                action={{ label: 'See leads', onClick: () => go('leads') }}
              />
            )}
            {q.overdueJobs.length > 0 && (
              <AttentionCard
                tone="wait"
                title={`${plural(q.overdueJobs.length, 'karigar job')} past the agreed date`}
                detail={q.overdueJobs
                  .map((j) => `${karigarOf(j.karigarId)?.name ?? j.karigarId} ${plural(jobOverdueDays(j, now), 'day')} over (${j.id})`)
                  .join(' · ')}
                action={{ label: 'See tracker', onClick: () => go('karigars') }}
              />
            )}
          </div>
        )}
      </Block>

      <Block label="Went through without you today" note="no buttons here">
        <div className="space-y-3">
          <AttentionCard
            tone="live"
            title={
              releasedToday.length === 0
                ? 'No parcel has gone live yet today'
                : `${plural(releasedToday.length, 'parcel')} went live without you`
            }
            detail={
              releasedToday.length === 0
                ? 'When a parcel matches, the staff who tagged it release it. It will be counted here.'
                : `${plural(releasedPieces.length, 'piece')} · ${fmtG(sumG(releasedPieces.map((p) => netOf(p))))} g pure gold · each one matched, so the staff who tagged them released them`
            }
          />
          <AttentionCard
            tone="closed"
            title={`${plural(outToday.length, 'piece')} went out · ${plural(wishesToday, 'wish', 'wishes')} sent`}
          />
        </div>
      </Block>

      <Block label="The rules behind these alerts">
        <RulesPanel />
      </Block>

      <Block label="Where the gold is right now">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <SectionLabel>Gold on the floor</SectionLabel>
            <div className="mt-2">
              <WeightReadout g={pureGoldOnFloor(state)} size="hero" />
            </div>
            <p className="mt-1 text-right text-sm text-ink-3">{plural(floor.length, 'piece')}, ready to sell</p>
          </Card>
          <Card>
            <SectionLabel>Gold with karigars</SectionLabel>
            <div className="mt-2">
              <WeightReadout g={goldWith} size="hero" />
            </div>
            <p className="mt-1 text-right text-sm text-ink-3">
              {plural(openJobs.length, 'open job')} · {pastDate} past the date
            </p>
          </Card>
          <Card>
            <SectionLabel>Metal pool</SectionLabel>
            <div className="mt-2">
              <WeightReadout g={state.pool.balanceG} size="hero" />
            </div>
            <p className="mt-1 text-right text-sm text-ink-3">free to issue</p>
          </Card>
          <Card>
            <SectionLabel>Pieces out today</SectionLabel>
            <p className="mt-2 text-right font-mono text-[26px] font-semibold text-ink tabular">{outToday.length}</p>
            <p className="mt-1 text-right text-sm text-ink-3">{fmtG(sumG(outToday.map((p) => netOf(p))))} g pure gold</p>
          </Card>
        </div>
      </Block>

      <Block label="Karigars, worst first">
        <div className="space-y-3">
          {over.length === 0 ? (
            <Card>
              <p className="text-[15px] text-ink-2">Every karigar is inside their allowance. Nothing to do there.</p>
            </Card>
          ) : (
            over.map((k) => <KarigarRow key={k.id} k={k} />)
          )}
          {inside.length > 0 && over.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
              <StatusChip tone="live" label="Inside allowance" />
              {inside.map((k) => k.name).join(' and ')} {inside.length === 1 ? 'is' : 'are'} inside their allowance. Nothing to do there.
            </p>
          )}
          <Button variant="quiet" size="sm" onClick={() => go('karigars')}>
            All {state.karigars.length} karigars
          </Button>
        </div>
      </Block>
    </div>
  );
}
