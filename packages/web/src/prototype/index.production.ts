/**
 * The production side of the prototype seam: nothing. `vite build` resolves `@prototype` to this
 * file, so no demo screen, demo store or phone frame reaches the bundle. An unwired route shows
 * NotWiredYet.
 */
import type { ComponentType, ReactNode } from 'react';
import type { RouteId } from '../nav';
export const prototypeScreens: Partial<Record<RouteId, ComponentType>> = {};
export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  return children;
}
export function KarigarFrame({ children }: { children: ReactNode }) {
  return children;
}
export function PrototypeNotice() {
  return null;
}
