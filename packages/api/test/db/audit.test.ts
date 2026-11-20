import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';

describeDb('audit entries (EP-02-S11)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addOwner = async (shopId: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role) values ($1, 'Sanjay Seth', '+91 90000 00009', 'owner@example.com', 'owner') returning id`,
        [shopId],
      )
    ).rows[0].id;
  const addEntry = (shopId: string, actorId: string, values: { kind?: string; role?: string } = {}) =>
    pool.query<{ id: string }>(
      `insert into audit_entries (shop_id, code, actor_id, actor_name, actor_role, kind, summary, detail, reference)
       values ($1, 'AU-001', $2, 'Sanjay Seth', $3, $4, 'Edit applied', 'Gross 48.61 to 48.65', 'TAG-8841') returning id`,
      [shopId, actorId, values.role ?? 'owner', values.kind ?? 'edit_applied'],
    );

  it('has the audit columns', async () => {
    const cols = await columnsOf(pool, 'audit_entries');
    for (const c of ['id', 'shop_id', 'at', 'actor_id', 'actor_name', 'actor_role', 'kind', 'summary', 'detail']) {
      expect(cols).toHaveProperty(c);
    }
    expect(cols.reference).toBeDefined();
    expect(cols.at).toMatchObject({ type: 'timestamp with time zone', nullable: false });
  });

  it('rejects an unknown kind, role or actor', async () => {
    const { shopId } = await newShop(pool);
    const owner = await addOwner(shopId);
    await expectPgError(addEntry(shopId, owner, { kind: 'piece_deleted' }), '23514');
    await expectPgError(addEntry(shopId, owner, { role: 'admin' }), '23514');
    await expectPgError(addEntry(shopId, randomUUID()), '23503');
  });

  it('refuses UPDATE, DELETE and TRUNCATE and leaves the row as it was', async () => {
    const { shopId } = await newShop(pool);
    const owner = await addOwner(shopId);
    const id = (await addEntry(shopId, owner)).rows[0].id;
    const read = async () => (await pool.query('select * from audit_entries where id = $1', [id])).rows;
    const before = await read();
    await expectPgError(pool.query(`update audit_entries set summary = 'changed' where id = $1`, [id]), 'P0001');
    await expectPgError(pool.query('delete from audit_entries where id = $1', [id]), 'P0001');
    await expectPgError(pool.query('truncate audit_entries'), 'P0001');
    await expect(pool.query('truncate audit_entries')).rejects.toThrow('audit_entries is append-only');
    expect(await read()).toEqual(before);
    expect(before).toHaveLength(1);
  });
});
