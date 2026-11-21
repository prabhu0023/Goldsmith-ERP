import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { authCall } from './auth-api';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { gateAfterCheck, gateAfterRecheck, gateAfterSignOut, gateFromLocation, signedOut } from './gate-state';
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
/**
 * Shows the app only to a signed-in person (EP-04-S6, S11, S12). Without a session it shows sign-in;
 * when the session ends while the app is open, it says so on the next focus.
 */
export function AuthGate({ children }: { children: (session: CurrentSession, signOut: SignOut) => ReactNode }) {
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
  useEffect(() => {
    if (!signedIn) return;
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      void authCall('readCurrentSession', {}).then((answer) => {
        const next = gateAfterRecheck(answer);
        if (next) setState(next);
      });
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [signedIn]);
  const signOut = useCallback<SignOut>(async () => {
    const answer = await authCall('signOut', {});
    const next = gateAfterSignOut(answer);
    if (!next) return answer.ok ? null : answer.message;
    setState(next);
    window.history.replaceState(null, '', '/');
    return null;
  }, []);
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
      return children(state.session, signOut);
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
