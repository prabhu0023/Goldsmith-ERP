import { useEffect, useState } from 'react';
import { mergeRailBadges, useLiveRailBadges } from '../../live/rail-badges-live';
import { navFor, routeTitles } from '../../nav';
import { railBadges } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import { registry } from '../registry';
import { Rail, RoleChip, TopBar, cn } from '../ui';
import { PhoneFrame } from './PhoneFrame';

function PricingToggle() {
  const { state, actions } = useStore();
  const on = state.settings.pricingEnabled;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => actions.setSetting('pricingEnabled', !on)}
      className="flex min-h-9 w-full items-center justify-between rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-ink-3 hover:bg-paper"
    >
      <span>Dev · pricing</span>
      <span className={cn('font-bold', on ? 'text-live' : 'text-ink-4')}>{on ? 'on' : 'off'}</span>
    </button>
  );
}

export function AppShell() {
  const { state, route, role, now, go } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const liveBadges = useLiveRailBadges(role);
  const Screen = registry[route.id];

  useEffect(() => setMenuOpen(false), [route.id, role]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (role === 'karigar') {
    // Slim rail with only the role switcher, then the phone.
    return (
      <div className="flex min-h-screen flex-col bg-paper md:flex-row">
        <aside className="border-b border-line bg-surface p-3 md:w-64 md:border-b-0 md:border-r">
          <div className="mb-3 hidden items-center gap-3 md:flex">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-closed font-serif text-xl font-bold text-gold">JGD</span>
            <span className="font-serif text-lg font-semibold text-ink">Jai Gulab Dev</span>
          </div>
          <RoleChip placement="down" />
        </aside>
        <main className="flex flex-1 items-start justify-center p-4 md:items-center md:p-8">
          <PhoneFrame>
            <Screen />
          </PhoneFrame>
        </main>
      </div>
    );
  }

  const rail = (
    <Rail
      sections={navFor(role)}
      routeId={route.id}
      badges={mergeRailBadges(railBadges(state, role, now), liveBadges)}
      onNavigate={(id) => go(id)}
      branch={role === 'owner' ? 'All branches' : 'Main showroom'}
      footer={
        <>
          <PricingToggle />
          <RoleChip />
        </>
      }
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
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
          <Screen />
        </main>
      </div>
    </div>
  );
}
