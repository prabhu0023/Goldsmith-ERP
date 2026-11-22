import { describe, expect, it } from 'vitest';
import { assertPasswordPolicy, createPasswordHasher, passwordHasher } from '../../src/auth/password-hash.js';
import { ValidationError } from '../../src/pipeline/api-errors.js';
describe('password hashing (EP-04-S2), production parameters', () => {
  it('AC1: two hashes of one password differ, and both verify', async () => {
    const a = await passwordHasher.hash('gold2026!');
    const b = await passwordHasher.hash('gold2026!');
    expect(a).not.toBe(b);
    expect(await passwordHasher.verify('gold2026!', a)).toBe('ok');
    expect(await passwordHasher.verify('gold2026!', b)).toBe('ok');
  });
  it('AC2: a different password is wrong', async () => {
    const stored = await passwordHasher.hash('gold2026!');
    expect(await passwordHasher.verify('gold2026?', stored)).toBe('wrong');
  });
  it('AC3: "gold26" is refused with code validation and the policy sentence', () => {
    let err: unknown;
    try {
      assertPasswordPolicy('gold26');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ code: 'validation', field: 'password', message: 'Use at least 8 characters.' });
    expect(() => assertPasswordPolicy('counter-2026')).not.toThrow();
  });
  it('stores the parameters with the hash', async () => {
    const stored = await passwordHasher.hash('gold2026!');
    expect(stored).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(stored).not.toContain('gold2026!');
  });
  it('answers wrong for a null, empty or malformed stored value', async () => {
    for (const stored of [null, undefined, '', 'gold2026!', '$scrypt$ln=99,r=8,p=3$AAAA$AAAA', '$bcrypt$xyz']) {
      expect(await passwordHasher.verify('gold2026!', stored)).toBe('wrong');
    }
  });
  it('verifies with the parameters stored in the hash, so a cheaper test hasher reads it too', async () => {
    const fast = createPasswordHasher({ ln: 10 });
    const stored = await fast.hash('counter-2026');
    expect(stored.startsWith('$scrypt$ln=10,r=8,p=3$')).toBe(true);
    expect(await passwordHasher.verify('counter-2026', stored)).toBe('ok');
  });
  it('computes the dummy hash once', async () => {
    const fast = createPasswordHasher({ ln: 10 });
    const first = await fast.dummyHash();
    expect(await fast.dummyHash()).toBe(first);
    expect(await fast.verify('gold2026!', first)).toBe('wrong');
  });
});
