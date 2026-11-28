import { CUSTOMER_GROUPS } from '@goldsmith/shared';
import { Field, Input, Select, Textarea, cn } from '../ui';
import type { CustomerField, CustomerForm } from './customer-rows';
import { MONTHS, daysInMonth } from './util';
type Errors = Partial<Record<CustomerField, string>>;
interface Props {
  form: CustomerForm;
  onChange: (patch: Partial<CustomerForm>) => void;
  errors: Errors;
}
/** A day and a month, as the form asks for a birthday or an anniversary. */
function DayMonth({ label, day, month, error, onDay, onMonth }: { label: string; day: string; month: string; error?: string; onDay: (v: string) => void; onMonth: (v: string) => void }) {
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
      {error && <span className="mt-1 block text-sm font-semibold text-stop">{error}</span>}
    </fieldset>
  );
}
/** Name, phone, city, address, group and (when `withNotes`) notes. Shared by the add form and the edit form. */
export function WhoTheyAre({ form, onChange, errors, withNotes }: Props & { withNotes?: boolean }) {
  return (
    <>
      <Field label="Name" error={errors.name}>
        <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} autoComplete="off" />
      </Field>
      <Field label="Phone · also the WhatsApp number" error={errors.phone}>
        <Input value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} inputMode="tel" placeholder="+91 98840 21107" />
      </Field>
      <Field label="City" error={errors.city}>
        <Input value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
      </Field>
      <Field label="Address (optional)" error={errors.address}>
        <Input value={form.address} onChange={(e) => onChange({ address: e.target.value })} placeholder="door, street, area…" />
      </Field>
      <fieldset>
        <legend className="mb-1 block text-sm font-semibold text-ink-2">Group</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {CUSTOMER_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={form.group === g}
              onClick={() => onChange({ group: g })}
              className={cn(
                'min-h-11 rounded-lg border px-4 text-sm font-semibold',
                form.group === g ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
              )}
            >
              {g}
            </button>
          ))}
        </div>
        {errors.group && <span className="mt-1 block text-sm font-semibold text-stop">{errors.group}</span>}
      </fieldset>
      {withNotes && (
        <Field label="Notes (optional)" error={errors.notes}>
          <Textarea value={form.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      )}
    </>
  );
}
/** Birthday and anniversary, each a day and a month. */
export function WhenToWish({ form, onChange, errors }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <DayMonth
        label="Birthday"
        day={form.birthdayDay}
        month={form.birthdayMonth}
        error={errors.dob}
        onDay={(v) => onChange({ birthdayDay: v })}
        onMonth={(v) => onChange({ birthdayMonth: v })}
      />
      <DayMonth
        label="Anniversary"
        day={form.anniversaryDay}
        month={form.anniversaryMonth}
        error={errors.anniversary}
        onDay={(v) => onChange({ anniversaryDay: v })}
        onMonth={(v) => onChange({ anniversaryMonth: v })}
      />
    </div>
  );
}
