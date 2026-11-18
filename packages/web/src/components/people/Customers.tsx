import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { fmtDate } from '@goldsmith/shared';
import { fmtG } from '@goldsmith/shared';
import { useStore } from '../../store/StoreProvider';
import type { Customer, CustomerGroup } from '@goldsmith/shared';
import { Button, Card, DetailDrawer, DrawerSection, Input, PageHeader, Pill, SectionLabel, StatusChip, ValueSlot, WeightReadout, cn } from '../ui';
import { dayMonthLabel, takenHomeG } from './util';

const GROUPS: CustomerGroup[] = ['VIP Bridal', 'High net worth', 'Regular', 'Wholesale'];

function CustomerDrawer({ c, onClose }: { c: Customer; onClose: () => void }) {
  const history = [...c.history].sort((a, b) => b.on - a.on);
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={c.name}
      subtitle={`${c.phone}${c.city ? ` · ${c.city}` : ''} · ${c.group}`}
      hero={{
        label: 'Pure gold taken home',
        value: <WeightReadout g={takenHomeG(c)} size="hero" />,
        note: `${history.length} ${history.length === 1 ? 'piece' : 'pieces'} in all`,
      }}
    >
      <DrawerSection title="What they have taken home, by weight" defaultOpen>
        {history.length === 0 ? (
          <p>No purchases yet. Their pieces appear here by tag and weight once they buy.</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="block font-semibold text-ink">{h.name}</span>
                  <span className="block text-[13px] text-ink-3">
                    <span className="font-mono">{h.tag}</span> · {fmtDate(h.on)}
                  </span>
                </span>
                <WeightReadout g={h.pureG} size="body" />
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
      <DrawerSection title="When to wish them" defaultOpen>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-ink-3">Birthday</dt>
            <dd className="font-semibold text-ink">{dayMonthLabel(c.dob) || 'Not given'}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Anniversary</dt>
            <dd className="font-semibold text-ink">{dayMonthLabel(c.anniversary) || 'Not given'}</dd>
          </div>
        </dl>
        <p className="mt-2">{c.optedIn ? 'Opted in to WhatsApp wishes and broadcasts.' : 'Has not opted in to WhatsApp messages.'}</p>
      </DrawerSection>
      {c.notes && (
        <DrawerSection title="Notes">
          <p>{c.notes}</p>
        </DrawerSection>
      )}
      <div className="mt-3 space-y-1">
        <ValueSlot value={c.budgetINR} label="Budget" />
        <ValueSlot value={c.spentINR} label="Spend so far" />
      </div>
    </DetailDrawer>
  );
}

/** The customer directory. History is by tag and grams; budget and spend sit behind ValueSlot. */
export function Customers() {
  const { state, go, route } = useStore();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<CustomerGroup | 'All'>('All');
  const [selected, setSelected] = useState<string | null>(route.params?.customerId ?? null);

  const needle = q.trim().toLowerCase();
  const rows = state.customers.filter(
    (c) => (group === 'All' || c.group === group) && (!needle || c.name.toLowerCase().includes(needle) || c.phone.replace(/\s/g, '').includes(needle.replace(/\s/g, '')) || c.city.toLowerCase().includes(needle)),
  );
  const open = state.customers.find((c) => c.id === selected);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Who they are, when to wish them, and what they have taken home by weight."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('customer-new')}>
            Add a customer
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or city" aria-label="Search customers" className="pl-9" />
        </div>
        <div role="group" aria-label="Group" className="flex flex-wrap gap-2">
          {(['All', ...GROUPS] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={cn(
                'min-h-10 rounded-full border px-3 text-sm font-semibold',
                group === g ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <SectionLabel className="mb-3">
        {rows.length} of {state.customers.length} customers
      </SectionLabel>
      {rows.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-2">Nobody matches that. Clear the search or add them as a new customer.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelected(c.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-gold"
              >
                <span className="min-w-[12rem] flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{c.name}</span>
                  <span className="block text-sm text-ink-3">
                    {c.phone}
                    {c.city && ` · ${c.city}`}
                  </span>
                </span>
                <Pill>{c.group}</Pill>
                {!c.optedIn && <StatusChip tone="closed" label="Not opted in" />}
                <span className="w-28 text-right text-sm text-ink-3">
                  {c.history.length} {c.history.length === 1 ? 'piece' : 'pieces'}
                </span>
                <span className="w-36 text-right font-mono text-sm font-medium text-ink tabular">{fmtG(takenHomeG(c))} g</span>
                <ValueSlot value={c.spentINR} label="Spend" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <CustomerDrawer c={open} onClose={() => setSelected(null)} />}
    </div>
  );
}
