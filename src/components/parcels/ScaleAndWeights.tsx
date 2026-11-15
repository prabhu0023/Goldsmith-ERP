import { trimNum } from '../../domain/weights';
import { useStore } from '../../store/StoreProvider';
import { Field, Input, Select } from '../ui';

/** Pick the scale from the registry. Its readability sets how exact the match must be. */
export function ScalePicker({ value, onChange, label = 'Which scale is this on?' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const { state } = useStore();
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {state.scales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {trimNum(s.readabilityG)} g
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** A typed weight in grams. Never pre-filled. */
export function WeightField({
  label,
  value,
  onChange,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <div className="flex items-center gap-2">
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0000"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-lg tabular"
          aria-invalid={!!error}
        />
        <span className="text-sm text-ink-3">g</span>
      </div>
    </Field>
  );
}
