/** Update Customer (EP-17-S5, S4 AC2, AC3). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { auditCount, addCustomer, type CustomersHarness, customerRow, MEERA, startCustomersHarness } from './customer-test-helpers.js';

const DUPLICATE = 'A customer with this phone number already exists.';

describeDb('editing a customer (EP-17-S5)', () => {
  let h: CustomersHarness;
  let meera: string;
  let priya: string;
  beforeAll(async () => {
    h = await startCustomersHarness();
    meera = (await h.asStaff('createCustomer', { ...MEERA, optInSource: 'counter' })).body.id as string;
    priya = (await h.asStaff('createCustomer', { name: 'Priya Malhotra', phone: '98450 12034', group: 'Regular' })).body.id as string;
  });
  afterAll(async () => {
    await h?.close();
  });
  /** The full form for Meera as stored, with `changes` applied. */
  const form = async (code: string, changes: Record<string, unknown> = {}) => {
    const row = await customerRow(h, code);
    return {
      customerId: code,
      version: row?.version,
      name: row?.name,
      phone: row?.phone,
      city: row?.city,
      group: row?.customer_group,
      dob: row?.dob ? { day: Number(row.dob.slice(8)), month: Number(row.dob.slice(5, 7)) } : undefined,
      ...changes,
    };
  };

  it('S5 AC1: adds an anniversary and changes the city; version +1; id, phone and consent unchanged', async () => {
    const before = await customerRow(h, meera);
    const res = await h.asStaff('updateCustomer', await form(meera, { anniversary: { day: 2, month: 12 }, city: 'Coimbatore' }));
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const after = await customerRow(h, meera);
    expect(after).toMatchObject({ city: 'Coimbatore', anniversary: '2000-12-02', phone: '+919884021107', opted_in: true, code: meera });
    expect(after?.version).toBe((before?.version ?? 0) + 1);
  });

  it('S5: a stored date whose day and month are unchanged keeps its year; a blank field is cleared', async () => {
    const real = await addCustomer(h, { name: 'Real Year', phone: '+919800000101', dob: '1985-03-14', notes: 'old note', address: 'Old street' });
    const res = await h.asStaff('updateCustomer', {
      customerId: real.code,
      version: 1,
      name: 'Real Year',
      phone: '98000 00101',
      group: 'Regular',
      dob: { day: 14, month: 3 },
      notes: '  ',
    });
    expect(res.status).toBe(200);
    expect(await customerRow(h, real.code)).toMatchObject({ dob: '1985-03-14', notes: null, address: null });
  });

  it('S5 AC2: clearing the name is refused and nothing changes', async () => {
    const before = await customerRow(h, priya);
    const res = await h.asStaff('updateCustomer', await form(priya, { name: ' ' }));
    expect(res).toEqual({ status: 400, body: { code: 'validation', message: 'Add the customer name.', field: 'name' } });
    expect(await customerRow(h, priya)).toEqual(before);
  });

  it('S5 AC3: an anniversary month with no day is refused and nothing changes', async () => {
    const before = await customerRow(h, priya);
    const res = await h.asStaff('updateCustomer', await form(priya, { anniversary: { month: 12 } }));
    expect(res.body).toMatchObject({ field: 'anniversary', message: 'Give both the day and the month of the anniversary, or neither.' });
    expect(await customerRow(h, priya)).toEqual(before);
  });

  it("S5 AC4, S4 AC2: another customer's phone gives the duplicate refusal and her phone is unchanged", async () => {
    const res = await h.asStaff('updateCustomer', await form(priya, { phone: '+91 98840 21107' }));
    expect(res).toEqual({ status: 400, body: { code: 'validation', message: DUPLICATE, field: 'phone' } });
    expect((await customerRow(h, priya))?.phone).toBe('+919845012034');
  });

  it('S4 AC3: keeping her own phone, typed another way, raises no warning', async () => {
    const res = await h.asStaff('updateCustomer', await form(meera, { phone: '098840 21107', city: 'Madurai' }));
    expect(res.status).toBe(200);
    expect((await customerRow(h, meera))?.phone).toBe('+919884021107');
  });

  it('S5 AC5: saving with an older version is a conflict and nothing changes', async () => {
    const stale = await form(priya, { city: 'Pune' });
    expect((await h.asOwner('updateCustomer', await form(priya, { city: 'Delhi' }))).status).toBe(200);
    const res = await h.asStaff('updateCustomer', stale);
    expect(res).toEqual({ status: 409, body: { code: 'conflict', message: 'Someone else changed this customer. Reload and try again.' } });
    expect((await customerRow(h, priya))?.city).toBe('Delhi');
  });

  it('S5 AC6: optedIn, status, budgetINR, spentINR, id and a stray field are validation errors', async () => {
    const before = await customerRow(h, priya);
    for (const extra of [{ optedIn: true }, { status: 'erased' }, { budgetINR: 1 }, { spentINR: 1 }, { id: 'CU-900' }, { opted_in: true }]) {
      const res = await h.asStaff('updateCustomer', await form(priya, extra));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation' });
    }
    expect(await customerRow(h, priya)).toEqual(before);
  });

  it('S5: an edit that changes nothing writes nothing, no version and no audit entry', async () => {
    const before = await customerRow(h, priya);
    const entries = await auditCount(h);
    const res = await h.asStaff('updateCustomer', await form(priya));
    expect(res.status).toBe(200);
    expect(await customerRow(h, priya)).toEqual(before);
    expect(await auditCount(h)).toBe(entries);
  });

  it('S5: an unchanged edit with an older version is still a conflict', async () => {
    const stale = await form(priya);
    await h.asStaff('updateCustomer', await form(priya, { city: 'Goa' }));
    expect((await h.asStaff('updateCustomer', stale)).status).toBe(409);
  });

  it('S5: an unknown or erased customer is not_found', async () => {
    const erased = await addCustomer(h, { name: 'Erased customer', phone: null, status: 'erased' });
    for (const code of ['CU-999', erased.code]) {
      const res = await h.asStaff('updateCustomer', { customerId: code, version: 1, name: 'X', phone: '98000 00102', group: 'Regular' });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'not_found' });
    }
  });
});
