/** Create Customer (EP-17-S3, S4 AC1, AC4, AC5, S6 AC1, AC2, AC5, S11 AC2). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { expectExactlyOne, releaseTogether } from '../support/concurrency.js';
import {
  addCustomer,
  consentRows,
  type CustomersHarness,
  customerCount,
  customerRow,
  MEERA,
  startCustomersHarness,
} from './customer-test-helpers.js';

const DUPLICATE = 'A customer with this phone number already exists.';

describeDb('adding a customer (EP-17-S3, S4, S6)', () => {
  let h: CustomersHarness;
  beforeAll(async () => {
    h = await startCustomersHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  const refused = async (body: Record<string, unknown>) => {
    const before = await customerCount(h);
    const res = await h.asStaff('createCustomer', { ...MEERA, ...body });
    expect(await customerCount(h), 'nothing stored').toBe(before);
    return res;
  };

  it('S3 AC1: stores the customer with a normalised phone, status active, creator and time, and returns the id', async () => {
    const res = await h.asStaff('createCustomer', { ...MEERA, notes: 'Likes temple jewellery', address: '12 Lake Road' });
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'CU-001' } });
    const row = await customerRow(h, 'CU-001');
    expect(row).toMatchObject({
      name: 'Meera Iyer',
      phone: '+919884021107',
      city: 'Chennai',
      address: '12 Lake Road',
      notes: 'Likes temple jewellery',
      customer_group: 'VIP Bridal',
      dob: '2000-03-14',
      anniversary: null,
      status: 'active',
      opted_in: false,
      version: 1,
      created_by: h.userId,
      budget_inr: null,
      spent_inr: null,
    });
    expect(row?.created_at.toISOString()).toBe(SERVER_NOW.toISOString());
  });

  it('S3 AC1: the next customer gets the next id', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Priya Malhotra', phone: '98450 12034', group: 'Regular' });
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'CU-002' } });
  });

  it('S3 AC2: an empty or blank name is refused', async () => {
    for (const name of ['', '   ']) {
      const res = await refused({ name, phone: '98000 00001' });
      expect(res).toEqual({ status: 400, body: { code: 'validation', message: 'Add the customer name.', field: 'name' } });
    }
  });

  it('S3 AC3: a phone under 10 digits is refused', async () => {
    const res = await refused({ phone: '98840 211' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'validation',
      field: 'phone',
      message: 'Add a phone number with at least 10 digits. It is also the WhatsApp number.',
    });
  });

  it('S3 AC4: a birthday or anniversary with only a day or a month is refused', async () => {
    const phone = '98000 00002';
    expect((await refused({ phone, dob: { day: 14 } })).body).toMatchObject({
      field: 'dob',
      message: 'Give both the day and the month of the birthday, or neither.',
    });
    expect((await refused({ phone, dob: undefined, anniversary: { month: 12 } })).body).toMatchObject({
      field: 'anniversary',
      message: 'Give both the day and the month of the anniversary, or neither.',
    });
  });

  it('S3 AC5: a day that does not exist in the month is a validation error on dob', async () => {
    const res = await refused({ phone: '98000 00003', dob: { day: 31, month: 2 } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field: 'dob' });
    const anniversary = await refused({ phone: '98000 00003', dob: undefined, anniversary: { day: 30, month: 2 } });
    expect(anniversary.body).toMatchObject({ code: 'validation', field: 'anniversary' });
  });

  it('S3 AC5: 29 February is accepted', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Leap Day', phone: '98000 00004', group: 'Regular', dob: { day: 29, month: 2 } });
    expect(res.status).toBe(200);
    expect((await customerRow(h, res.body.id as string))?.dob).toBe('2000-02-29');
  });

  it('S3: a group outside the list is a validation error', async () => {
    const res = await refused({ phone: '98000 00005', group: 'Festive collector' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation' });
  });

  it('S3 AC6: the same request sent twice with one idempotency key adds one customer', async () => {
    const before = await customerCount(h);
    const body = { name: 'Ravi Shankar', phone: '98000 00006', group: 'Regular' };
    const first = await h.asStaff('createCustomer', body, 'key-add-ravi');
    const second = await h.asStaff('createCustomer', body, 'key-add-ravi');
    expect(first.status).toBe(200);
    expect(second).toEqual(first);
    expect(await customerCount(h)).toBe(before + 1);
  });

  it('S3: the owner may add a customer too', async () => {
    const res = await h.asOwner('createCustomer', { name: 'Owner Added', phone: '98000 00007', group: 'Wholesale' });
    expect(res.status).toBe(200);
  });

  it('S4 AC1: a phone another customer holds is refused as validation on phone, however it is typed', async () => {
    for (const phone of ['98840 21107', '+91 98840 21107', '09884021107']) {
      const res = await refused({ name: 'M. Iyer', phone });
      expect(res).toEqual({ status: 400, body: { code: 'validation', message: DUPLICATE, field: 'phone' } });
    }
  });

  it('S4 AC4: two adds with one phone at the same moment leave exactly one customer', async () => {
    const body = { name: 'Race Runner', phone: '98840 55555', group: 'Regular' };
    const results = await releaseTogether([() => h.asStaff('createCustomer', body), () => h.asOwner('createCustomer', body)]);
    const { losers } = expectExactlyOne(results);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ status: 400, body: { code: 'validation', message: DUPLICATE, field: 'phone' } });
    const { rows } = await h.pool.query('select 1 from customers where shop_id = $1 and phone = $2', [h.shop.shopId, '+919884055555']);
    expect(rows).toHaveLength(1);
  });

  it('S4 AC5: an erased customer no longer holds a phone', async () => {
    const erased = await addCustomer(h, { name: 'Erased customer', phone: null, status: 'erased' });
    const res = await h.asStaff('createCustomer', { name: 'New Holder', phone: '98840 66666', group: 'Regular' });
    expect(res.status).toBe(200);
    expect(erased.code).toMatch(/^CU-/);
  });

  it('S6 AC1: ticking the box writes one opt_in event in the same transaction, source and recorder set', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Opted In', phone: '98840 77777', group: 'Regular', optInSource: 'counter' });
    const code = res.body.id as string;
    expect((await customerRow(h, code))?.opted_in).toBe(true);
    const events = await consentRows(h, code);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'opt_in', source: 'counter', recorded_by: h.userId });
    expect((events[0].at as Date).toISOString()).toBe(SERVER_NOW.toISOString());
  });

  it('S6 AC2: leaving the box unticked writes no consent event', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Not Opted', phone: '98840 88888', group: 'Regular' });
    const code = res.body.id as string;
    expect((await customerRow(h, code))?.opted_in).toBe(false);
    expect(await consentRows(h, code)).toHaveLength(0);
  });

  it('S6 AC5: a source only the system sets is a validation error', async () => {
    for (const optInSource of ['whatsapp_reply', 'import']) {
      const res = await refused({ phone: '98000 00008', optInSource });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation' });
    }
  });

  it('S11 AC2: id, status, version, optedIn, budgetINR and spentINR are refused and nothing is stored', async () => {
    for (const extra of [{ budgetINR: 800000 }, { spentINR: 1 }, { optedIn: true }, { status: 'erased' }, { id: 'CU-900' }, { version: 3 }]) {
      const res = await refused({ phone: '98000 00009', ...extra });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation' });
    }
  });
});
