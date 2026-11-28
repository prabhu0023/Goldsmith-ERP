import type { RoleId } from '@goldsmith/shared';
import { PrototypeStoreProvider } from '@prototype';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { navFor } from '../../nav';
import { KarigarFrame, PrototypeNotice, PrototypeStoreProvider as ProductionStoreProvider, prototypeScreens } from '../../prototype/index.production';
import { createConnectionStore } from '../../query/connection';
import { OFFLINE_TEXT } from '../ui/ConnectionBanner';
import { renderAs, SHOP_NAME } from '../../test-support/render-as';
import { AppShell } from './AppShell';
const NAMES: Record<RoleId, string> = { owner: 'Sanjay Seth', staff: 'Rajesh Verma', karigar: 'Lakshmi Devi' };
const shell = (role: RoleId, path = '/', connection?: ReturnType<typeof createConnectionStore>) =>
  renderAs(
    NAMES[role],
    role,
    <PrototypeStoreProvider>
      <AppShell />
    </PrototypeStoreProvider>,
    { path, connection },
  );
/** The labels of the rail items, in order. */
const railLabels = (html: string) =>
  [...html.matchAll(/<span class="flex-1 truncate">([^<]*)<\/span>/g)].map((m) => m[1].replaceAll('&amp;', '&'));
const offline = () =>
  createConnectionStore({ windowLike: { navigator: { onLine: false }, addEventListener: () => {}, removeEventListener: () => {} } });
describe('AppShell (EP-08-S13, S14)', () => {
  it.each(['owner', 'staff'] as const)('S13 AC1: the %s rail equals navFor(role)', (role) => {
    const expected = navFor(role).flatMap((s) => s.items.map((i) => i.label));
    expect(railLabels(shell(role))).toEqual(expected);
  });
  it('S13 AC5: the staff rail has no Staff or Security log entry; the owner rail has both', () => {
    expect(railLabels(shell('staff'))).not.toContain('Staff');
    expect(railLabels(shell('staff'))).not.toContain('Security log');
    expect(railLabels(shell('owner'))).toEqual(expect.arrayContaining(['Staff', 'Security log']));
  });
  it('S12 AC2: each role opens on its landing screen', () => {
    expect(shell('owner')).toContain('aria-current="page"');
    expect(railLabels(shell('owner'))[0]).toBe('Decisions');
    expect(shell('staff')).toMatch(/aria-current="page"[^>]*>(<svg[^>]*>.*?<\/svg>)<span class="flex-1 truncate">Today</);
  });
  it('S13 AC2: a staff deep link to security shows Today with the notice, and no security log screen', () => {
    const html = shell('staff', '/security');
    expect(html).toContain('You do not have access to Security log. Showing Today.');
    expect(html).toMatch(/aria-current="page"[^>]*>(<svg[^>]*>.*?<\/svg>)<span class="flex-1 truncate">Today</);
  });
  it('S13 AC4: a karigar opening stock lands on k-jobs', () => {
    const html = shell('karigar', '/stock');
    expect(html).toContain('You do not have access to Showroom stock. Showing My jobs.');
    expect(html).not.toContain('aria-label="Main"');
  });
  it('S14 AC5: the rail shows the shop name from the session', () => {
    for (const role of ['owner', 'staff'] as const) expect(shell(role)).toContain(SHOP_NAME);
  });
  it('S14 AC1: the account menu shows the name and the role label', () => {
    for (const [role, label] of [['owner', 'Owner'], ['staff', 'Staff'], ['karigar', 'Karigar']] as const) {
      const html = shell(role);
      expect(html).toContain(NAMES[role]);
      expect(html).toContain(`>${label}<`);
    }
  });
  it('S14 AC3: there is no pricing toggle and no signed-out fallback', () => {
    for (const role of ['owner', 'staff', 'karigar'] as const) {
      const html = shell(role);
      expect(html).not.toContain('Dev · pricing');
      expect(html).not.toContain('Not signed in.');
    }
  });
  it('S14 AC2: the production seam has no phone frame, no demo store and no prototype screen', () => {
    expect(renderToStaticMarkup(<KarigarFrame><p>screen</p></KarigarFrame>)).toBe('<p>screen</p>');
    expect(renderToStaticMarkup(<ProductionStoreProvider><p>screen</p></ProductionStoreProvider>)).toBe('<p>screen</p>');
    expect(renderToStaticMarkup(<PrototypeNotice />)).toBe('');
    expect(prototypeScreens).toEqual({});
  });
  it('S19: a prototype screen carries the demo notice in dev', () => {
    expect(shell('staff')).toContain('Prototype screen: demo data, not the shop&#x27;s data.');
  });
  it('S11 AC1, S10: the connection banner shows offline in both layouts', () => {
    expect(shell('owner', '/', offline())).toContain(OFFLINE_TEXT);
    expect(shell('karigar', '/', offline())).toContain(OFFLINE_TEXT);
  });
  it('the karigar layout is one column with 15 px text', () => {
    const html = shell('karigar');
    expect(html).toContain('text-[15px]');
    expect(html).toContain('max-w-md');
  });
});
