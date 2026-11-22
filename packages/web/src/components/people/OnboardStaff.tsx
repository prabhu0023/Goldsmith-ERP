import { ROLE_INFO } from '@goldsmith/shared';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, cn } from '../ui';
import { firstName } from '../home/util';
import { phoneLooksValid } from './util';

const loginFrom = (name: string): string => name.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]/g, '') ?? '';

/** Screen 25. Owner only. The role fixes the permission list; nobody ticks boxes. */
export function OnboardStaff() {
  const { state, actions, go, role } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffRole, setStaffRole] = useState<'staff' | 'owner'>('staff');
  const [error, setError] = useState<string | null>(null);

  if (role !== 'owner') {
    return (
      <div>
        <PageHeader title="Add a staff member" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can add staff or change a role.</p>
        </Card>
      </div>
    );
  }

  const info = ROLE_INFO.find((r) => r.id === staffRole) ?? ROLE_INFO[0];
  const who = name.trim() ? firstName(name.trim()) : 'They';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Add the name.');
    if (!phoneLooksValid(phone)) return setError('Add a phone number with at least 10 digits. They sign in and get codes here.');
    let login = loginFrom(name);
    if (!login) return setError('The name needs some letters so a sign-in name can be made.');
    const base = login;
    let i = 2;
    while (state.staff.some((m) => m.login === login)) login = `${base}${i++}`;
    const r = actions.onboardStaff({ name, login, phone, role: staffRole });
    if (!r.ok) return setError(r.error ?? 'Could not add this person.');
    go('staff-directory');
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <PageHeader title="Add a staff member" subtitle="Their role decides what they land on and what they may do. Every sale they make is counted to them." />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone · they sign in and get codes here">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 90030 71145" />
        </Field>
        <p className="text-sm text-ink-3">
          Counter: Main showroom. Sales will be counted to {name.trim() ? firstName(name.trim()) : 'them'}.
        </p>
      </Card>

      <Card className="mb-4 space-y-3">
        <SectionLabel>What role · this sets everything else</SectionLabel>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {ROLE_INFO.filter((r) => r.id !== 'karigar').map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={staffRole === r.id}
              onClick={() => setStaffRole(r.id as 'staff' | 'owner')}
              className={cn(
                'rounded-xl border p-4 text-left',
                staffRole === r.id ? 'border-gold bg-gold-soft' : 'border-line-2 bg-surface hover:bg-paper',
              )}
            >
              <span className="block text-[15px] font-semibold text-ink">{r.label}</span>
              <span className="block text-sm text-ink-2">{r.blurb}</span>
              <span className="mt-1 block text-[13px] text-ink-3">lands on {r.lands}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-3">
          A karigar is not a staff member: they use the phone portal.{' '}
          <button type="button" className="font-semibold text-gold-ink underline" onClick={() => go('karigar-new')}>
            Add a karigar instead
          </button>
        </p>
      </Card>

      <Card className="mb-4">
        <SectionLabel>
          So {who}, as {info.label}, will be able to
        </SectionLabel>
        <ul className="mt-3 space-y-2">
          {info.can.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[15px] text-ink">
              <Check size={18} className="mt-0.5 shrink-0 text-live" aria-hidden />
              {t}
            </li>
          ))}
          {info.cannot.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[15px] text-ink-3">
              <X size={18} className="mt-0.5 shrink-0 text-stop" aria-hidden />
              Not: {t.charAt(0).toLowerCase() + t.slice(1)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-ink-3">Two roles here, no in-between. The list is fixed by the role; you do not tick boxes.</p>
      </Card>

      {error && (
        <div className="mb-4">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Add this staff member
        </Button>
        <Button onClick={() => go('staff-directory')}>Cancel</Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Only the owner can add staff or change a role.</p>
    </form>
  );
}
