import type { ErrorCode } from '@goldsmith/shared';
import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { type StateSize, stateText } from './textSize';

export const FORBIDDEN_SENTENCE = 'You may not see this.';

/**
 * A read that failed (EP-08-S4): the server's sentence with an icon, and "Try again". A refused
 * read (`forbidden`) says so and offers no button: trying again cannot change the answer.
 */
export function ReadError({
  label,
  message,
  code,
  onRetry,
  busy,
  size,
}: {
  /** What could not be loaded, e.g. "security log": the sentence starts "The security log could not be loaded." */
  label?: string;
  message: string;
  code?: ErrorCode;
  onRetry?: () => void;
  /** A retry is running. */
  busy?: boolean;
  size?: StateSize;
}) {
  const forbidden = code === 'forbidden';
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-3 rounded-lg border border-stop bg-stop-soft px-3 py-2 font-semibold text-stop', stateText(size))}>
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <span>{forbidden ? FORBIDDEN_SENTENCE : label ? `The ${label} could not be loaded. ${message}` : message}</span>
      {!forbidden && onRetry && (
        <Button size="sm" onClick={onRetry} disabled={busy}>
          {busy ? 'Trying again…' : 'Try again'}
        </Button>
      )}
    </div>
  );
}
