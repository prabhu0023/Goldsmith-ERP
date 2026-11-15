import { AlertTriangle, Mail, MessageCircle, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { ago } from '../../domain/clock';
import { slaRunning, slaState } from '../../domain/leads';
import { useStore } from '../../store/StoreProvider';
import type { Lead, LeadSource } from '../../types/jewellery';
import { Button, Card, PageHeader, Pill, SectionLabel, StatusChip, cn } from '../ui';
import { firstName, flaggedCount, sourceLabel } from './util';

type Tab = 'glance' | 'worked' | 'all';

const sourceIcon: Record<LeadSource, typeof Mail> = { whatsapp: MessageCircle, email: Mail, counter: Store };

export function LeadInbox() {
  const { state, go, now } = useStore();
  const [tab, setTab] = useState<Tab>('glance');
  const sla = state.settings.leadSlaHours;

  const glance = state.leads.filter((l) => l.state === 'needs_glance');
  const worked = state.leads.filter((l) => l.state === 'opened' || l.state === 'being_worked');
  const lists: Record<Tab, Lead[]> = { glance, worked, all: state.leads };
  const shown = [...lists[tab]].sort((a, b) => a.arrivedAt - b.arrivedAt);
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'glance', label: 'Needs a glance', n: glance.length },
    { id: 'worked', label: 'Being worked', n: worked.length },
    { id: 'all', label: 'All', n: state.leads.length },
  ];

  const open = (l: Lead) => (l.state === 'needs_glance' ? go('lead-review', { leadId: l.id }) : go('lead-convert', { leadId: l.id }));

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Orders that came in by message, and ones you took at the counter. Nothing a customer sends is ever dropped."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('lead-create')}>
            Add a lead by hand
          </Button>
        }
      />

      <div role="tablist" aria-label="Lead lists" className="mb-4 flex flex-wrap items-center gap-2 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold',
              tab === t.id ? 'border-gold text-ink' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {t.label} · {t.n}
          </button>
        ))}
        <span className="ml-auto pb-2 text-[13px] text-ink-4">Oldest first</span>
      </div>

      {shown.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">Nothing here. Every lead has been looked at.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((l) => {
            const s = slaState(l, now, sla);
            const Icon = sourceIcon[l.source];
            const flagged = flaggedCount(l);
            const unreadable = l.confidence === 'unreadable';
            const cta = l.state === 'needs_glance' ? (unreadable ? 'Open and read' : l.confidence === 'unsure' ? 'Check and keep' : 'Open') : 'Open';
            return (
              <li key={l.id}>
                <Card
                  className={cn(
                    'flex flex-wrap items-center gap-4 border-l-4',
                    unreadable ? 'border-l-stop' : s.phase === 'late' ? 'border-l-stop' : l.state === 'needs_glance' ? 'border-l-wait' : 'border-l-live',
                  )}
                >
                  <div className="min-w-[16rem] flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {l.state === 'needs_glance' ? (
                        unreadable ? (
                          <StatusChip tone="stop" label="Please check" />
                        ) : l.confidence === 'unsure' ? (
                          <StatusChip tone="wait" label={`${flagged} field${flagged === 1 ? '' : 's'} to confirm`} />
                        ) : (
                          <StatusChip tone="live" label="Read cleanly" />
                        )
                      ) : (
                        <StatusChip kind="lead" value={l.state} />
                      )}
                      <Pill>
                        <Icon size={14} className="mr-1" aria-hidden />
                        {sourceLabel[l.source]}
                      </Pill>
                    </div>
                    <p className="text-[15px] font-semibold text-ink">{l.title}</p>
                    <p className="mt-1 text-sm text-ink-3">
                      {l.source === 'counter' && l.takenBy
                        ? `taken ${ago(l.arrivedAt, now)} by ${firstName(l.takenBy)}`
                        : `arrived ${ago(l.arrivedAt, now)}`}
                    </p>
                    {slaRunning(l) && (
                      <p className={cn('mt-1 flex items-center gap-1.5 text-sm font-semibold', s.phase === 'late' ? 'text-stop' : 'text-ink-3')}>
                        {s.phase === 'late' && <AlertTriangle size={15} aria-hidden />}
                        {s.label}
                      </p>
                    )}
                    {!slaRunning(l) && l.state === 'being_worked' && <p className="mt-1 text-sm font-semibold text-live">being worked</p>}
                  </div>
                  <Button variant={l.state === 'needs_glance' ? 'primary' : 'secondary'} onClick={() => open(l)}>
                    {cta}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-sm text-ink-3">
        A message we cannot read still becomes a lead, flagged in red. It is never thrown away. The clock just starts ticking on it like any other.
      </p>

      <section className="mt-8">
        <SectionLabel className="mb-3">Every lead arrives one of two ways</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h4 className="text-[15px] font-semibold text-ink">1 · By itself</h4>
            <p className="mt-1 text-sm text-ink-2">
              A PO comes by email or WhatsApp. The system reads it and makes the lead on its own, so you never retype it. If it read cleanly, open and work it. If it was unsure, or could not read at all, it is flagged for a few seconds of your eyes.
            </p>
          </Card>
          <Card>
            <h4 className="text-[15px] font-semibold text-ink">2 · You add it by hand</h4>
            <p className="mt-1 text-sm text-ink-2">
              A walk-in or a phone call. You type it straight in. There is no message to read, so there is nothing to check. This is the preorder you raise at the counter. From here it behaves exactly like one that arrived by message.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
