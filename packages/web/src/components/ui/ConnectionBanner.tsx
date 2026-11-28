import { LoaderCircle, WifiOff } from 'lucide-react';
import type { ConnectionState } from '../../query/connection';
import { useConnection } from '../../query/use-connection';
import { cn } from './cn';

export const RECONNECTING_TEXT = 'Reconnecting…';
export const OFFLINE_TEXT = 'You are offline. What you see may be out of date. Changes need the server.';
export const CONNECTED_AGAIN_TEXT = 'Connected again.';

/**
 * The shell's connection line (EP-08-S10, S11). One polite live region, so each change is
 * announced once: "Reconnecting…" with a spinner, the offline sentence with an icon, and a
 * visually hidden "Connected again." when the connection returns. The amber colour is a second cue.
 */
export function ConnectionBannerView({ state, recovered }: { state: ConnectionState; recovered: boolean }) {
  const warn = state === 'reconnecting' || state === 'offline';
  return (
    <div role="status" aria-live="polite">
      {warn && (
        <p className={cn('flex items-center gap-2 border-b border-wait bg-wait-soft px-4 py-2 text-sm font-semibold text-wait')}>
          {state === 'reconnecting' ? (
            <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
          ) : (
            <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          )}
          <span>{state === 'reconnecting' ? RECONNECTING_TEXT : OFFLINE_TEXT}</span>
        </p>
      )}
      {!warn && recovered && <span className="sr-only">{CONNECTED_AGAIN_TEXT}</span>}
    </div>
  );
}

export function ConnectionBanner() {
  const { state, recovered } = useConnection();
  return <ConnectionBannerView state={state} recovered={recovered} />;
}
