import { roleMay } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import { canOpenRoute, isRouteId, navFor, ownerOnlyRoutes, resolveRoute, routeTitles } from './nav';
import type { RouteId } from './nav';

const ids = (role: 'owner' | 'staff' | 'karigar') => navFor(role).flatMap((s) => s.items.map((i) => i.id));

describe('navFor (EP-05-S11 AC2)', () => {
  it('the staff rail has no Staff entry', () => {
    expect(ids('staff')).not.toContain('staff-directory');
  });
  it("the owner's rail has it", () => {
    expect(ids('owner')).toContain('staff-directory');
  });
  it('EP-06-S12 AC3: the staff rail has no Security log; the owner rail has it', () => {
    expect(ids('staff')).not.toContain('security');
    expect(ids('karigar')).not.toContain('security');
    expect(ids('owner')).toContain('security');
  });
});
describe('route guard (EP-08 D-E, S13)', () => {
  const allIds = Object.keys(routeTitles) as RouteId[];
  it('owner-only routes are the owner rail minus the staff rail', () => {
    expect([...ownerOnlyRoutes].sort()).toEqual(
      ['decisions', 'karigar-new', 'karigars', 'metal-pool', 'scales', 'security', 'staff-directory', 'staff-new'].sort(),
    );
  });
  it('the owner-only set agrees with the permission list', () => {
    const closedToStaff = (op: string) => !roleMay('staff', op) && roleMay('owner', op);
    for (const op of ['listUsers', 'createUser', 'listAuditEntries', 'upsertScale', 'onboardKarigar', 'listPoolEntries']) expect(closedToStaff(op)).toBe(true);
    for (const id of ['staff-directory', 'staff-new', 'security', 'scales', 'karigar-new', 'metal-pool']) expect(ownerOnlyRoutes.has(id as RouteId)).toBe(true);
  });
  it('staff may open every route except the owner-only ones and k-jobs', () => {
    for (const id of allIds) expect(canOpenRoute('staff', id)).toBe(!ownerOnlyRoutes.has(id) && id !== 'k-jobs');
  });
  it('the owner may open everything except k-jobs', () => {
    for (const id of allIds) expect(canOpenRoute('owner', id)).toBe(id !== 'k-jobs');
  });
  it('the karigar may open only k-jobs', () => {
    for (const id of allIds) expect(canOpenRoute('karigar', id)).toBe(id === 'k-jobs');
  });
  it('a closed route resolves to the role landing route', () => {
    expect(resolveRoute('staff', 'security')).toEqual({ id: 'today', redirected: true });
    expect(resolveRoute('karigar', 'stock')).toEqual({ id: 'k-jobs', redirected: true });
    expect(resolveRoute('owner', 'security')).toEqual({ id: 'security', redirected: false });
  });
  it('isRouteId knows the route ids and nothing else', () => {
    expect(isRouteId('security')).toBe(true);
    expect(isRouteId('toString')).toBe(false);
    expect(isRouteId('')).toBe(false);
  });
});
