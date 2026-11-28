import type { ReactNode } from 'react';
import { PhoneFrame } from '../components/shell/PhoneFrame';
import { useSession } from '../shell/session-context';
import { StoreProvider } from '../store/StoreProvider';

/** The demo store, acting as the signed-in person. */
export function PrototypeStoreProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <StoreProvider signedIn={session.user} permissions={session.permissions} onSignOut={session.signOut}>
      {children}
    </StoreProvider>
  );
}
/** The karigar's phone frame (dev only). */
export function KarigarFrame({ children }: { children: ReactNode }) {
  return <PhoneFrame>{children}</PhoneFrame>;
}
/** Says a screen shows demo data. */
export function PrototypeNotice() {
  return (
    <p role="note" className="mb-4 rounded-lg border border-dashed border-line-2 bg-surface px-3 py-2 text-sm text-ink-3">
      Prototype screen: demo data, not the shop's data.
    </p>
  );
}
