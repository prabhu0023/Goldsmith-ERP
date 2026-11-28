import { TriangleAlert } from 'lucide-react';
import { MAYBE_NOT_SAVED_MESSAGE } from '../../query/action-controller';
import { Button } from './Button';
import { cn } from './cn';
import { type StateSize, stateText } from './textSize';

/**
 * The outcome of a refused or unconfirmed action, beside the button that ran it (EP-08-S5, S6):
 * the server's sentence for a refusal; "It may not have been saved…" with "Try again" when the
 * connection failed after sending. Nothing is shown otherwise.
 */
export function ActionError({
  refusal,
  maybeNotSaved,
  onRetry,
  busy,
  id,
  size,
}: {
  refusal: { message: string } | null;
  maybeNotSaved?: boolean;
  onRetry?: () => void;
  busy?: boolean;
  id?: string;
  size?: StateSize;
}) {
  if (!maybeNotSaved && !refusal) return null;
  return (
    <div id={id} role="alert" className={cn('flex flex-wrap items-center gap-3 font-semibold text-stop', stateText(size))}>
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span>{maybeNotSaved ? MAYBE_NOT_SAVED_MESSAGE : refusal?.message}</span>
      {maybeNotSaved && onRetry && (
        <Button size="sm" onClick={onRetry} disabled={busy}>
          {busy ? 'Trying again…' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
