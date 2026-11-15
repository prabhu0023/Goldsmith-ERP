import { fmtG } from '../../domain/weights';
import { cn } from './cn';

interface Props {
  g: number;
  /** hero 26 px, table 20 px, body 14 px. */
  size?: 'hero' | 'table' | 'body';
  unit?: boolean;
  /** Shows "was X" underneath, for an edited figure. */
  was?: number;
  className?: string;
  tone?: 'default' | 'live' | 'wait' | 'stop' | 'muted';
}

const sizeCls = { hero: 'text-[26px] font-semibold', table: 'text-xl font-medium', body: 'text-sm font-medium' };
const toneCls = { default: 'text-ink', live: 'text-live', wait: 'text-wait', stop: 'text-stop', muted: 'text-ink-3' };

/** A weight: tabular mono, always four decimals, right-aligned. */
export function WeightReadout({ g, size = 'table', unit = true, was, className, tone = 'default' }: Props) {
  return (
    <span className={cn('inline-flex flex-col items-end text-right font-mono tabular', className)}>
      <span className={cn(sizeCls[size], toneCls[tone])}>
        {fmtG(g)}
        {unit && <span className="ml-1 text-sm font-normal text-ink-3">g</span>}
      </span>
      {was !== undefined && <span className="text-[13px] font-normal text-ink-3">was {fmtG(was)}</span>}
    </span>
  );
}
