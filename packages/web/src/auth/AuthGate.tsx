import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authCall } from './auth-api';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { gateAfterCheck, gateAfterEnd, gateAfterRecheck, gateAfterSignOut, gateFromLocation, signedOut } from './gate-state';
import type { CurrentSession, GateState } from './gate-state';
import { SetPasswordPage } from './SetPasswordPage';
import { SignInPage } from './SignInPage';
export type { CurrentSession } from './gate-state';
/** The first gate state; a link's hash is dropped so the token leaves the address bar. */
function stateFromLocation(): GateState {
  const state = gateFromLocation(window.location.pathname, window.location.hash);
  if (state.kind === 'link') window.history.replaceState(null, '', window.location.pathname);
  return state;
}
/** Ends the session; resolves to the error sentence when the app stays signed in, else null. */
export type SignOut = () => Promise<string | null>;
/** Asks the server whether the session still lives; shows sign-in with the session-ended sentence when not. */
export type Recheck = () => void;
/** What the signed-in app can ask of the gate. */
export interface GateActions {
  signOut: SignOut;
  recheck: Recheck;
  /** The session is over (a 401, a closed live stream, the person's own access change): back to sign-in with the session-ended sentence. */
  endSession: () => void;
}
/**
 * Shows the app only to a signed-in person (EP-04-S6, S11, S12). Without a session it shows sign-in;
 * when the session ends while the app is open, it says so on the next focus, or when the live
 * channel finds it gone (EP-07-S7 AC5).
 */
export function AuthGate({
  children,
}: {
  children: (session: CurrentSession, actions: GateActions) => ReactNode;
}) {
  const [state, setState] = useState<GateState>(stateFromLocation);
  const signedIn = state.kind === 'signed-in';
  useEffect(() => {
    if (state.kind !== 'checking') return;
    let live = true;
    void authCall('readCurrentSession', {}).then((answer) => {
      if (!live) return;
      setState(gateAfterCheck(answer));
    });
    return () => {
      live = false;
    };
  }, [state.kind]);
  const recheck = useCallback<Recheck>(() => {
    void authCall('readCurrentSession', {}).then((answer) => {
      const next = gateAfterRecheck(answer);
      if (next) setState(next);
    });
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    const onFocus = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [signedIn, recheck]);
  const signOut = useCallback<SignOut>(async () => {
    const answer = await authCall('signOut', {});
    const next = gateAfterSignOut(answer);
    if (!next) return answer.ok ? null : answer.message;
    setState(next);
    window.history.replaceState(null, '', '/');
    return null;
  }, []);
  const endSession = useCallback(() => {
    window.history.replaceState(null, '', '/');
    setState(gateAfterEnd());
  }, []);
  const actions = useMemo<GateActions>(() => ({ signOut, recheck, endSession }), [signOut, recheck, endSession]);
  const toSignIn = useCallback(() => {
    window.history.replaceState(null, '', '/');
    setState(signedOut());
  }, []);
  switch (state.kind) {
    case 'checking':
      return null;
    case 'link':
      return <SetPasswordPage purpose={state.purpose} token={state.token} onDone={toSignIn} />;
    case 'signed-in':
      return children(state.session, actions);
    case 'signed-out':
      return state.view === 'forgot' ? (
        <ForgotPasswordPage onBack={toSignIn} />
      ) : (
        <SignInPage
          notice={state.notice}
          onSignedIn={(session) => setState({ kind: 'signed-in', session })}
          onForgot={() => setState({ kind: 'signed-out', view: 'forgot' })}
        />
      );
  }
}
