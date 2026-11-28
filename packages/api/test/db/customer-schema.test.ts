import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, testPool } from './db-test-helpers.js';
/** The phone rewrite and the consent backfill of 20261128T1132_ep17_customer_master.sql, run on fixtures. */
const REWRITE_PHONES = `
  update customers c
     set phone = case
           when length(d.digits) = 10 then '+91' || d.digits
           when length(d.digits) = 11 and left(d.digits, 1) = '0' then '+91' || right(d.digits, 10)
           else '+' || d.digits
         end
    from (
      select id, regexp_replace(phone, '[^0-9]', '', 'g') as digits
        from customers
       where phone is not null and shop_id = $1
    ) d
   where d.id = c.id
     and length(d.digits) between 10 and 15`;
const BACKFILL_CONSENT = `
  insert into consent_events (shop_id, customer_id, kind, source, recorded_by)
  select shop_id, id, 'opt_in', 'import', null from customers where opted_in and shop_id = $1`;
describeDb('customer master storage (EP-17-S1, S2)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  let n = 0;
  const addCustomer = async (
    shopId: string,
    values: { phone?: string | null; name?: string; optedIn?: boolean; status?: string } = {},
  ) => {
    n += 1;
    const { rows } = await pool.query<{ id: string }>(
      `insert into customers (shop_id, code, name, phone, customer_group, opted_in, status)
       values ($1, $2, $3, $4, 'Regular', $5, $6) returning id`,
      [
        shopId,
        `CU-${n}`,
        values.name ?? 'Meera Iyer',
        values.phone === undefined ? `+9198${String(n).padStart(8, '0')}` : values.phone,
        values.optedIn ?? false,
        values.status ?? 'active',
      ],
    );
    return rows[0].id;
  };
  const addEvent = (shopId: string, customerId: string, kind = 'opt_in', source = 'counter') =>
    pool.query(
      `insert into consent_events (shop_id, customer_id, kind, source) values ($1, $2, $3, $4) returning id`,
      [shopId, customerId, kind, source],
    );
  describe('customers (S1)', () => {
    it('has the new columns, a nullable phone and money sockets without defaults (AC1)', async () => {
      const cols = await columnsOf(pool, 'customers');
      expect(cols.address).toMatchObject({ type: 'text', nullable: true, default: null });
      expect(cols.status).toMatchObject({ type: 'text', nullable: false });
      expect(cols.status.default).toContain('active');
      expect(cols.created_at).toMatchObject({ type: 'timestamp with time zone', nullable: false });
      expect(cols.created_by).toMatchObject({ type: 'uuid', nullable: true, default: null });
      expect(cols.version).toMatchObject({ type: 'integer', nullable: false, default: '1' });
      expect(cols.phone).toMatchObject({ nullable: true });
      for (const c of ['budget_inr', 'spent_inr']) {
        expect(cols[c]).toMatchObject({ type: 'numeric', nullable: true, default: null });
      }
    });
    it('starts a customer active at version 1 with a creation time', async () => {
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      const { rows } = await pool.query('select status, version, created_at, created_by, address from customers where id = $1', [
        id,
      ]);
      expect(rows[0]).toMatchObject({ status: 'active', version: 1, created_by: null, address: null });
      expect(rows[0].created_at).toBeInstanceOf(Date);
    });
    it('allows only the statuses active and erased', async () => {
      const { shopId } = await newShop(pool);
      await expectPgError(addCustomer(shopId, { status: 'deleted' }), '23514');
      await addCustomer(shopId, { status: 'erased', phone: null });
    });
    it('refuses a blank name', async () => {
      const { shopId } = await newShop(pool);
      await expectPgError(addCustomer(shopId, { name: '   ' }), '23514');
      await expectPgError(addCustomer(shopId, { name: '' }), '23514');
    });
    it('keeps the phone unique per shop, but lets two erased customers hold no phone', async () => {
      const mine = await newShop(pool);
      const theirs = await newShop(pool, 'Other shop');
      await addCustomer(mine.shopId, { phone: '+919884021107' });
      await expectPgError(addCustomer(mine.shopId, { phone: '+919884021107' }), '23505');
      await addCustomer(theirs.shopId, { phone: '+919884021107' });
      await addCustomer(mine.shopId, { status: 'erased', phone: null });
      await addCustomer(mine.shopId, { status: 'erased', phone: null });
      const { rows } = await pool.query(`select count(*)::int as n from customers where shop_id = $1 and phone is null`, [
        mine.shopId,
      ]);
      expect(rows[0].n).toBe(2);
    });
    it('rewrites stored phones to +<country><number> and leaves every other column alone (AC2, AC5)', async () => {
      const { shopId } = await newShop(pool);
      // Typed form -> stored form. A phone the rule refuses (under 10 or over 15 digits) stays as it was.
      const cases: [string, string][] = [
        ['+91 98840 21107', '+919884021107'],
        ['098401 55502', '+919840155502'],
        ['+91-9840155503', '+919840155503'],
        ['+1 415 555 2671', '+14155552671'],
        ['5123456789', '+915123456789'],
        ['+919840155509', '+919840155509'],
        ['98840 211', '98840 211'],
        ['12345678901234567', '12345678901234567'],
      ];
      const ids: string[] = [];
      for (const [typed] of cases) ids.push(await addCustomer(shopId, { phone: typed }));
      await pool.query(
        `update customers set city = 'Chennai', address = 'T Nagar', notes = 'Likes antiques', opted_in = true where shop_id = $1`,
        [shopId],
      );
      // The version is left out: the bump_version trigger exists by now, the migration rewrites before it.
      const others = `select id, code, name, city, address, notes, customer_group, opted_in, dob, anniversary
                        from customers where shop_id = $1 order by id`;
      const before = (await pool.query(others, [shopId])).rows;
      await pool.query(REWRITE_PHONES, [shopId]);
      for (const [i, [typed, stored]] of cases.entries()) {
        const { rows } = await pool.query('select phone from customers where id = $1', [ids[i]]);
        expect(rows[0].phone, typed).toBe(stored);
      }
      expect((await pool.query(others, [shopId])).rows).toEqual(before);
    });
    it('raises the version on every update (EP-02-S14)', async () => {
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      await pool.query(`update customers set city = 'Coimbatore' where id = $1`, [id]);
      await pool.query(`update customers set city = 'Salem' where id = $1`, [id]);
      const { rows } = await pool.query('select version, city from customers where id = $1', [id]);
      expect(rows[0]).toEqual({ version: 3, city: 'Salem' });
    });
    it('refuses a created_by that is not a user of the same shop', async () => {
      const mine = await newShop(pool);
      const theirs = await newShop(pool, 'Other shop');
      const user = await pool.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role) values ($1, 'Other staff', '+919841099999', 'o@example.test', 'staff') returning id`,
        [theirs.shopId],
      );
      await expectPgError(
        pool.query(
          `insert into customers (shop_id, code, name, phone, customer_group, created_by)
           values ($1, 'CU-X', 'Meera', '+919884000001', 'Regular', $2)`,
          [mine.shopId, user.rows[0].id],
        ),
        '23503',
      );
    });
    it('indexes the directory order and the group filter', async () => {
      const { rows } = await pool.query<{ indexdef: string }>(
        `select indexdef from pg_indexes where tablename = 'customers' and schemaname = 'public'`,
      );
      const defs = rows.map((r) => r.indexdef).join('\n');
      expect(defs).toContain('(shop_id, name, id)');
      expect(defs).toContain('(shop_id, customer_group)');
    });
  });
  describe('consent_events (S2)', () => {
    it('has the columns and checks (AC1)', async () => {
      const cols = await columnsOf(pool, 'consent_events');
      expect(cols.kind).toMatchObject({ type: 'text', nullable: false });
      expect(cols.source).toMatchObject({ type: 'text', nullable: false });
      expect(cols.recorded_by).toMatchObject({ type: 'uuid', nullable: true });
      expect(cols.at).toMatchObject({ type: 'timestamp with time zone', nullable: false });
      expect(cols.seq).toMatchObject({ type: 'bigint' });
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      await expectPgError(addEvent(shopId, id, 'maybe'), '23514');
      await expectPgError(addEvent(shopId, id, 'opt_in', 'telepathy'), '23514');
      for (const source of ['counter', 'whatsapp_reply', 'form', 'import']) await addEvent(shopId, id, 'opt_out', source);
    });
    it('refuses an event for an unknown customer or a customer of another shop', async () => {
      const mine = await newShop(pool);
      const theirs = await newShop(pool, 'Other shop');
      const theirCustomer = await addCustomer(theirs.shopId);
      await expectPgError(addEvent(mine.shopId, randomUUID()), '23503');
      await expectPgError(addEvent(mine.shopId, theirCustomer), '23503');
    });
    it('keeps the event and the opted_in copy together or not at all (AC3)', async () => {
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`insert into consent_events (shop_id, customer_id, kind, source) values ($1, $2, 'opt_in', 'counter')`, [
          shopId,
          id,
        ]);
        await client.query('update customers set opted_in = true where id = $1', [id]);
        await client.query('rollback');
      } finally {
        client.release();
      }
      const events = await pool.query('select count(*)::int as n from consent_events where customer_id = $1', [id]);
      const copy = await pool.query('select opted_in from customers where id = $1', [id]);
      expect(events.rows[0].n).toBe(0);
      expect(copy.rows[0].opted_in).toBe(false);
    });
    it('orders events at the same instant by seq, so the latest is one row (AC2)', async () => {
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      await pool.query(
        `insert into consent_events (shop_id, customer_id, kind, source, at) values
           ($1, $2, 'opt_in', 'counter', '2030-01-01T00:00:00Z'),
           ($1, $2, 'opt_out', 'form', '2030-01-01T00:00:00Z')`,
        [shopId, id],
      );
      const { rows } = await pool.query(
        'select kind from consent_events where shop_id = $1 and customer_id = $2 order by at desc, seq desc limit 1',
        [shopId, id],
      );
      expect(rows[0].kind).toBe('opt_out');
    });
    it('gives each opted-in customer one import opt-in event when backfilled (AC4)', async () => {
      const { shopId } = await newShop(pool);
      const optedIn = await addCustomer(shopId, { optedIn: true });
      const other = await addCustomer(shopId, { optedIn: false });
      await pool.query(BACKFILL_CONSENT, [shopId]);
      const { rows } = await pool.query(
        'select customer_id, kind, source, recorded_by from consent_events where shop_id = $1',
        [shopId],
      );
      expect(rows).toEqual([{ customer_id: optedIn, kind: 'opt_in', source: 'import', recorded_by: null }]);
      expect(rows.some((r) => r.customer_id === other)).toBe(false);
    });
    it('refuses update, delete and truncate (AC5)', async () => {
      const { shopId } = await newShop(pool);
      const id = await addCustomer(shopId);
      await addEvent(shopId, id);
      await expectPgError(pool.query(`update consent_events set kind = 'opt_out' where shop_id = $1`, [shopId]), 'P0001');
      await expectPgError(pool.query('delete from consent_events where shop_id = $1', [shopId]), 'P0001');
      await expectPgError(pool.query('truncate consent_events'), 'P0001');
      const { rows } = await pool.query('select count(*)::int as n from consent_events where shop_id = $1', [shopId]);
      expect(rows[0].n).toBe(1);
    });
  });
  describe('audit kinds (S14)', () => {
    it('accepts the five customer kinds and keeps the earlier ones', async () => {
      const { shopId } = await newShop(pool);
      const user = await pool.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role) values ($1, 'Rajesh Verma', '+919841011111', 'r@example.test', 'staff') returning id`,
        [shopId],
      );
      for (const kind of [
        'customer_added',
        'customer_edited',
        'customer_consent_recorded',
        'customer_opted_out',
        'customer_erased',
        'customer_onboarded',
        'user_added',
      ]) {
        await pool.query(
          `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, entity_type, entity_id)
           values ($1, $2, 'Rajesh Verma', 'staff', $3, 'customer', 'CU-009')`,
          [shopId, user.rows[0].id, kind],
        );
      }
    });
  });
});
