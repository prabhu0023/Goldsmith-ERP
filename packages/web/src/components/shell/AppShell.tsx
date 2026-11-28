import { useEffect, useState } from 'react';
import { KarigarFrame, PrototypeNotice } from '@prototype';
import { navFor, routeTitles } from '../../nav';
import { useNavigation } from '../../shell/navigation';
import { useRailBadges } from '../../shell/rail-badges';
import { useSession } from '../../shell/session-context';
import { isPrototypeRoute, screenFor } from '../registry';
import { AccountMenu, ConnectionBanner, Rail, TopBar } from '../ui';
import { RedirectNotice } from './RedirectNotice';
/**
 * The signed-in shell (EP-08-S13, S14). The person, role, shop name and permissions come from the
 * session, the open screen from navigation, the rail counts from the server. The rail is exactly
 * `navFor(role)`; the account menu is its only footer.
 */
export function AppShell() {
  const { role, shopName } = useSession();
  const { route, go, notice } = useNavigation();
  const badges = useRailBadges(role);
  const [menuOpen, setMenuOpen] = useState(false);
  const Screen = screenFor(route.id);
  const prototype = isPrototypeRoute(route.id);
  useEffect(() => setMenuOpen(false), [route.id]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  if (role === 'karigar') {
    // No rail: a plain column with the account menu on top. A phone frame only in dev (the seam).
    return (
      <div className="min-h-screen bg-paper text-[15px]">
        <div className="mx-auto w-full max-w-md">
          <header className="border-b border-line bg-surface p-3">
            <AccountMenu placement="down" />
          </header>
          <ConnectionBanner />
          <main className="p-4">
            <RedirectNotice notice={notice} />
            <KarigarFrame>
              {prototype && <PrototypeNotice />}
              <Screen />
            </KarigarFrame>
          </main>
        </div>
      </div>
    );
  }
  const rail = (
    <Rail
      sections={navFor(role)}
      routeId={route.id}
      badges={badges}
      onNavigate={(id) => go(id)}
      shopName={shopName}
      footer={<AccountMenu />}
    />
  );
  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-20 hidden lg:block">{rail}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-72 max-w-[85vw]">{rail}</div>
        </div>
      )}
      <div className="lg:pl-64">
        <TopBar title={routeTitles[route.id]} onMenu={() => setMenuOpen(true)} />
        <ConnectionBanner />
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <RedirectNotice notice={notice} />
          {prototype && <PrototypeNotice />}
          <Screen />
        </main>
      </div>
    </div>
  );
}
