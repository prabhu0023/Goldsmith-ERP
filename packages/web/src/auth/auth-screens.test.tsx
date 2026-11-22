import { AUTH_MESSAGES } from '@goldsmith/shared';
import type { RoleId } from '@goldsmith/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoleChip } from '../components/ui/RoleChip';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { SignInPage } from './SignInPage';
const noop = () => {};
const signOutOk = async () => null;
/** Every `<input …>` and `<button …>` tag in rendered markup. */
const targets = (html: string) => html.match(/<(input|button)\b[^>]*>/g) ?? [];
function Probe() {
  const { route, identity } = useStore();
  return <p>{`${route.id}|${identity.name}|${identity.role}`}</p>;
}
describe('sign-in screens (EP-04-S3, S7, S12)', () => {
  it('S3 AC5: every input and button on sign-in and forgot-password is 56 px tall (min-h-14)', () => {
    for (const html of [
      renderToStaticMarkup(<SignInPage onSignedIn={noop} onForgot={noop} />),
      renderToStaticMarkup(<ForgotPasswordPage onBack={noop} />),
    ]) {
      const tags = targets(html);
      expect(tags.length).toBeGreaterThanOrEqual(3);
      for (const tag of tags) expect(tag).toMatch(/class="[^"]*\bmin-h-14\b/);
    }
  });
  it('S3: the password field is masked and never prefilled', () => {
    const password = targets(renderToStaticMarkup(<SignInPage onSignedIn={noop} onForgot={noop} />)).find((t) =>
      t.includes('type="password"'),
    );
    expect(password).toBeDefined();
    expect(password).toContain('value=""');
  });
  it('S12 AC1: the session-ended sentence shows above the sign-in form', () => {
    const html = renderToStaticMarkup(<SignInPage notice={AUTH_MESSAGES.sessionEnded} onSignedIn={noop} onForgot={noop} />);
    expect(html).toContain('Your session has ended. Sign in again.');
    expect(html.indexOf('Your session has ended.')).toBeLessThan(html.indexOf('<form'));
  });
});
describe('after sign-in (EP-04-S6)', () => {
  it.each([
    ['Sanjay Seth', 'owner', 'decisions'],
    ['Rajesh Verma', 'staff', 'today'],
    ['Lakshmi Devi', 'karigar', 'k-jobs'],
  ] as Array<[string, RoleId, string]>)('S6 AC1-3: %s (%s) opens route %s as that person', (name, role, route) => {
    const html = renderToStaticMarkup(
      <StoreProvider signedIn={{ name, role }} onSignOut={signOutOk}>
        <Probe />
      </StoreProvider>,
    );
    expect(html).toBe(`<p>${route}|${name}|${role}</p>`);
  });
  it('S6: with a real session the account chip offers no identity switch', () => {
    const signedIn = renderToStaticMarkup(
      <StoreProvider signedIn={{ name: 'Rajesh Verma', role: 'staff' }} onSignOut={signOutOk}>
        <RoleChip />
      </StoreProvider>,
    );
    expect(signedIn).toContain('Rajesh Verma');
    expect(signedIn).not.toContain('switch');
    const prototype = renderToStaticMarkup(
      <StoreProvider>
        <RoleChip />
      </StoreProvider>,
    );
    expect(prototype).not.toContain('switch');
  });
});
