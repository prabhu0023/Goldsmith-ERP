import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

type Step = 1 | 2 | 3;

interface Props {
  step: Step;
  /** Furthest step reached, so earlier steps can be revisited. */
  maxStep?: Step;
  onStep?: (n: Step) => void;
  labels?: [string, string, string];
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

const defaultLabels: [string, string, string] = ['Weigh the parcel', 'Tag each item', 'Match and release'];

/** The three-step intake header: weigh, tag, match. One decision per step, a visible way back. */
export function StepFrame({ step, maxStep = step, onStep, labels = defaultLabels, title, subtitle, actions, children }: Props) {
  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Steps">
        {labels.map((label, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const current = n === step;
          const reachable = !!onStep && n <= maxStep && !current;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                onClick={() => onStep?.(n)}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
                  current && 'border-gold bg-gold-soft text-gold-ink',
                  done && 'border-live/40 bg-live-soft text-live',
                  !current && !done && 'border-line-2 bg-surface text-ink-3',
                  !reachable && 'cursor-default',
                )}
              >
                {done ? <Check size={16} /> : <span>{n}</span>}
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
