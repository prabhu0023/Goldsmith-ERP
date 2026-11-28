import { usePricingEnabled } from '../../shell/pricing';
import { cn } from './cn';

interface Props {
  /** Rupees, or null while no value is recorded. */
  value: number | null | undefined;
  label?: string;
  className?: string;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/**
 * The one socket every rupee figure goes through. With pricing off it draws nothing and takes no
 * space. Nothing else in the app may print a currency symbol.
 */
export function ValueSlot({ value, label, className }: Props) {
  if (!usePricingEnabled()) return null;
  return (
    <div className={cn('text-sm text-ink-2', className)}>
      {label && <span className="mr-1.5 text-ink-3">{label}</span>}
      {value === null || value === undefined ? <span className="text-ink-4">not set</span> : <span className="font-mono font-medium tabular">{inr.format(value)}</span>}
    </div>
  );
}
