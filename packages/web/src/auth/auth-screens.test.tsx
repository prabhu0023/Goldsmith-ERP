import { AUTH_MESSAGES } from '@goldsmith/shared';
import type { RoleId } from '@goldsmith/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AccountMenu } from '../components/ui/AccountMenu';
import { useNavigation } from '../shell/navigation';
import { useSession } from '../shell/session-context';
import { StoreProvider, useStore } from '../store/StoreProvider';
import { renderAs } from '../test-support/render-as';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { SignInPage } from './SignInPage';
const noop = () => {};
/** Every `<input …>` and `<button …>` tag in rendered markup. */
const targets = (html: string) => html.match(/<(input|button)\b[^>]*>/g) ?? [];
function Probe() {
  const { route } = useNavigation();
  const { user } = useSession();
  return <p>{`${route.id}|${user.name}|${user.role}`}</p>;
}
/** The prototype store inside the shell: its route is the shell's, not its own. */
function StoreProbe() {
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
    const html = renderAs(name, role, <Probe />);
    expect(html).toBe(`<p>${route}|${name}|${role}</p>`);
  });
  it('the prototype store takes the shell route and the session person', () => {
    const html = renderAs(
      'Rajesh Verma',
      'staff',
      <StoreProvider signedIn={{ name: 'Rajesh Verma', role: 'staff' }} onSignOut={async () => null}>
        <StoreProbe />
      </StoreProvider>,
      { path: '/stock' },
    );
    expect(html).toBe('<p>stock|Rajesh Verma|staff</p>');
  });
  it('S6: with a real session the account menu offers no identity switch', () => {
    const html = renderAs('Rajesh Verma', 'staff', <AccountMenu />);
    expect(html).toContain('Rajesh Verma');
    expect(html).not.toContain('switch');
  });
});
