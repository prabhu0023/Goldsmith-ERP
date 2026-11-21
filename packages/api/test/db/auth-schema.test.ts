import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';
describeDb('sign-in schema (EP-04-S1, S3, S5, S7, S8, S9, S13, S14)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  const addUser = async (shopId: string, phone: string, values: { role?: string; status?: string } = {}) =>
    (
      await pool.query<{ id: string; phone_e164: string | null }>(
        `insert into users (shop_id, name, phone, email, role, status)
         values ($1, 'Rajesh Verma', $2, 'rajesh@example.com', $3, $4) returning id, phone_e164`,
        [shopId, phone, values.role ?? 'staff', values.status ?? 'active'],
      )
    ).rows[0];
  it('has the new columns and tables', async () => {
    const users = await columnsOf(pool, 'users');
    expect(users.password_set_at).toMatchObject({ type: 'timestamp with time zone', nullable: true });
    expect(users.phone_e164).toMatchObject({ type: 'text' });
    const sessions = await columnsOf(pool, 'sessions');
    for (const c of ['token_hash', 'role_at_issue', 'end_reason', 'device_label']) expect(sessions).toHaveProperty(c);
    expect(await columnsOf(pool, 'password_links')).toHaveProperty('replaced_at');
    const firstOwners = await columnsOf(pool, 'shop_first_owners');
    for (const c of ['shop_id', 'user_id', 'created_at']) expect(firstOwners).toHaveProperty(c);
    const lockouts = await columnsOf(pool, 'sign_in_lockouts');
    for (const c of ['id', 'shop_id', 'user_id', 'phone_hash', 'failed_count', 'locked_until', 'unlocked_by', 'unlocked_at']) {
      expect(lockouts).toHaveProperty(c);
    }
    const counters = await columnsOf(pool, 'auth_rate_counters');
    for (const c of ['shop_id', 'bucket', 'window_start', 'hits']) expect(counters).toHaveProperty(c);
    expect((await columnsOf(pool, 'audit_entries')).actor_id.nullable).toBe(true);
  });
  it.each(['+91 98410 11111', '98410 11111', '09841011111', '919841011111'])('normalises %s to +919841011111', async (phone) => {
    const { shopId } = await newShop(pool);
    expect((await addUser(shopId, phone)).phone_e164).toBe('+919841011111');
  });
  it('leaves phone_e164 null for a number that is not an Indian mobile', async () => {
    const { shopId } = await newShop(pool);
    expect((await addUser(shopId, '12345')).phone_e164).toBeNull();
  });
  it('keeps the normalised phone unique among live users of one shop', async () => {
    const { shopId } = await newShop(pool);
    await addUser(shopId, '+91 98410 11111');
    await expectPgError(addUser(shopId, '09841011111'), '23505');
    await addUser(shopId, '98410 11111', { status: 'deactivated' });
    const other = await newShop(pool);
    await addUser(other.shopId, '9841011111');
  });
  it('accepts a system actor with no user for an auth kind, and refuses a staff actor with no user', async () => {
    const { shopId } = await newShop(pool);
    await pool.query(
      `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, summary, detail)
       values ($1, null, 'System', 'system', 'sessions_ended', 'Sessions ended', '{}')`,
      [shopId],
    );
    await expectPgError(
      pool.query(
        `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, summary, detail)
         values ($1, null, 'Rajesh Verma', 'staff', 'signed_in', 'Rajesh Verma signed in', '{}')`,
        [shopId],
      ),
      '23514',
    );
  });
  it('allows one first-owner marker per shop', async () => {
    const { shopId } = await newShop(pool);
    const a = await addUser(shopId, '9841011111', { role: 'owner' });
    const b = await addUser(shopId, '9841022222', { role: 'owner' });
    const mark = (userId: string) =>
      pool.query('insert into shop_first_owners (shop_id, user_id, created_at) values ($1, $2, now())', [shopId, userId]);
    await mark(a.id);
    await expectPgError(mark(b.id), '23505');
  });
});
