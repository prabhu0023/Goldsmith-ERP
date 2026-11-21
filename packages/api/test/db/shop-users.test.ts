import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('shops, users and sessions (EP-02-S3)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addUser = (
    shopId: string,
    values: { phone?: string; email?: string | null; role?: string; status?: string } = {},
  ) =>
    pool.query<{ id: string }>(
      'insert into users (shop_id, name, phone, email, role, status) values ($1, $2, $3, $4, $5, $6) returning id',
      [
        shopId,
        'Asha',
        values.phone ?? '+91 90000 00001',
        values.email === undefined ? 'asha@example.com' : values.email,
        values.role ?? 'staff',
        values.status ?? 'pending_activation',
      ],
    );

  it('creates the tables and columns, and no branches table', async () => {
    expect(Object.keys(await columnsOf(pool, 'shops')).sort()).toEqual(
      ['address', 'created_at', 'gstin', 'id', 'logo_key', 'name', 'setup_completed_at'].sort(),
    );
    expect(Object.keys(await columnsOf(pool, 'locations')).sort()).toEqual(['id', 'name', 'shop_id']);
    const users = await columnsOf(pool, 'users');
    for (const c of ['id', 'shop_id', 'name', 'phone', 'email', 'role', 'karigar_id', 'status', 'password_hash']) {
      expect(users).toHaveProperty(c);
    }
    expect(users.status.default).toContain('pending_activation');
    expect(Object.keys(await columnsOf(pool, 'sessions')).sort()).toEqual(
      [
        'created_at',
        'ended_at',
        'expires_at',
        'id',
        'shop_id',
        'user_id',
        // EP-04 (20261121T1841_auth_sign_in.sql)
        'token_hash',
        'role_at_issue',
        'end_reason',
        'device_label',
      ].sort(),
    );
    const links = await columnsOf(pool, 'password_links');
    for (const c of ['user_id', 'purpose', 'token_hash', 'expires_at', 'used_at']) expect(links).toHaveProperty(c);
    expect(await columnsOf(pool, 'branches')).toEqual({});
  });

  it('rejects an unknown role, an unknown status and a missing email', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(addUser(shopId, { role: 'manager' }), '23514');
    await expectPgError(addUser(shopId, { status: 'locked' }), '23514');
    await expectPgError(addUser(shopId, { email: null }), '23502');
  });

  it('rejects a session for an unknown user', async () => {
    const { shopId } = await newShop(pool);
    await expectPgError(
      pool.query(`insert into sessions (shop_id, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [
        shopId,
        randomUUID(),
      ]),
      '23503',
    );
    const user = await addUser(shopId);
    await pool.query(`insert into sessions (shop_id, user_id, expires_at) values ($1, $2, now() + interval '1 day')`, [
      shopId,
      user.rows[0].id,
    ]);
  });

  it('keeps a live phone number unique per shop and frees it on deactivation', async () => {
    const a = await newShop(pool);
    const b = await newShop(pool);
    const first = await addUser(a.shopId, { phone: '+91 90000 11111' });
    await expectPgError(addUser(a.shopId, { phone: '+91 90000 11111' }), '23505');
    await addUser(b.shopId, { phone: '+91 90000 11111' });
    await pool.query(`update users set status = 'deactivated' where id = $1`, [first.rows[0].id]);
    await addUser(a.shopId, { phone: '+91 90000 11111' });
  });

  it('gives a new shop exactly one location, named Main shop', async () => {
    const { shopId } = await newShop(pool);
    const locs = await pool.query<{ name: string }>('select name from locations where shop_id = $1', [shopId]);
    expect(locs.rows).toEqual([{ name: 'Main shop' }]);
    await expectPgError(
      pool.query(`insert into locations (shop_id, name) values ($1, 'Back room')`, [shopId]),
      '23505',
    );
  });
});
