import { describe, expect, it } from 'vitest';
import { navFor } from './nav';

const ids = (role: 'owner' | 'staff' | 'karigar') => navFor(role).flatMap((s) => s.items.map((i) => i.id));

describe('navFor (EP-05-S11 AC2)', () => {
  it('the staff rail has no Staff entry', () => {
    expect(ids('staff')).not.toContain('staff-directory');
  });
  it("the owner's rail has it", () => {
    expect(ids('owner')).toContain('staff-directory');
  });
});
