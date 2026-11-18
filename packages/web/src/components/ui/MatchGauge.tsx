import { fmtMg } from '@goldsmith/shared';
import { cn } from './cn';

interface Props {
  /** Tags minus parcel, in grams. Negative = the tags are short. */
  gapG: number;
  /** The most the scales alone could explain, in grams. */
  ceilingG: number;
  caption?: string;
}

/** Symmetric, zero-centred. The faint band is the ceiling; the marker is the gap. */
export function MatchGauge({ gapG, ceilingG, caption }: Props) {
  const abs = Math.abs(gapG);
  const half = Math.max(abs * 1.3, ceilingG * 3, 0.00001);
  const pos = Math.max(2, Math.min(98, 50 + (gapG / half) * 50));
  const band = Math.max(1.5, (ceilingG / half) * 50);
  const state = abs === 0 ? 'exact' : abs <= ceilingG + 1e-9 ? 'near' : 'off';
  const markerCls = { exact: 'bg-live', near: 'bg-wait', off: 'bg-stop' }[state];
  const text = state === 'exact' ? 'exactly 0 mg' : `${fmtMg(gapG)} ${gapG < 0 ? 'short' : 'over'}`;
  return (
    <figure className="w-full" role="img" aria-label={`Gap on pure gold: ${text}. Scales could explain up to ${fmtMg(ceilingG)}.`}>
      <div className="relative h-4 rounded-full bg-closed-soft">
        <div className="absolute inset-y-0 rounded-full bg-gold/25" style={{ left: `${50 - band}%`, width: `${band * 2}%` }} />
        <div className="absolute inset-y-[-4px] left-1/2 w-px bg-ink-4" />
        <div className={cn('absolute top-1/2 h-6 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded', markerCls)} style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[13px] text-ink-3">
        <span>short</span>
        <span className={cn('font-mono text-sm font-semibold tabular', state === 'exact' ? 'text-live' : state === 'near' ? 'text-wait' : 'text-stop')}>{text}</span>
        <span>over</span>
      </div>
      <figcaption className="mt-1 text-[13px] text-ink-3">{caption ?? `The faint band is ±${fmtMg(ceilingG)}, all that the weighings' rounding could ever explain.`}</figcaption>
    </figure>
  );
}
