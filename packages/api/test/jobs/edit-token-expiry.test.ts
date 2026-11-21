import { checkToken, MIN, type PieceEdit, TOKEN_TTL_MS } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { editTokenExpiryJob } from '../../src/jobs/handlers/edit-token-expiry.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { addPieceEdit, makeScheduler, manualClock, newJobsShop } from './job-test-helpers.js';

const NOW = Date.parse('2026-11-01T10:00:00Z');
const ago = (ms: number): Date => new Date(NOW - ms);

/** An edit as the shared token check sees it, holding the token the owner was sent. */
const editShaped = (tokenIssuedAt: Date): PieceEdit =>
  ({ status: 'token_sent', token: '480913', tokenIssuedAt: tokenIssuedAt.getTime() }) as PieceEdit;

/** EP-10-S8: expire edit tokens after 10 minutes. */
describeDb('edit token sweep (EP-10-S8)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const expiredAt = async (shop: TestShop, id: string): Promise<Date | null> =>
    (
      await pool.query<{ expired_at: Date | null }>('select expired_at from piece_edits where shop_id = $1 and id = $2', [
        shop.shopId,
        id,
      ])
    ).rows[0].expired_at;
  const sweep = (shop: TestShop) => makeScheduler(pool, manualClock(new Date(NOW)), shop, [editTokenExpiryJob]).tick();

  it('S8 AC1: a token sent 11 minutes ago is marked expired when it ran out', async () => {
    const shop = await newJobsShop(pool);
    const issued = ago(11 * MIN);
    const id = await addPieceEdit(pool, shop, { code: 'ED-101', tokenIssuedAt: issued });
    await sweep(shop);
    expect(await expiredAt(shop, id)).toEqual(new Date(issued.getTime() + TOKEN_TTL_MS));
  });

  it('S8 AC2: ED-101 and ED-102 both expire, and their tokens are refused', async () => {
    const shop = await newJobsShop(pool);
    const issued101 = ago(11 * MIN);
    const issued102 = ago(12 * MIN);
    const id101 = await addPieceEdit(pool, shop, { code: 'ED-101', tokenIssuedAt: issued101 });
    const id102 = await addPieceEdit(pool, shop, { code: 'ED-102', tokenIssuedAt: issued102 });
    await sweep(shop);
    expect(await expiredAt(shop, id101)).not.toBeNull();
    expect(await expiredAt(shop, id102)).not.toBeNull();
    expect(checkToken(editShaped(issued101), '480913', NOW)).toBe('expired');
    expect(checkToken(editShaped(issued102), '480 913', NOW)).toBe('expired');
  });

  it('S8 AC3: a token sent 9 minutes ago is untouched', async () => {
    const shop = await newJobsShop(pool);
    const id = await addPieceEdit(pool, shop, { code: 'ED-103', tokenIssuedAt: ago(9 * MIN) });
    await sweep(shop);
    expect(await expiredAt(shop, id)).toBeNull();
  });

  it('S8 AC4: a token already used is left as it is', async () => {
    const shop = await newJobsShop(pool);
    const id = await addPieceEdit(pool, shop, { code: 'ED-104', status: 'applied', tokenIssuedAt: ago(11 * MIN) });
    await sweep(shop);
    const row = await pool.query('select status, expired_at from piece_edits where id = $1', [id]);
    expect(row.rows[0]).toEqual({ status: 'applied', expired_at: null });
  });

  it('S8 AC5: at 10 min 30 s, before any sweep, the check at use refuses the token', async () => {
    const shop = await newJobsShop(pool);
    const issued = ago(10 * MIN + 30_000);
    const id = await addPieceEdit(pool, shop, { code: 'ED-105', tokenIssuedAt: issued });
    expect(await expiredAt(shop, id)).toBeNull();
    expect(checkToken(editShaped(issued), '480913', NOW)).toBe('expired');
  });
});
