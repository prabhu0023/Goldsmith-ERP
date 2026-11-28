import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { authContract, SERVER_SET_KEYS, sessionResult } from '../src/index.js';
/** Every key of an input, recursing into nested objects. */
function keysOf(schema: z.ZodType): string[] {
  if (!(schema instanceof z.ZodObject)) return [];
  return Object.entries(schema.shape as Record<string, z.ZodType>).flatMap(([key, child]) => [key, ...keysOf(child)]);
}
describe('auth contract (EP-04)', () => {
  it('names each operation by its key', () => {
    for (const [key, op] of Object.entries(authContract)) expect(op.name).toBe(key);
  });
  it('lets no input carry who acts or when', () => {
    for (const op of Object.values(authContract)) {
      const keys = keysOf(op.input);
      for (const key of SERVER_SET_KEYS) expect(keys, `${op.name} declares ${key}`).not.toContain(key);
    }
  });
  it('gives signIn the phone in E.164 form', () => {
    const parsed = authContract.signIn.input.parse({ phone: '+91 98410 11111', password: 'gold2026!' });
    expect(parsed).toEqual({ phone: '+919841011111', password: 'gold2026!' });
  });
  it('refuses a malformed email and a short phone on createFirstOwner, naming each field', () => {
    const result = authContract.createFirstOwner.input.safeParse({
      name: 'Sanjay Seth',
      phone: '98410',
      email: 'sanjay@',
    });
    expect(result.success).toBe(false);
    const issues = result.error?.issues ?? [];
    expect(issues.map((i) => i.path[0]).sort()).toEqual(['email', 'phone']);
    expect(issues.find((i) => i.path[0] === 'phone')?.message).toBe('Enter a 10-digit mobile number.');
  });
  it('carries the permission list in the session result (EP-05-S12 AC5)', () => {
    const body = {
      ok: true,
      user: { userId: 'u1', name: 'Rajesh Verma', role: 'staff' },
      landingRoute: 'today',
      permissions: ['markLeadLost', 'raiseProblem'],
      shopName: 'Test shop',
      serverTime: '2026-11-21T10:00:00.000Z',
    };
    expect(sessionResult.parse(body)).toEqual(body);
    const { permissions: _dropped, ...withoutPermissions } = body;
    expect(sessionResult.safeParse(withoutPermissions).success).toBe(false);
  });
  it('accepts a valid first owner', () => {
    const parsed = authContract.createFirstOwner.input.parse({
      name: ' Sanjay Seth ',
      phone: '09841011111',
      email: 'sanjay@example.com',
    });
    expect(parsed).toEqual({ name: 'Sanjay Seth', phone: '+919841011111', email: 'sanjay@example.com' });
  });
});
