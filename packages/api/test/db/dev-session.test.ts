import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
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
    const { rows } = await pool.query('select shop_id, expires_at, ended_at from sessions where id = $1', [
      s.sessionId,
    ]);
    expect(rows).toEqual([{ shop_id: shop.shopId, expires_at: s.expiresAt, ended_at: null }]);
  });

  it('fails for a name no user has', async () => {
    await expect(createDevSession(pool, { appEnv: 'development', userName: 'Nobody At All' })).rejects.toThrow(
      'Expected one user named "Nobody At All", found 0',
    );
  });
});
