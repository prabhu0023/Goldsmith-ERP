import type { RoleId } from '@goldsmith/shared';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { SignOut } from '../auth/AuthGate';
import type { CurrentSession } from '../auth/gate-state';
import type { RouteId } from '../nav';
import { createServerClock } from './server-time';
export interface Session {
  user: CurrentSession['user'];
  role: RoleId;
  shopName: string;
  landingRoute: RouteId;
  permissions: readonly string[];
  /** Whether the session's permission list holds the operation. */
  can(op: string): boolean;
  /** The server's time now (ms), not the device's. */
  serverNow(): number;
  /** The shop's date now (Asia/Kolkata), YYYY-MM-DD, from the server's time. */
  shopToday(): string;
  signOut: SignOut;
}
const SessionContext = createContext<Session | null>(null);
/** Builds the session value; separate from the provider so a test can use it without React. */
export function buildSession(session: CurrentSession, signOut: SignOut, nowFn?: () => number): Session {
  const clock = createServerClock(session.serverTime, nowFn);
  const allowed = new Set<string>(session.permissions);
  return {
    user: session.user,
    role: session.user.role,
    shopName: session.shopName,
    landingRoute: session.landingRoute,
    permissions: session.permissions,
    can: (op) => allowed.has(op),
    serverNow: clock.now,
    shopToday: clock.shopToday,
    signOut,
  };
}
/** Gives the signed-in shell the person, the role, the permission list and the server's clock (EP-08-S12). */
export function SessionProvider({
  session,
  signOut,
  nowFn,
  children,
}: {
  session: CurrentSession;
  signOut: SignOut;
  /** The browser clock; a test passes a skewed one. */
  nowFn?: () => number;
  children: ReactNode;
}) {
  const value = useMemo(() => buildSession(session, signOut, nowFn), [session, signOut, nowFn]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession needs a SessionProvider above it.');
  return value;
}
/** The session, or null outside the signed-in shell. */
export const useOptionalSession = (): Session | null => useContext(SessionContext);
