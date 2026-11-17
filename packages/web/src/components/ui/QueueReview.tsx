import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  /** Zero-based position. */
  index: number;
  total: number;
  /** What is being worked through, e.g. "Piece" or "Edit". */
  noun: string;
  title?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  children?: ReactNode;
}

/** "n of m": one item at a time through a queue, with a bar that shows how far you are. */
export function QueueReview({ index, total, noun, title, onPrev, onNext, children }: Props) {
  const pct = total === 0 ? 0 : ((index + 1) / total) * 100;
  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div>
          <p className="text-[15px] font-semibold text-ink">
            {noun} {Math.min(index + 1, total)} of {total}
          </p>
          {title && <p className="text-sm text-ink-3">{title}</p>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<ChevronLeft size={16} />} disabled={!onPrev || index <= 0} onClick={onPrev} aria-label={`Previous ${noun.toLowerCase()}`}>
            Back
          </Button>
          <Button size="sm" disabled={!onNext || index >= total - 1} onClick={onNext} aria-label={`Next ${noun.toLowerCase()}`}>
            Next <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="h-1 bg-closed-soft" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
        <div className="h-1 bg-gold" style={{ width: `${pct}%` }} />
      </div>
      {children && <div className="p-4">{children}</div>}
    </section>
  );
}
