import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AUTH_MESSAGES } from '@goldsmith/shared';
import type { AuthResult } from '@goldsmith/shared';
import { authCall } from './auth-api';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { SetPasswordPage } from './SetPasswordPage';
import { SignInPage } from './SignInPage';
export type CurrentSession = AuthResult<'readCurrentSession'>;
type GateState =
  | { kind: 'checking' }
  | { kind: 'signed-out'; view: 'sign-in' | 'forgot'; notice?: string }
  | { kind: 'link'; purpose: 'activation' | 'reset'; token: string }
  | { kind: 'signed-in'; session: CurrentSession };
const LINK_PATHS: Record<string, 'activation' | 'reset'> = { '/activate': 'activation', '/reset-password': 'reset' };
/** Reads `#token=` from an activation or reset link, then drops the hash so the token leaves the address bar. */
function linkFromLocation(): { purpose: 'activation' | 'reset'; token: string } | null {
  const purpose = LINK_PATHS[window.location.pathname];
  if (!purpose) return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
  window.history.replaceState(null, '', window.location.pathname);
  return { purpose, token };
}
/**
 * Shows the app only to a signed-in person (EP-04-S6, S11, S12). Without a session it shows sign-in;
 * when the session ends while the app is open, it says so on the next focus.
 */
export function AuthGate({ children }: { children: (session: CurrentSession, signOut: () => void) => ReactNode }) {
  const [state, setState] = useState<GateState>(() => {
    const link = linkFromLocation();
    return link ? { kind: 'link', ...link } : { kind: 'checking' };
  });
  const signedIn = state.kind === 'signed-in';
  useEffect(() => {
    if (state.kind !== 'checking') return;
    let live = true;
    void authCall('readCurrentSession', {}).then((answer) => {
      if (!live) return;
      setState(answer.ok ? { kind: 'signed-in', session: answer.data } : { kind: 'signed-out', view: 'sign-in' });
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
        if (!answer.ok && answer.code === 'unauthenticated') {
          setState({ kind: 'signed-out', view: 'sign-in', notice: AUTH_MESSAGES.sessionEnded });
        }
      });
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, [signedIn]);
  const signOut = useCallback(() => {
    void authCall('signOut', {}).then(() => {
      setState({ kind: 'signed-out', view: 'sign-in' });
      window.history.replaceState(null, '', '/');
    });
  }, []);
  const toSignIn = useCallback(() => {
    window.history.replaceState(null, '', '/');
    setState({ kind: 'signed-out', view: 'sign-in' });
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
