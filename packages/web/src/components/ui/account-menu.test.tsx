import type { RoleId } from '@goldsmith/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoreProvider } from '../../store/StoreProvider';
import { RoleChip } from './RoleChip';
const signOutOk = async () => null;
const menuFor = (name: string, role: RoleId) =>
  renderToStaticMarkup(
    <StoreProvider signedIn={{ name, role }} onSignOut={signOutOk}>
      <RoleChip defaultOpen />
    </StoreProvider>,
  );
describe('account menu (EP-05-S12)', () => {
  it('AC1: a staff member sees their name, the Staff label and Sign out', () => {
    const html = menuFor('Rajesh Verma', 'staff');
    expect(html).toContain('Rajesh Verma');
    expect(html).toContain('>Staff<');
    expect(html).toContain('Sign out');
  });
  it('AC2: the menu offers no identity switch', () => {
    for (const [name, role] of [
      ['Rajesh Verma', 'staff'],
      ['Sanjay Seth', 'owner'],
    ] as Array<[string, RoleId]>) {
      const html = menuFor(name, role);
      expect(html).not.toContain('menuitemradio');
      expect(html.toLowerCase()).not.toContain('switch');
      expect(html.match(/role="menuitem"/g)).toHaveLength(1);
    }
  });
  it('AC4: the owner sees their name, the Owner label and Sign out', () => {
    const html = menuFor('Sanjay Seth', 'owner');
    expect(html).toContain('Sanjay Seth');
    expect(html).toContain('>Owner<');
    expect(html).toContain('Sign out');
  });
  it('shows the session name even when the prototype has no such person', () => {
    const html = menuFor('Meera Iyer', 'staff');
    expect(html).toContain('Meera Iyer');
    expect(html).toContain('>MI<');
  });
});
