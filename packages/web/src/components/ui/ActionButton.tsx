import { type ComponentProps, useId } from 'react';
import { useConnection } from '../../query/use-connection';
import { Button } from './Button';
import { cn } from './cn';
import { type StateSize, stateText } from './textSize';

type ButtonProps = ComponentProps<typeof Button>;

/**
 * The button of an action that needs the server (EP-08-S5, S6, S11). It is disabled while the
 * action runs (shows "Working…") and while the connection blocks actions, and then says why in
 * a line beside it, linked by aria-describedby. Nothing is queued while it is disabled (D6).
 */
export function ActionButton({
  busy,
  disabledReason,
  stateSize,
  disabled,
  className,
  children,
  ...rest
}: Omit<ButtonProps, 'aria-describedby'> & {
  busy?: boolean;
  /** Why the action cannot be run for a reason of the form itself (not the connection). */
  disabledReason?: string;
  stateSize?: StateSize;
}) {
  const connection = useConnection();
  const reasonId = useId();
  const reason = connection.blocksActions() ? connection.reason : (disabledReason ?? null);
  return (
    <div className={cn('inline-flex flex-col items-start gap-1', rest.block && 'flex w-full')}>
      <Button
        {...rest}
        className={className}
        disabled={disabled || busy || connection.blocksActions() || Boolean(disabledReason)}
        aria-describedby={reason ? reasonId : undefined}
        aria-busy={busy || undefined}
      >
        {busy ? 'Working…' : children}
      </Button>
      {reason && (
        <p id={reasonId} className={cn('font-medium text-ink-2', stateText(stateSize))}>
          {reason}
        </p>
      )}
    </div>
  );
}
