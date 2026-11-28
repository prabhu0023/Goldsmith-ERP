import { AUTH_MESSAGES } from '@goldsmith/shared';
import type { AuthResult } from '@goldsmith/shared';
import type { AuthAnswer } from './auth-api';
export type CurrentSession = AuthResult<'readCurrentSession'>;
/** What the auth gate shows (EP-04-S6, S11, S12). */
export type GateState =
  | { kind: 'checking' }
  | { kind: 'signed-out'; view: 'sign-in' | 'forgot'; notice?: string }
  | { kind: 'link'; purpose: 'activation' | 'reset'; token: string }
  | { kind: 'signed-in'; session: CurrentSession };
const LINK_PATHS: Record<string, 'activation' | 'reset'> = { '/activate': 'activation', '/reset-password': 'reset' };
/** The sign-in screen, with an optional sentence above the form. */
export const signedOut = (notice?: string): GateState => ({ kind: 'signed-out', view: 'sign-in', notice });
/**
 * The first state for an address: an activation or reset link reads `#token=`; every other path,
 * an app route such as `/stock` included, checks the session first.
 */
export function gateFromLocation(pathname: string, hash: string): GateState {
  const purpose = LINK_PATHS[pathname];
  if (!purpose) return { kind: 'checking' };
  return { kind: 'link', purpose, token: new URLSearchParams(hash.slice(1)).get('token') ?? '' };
}
/** After the first Read Current session: the app when signed in, else the sign-in screen. */
export const gateAfterCheck = (answer: AuthAnswer<'readCurrentSession'>): GateState =>
  answer.ok ? { kind: 'signed-in', session: answer.data } : signedOut();
/** The sign-in screen with the session-ended sentence (a 401, a closed live stream, own access change; EP-08-S15). */
export const gateAfterEnd = (): GateState => signedOut(AUTH_MESSAGES.sessionEnded);
/** After a re-check while signed in: the session-ended sentence on `unauthenticated`, else no change. */
export const gateAfterRecheck = (answer: AuthAnswer<'readCurrentSession'>): GateState | null =>
  !answer.ok && answer.code === 'unauthenticated' ? gateAfterEnd() : null;
/**
 * After Sign out (S11): the sign-in screen once the server ended the session, or when it had already
 * ended (`unauthenticated`). Any other failure keeps the app open: the HttpOnly cookie cannot be
 * cleared here, so showing sign-in would let a reload sign the same person back in.
 */
export const gateAfterSignOut = (answer: AuthAnswer<'signOut'>): GateState | null =>
  answer.ok || answer.code === 'unauthenticated' ? signedOut() : null;
