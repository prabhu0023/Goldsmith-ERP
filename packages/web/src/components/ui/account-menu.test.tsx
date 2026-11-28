import type { RoleId } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import { renderAs } from '../../test-support/render-as';
import { AccountMenu } from './AccountMenu';
const menuFor = (name: string, role: RoleId) => renderAs(name, role, <AccountMenu defaultOpen />);
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
  it('shows the session name and initials', () => {
    const html = menuFor('Meera Iyer', 'staff');
    expect(html).toContain('Meera Iyer');
    expect(html).toContain('>MI<');
  });
  it('EP-08-S14 AC1: the menu holds the name, the role label and Sign out only', () => {
    const html = menuFor('Lakshmi Devi', 'karigar');
    expect(html).toContain('Lakshmi Devi');
    expect(html).toContain('>Karigar<');
    expect(html.match(/role="menuitem"/g)).toHaveLength(1);
    expect(html).not.toContain('Dev · pricing');
    expect(html).not.toContain('Not signed in.');
  });
});
