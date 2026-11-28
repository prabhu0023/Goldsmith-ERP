import { cn } from '../ui';
import { SPECIALTY_CHOICES } from './karigar-rows';
/** One toggle chip; the state is its aria-checked, never colour alone. */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn('min-h-11 rounded-lg border px-4 text-sm font-semibold', on ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper')}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  );
}
/** What a karigar is best at. A saved specialty outside the usual list stays on offer so it can be unticked. */
export function SpecialtyChips({ value, onChange, error }: { value: string[]; onChange: (next: string[]) => void; error?: string }) {
  const choices = [...SPECIALTY_CHOICES, ...value.filter((s) => !(SPECIALTY_CHOICES as readonly string[]).includes(s))];
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold text-ink-2">What they are best at</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((s) => (
          <Chip key={s} on={value.includes(s)} onClick={() => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])}>
            {s}
          </Chip>
        ))}
      </div>
      {error && <p className="mt-1 text-[13px] font-semibold text-stop">{error}</p>}
    </fieldset>
  );
}
