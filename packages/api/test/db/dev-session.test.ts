import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashSecret } from '../../src/auth/session-store.js';
import { createDevSession } from '../../src/db/dev-session.js';
import { newUser } from '../support/api-harness.js';
import { describeDb, newShop, type TestShop, testPool } from './db-test-helpers.js';

const NOW = new Date('2026-11-21T10:00:00.000Z');

describeDb('db:dev-session (EP-03-S3)', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  let name: string;

  beforeAll(async () => {
    pool = testPool(2);
    shop = await newShop(pool);
    // Unique per run: the test database is shared by every test file.
    name = `Dev Session User ${shop.shopId}`;
    await newUser(pool, shop, { name, role: 'owner' });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it.each(['staging', 'production'] as const)('is refused when APP_ENV=%s', async (appEnv) => {
    await expect(createDevSession(pool, { appEnv, userName: name })).rejects.toThrow(
      `db:dev-session is refused when APP_ENV=${appEnv}`,
    );
  });

  it('opens a 12 h session for the named user in development', async () => {
    const s = await createDevSession(pool, { appEnv: 'development', userName: name, now: NOW });
    expect(s).toMatchObject({ name, role: 'owner', expiresAt: new Date('2026-11-21T22:00:00.000Z') });
    const { rows } = await pool.query(
      'select id, shop_id, expires_at, ended_at, role_at_issue from sessions where token_hash = $1',
      [hashSecret(s.token)],
    );
    expect(rows).toEqual([
      { id: s.sessionId, shop_id: shop.shopId, expires_at: s.expiresAt, ended_at: null, role_at_issue: 'owner' },
    ]);
  });

  it('refuses a user who is not active: their session would be refused', async () => {
    const pending = `Pending Dev User ${shop.shopId}`;
    await newUser(pool, shop, { name: pending, status: 'pending_activation' });
    await expect(createDevSession(pool, { appEnv: 'development', userName: pending })).rejects.toThrow(
      'is pending_activation, not active',
    );
  });

  it('fails for a name no user has', async () => {
    await expect(createDevSession(pool, { appEnv: 'development', userName: 'Nobody At All' })).rejects.toThrow(
      'Expected one user named "Nobody At All", found 0',
    );
  });
});
