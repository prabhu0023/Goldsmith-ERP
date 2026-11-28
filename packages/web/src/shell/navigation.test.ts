import { describe, expect, it } from 'vitest';
import { openingRoute, redirectNotice, routeFromPath } from './navigation';
describe('navigation (EP-08-S12, S13)', () => {
  it('S12 AC2: with no deep link each role opens its landing route', () => {
    expect(openingRoute('owner', 'decisions', '/').route.id).toBe('decisions');
    expect(openingRoute('staff', 'today', '/').route.id).toBe('today');
    expect(openingRoute('karigar', 'k-jobs', '/').route.id).toBe('k-jobs');
  });
  it('a deep link the role may open is the first route', () => {
    expect(openingRoute('staff', 'today', '/stock')).toEqual({ route: { id: 'stock' }, notice: null });
    expect(openingRoute('owner', 'decisions', '/security').route.id).toBe('security');
  });
  it('S13 AC2: a staff deep link to security shows today with a notice', () => {
    const opened = openingRoute('staff', 'today', '/security');
    expect(opened.route.id).toBe('today');
    expect(opened.notice).toBe('You do not have access to Security log. Showing Today.');
  });
  it('S13 AC4: a karigar opening stock lands on k-jobs', () => {
    const opened = openingRoute('karigar', 'k-jobs', '/stock');
    expect(opened.route.id).toBe('k-jobs');
    expect(opened.notice).toBe(redirectNotice('stock', 'k-jobs'));
  });
  it('S12 AC4: an address that names no route opens the landing route', () => {
    expect(openingRoute('staff', 'today', '/nothing-here').route.id).toBe('today');
    expect(openingRoute('staff', 'today', '/activate').route.id).toBe('today');
    expect(routeFromPath('/stock/')).toBe('stock');
    expect(routeFromPath('/')).toBeNull();
  });
});
