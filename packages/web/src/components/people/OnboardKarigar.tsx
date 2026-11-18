import { useState } from 'react';
import type { FormEvent } from 'react';
import { fmtG, round4 } from '@goldsmith/shared';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, cn } from '../ui';
import { phoneLooksValid } from './util';

const SPECIALTIES = ['Chettinad', 'Temple', 'Kundan', 'Polki', 'Antique', 'Jadau', 'Meenakari'];
const LANGUAGES = [
  { value: 'Tamil', label: 'தமிழ்' },
  { value: 'Hindi', label: 'हिन्दी' },
  { value: 'English', label: 'English' },
];
const SAMPLE_JOB_G = 160;

function Chip({ on, onClick, role, children }: { on: boolean; onClick: () => void; role: 'checkbox' | 'radio'; children: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-lg border px-4 text-sm font-semibold',
        on ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
      )}
    >
      {children}
    </button>
  );
}

/** Screen 24. Owner only. The wastage allowance set here is the window on every job sheet. */
export function OnboardKarigar() {
  const { state, actions, go, role } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [language, setLanguage] = useState('Hindi');
  const [wastage, setWastage] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

  if (role !== 'owner') {
    return (
      <div>
        <PageHeader title="Add a karigar" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can add a karigar or change their wastage allowance.</p>
        </Card>
      </div>
    );
  }

  let n = state.karigars.length + 1;
  while (state.karigars.some((x) => x.id === `KG-${String(n).padStart(2, '0')}`)) n += 1;
  const code = `KG-${String(n).padStart(2, '0')}`;
  const lossOnSample = round4((SAMPLE_JOB_G * wastage) / 100);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Add the karigar name.');
    if (!phoneLooksValid(phone)) return setError('Add a phone number with at least 10 digits. Their job portal logs in with it.');
    if (specialties.length === 0) return setError('Pick at least one thing they are best at.');
    const r = actions.onboardKarigar({ name, phone, specialty: specialties.join(' and '), language, wastagePct: wastage });
    if (!r.ok) return setError(r.error ?? 'Could not add this karigar.');
    go('karigars', r.id ? { karigarId: r.id } : undefined);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <PageHeader title="Add a karigar" subtitle="An artisan you issue gold to. The wastage you allow here is what every one of their parcels is judged against." />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Code">
            <Input value={code} readOnly aria-readonly className="font-mono" />
          </Field>
        </div>
        <Field label="Phone · their job portal logs in with this">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 94431 55082" />
        </Field>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold text-ink-2">What they are best at</legend>
          <div className="flex flex-wrap gap-2">
            {SPECIALTIES.map((s) => (
              <Chip
                key={s}
                role="checkbox"
                on={specialties.includes(s)}
                onClick={() => setSpecialties(specialties.includes(s) ? specialties.filter((x) => x !== s) : [...specialties, s])}
              >
                {s}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 block text-sm font-semibold text-ink-2">Language for their phone</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {LANGUAGES.map((l) => (
              <Chip key={l.value} role="radio" on={language === l.value} onClick={() => setLanguage(l.value)}>
                {l.label}
              </Chip>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="mb-4 space-y-3">
        <SectionLabel>The wastage you allow them</SectionLabel>
        <p className="text-sm text-ink-3">How much metal they may lose, as a share of gold issued.</p>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Allowed loss</p>
            <p className="font-mono text-3xl font-semibold text-ink tabular">{wastage.toFixed(2)}%</p>
            <p className="text-[13px] text-ink-3">of gold issued</p>
          </div>
          <div className="min-w-[14rem] flex-1">
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.1}
              value={wastage}
              onChange={(e) => setWastage(Math.round(Number(e.target.value) * 10) / 10)}
              aria-label="Allowed loss in percent"
              className="w-full accent-gold"
            />
            <div className="flex justify-between text-[13px] text-ink-3">
              <span>0.6%</span>
              <span>1.2%</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-ink-2">
          On a {SAMPLE_JOB_G} g job, that means up to <span className="font-mono font-semibold tabular">{fmtG(lossOnSample)} g</span> lost. More than that against a job, and it is flagged to you.
        </p>
        <p className="text-[13px] text-ink-3">The usual range for hand-made work. You can move it per karigar. This feeds their scorecard: loss %, punctuality, rating.</p>
      </Card>

      {error && (
        <div className="mb-4">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          Add this karigar
        </Button>
        <Button onClick={() => go('karigars')}>Cancel</Button>
      </div>
      <p className="mt-3 text-[13px] text-ink-3">Only the owner can add a karigar or change their wastage allowance.</p>
    </form>
  );
}
