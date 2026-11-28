import { useEffect, useState } from 'react';
import type { CurrentSession } from '../auth/gate-state';
import type { GateActions } from '../auth/AuthGate';
import { AppShell } from '../components/shell/AppShell';
import { browserTimers } from '../live/browser-stream';
import { LiveProvider } from '../live/LiveProvider';
import { QueryProvider } from '../query/QueryProvider';
import { ConnectionProvider } from '../query/use-connection';
import { PrototypeStoreProvider } from '@prototype';
import { NavigationProvider } from './navigation';
import { SessionProvider } from './session-context';
import { createSignedInRuntime, type SignedInRuntime } from './signed-in-runtime';
/**
 * Everything a signed-in person has (EP-08-S8, S12 to S15): one query cache, one live connection,
 * one connection state, the session, navigation and the shell. Mount it with `key={userId}`. When
 * it unmounts (sign-out, session end) the cache is emptied and the live client is stopped, so
 * nothing of this person stays in memory.
 */
export function SignedInApp({ session, actions }: { session: CurrentSession; actions: GateActions }) {
  const [runtime, setRuntime] = useState<SignedInRuntime | null>(null);
  const { endSession, signOut } = actions;
  const userId = session.user.userId;
  useEffect(() => {
    // Created in the effect, so a remount (StrictMode included) gets fresh state and no listener leaks.
    const created = createSignedInRuntime({ userId, onSessionEnded: endSession, timers: browserTimers });
    setRuntime(created);
    return () => {
      created.dispose();
    };
  }, [userId, endSession]);
  if (!runtime) return null;
  return (
    <ConnectionProvider store={runtime.connection}>
      <QueryProvider client={runtime.queries} api={runtime.api}>
        <SessionProvider session={session} signOut={signOut}>
          <LiveProvider onClient={runtime.attach}>
            <NavigationProvider role={session.user.role} landingRoute={session.landingRoute}>
              <PrototypeStoreProvider>
                <AppShell />
              </PrototypeStoreProvider>
            </NavigationProvider>
          </LiveProvider>
        </SessionProvider>
      </QueryProvider>
    </ConnectionProvider>
  );
}
