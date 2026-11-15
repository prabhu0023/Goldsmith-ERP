import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export type CardTone = 'stop' | 'wait' | 'gold' | 'live' | 'closed';

const edge: Record<CardTone, string> = {
  stop: 'border-l-stop',
  wait: 'border-l-wait',
  gold: 'border-l-gold',
  live: 'border-l-live',
  closed: 'border-l-closed',
};

interface Props {
  tone: CardTone;
  /** One sentence. */
  title: string;
  detail?: ReactNode;
  /** One action. */
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
  className?: string;
}

/** Coloured left edge, one sentence, one action. */
export function AttentionCard({ tone, title, detail, action, icon, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-center gap-4 rounded-xl border border-line border-l-4 bg-surface p-4', edge[tone], className)}>
      {icon && <div className="shrink-0 text-ink-3">{icon}</div>}
      <div className="min-w-[14rem] flex-1">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {detail && <p className="mt-0.5 text-sm text-ink-3">{detail}</p>}
      </div>
      {action && (
        <Button variant={tone === 'gold' || tone === 'stop' ? 'primary' : 'secondary'} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
