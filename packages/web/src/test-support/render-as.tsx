/**
 * Static renders of a screen as a signed-in person: a session fixture, the query cache with a fake
 * api (a static render never fetches), the connection store and navigation. Tests only.
 */
import type { RoleId } from '@goldsmith/shared';
import { permissionsFor } from '@goldsmith/shared';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CurrentSession } from '../auth/gate-state';
import { landingRoute } from '../nav';
import { QueryProvider } from '../query/QueryProvider';
import { createQueryClient, type QueryClient } from '../query/query-client';
import { fakeApi, fakeTimers } from '../query/test-support';
import { ConnectionProvider } from '../query/use-connection';
import type { ConnectionStore } from '../query/connection';
import { NavigationProvider } from '../shell/navigation';
import { SessionProvider } from '../shell/session-context';
export const SHOP_NAME = 'Jai Gulab Dev, Main showroom';
/** The answer of `readCurrentSession` for a person. */
export function sessionFor(name: string, role: RoleId, over: Partial<CurrentSession> = {}): CurrentSession {
  return {
    ok: true,
    user: { userId: `u-${role}`, name, role },
    landingRoute: landingRoute[role] as CurrentSession['landingRoute'],
    permissions: [...permissionsFor(role)],
    shopName: SHOP_NAME,
    serverTime: '2026-10-01T18:40:00.000Z',
    ...over,
  };
}
export interface RenderAsOptions {
  /** The session's permission list; default: the role's list. */
  permissions?: readonly string[];
  /** The address the person opened (a deep link); default `/`. */
  path?: string;
  /** A cache the test seeded. */
  queries?: QueryClient;
  connection?: ConnectionStore;
  nowFn?: () => number;
}
/** The providers of the signed-in shell around `node`. */
export function asSignedIn(name: string, role: RoleId, node: ReactNode, opts: RenderAsOptions = {}): ReactElement {
  const session = sessionFor(name, role, opts.permissions ? { permissions: [...opts.permissions] } : {});
  const clock = fakeTimers();
  const queries = opts.queries ?? createQueryClient({ api: fakeApi().api, now: clock.now, timers: clock.timers });
  let tree = (
    <QueryProvider client={queries}>
      <SessionProvider session={session} signOut={async () => null} nowFn={opts.nowFn}>
        <NavigationProvider role={role} landingRoute={session.landingRoute} initialPath={opts.path ?? '/'}>
          {node}
        </NavigationProvider>
      </SessionProvider>
    </QueryProvider>
  );
  if (opts.connection) tree = <ConnectionProvider store={opts.connection}>{tree}</ConnectionProvider>;
  return tree;
}
/** Renders `node` as the person to static markup. */
export const renderAs = (name: string, role: RoleId, node: ReactNode, opts: RenderAsOptions = {}): string =>
  renderToStaticMarkup(asSignedIn(name, role, node, opts));
