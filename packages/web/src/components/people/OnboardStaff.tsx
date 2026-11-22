import { ROLE_INFO } from '@goldsmith/shared';
import type { RoleId } from '@goldsmith/shared';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { opsCall } from '../../api/ops-client';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, cn } from '../ui';
import { firstName } from '../home/util';
import { addUserFieldErrors } from './user-rows';
import type { AddUserField } from './user-rows';
type FieldName = AddUserField;
const ROLE_ORDER: RoleId[] = ['staff', 'karigar', 'owner'];
/** Screen 25. Owner only (EP-05-S4). The role fixes the permission list; nobody ticks boxes. */
export function OnboardStaff() {
  const { can } = useStore();
  if (!can('createUser')) {
    return (
      <div>
        <PageHeader title="Add a staff member" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can add staff or change a role.</p>
        </Card>
      </div>
    );
  }
  return <AddUserForm />;
}
function AddUserForm() {
  const { go } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleId>('staff');
  const [karigarId, setKarigarId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form, so a resend after a lost answer cannot add the person twice (EP-03-S8).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const info = ROLE_INFO.find((r) => r.id === role) ?? ROLE_INFO[0];
  const who = name.trim() ? firstName(name.trim()) : 'They';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const found = addUserFieldErrors({ name, phone, email, role, karigarId });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const answer = await opsCall(
      'createUser',
      { name: name.trim(), phone, email: email.trim(), role, ...(role === 'karigar' ? { karigarId: karigarId.trim() } : {}) },
      { idempotencyKey },
    );
    setBusy(false);
    if (answer.ok) return go('staff-directory');
    const field = answer.field as FieldName | undefined;
    if (answer.code === 'validation' && field && ['name', 'phone', 'email', 'karigarId'].includes(field)) {
      return setErrors({ [field]: answer.message });
    }
    setNotice(answer.message);
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-2xl">
      <PageHeader title="Add a staff member" subtitle="Their role decides what they land on and what they may do. They get an email to set their password." />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <Field label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Phone · they sign in with this number" error={errors.phone}>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 90030 71145" />
        </Field>
        <Field label="Email · the activation link goes here" error={errors.email}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off" />
        </Field>
      </Card>
      <Card className="mb-4 space-y-3">
        <SectionLabel>What role · this sets everything else</SectionLabel>
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
          {ROLE_ORDER.map((id) => ROLE_INFO.find((r) => r.id === id))
            .filter((r) => r !== undefined)
            .map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={role === r.id}
                onClick={() => setRole(r.id)}
                className={cn('rounded-xl border p-4 text-left', role === r.id ? 'border-gold bg-gold-soft' : 'border-line-2 bg-surface hover:bg-paper')}
              >
                <span className="block text-[15px] font-semibold text-ink">{r.label}</span>
                <span className="block text-sm text-ink-2">{r.blurb}</span>
                <span className="mt-1 block text-[13px] text-ink-3">lands on {r.lands}</span>
              </button>
            ))}
        </div>
        {role === 'karigar' && (
          <Field label="Karigar code · the karigar record they are" hint="For example KG-04." error={errors.karigarId}>
            <Input value={karigarId} onChange={(e) => setKarigarId(e.target.value)} autoComplete="off" />
          </Field>
        )}
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
        <p className="mt-3 text-[13px] text-ink-3">The list is fixed by the role; you do not tick boxes.</p>
      </Card>
      {notice && (
        <div className="mb-4">
          <Notice tone="stop">{notice}</Notice>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          Add this staff member
        </Button>
        <Button onClick={() => go('staff-directory')}>Cancel</Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Only the owner can add staff or change a role.</p>
    </form>
  );
}
