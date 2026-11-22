import type { RoleId } from '@goldsmith/shared';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoreProvider } from '../../store/StoreProvider';
import { OnboardStaff } from './OnboardStaff';
import { DirectoryLoadError, StaffDirectory } from './StaffDirectory';
const as = (name: string, role: RoleId, screen: ReactElement) =>
  renderToStaticMarkup(
    <StoreProvider signedIn={{ name, role }} onSignOut={async () => null}>
      {screen}
    </StoreProvider>,
  );
describe('people screens (EP-05-S4, S11)', () => {
  it('the owner sees the directory loading from the server', () => {
    const html = as('Sanjay Seth', 'owner', <StaffDirectory />);
    expect(html).toContain('Loading the staff list');
    expect(html).toContain('Add a staff member');
    expect(html).not.toContain('Only the owner sees the staff list.');
  });
  it('S11 AC4: a failed load shows the message and a Retry button', () => {
    const html = renderToStaticMarkup(
      <DirectoryLoadError message="Cannot reach the server. Check the connection and try again." onRetry={() => {}} />,
    );
    expect(html).toContain('Cannot reach the server. Check the connection and try again.');
    expect(html).toMatch(/<button[^>]*>Retry<\/button>/);
  });
  it('the owner sees the add form with email, three roles and the submit button', () => {
    const html = as('Sanjay Seth', 'owner', <OnboardStaff />);
    expect(html).toContain('Email');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    for (const label of ['>Staff<', '>Karigar<', '>Owner<']) expect(html).toContain(label);
    expect(html).toContain('Add this staff member');
  });
  it('a staff member sees the owner-only sentences', () => {
    expect(as('Rajesh Verma', 'staff', <StaffDirectory />)).toContain('Only the owner sees the staff list.');
    const form = as('Rajesh Verma', 'staff', <OnboardStaff />);
    expect(form).toContain('Only the owner can add staff or change a role.');
    expect(form).not.toContain('Add this staff member');
  });
  it('the session permissions decide, not the role alone', () => {
    const html = renderToStaticMarkup(
      <StoreProvider signedIn={{ name: 'Sanjay Seth', role: 'owner' }} permissions={[]} onSignOut={async () => null}>
        <StaffDirectory />
      </StoreProvider>,
    );
    expect(html).toContain('Only the owner sees the staff list.');
  });
});
