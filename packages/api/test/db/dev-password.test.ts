import { afterAll, beforeAll, expect, it } from 'vitest';
import { setDevPassword } from '../../src/db/dev-password.js';
import { type Harness, newUser, startHarness, testPasswords } from '../support/api-harness.js';
import { describeDb } from './db-test-helpers.js';

const NOW = new Date('2026-11-21T10:00:00.000Z');

describeDb('db:dev-password (EP-04)', () => {
  let h: Harness;
  let name: string;
  let userId: string;
  const phone = '+91 98410 77777';

  beforeAll(async () => {
    h = await startHarness();
    // Unique per run: the test database is shared by every test file.
    name = `Dev Password User ${h.shop.shopId}`;
    userId = await newUser(h.pool, h.shop, { name, phone, status: 'pending_activation' });
  });

  afterAll(async () => {
    await h.close();
  });

  const statusOf = async () =>
    (await h.pool.query('select status, password_hash, password_set_at from users where id = $1', [userId])).rows[0];

  it.each(['staging', 'production'] as const)('is refused when APP_ENV=%s', async (appEnv) => {
    await expect(setDevPassword(h.pool, { appEnv, userName: name, password: 'counter-2026' })).rejects.toThrow(
      `db:dev-password is refused when APP_ENV=${appEnv}`,
    );
    expect(await statusOf()).toEqual({ status: 'pending_activation', password_hash: null, password_set_at: null });
  });

  it('refuses a password that breaks the policy', async () => {
    await expect(
      setDevPassword(h.pool, { appEnv: 'development', userName: name, password: 'gold26' }),
    ).rejects.toThrow('Use at least 8 characters.');
  });

  it('fails for a name no user has', async () => {
    await expect(
      setDevPassword(h.pool, { appEnv: 'development', userName: 'Nobody At All', password: 'counter-2026' }),
    ).rejects.toThrow('Expected one user named "Nobody At All", found 0');
  });

  it('sets the hash and makes the user active, who can then sign in', async () => {
    const result = await setDevPassword(h.pool, {
      appEnv: 'development',
      userName: name,
      password: 'counter-2026',
      now: NOW,
      passwords: testPasswords,
    });
    expect(result).toEqual({ name, role: 'staff', phone });
    const row = await statusOf();
    expect(row).toMatchObject({ status: 'active', password_set_at: NOW });
    expect(row.password_hash).toMatch(/^\$scrypt\$/);
    const res = await h.auth('signIn', { phone: '98410 77777', password: 'counter-2026' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { name, role: 'staff' } });
  });
});
