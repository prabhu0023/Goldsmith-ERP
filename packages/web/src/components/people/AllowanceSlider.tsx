import { unitsToGrams, wastageExampleUnits } from '@goldsmith/shared';
import { bpToPercent, percentToBp } from './karigar-rows';
/** The wastage allowance, 0.6% to 1.2% in steps of 0.1, kept as whole basis points, with what it means on a 160 g job. */
export function AllowanceSlider({ bp, onChange, label = 'Allowed loss in percent' }: { bp: number; onChange: (bp: number) => void; label?: string }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Allowed loss</p>
          <p className="font-mono text-3xl font-semibold text-ink tabular">{bpToPercent(bp)}%</p>
          <p className="text-[13px] text-ink-3">of gold issued</p>
        </div>
        <div className="min-w-[14rem] flex-1">
          <input
            type="range"
            min={0.6}
            max={1.2}
            step={0.1}
            value={bpToPercent(bp)}
            onChange={(e) => onChange(percentToBp(e.target.value) ?? bp)}
            aria-label={label}
            className="w-full accent-gold"
          />
          <div className="flex justify-between text-[13px] text-ink-3">
            <span>0.6%</span>
            <span>1.2%</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-ink-2">
        On a 160 g job, that means up to <span className="font-mono font-semibold tabular">{unitsToGrams(wastageExampleUnits(bp))} g</span> lost. More than that against a job, and it is flagged to you.
      </p>
    </>
  );
}
