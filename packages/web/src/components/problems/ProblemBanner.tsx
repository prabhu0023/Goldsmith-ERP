import { OctagonAlert } from 'lucide-react';
import { useState } from 'react';
import { ago } from '@goldsmith/shared';
import { problemsOn } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { ProblemTarget } from '@goldsmith/shared';
import { Button, Notice } from '../ui';

/** Open problems raised on a parcel, job or piece. Anyone sees them; only the owner can clear one. */
export function ProblemBanner({ target }: { target: ProblemTarget }) {
  const { state, actions, role, now } = useStore();
  const [error, setError] = useState<string | null>(null);
  const list = problemsOn(state, target.kind, target.id);
  if (list.length === 0) return null;
  return (
    <div className="space-y-2">
      {list.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-stop/40 border-l-4 border-l-stop bg-stop-soft p-4">
          <OctagonAlert size={20} className="shrink-0 text-stop" aria-hidden />
          <div className="min-w-[12rem] flex-1">
            <p className="text-[15px] font-semibold text-ink">Stopped: {p.text}</p>
            <p className="text-sm text-ink-2">
              Raised by {p.raisedBy} {ago(p.raisedAt, now)}.{' '}
              {role === 'owner' ? 'Only you can start it again.' : 'Only the owner can start it again.'}
            </p>
          </div>
          {role === 'owner' && (
            <Button
              variant="primary"
              onClick={() => {
                const r = actions.clearProblem({ problemId: p.id });
                setError(r.ok ? null : (r.error ?? 'Could not clear it.'));
              }}
            >
              Clear it and start again
            </Button>
          )}
        </div>
      ))}
      {error && <Notice tone="stop">{error}</Notice>}
    </div>
  );
}
