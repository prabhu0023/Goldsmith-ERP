import { Gift, PackagePlus, ReceiptText, Search, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ago, fmtLongDate, sameDay } from '@goldsmith/shared';
import { slaState } from '@goldsmith/shared';
import { fmtG, netOf, sumG } from '@goldsmith/shared';
import type { RouteId } from '../../nav';
import {
  evaluate,
  goldOutToday,
  heldBackPieces,
  inStockPieces,
  openProblems,
  piecesOutToday,
  pureGoldOnFloor,
  wishesDueToday,
} from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Lead } from '@goldsmith/shared';
import { AttentionCard, Button, Card, Input, SectionLabel, WeightReadout } from '../ui';
import type { CardTone } from '../ui';
import { parcelTarget } from '../parcels/util';
import { firstName, gapPhrase, greetingFor, plural } from './util';

interface NeedCard {
  key: string;
  tone: CardTone;
  title: string;
  detail: ReactNode;
  action?: { label: string; onClick: () => void };
}

function Tile({ icon, title, hint, onClick }: { icon: ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-gold hover:bg-gold-soft"
    >
      <span className="mt-0.5 text-gold-ink">{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-sm text-ink-3">{hint}</span>
      </span>
    </button>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 text-2xl font-semibold text-ink">{children}</div>
    </Card>
  );
}

/** Screen 02. The day as a list: what needs you now, what to start, how the showcase stands. */
export function StaffToday() {
  const { state, go, identity, role, now } = useStore();
  const [query, setQuery] = useState('');
  const [miss, setMiss] = useState(false);

  const search = () => {
    const q = query.trim().toLowerCase();
    if (!q) return go('stock');
    const hit = state.pieces.find((p) => p.id.toLowerCase() === q || p.huid.toLowerCase() === q) ?? state.pieces.find((p) => p.name.toLowerCase().includes(q));
    if (!hit) return setMiss(true);
    setMiss(false);
    go('stock', { pieceId: hit.id });
  };

  const karigarName = (id: string) => state.karigars.find((k) => k.id === id)?.name ?? id;
  const needs: NeedCard[] = [];
  const problems = openProblems(state);

  // stopped parcels first, then raised problems
  for (const p of state.parcels) {
    if (p.status !== 'stopped' || p.resolution !== null) continue;
    const t = parcelTarget(state, p, role);
    const count = evaluate(state, p).tagged;
    if (p.verdict === 'mismatch') {
      needs.push({
        key: p.id,
        tone: 'stop',
        title: `Parcel from ${karigarName(p.karigarId)} is ${gapPhrase(state, p)}`,
        detail: `${p.id} · ${plural(count, 'piece')} held back from the showcase. Only the owner can release this.${p.stoppedAt ? ` Sent to him ${ago(p.stoppedAt, now)}.` : ''}`,
        action: { label: 'Open parcel', onClick: () => go(t.id, t.params) },
      });
    } else {
      needs.push({
        key: p.id,
        tone: 'stop',
        title: `Parcel ${p.id} from ${karigarName(p.karigarId)} is stopped`,
        detail: 'Someone raised a problem on it. Only the owner can start it again.',
        action: { label: 'Open parcel', onClick: () => go(t.id, t.params) },
      });
    }
  }
  for (const pr of problems) {
    if (pr.target.kind === 'parcel') continue;
    const t = pr.target;
    needs.push({
      key: pr.id,
      tone: 'stop',
      title: `${pr.raisedBy} stopped ${t.kind === 'job' ? 'job' : 'piece'} ${t.id}`,
      detail: `${pr.text} Only the owner can start it again.`,
      action: t.kind === 'piece' ? { label: 'Open piece', onClick: () => go('stock', { pieceId: t.id }) } : undefined,
    });
  }

  // parcels waiting on staff
  for (const p of state.parcels) {
    if (p.status !== 'open') continue;
    const ev = evaluate(state, p);
    const target = parcelTarget(state, p, role);
    if (p.weighings.length === 0) {
      needs.push({
        key: p.id,
        tone: 'gold',
        title: `${p.id} from ${karigarName(p.karigarId)} has not been weighed`,
        detail: 'Weigh the whole parcel before anything is tagged.',
        action: { label: 'Weigh it', onClick: () => go(target.id, target.params) },
      });
    } else if (ev.tagged < ev.expected) {
      const left = ev.expected - ev.tagged;
      needs.push({
        key: p.id,
        tone: 'wait',
        title: `${plural(left, 'piece')} still untagged in ${p.id}`,
        detail: `${karigarName(p.karigarId)}'s parcel · arrived ${ago(p.arrivedAt, now)}. Tag them to finish reconciling the parcel weight.`,
        action: { label: 'Tag pieces', onClick: () => go(target.id, target.params) },
      });
    } else {
      needs.push({
        key: p.id,
        tone: 'gold',
        title: `${p.id} is fully tagged and ready to match`,
        detail: `${karigarName(p.karigarId)}'s parcel · ${plural(ev.expected, 'piece')}. Check it and release it to the showcase.`,
        action: { label: 'Match and release', onClick: () => go(target.id, target.params) },
      });
    }
  }

  // leads past, or close to, the time limit
  const sla = state.settings.leadSlaHours;
  const leadRows: { lead: Lead; late: boolean; elapsed: number }[] = [];
  for (const l of state.leads) {
    const st = slaState(l, now, sla);
    if (st.phase === 'late' || (st.phase === 'running' && st.leftH <= 2)) leadRows.push({ lead: l, late: st.phase === 'late', elapsed: st.elapsedH });
  }
  leadRows.sort((a, b) => b.elapsed - a.elapsed);
  for (const r of leadRows.slice(0, 3)) {
    const l = r.lead;
    needs.push({
      key: l.id,
      tone: r.late ? 'stop' : 'wait',
      title: r.late ? `${l.customerName}'s lead is past the ${sla} h limit` : `${l.customerName}'s lead is close to the ${sla} h limit`,
      detail: `${l.title} · arrived ${ago(l.arrivedAt, now)}. ${r.late ? 'The owner has been told.' : 'Open it before the owner is told.'}`,
      action: {
        label: l.state === 'needs_glance' ? 'Check it' : 'Work it',
        onClick: () => go((l.state === 'needs_glance' ? 'lead-review' : 'lead-convert') as RouteId, { leadId: l.id }),
      },
    });
  }
  if (leadRows.length > 3) {
    needs.push({
      key: 'more-leads',
      tone: 'wait',
      title: `${leadRows.length - 3} more leads are close to or past the limit`,
      detail: 'They are all in the inbox.',
      action: { label: 'See leads', onClick: () => go('leads') },
    });
  }

  const sentWishes = new Set(state.wishes.filter((w) => sameDay(w.at, now)).map((w) => `${w.customerId}:${w.kind}`));
  const wishes = wishesDueToday(state, now).filter((w) => !sentWishes.has(`${w.customer.id}:${w.kind}`));
  const lastBought = (id: string): string | null => {
    const c = state.customers.find((x) => x.id === id);
    const last = c ? [...c.history].sort((a, b) => b.on - a.on)[0] : undefined;
    return last ? last.name : null;
  };
  const outToday = piecesOutToday(state, now);
  const first = firstName(identity.name);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">
          {greetingFor(now)}, {first}
        </h1>
        <p className="mt-1 text-sm text-ink-3">{fmtLongDate(now)}</p>
      </header>

      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMiss(false);
            }}
            placeholder="Search tag, HUID or name"
            aria-label="Search tag, HUID or name"
            className="pl-9"
          />
        </div>
        <Button type="submit">Find it</Button>
        {miss && <p className="w-full text-sm font-semibold text-stop">Nothing in the book matches that.</p>}
      </form>

      <Card className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionLabel>Gold out today</SectionLabel>
          <p className="mt-1 text-sm text-ink-3">Pure gold in the {plural(outToday.length, 'piece')} billed today.</p>
        </div>
        <WeightReadout g={goldOutToday(state, now)} size="hero" />
      </Card>

      <section className="mb-8">
        <SectionLabel className="mb-3">Needs you now · {needs.length}</SectionLabel>
        {needs.length === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">Nothing is waiting on you. Parcels are tagged, leads are within time and nothing is stopped.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {needs.map((n) => (
              <AttentionCard key={n.key} tone={n.tone} title={n.title} detail={n.detail} action={n.action} />
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <SectionLabel className="mb-3">Start something</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile icon={<ReceiptText size={22} />} title="Sell a piece" hint="Scan tags, record the bill." onClick={() => go('stock-out')} />
          <Tile icon={<PackagePlus size={22} />} title="Receive a parcel" hint="Weigh it before tagging." onClick={() => go('parcel-arrival')} />
          <Tile icon={<UserPlus size={22} />} title="Add a customer" hint="Name, phone and wishes." onClick={() => go('customer-new')} />
        </div>
      </section>

      <section className="mb-8">
        <SectionLabel className="mb-3">The showcase right now</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Pure gold on the floor">
            <span className="font-mono tabular">{fmtG(pureGoldOnFloor(state))}</span> <span className="text-sm font-normal text-ink-3">g</span>
          </Stat>
          <Stat label="Pieces you can sell today">{inStockPieces(state).length}</Stat>
          <Stat label="Held back from the floor">{heldBackPieces(state).length}</Stat>
          <Stat label="Pieces out today">{outToday.length}</Stat>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          Pieces out today carry {fmtG(sumG(outToday.map((p) => netOf(p))))} g of pure gold.
        </p>
      </section>

      <section>
        <SectionLabel className="mb-3">Wishes to send today · {wishes.length}</SectionLabel>
        {wishes.length === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">No birthdays or anniversaries are left to wish today.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {wishes.map((w) => {
              const bought = lastBought(w.customer.id);
              return (
                <li key={`${w.customer.id}:${w.kind}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
                  <Gift size={20} className="shrink-0 text-gold-ink" aria-hidden />
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-[15px] font-semibold text-ink">
                      {w.customer.name} · {w.kind === 'birthday' ? 'birthday today' : 'anniversary today'}
                    </p>
                    <p className="text-sm text-ink-3">
                      {w.customer.group}
                      {bought ? ` · last bought ${bought}` : ` · ${plural(w.customer.history.length, 'purchase')}`}
                    </p>
                  </div>
                  <Button onClick={() => go('wishes')}>Message</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
