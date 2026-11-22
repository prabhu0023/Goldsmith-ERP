import { AuthGate } from './auth/AuthGate';
import { AppShell } from './components/shell/AppShell';
import { StoreProvider } from './store/StoreProvider';
export default function App() {
  return (
    <AuthGate>
      {(s, signOut) => (
        <StoreProvider key={s.user.userId} signedIn={s.user} permissions={s.permissions} onSignOut={signOut}>
          <AppShell />
        </StoreProvider>
      )}
    </AuthGate>
  );
}
