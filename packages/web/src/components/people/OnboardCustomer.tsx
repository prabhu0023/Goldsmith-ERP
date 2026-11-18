import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../../store/StoreProvider';
import type { CustomerGroup } from '@goldsmith/shared';
import { Button, Card, Field, Input, Notice, PageHeader, Select, SectionLabel, ValueSlot, cn } from '../ui';
import { MONTHS, daysInMonth, dayMonthToIso, phoneLooksValid } from './util';

const GROUPS: CustomerGroup[] = ['VIP Bridal', 'High net worth', 'Regular', 'Wholesale'];

function DayMonth({ label, day, month, onDay, onMonth }: { label: string; day: string; month: string; onDay: (v: string) => void; onMonth: (v: string) => void }) {
  const max = month ? daysInMonth(Number(month)) : 31;
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold text-ink-2">{label}</legend>
      <div className="flex gap-2">
        <Select value={day} onChange={(e) => onDay(e.target.value)} aria-label={`${label} day`}>
          <option value="">Day</option>
          {Array.from({ length: max }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {i + 1}
            </option>
          ))}
        </Select>
        <Select
          value={month}
          onChange={(e) => {
            onMonth(e.target.value);
            if (e.target.value && Number(day) > daysInMonth(Number(e.target.value))) onDay('');
          }}
          aria-label={`${label} month`}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>
              {m}
            </option>
          ))}
        </Select>
      </div>
    </fieldset>
  );
}

/** Screen 23. Who they are and when to wish them. Budget and spend stay behind ValueSlot. */
export function OnboardCustomer() {
  const { actions, go } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [group, setGroup] = useState<CustomerGroup>('Regular');
  const [bd, setBd] = useState('');
  const [bm, setBm] = useState('');
  const [ad, setAd] = useState('');
  const [am, setAm] = useState('');
  const [optedIn, setOptedIn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Add the customer name.');
    if (!phoneLooksValid(phone)) return setError('Add a phone number with at least 10 digits. It is also the WhatsApp number.');
    if ((bd && !bm) || (!bd && bm)) return setError('Give both the day and the month of the birthday, or neither.');
    if ((ad && !am) || (!ad && am)) return setError('Give both the day and the month of the anniversary, or neither.');
    const r = actions.onboardCustomer({
      name,
      phone,
      city,
      group,
      dob: dayMonthToIso(bd, bm),
      anniversary: dayMonthToIso(ad, am),
      optedIn,
      notes: address.trim() ? `Address: ${address.trim()}` : '',
    });
    if (!r.ok) return setError(r.error ?? 'Could not add this customer.');
    go('customers', r.id ? { customerId: r.id } : undefined);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <PageHeader
        title="Add a customer"
        subtitle="Who they are and when to wish them. Their pieces attach by weight once they buy."
      />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone · also the WhatsApp number">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98840 21107" />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Address (optional)">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="door, street, area…" />
        </Field>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold text-ink-2">Group</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={group === g}
                onClick={() => setGroup(g)}
                className={cn(
                  'min-h-11 rounded-lg border px-4 text-sm font-semibold',
                  group === g ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="mb-4 space-y-4">
        <SectionLabel>When to wish them</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <DayMonth label="Birthday" day={bd} month={bm} onDay={setBd} onMonth={setBm} />
          <DayMonth label="Anniversary" day={ad} month={am} onDay={setAd} onMonth={setAm} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={optedIn} onChange={(e) => setOptedIn(e.target.checked)} className="h-5 w-5 accent-gold" />
          Send wishes on WhatsApp
        </label>
        <p className="text-[13px] text-ink-3">Only customers who have said yes receive wishes and broadcasts.</p>
      </Card>

      <div className="mb-4 space-y-3">
        <ValueSlot value={null} label="Budget" />
        <ValueSlot value={null} label="Spend so far" />
      </div>

      <Card className="mb-4">
        <SectionLabel>What they have taken home · by weight</SectionLabel>
        <p className="mt-2 text-sm text-ink-3">Nothing yet. Each piece they buy is attached here by tag and grams, the same ones the system already tracks.</p>
      </Card>

      {error && (
        <div className="mb-4">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Add this customer
        </Button>
        <Button onClick={() => go('customers')}>Cancel</Button>
      </div>
    </form>
  );
}
