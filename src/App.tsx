import { AppShell } from './components/shell/AppShell';
import { StoreProvider } from './store/StoreProvider';

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}
