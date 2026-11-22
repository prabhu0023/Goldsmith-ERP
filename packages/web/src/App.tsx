import { AuthGate } from './auth/AuthGate';
import { AppShell } from './components/shell/AppShell';
import { LiveProvider } from './live/LiveProvider';
import { StoreProvider } from './store/StoreProvider';
export default function App() {
  return (
    <AuthGate>
      {(s, signOut, recheck) => (
        <LiveProvider key={s.user.userId} onSignedOut={recheck}>
          <StoreProvider signedIn={s.user} permissions={s.permissions} onSignOut={signOut}>
            <AppShell />
          </StoreProvider>
        </LiveProvider>
      )}
    </AuthGate>
  );
}
