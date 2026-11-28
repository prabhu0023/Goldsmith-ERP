/**
 * The append-only audit store (EP-06-S1, S7 AC5) and the api's role goldsmith_app (FU-001):
 * the role can add and read entries but never change, remove or unprotect them.
 */
import { AUDIT_ACTIONS } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { APP_ROLE, auditGrantProblems } from '../../src/db/app-role.js';
import { appRolePool, columnsOf, describeDb, expectPgError, newShop, testPool } from '../db/db-test-helpers.js';

describeDb('audit store (EP-06-S1, S7 AC5)', () => {
  let owner: pg.Pool;
  let app: pg.Pool;

  beforeAll(() => {
    owner = testPool();
    app = appRolePool();
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
  });

  const addEntry = (
    pool: pg.Pool,
    shopId: string,
    values: { kind?: string; entityType?: string | null; entityId?: string | null } = {},
  ) =>
    pool.query<{ id: string }>(
      `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, summary, entity_type, entity_id, reference)
       values ($1, null, 'System (SLA breach job)', 'system', $2, 'Lead LD-2026-213 marked late', $3, $4, 'LD-2026-213')
       returning id`,
      [
        shopId,
        values.kind ?? 'lead_marked_late',
        values.entityType === undefined ? 'lead' : values.entityType,
        values.entityId === undefined ? 'LD-2026-213' : values.entityId,
      ],
    );

  it('EP-06-S1 AC1: has every column of an entry', async () => {
    const cols = await columnsOf(owner, 'audit_entries');
    // Story names: action = kind, ref = reference, before / after = before_value / after_value.
    for (const c of [
      'id',
      'at',
      'actor_id',
      'actor_name',
      'actor_role',
      'entity_type',
      'entity_id',
      'kind',
      'summary',
      'before_value',
      'after_value',
      'reason',
      'token_reference',
      'reference',
    ]) {
      expect(cols, c).toHaveProperty(c);
    }
    expect(cols.at).toMatchObject({ type: 'timestamp with time zone', nullable: false });
    expect(cols.before_value.type).toBe('jsonb');
    expect(cols.token_reference.type).toBe('text');
  });

  it('EP-06-S1 AC2: as goldsmith_app, UPDATE, DELETE, TRUNCATE and disabling the trigger fail with 42501', async () => {
    const { shopId } = await newShop(owner);
    const id = (await addEntry(app, shopId)).rows[0].id;
    const read = async () => (await owner.query('select * from audit_entries where id = $1', [id])).rows;
    const before = await read();
    expect(before).toHaveLength(1);
    expect((await app.query('select id from audit_entries where id = $1', [id])).rows).toHaveLength(1);
    await expectPgError(app.query(`update audit_entries set summary = 'changed' where id = $1`, [id]), '42501');
    await expectPgError(app.query('delete from audit_entries where id = $1', [id]), '42501');
    await expectPgError(app.query('truncate audit_entries'), '42501');
    await expectPgError(app.query('alter table audit_entries disable trigger audit_entries_no_change'), '42501');
    expect(await read()).toEqual(before);
  });

  it('EP-06-S1 AC2: goldsmith_app can still change the other tables', async () => {
    const { shopId } = await newShop(owner);
    const { rows } = await app.query<{ id: string }>(
      `insert into karigars (shop_id, code, name, email, wastage_bp)
       values ($1, 'KG-04', 'Lakshmi Devi', 'kg-04@example.test', 70) returning id`,
      [shopId],
    );
    await app.query(`update karigars set name = 'Lakshmi D.' where id = $1`, [rows[0].id]);
    await app.query('delete from karigars where id = $1', [rows[0].id]);
    expect((await owner.query('select 1 from karigars where id = $1', [rows[0].id])).rowCount).toBe(0);
    await expectPgError(app.query('select * from schema_migrations'), '42501');
  });

  it('EP-06-S1 AC4: an entity type that is not a record of the app, or no entity, is rejected', async () => {
    const { shopId } = await newShop(owner);
    await expectPgError(addEntry(app, shopId, { entityType: 'invoice' }), '23514');
    await expectPgError(addEntry(app, shopId, { entityType: null }), '23514');
    await expectPgError(addEntry(app, shopId, { entityId: null }), '23514');
    expect((await owner.query('select 1 from audit_entries where shop_id = $1', [shopId])).rowCount).toBe(0);
  });

  it('EP-06-S1 AC5: goldsmith_app holds only INSERT and SELECT on audit_entries, and no other role can change it', async () => {
    const grants = await owner.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = $1 and table_schema = 'public' and table_name = 'audit_entries'
        order by privilege_type`,
      [APP_ROLE],
    );
    expect(grants.rows.map((r) => r.privilege_type)).toEqual(['INSERT', 'SELECT']);
    const changers = await owner.query<{ rolname: string }>(
      `select r.rolname
         from pg_roles r, pg_class c
        where c.oid = 'audit_entries'::regclass
          and not r.rolsuper
          and r.rolname not like 'pg\\_%'
          and not pg_has_role(r.oid, c.relowner, 'USAGE')
          and (has_table_privilege(r.oid, c.oid, 'UPDATE')
               or has_table_privilege(r.oid, c.oid, 'DELETE')
               or has_table_privilege(r.oid, c.oid, 'TRUNCATE'))`,
    );
    expect(changers.rows).toEqual([]);
    expect(await auditGrantProblems(app)).toBe(false);
    expect(await auditGrantProblems(owner)).toBe(true);
  });

  it('EP-06-S7 AC5: the database check holds exactly the shared kinds; a new kind is accepted, an unknown one rejected', async () => {
    const { rows } = await owner.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'audit_entries'::regclass and conname = 'audit_entries_kind_check'`,
    );
    const kinds = [...rows[0].def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(kinds.sort()).toEqual([...AUDIT_ACTIONS].sort());
    const { shopId } = await newShop(owner);
    await addEntry(app, shopId, { kind: 'lead_lost' });
    await expectPgError(addEntry(app, shopId, { kind: 'piece_deleted' }), '23514');
  });
});
