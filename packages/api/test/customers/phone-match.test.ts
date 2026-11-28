/** Find Customer by phone (EP-17-S10). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { findCustomerByPhone } from '../../src/customers/index.js';
import { describeDb } from '../db/db-test-helpers.js';
import { addCustomer, auditCount, type CustomersHarness, startCustomersHarness } from './customer-test-helpers.js';

describeDb('matching a phone to a customer (EP-17-S10)', () => {
  let h: CustomersHarness;
  beforeAll(async () => {
    h = await startCustomersHarness();
    await addCustomer(h, { name: 'Meera Iyer', phone: '+919884021107', city: 'Chennai', group: 'VIP Bridal', dob: '2000-03-14', address: 'Secret street', notes: 'private' });
    await addCustomer(h, { name: 'Gone Away', phone: null, status: 'erased' });
  });
  afterAll(async () => {
    await h?.close();
  });
  const find = (phone: string, as: 'asStaff' | 'asOwner' = 'asStaff') => h[as]('findCustomerByPhone', { phone });

  it('AC1: any typing of her phone returns her id, name, city and group and nothing else', async () => {
    for (const phone of ['+91 98840 21107', '98840 21107', '9884021107', '09884021107', '+919884021107']) {
      const res = await find(phone);
      expect(res).toEqual({
        status: 200,
        body: { ok: true, customer: { id: expect.stringMatching(/^CU-/), name: 'Meera Iyer', city: 'Chennai', group: 'VIP Bridal' } },
      });
    }
  });

  it('AC2: a phone nobody holds returns none and creates no customer', async () => {
    const count = async () =>
      (await h.pool.query('select count(*)::int as n from customers where shop_id = $1', [h.shop.shopId])).rows[0].n;
    const before = await count();
    expect(await find('+91 98451 20034')).toEqual({ status: 200, body: { ok: true, customer: null } });
    expect(await count()).toBe(before);
  });

  it('AC3: fewer than 10 digits returns none with no error', async () => {
    expect(await find('98840 211')).toEqual({ status: 200, body: { ok: true, customer: null } });
    expect(await find('')).toEqual({ status: 200, body: { ok: true, customer: null } });
  });

  it('AC4: after she is erased her old phone returns none', async () => {
    const meera = (await h.asStaff('listCustomers', { search: 'iyer' })).body.items as Array<{ id: string }>;
    const read = await h.asOwner('readCustomer', { customerId: meera[0].id });
    const erased = await h.asOwner('eraseCustomer', {
      customerId: meera[0].id,
      version: (read.body.customer as { version: number }).version,
      deletionRequestRef: 'DPDP-2026-0007',
      reason: 'Customer asked in writing',
    });
    expect(erased.status).toBe(200);
    expect(await find('98840 21107')).toEqual({ status: 200, body: { ok: true, customer: null } });
  });

  it('server code can match through findCustomerByPhone, and the match writes nothing', async () => {
    await addCustomer(h, { name: 'Server Side', phone: '+919800000401', city: 'Pune', group: 'Wholesale' });
    const entries = await auditCount(h);
    const match = await findCustomerByPhone(h.pool as never, h.shop, '98000 00401');
    expect(match).toMatchObject({ name: 'Server Side', city: 'Pune', group: 'Wholesale' });
    expect(await findCustomerByPhone(h.pool as never, h.shop, '123')).toBeNull();
    expect(await auditCount(h)).toBe(entries);
  });

  it('AC5: with 10,000 customers the match answers in under 200 ms', async () => {
    const big = await startCustomersHarness();
    try {
      await big.pool.query(
        `insert into customers (shop_id, code, name, phone, customer_group)
         select $1, 'CU-' || (1000 + i), 'Customer ' || lpad(i::text, 5, '0'), '+91' || (7000000000 + i)::text, 'Regular'
           from generate_series(1, 10000) i`,
        [big.shop.shopId],
      );
      await big.asStaff('findCustomerByPhone', { phone: '7000000001' });
      const started = Date.now();
      const res = await big.asStaff('findCustomerByPhone', { phone: '70000 09999' });
      expect(Date.now() - started).toBeLessThan(200);
      expect(res.body.customer).toMatchObject({ name: 'Customer 09999' });
    } finally {
      await big.close();
    }
  });
});
