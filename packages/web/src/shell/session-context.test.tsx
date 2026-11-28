import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CurrentSession } from '../auth/gate-state';
import { buildSession, SessionProvider, useSession } from './session-context';
import { sessionFor } from '../test-support/render-as';
import { createServerClock } from './server-time';
const sessionFixture = (over: Partial<CurrentSession> = {}): CurrentSession =>
  sessionFor('Rajesh Verma', 'staff', { permissions: ['listLeads', 'readPiece'], ...over });
const signOut = async () => null;
function Probe() {
  const s = useSession();
  return <p>{`${s.user.name}|${s.shopName}|${s.shopToday()}`}</p>;
}
function BareProbe() {
  useSession();
  return null;
}
describe('server clock (EP-08-S12 AC3, AC5)', () => {
  it('shows the server date in Asia/Kolkata with a browser clock skewed 3 hours', () => {
    // 2026-10-01 18:40 UTC is 2026-10-02 00:10 in Asia/Kolkata. The browser says 3 h earlier.
    const browserNow = Date.parse('2026-10-01T15:40:00.000Z');
    const clock = createServerClock('2026-10-01T18:40:00.000Z', () => browserNow);
    expect(clock.shopToday()).toBe('2026-10-02');
    expect(new Date(clock.now()).toISOString()).toBe('2026-10-01T18:40:00.000Z');
  });
  it('keeps moving with the browser clock after the answer', () => {
    let browser = Date.parse('2026-10-01T15:40:00.000Z');
    const clock = createServerClock('2026-10-01T18:40:00.000Z', () => browser);
    browser += 2 * 60 * 60 * 1000;
    expect(new Date(clock.now()).toISOString()).toBe('2026-10-01T20:40:00.000Z');
  });
});
describe('session context (EP-08-S12 AC3, S14 AC5)', () => {
  it('gives the name, role, shop name, landing route and permission check', () => {
    const s = buildSession(sessionFixture(), signOut, () => Date.parse('2026-10-01T15:40:00.000Z'));
    expect(s.user.name).toBe('Rajesh Verma');
    expect(s.role).toBe('staff');
    expect(s.shopName).toBe('Jai Gulab Dev, Main showroom');
    expect(s.landingRoute).toBe('today');
    expect(s.can('readPiece')).toBe(true);
    expect(s.can('listUsers')).toBe(false);
    expect(s.shopToday()).toBe('2026-10-02');
  });
  it('a component reads the session through useSession', () => {
    const html = renderToStaticMarkup(
      <SessionProvider session={sessionFixture()} signOut={signOut} nowFn={() => Date.parse('2026-10-01T15:40:00.000Z')}>
        <Probe />
      </SessionProvider>,
    );
    expect(html).toBe('<p>Rajesh Verma|Jai Gulab Dev, Main showroom|2026-10-02</p>');
  });
  it('useSession outside a provider throws', () => {
    expect(() => renderToStaticMarkup(<BareProbe />)).toThrow('SessionProvider');
  });
});
