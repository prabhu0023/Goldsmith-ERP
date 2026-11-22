import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

/** The EP-05 migration: versioned users, deactivation time, prototype code, one owner, audit kinds. */
describeDb('users and roles schema (EP-05-S4 to S14)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = testPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  const addUser = async (
    shopId: string,
    phone: string,
    values: { role?: string; status?: string; karigarId?: string | null; code?: string | null } = {},
  ) =>
    (
      await pool.query<{ id: string; version: number; deactivated_at: Date | null; code: string | null }>(
        `insert into users (shop_id, name, phone, email, role, status, karigar_id, code)
         values ($1, 'Deepak Rao', $2, 'deepak.rao@example.com', $3, $4, $5, $6)
         returning id, version, deactivated_at, code`,
        [shopId, phone, values.role ?? 'staff', values.status ?? 'active', values.karigarId ?? null, values.code ?? null],
      )
    ).rows[0];

  const addAudit = (shopId: string, actorId: string, kind: string) =>
    pool.query(
      `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, summary)
       values ($1, $2, 'Sanjay Seth', 'owner', $3, 'User change')`,
      [shopId, actorId, kind],
    );

  it('has version, deactivated_at and code on users', async () => {
    const users = await columnsOf(pool, 'users');
    expect(users.version).toMatchObject({ type: 'integer', nullable: false, default: '1' });
    expect(users.deactivated_at).toMatchObject({ type: 'timestamp with time zone', nullable: true });
    expect(users.code).toMatchObject({ type: 'text', nullable: true });
    const { shopId } = await newShop(pool);
    expect(await addUser(shopId, '9003071145', { code: 'ST-01' })).toMatchObject({
      version: 1,
      deactivated_at: null,
      code: 'ST-01',
    });
  });

  it('raises the version on every update', async () => {
    const { shopId } = await newShop(pool);
    const user = await addUser(shopId, '9003071145');
    await pool.query(`update users set name = 'Deepak R' where id = $1`, [user.id]);
    await pool.query(`update users set name = 'Deepak Rao', version = 1 where id = $1`, [user.id]);
    const { rows } = await pool.query<{ version: number }>('select version from users where id = $1', [user.id]);
    expect(rows[0].version).toBe(3);
  });

  it('keeps the prototype code unique per shop', async () => {
    const a = await newShop(pool);
    const b = await newShop(pool);
    await addUser(a.shopId, '9003071145', { code: 'ST-01' });
    await addUser(b.shopId, '9003071145', { code: 'ST-01' });
    await addUser(a.shopId, '9003071146');
    await addUser(a.shopId, '9003071147');
    await expectPgError(addUser(a.shopId, '9003071148', { code: 'ST-01' }), '23505');
  });

  it('allows one live owner per shop', async () => {
    const { shopId } = await newShop(pool);
    const owner = await addUser(shopId, '9003071145', { role: 'owner' });
    await expectPgError(addUser(shopId, '9003071146', { role: 'owner' }), '23505');
    await expectPgError(addUser(shopId, '9003071147', { role: 'owner', status: 'pending_activation' }), '23505');
    await addUser(shopId, '9003071148', { role: 'owner', status: 'deactivated' });
    const staff = await addUser(shopId, '9003071149');
    await expectPgError(pool.query(`update users set role = 'owner' where id = $1`, [staff.id]), '23505');
    await pool.query(`update users set status = 'deactivated' where id = $1`, [owner.id]);
    await addUser(shopId, '9003071150', { role: 'owner' });
    const other = await newShop(pool);
    await addUser(other.shopId, '9003071145', { role: 'owner' });
  });

  it('allows one live user per karigar record', async () => {
    const shop = await newShop(pool);
    const kg04 = await addKarigar(pool, shop, 'KG-04');
    const first = await addUser(shop.shopId, '9003071145', { role: 'karigar', karigarId: kg04 });
    await expectPgError(addUser(shop.shopId, '9003071146', { role: 'karigar', karigarId: kg04 }), '23505');
    await pool.query(`update users set status = 'deactivated' where id = $1`, [first.id]);
    await addUser(shop.shopId, '9003071147', { role: 'karigar', karigarId: kg04 });
  });

  it.each(['user_added', 'user_edited', 'role_changed', 'user_deactivated', 'user_reactivated', 'karigar_linked'])(
    'accepts the audit kind %s',
    async (kind) => {
      const { shopId } = await newShop(pool);
      const owner = await addUser(shopId, '9003071145', { role: 'owner' });
      await addAudit(shopId, owner.id, kind);
    },
  );

  it.each([
    'edit_applied',
    'setting_changed',
    'activation_link_sent',
    'account_unlocked',
    'sessions_ended',
    'password_reset',
    'lead_marked_late',
    'job_run_retried',
  ])('still accepts the earlier audit kind %s', async (kind) => {
    const { shopId } = await newShop(pool);
    const owner = await addUser(shopId, '9003071145', { role: 'owner' });
    await addAudit(shopId, owner.id, kind);
  });

  it('still refuses an unknown audit kind', async () => {
    const { shopId } = await newShop(pool);
    const owner = await addUser(shopId, '9003071145', { role: 'owner' });
    await expectPgError(addAudit(shopId, owner.id, 'user_deleted'), '23514');
  });
});
