import { createLiveClient, type LiveClient } from '@goldsmith/shared';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { authCall } from '../auth/auth-api';
import { browserLiveOps, browserStreamSource, browserTimers } from './browser-stream';
import { idleLiveClient, LiveContext } from './use-live';

/**
 * True unless the server says the session is gone; an unreachable server keeps the client retrying.
 * A background check: the server must not count it as activity (EP-04-S12, EP-08-S15).
 */
async function sessionAlive(): Promise<boolean> {
  const answer = await authCall('readCurrentSession', {}, { background: true });
  return answer.ok || answer.code !== 'unauthenticated';
}

const browserClient = (): LiveClient =>
  createLiveClient({ source: browserStreamSource(), ops: browserLiveOps, timers: browserTimers, checkSession: sessionAlive });

/**
 * Creates the one client and wires what listens to it before it starts, so no event is missed:
 * `onClient` runs first and its returned function runs on close, before the client stops.
 */
export function openLive(
  create: () => LiveClient,
  hooks: { onSignedOut?: () => void; onClient?: (client: LiveClient) => (() => void) | undefined },
) {
  const client = create();
  const off = client.onStatus((status) => {
    if (status === 'signed_out') hooks.onSignedOut?.();
  });
  const detach = hooks.onClient?.(client);
  return {
    client,
    start: () => client.start(),
    close: () => {
      off();
      detach?.();
      client.stop();
    },
  };
}
/**
 * One live connection for the signed-in user (EP-07-S3 AC1), open while the app shell is mounted.
 * Mount it with `key={userId}` so another user gets a new connection. When the client finds the
 * session gone (S7 AC5) it calls onSignedOut, which takes the app back to sign-in.
 */
export function LiveProvider({
  children,
  onSignedOut,
  onClient,
  createClient = browserClient,
}: {
  children: ReactNode;
  onSignedOut?: () => void;
  /** Called with each new client before it starts, so a listener misses no event; the returned function runs before the client stops. */
  onClient?: (client: LiveClient) => (() => void) | undefined;
  createClient?: () => LiveClient;
}) {
  const [client, setClient] = useState<LiveClient>(idleLiveClient);
  const signedOut = useRef(onSignedOut);
  signedOut.current = onSignedOut;
  const attach = useRef(onClient);
  attach.current = onClient;
  const create = useRef(createClient);
  useEffect(() => {
    // Created in the effect, so a remount (StrictMode included) gets a fresh client.
    const live = openLive(create.current, {
      onSignedOut: () => signedOut.current?.(),
      onClient: (c) => attach.current?.(c),
    });
    setClient(live.client);
    live.start();
    return live.close;
  }, []);
  return <LiveContext.Provider value={client}>{children}</LiveContext.Provider>;
}
