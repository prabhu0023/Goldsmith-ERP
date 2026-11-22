import { createLiveClient, type LiveClient } from '@goldsmith/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { authCall } from '../auth/auth-api';
import { browserLiveOps, browserStreamSource, browserTimers } from './browser-stream';
import { idleLiveClient, LiveContext } from './use-live';

/** True unless the server says the session is gone; an unreachable server keeps the client retrying. */
async function sessionAlive(): Promise<boolean> {
  const answer = await authCall('readCurrentSession', {});
  return answer.ok || answer.code !== 'unauthenticated';
}

const browserClient = (): LiveClient =>
  createLiveClient({ source: browserStreamSource(), ops: browserLiveOps, timers: browserTimers, checkSession: sessionAlive });

/**
 * One live connection for the signed-in user (EP-07-S3 AC1), open while the app shell is mounted.
 * Mount it with `key={userId}` so another user gets a new connection. When the client finds the
 * session gone (S7 AC5) it calls onSignedOut, which takes the app back to sign-in.
 */
export function LiveProvider({
  children,
  onSignedOut,
  createClient = browserClient,
}: {
  children: ReactNode;
  onSignedOut?: () => void;
  createClient?: () => LiveClient;
}) {
  const [client, setClient] = useState<LiveClient>(idleLiveClient);
  const signedOut = useRef(onSignedOut);
  signedOut.current = onSignedOut;
  const create = useRef(createClient);
  useEffect(() => {
    // Created in the effect, so a remount (StrictMode included) gets a fresh client.
    const c = create.current();
    const off = c.onStatus((status) => {
      if (status === 'signed_out') signedOut.current?.();
    });
    setClient(c);
    c.start();
    return () => {
      off();
      c.stop();
    };
  }, []);
  return <LiveContext.Provider value={client}>{children}</LiveContext.Provider>;
}
