import type { RoleId } from '@goldsmith/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isRouteId, type Route, type RouteId, resolveRoute, routeTitles } from '../nav';
export interface NavigationValue {
  route: Route;
  /** Open a screen. A screen the role may not open shows the landing route and sets `notice`. */
  go: (id: RouteId, params?: Record<string, string>) => void;
  /** The sentence for a request that was redirected; null otherwise. */
  notice: string | null;
}
export const redirectNotice = (requested: RouteId, landing: RouteId): string =>
  `You do not have access to ${routeTitles[requested]}. Showing ${routeTitles[landing]}.`;
/** The route id a deep link such as `/security` names, else null. */
export function routeFromPath(path: string): RouteId | null {
  const name = path.replace(/^\/+|\/+$/g, '');
  return isRouteId(name) ? name : null;
}
interface Opened {
  route: Route;
  notice: string | null;
}
/** What opens first: the deep link when the role may open it, else the landing route (EP-08-S12 AC2, S13 AC2, AC4). */
export function openingRoute(role: RoleId, landing: RouteId, path: string): Opened {
  const requested = routeFromPath(path);
  if (!requested) return { route: { id: landing }, notice: null };
  const resolved = resolveRoute(role, requested);
  return resolved.redirected
    ? { route: { id: resolved.id }, notice: redirectNotice(requested, resolved.id) }
    : { route: { id: resolved.id }, notice: null };
}
const NavigationContext = createContext<NavigationValue | null>(null);
/**
 * The open screen. The first screen is the deep link in the address when it names a route the role
 * may open; the address is then reset to `/`, so a reload lands on the landing route.
 */
export function NavigationProvider({
  role,
  landingRoute,
  initialPath = typeof window === 'undefined' ? '/' : window.location.pathname,
  children,
}: {
  role: RoleId;
  landingRoute: RouteId;
  initialPath?: string;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState<Opened>(() => openingRoute(role, landingRoute, initialPath));
  useEffect(() => {
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
  }, []);
  const go = useCallback(
    (id: RouteId, params?: Record<string, string>) => {
      const resolved = resolveRoute(role, id);
      setOpened(
        resolved.redirected
          ? { route: { id: resolved.id }, notice: redirectNotice(id, resolved.id) }
          : { route: { id: resolved.id, params }, notice: null },
      );
      window.scrollTo({ top: 0 });
    },
    [role],
  );
  const value = useMemo<NavigationValue>(() => ({ route: opened.route, go, notice: opened.notice }), [opened, go]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation needs a NavigationProvider above it.');
  return value;
}
/** The navigation, or null outside the signed-in shell (prototype renders and static tests). */
export const useOptionalNavigation = (): NavigationValue | null => useContext(NavigationContext);
