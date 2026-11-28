/** Who may call the customer operations (EP-17-S12). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { addCustomer, auditCount, type CustomersHarness, customerCount, customerRow, startCustomersHarness } from './customer-test-helpers.js';

const KARIGAR_REFUSED = { status: 403, body: { code: 'forbidden', message: 'A karigar can only work on their own jobs.' } };
const ERASE_REFUSED = { status: 403, body: { code: 'forbidden', message: 'Only the owner can erase a customer.' } };
/** The refusal a karigar gets: erase has its own sentence. */
const refusalFor = (op: string) => (op === 'eraseCustomer' ? ERASE_REFUSED : KARIGAR_REFUSED);

describeDb('access to the customer operations (EP-17-S12)', () => {
  let h: CustomersHarness;
  let meera: { id: string; code: string };
  beforeAll(async () => {
    h = await startCustomersHarness();
    meera = await addCustomer(h, { name: 'Meera Iyer', phone: '+919884021107', city: 'Chennai', group: 'VIP Bridal' });
  });
  afterAll(async () => {
    await h?.close();
  });
  const asKarigar = (op: string, body: unknown) => h.call(op, body, { session: h.karigar });
  const valid: Record<string, unknown> = {
    createCustomer: { name: 'New One', phone: '98000 00501', group: 'Regular' },
    updateCustomer: { customerId: 'CU-501', version: 1, name: 'New One', phone: '98000 00501', group: 'Regular' },
    listCustomers: {},
    readCustomer: { customerId: 'CU-501' },
    findCustomerByPhone: { phone: '98840 21107' },
    recordConsent: { customerId: 'CU-501', kind: 'opt_in', source: 'counter' },
    eraseCustomer: { customerId: 'CU-501', version: 1, deletionRequestRef: 'REQ-1', reason: 'Asked' },
  };

  it('AC1, AC2: a karigar gets forbidden from all seven operations, and nothing changes', async () => {
    const customers = await customerCount(h);
    const entries = await auditCount(h);
    for (const [op, body] of Object.entries(valid)) {
      expect(await asKarigar(op, body), op).toEqual(refusalFor(op));
    }
    expect(await customerCount(h)).toBe(customers);
    expect(await auditCount(h)).toBe(entries);
  });

  it('AC3: a karigar with an invalid body gets the role refusal, not the validation sentence', async () => {
    for (const op of Object.keys(valid)) {
      expect(await asKarigar(op, { name: '', phone: '1', budgetINR: 5 }), op).toEqual(refusalFor(op));
      expect(await asKarigar(op, {}), op).toEqual(refusalFor(op));
    }
  });

  it('AC2: the refusal is the same for a customer who exists and one who does not', async () => {
    const known = await asKarigar('readCustomer', { customerId: meera.code });
    const unknown = await asKarigar('readCustomer', { customerId: 'CU-996' });
    expect(known).toEqual(unknown);
    expect(await asKarigar('findCustomerByPhone', { phone: '98840 21107' })).toEqual(await asKarigar('findCustomerByPhone', { phone: '90000 00000' }));
  });

  it('a signed-out caller is unauthenticated', async () => {
    const res = await h.call('listCustomers', {});
    expect(res.status).toBe(401);
  });

  it('AC (matrix): staff may use six operations but is forbidden from erasing, and nothing changes', async () => {
    const before = await customerRow(h, meera.code);
    const res = await h.asStaff('eraseCustomer', { customerId: meera.code, version: 1, deletionRequestRef: 'REQ-1', reason: 'Asked' });
    expect(res).toEqual({ status: 403, body: { code: 'forbidden', message: 'Only the owner can erase a customer.' } });
    expect(await customerRow(h, meera.code)).toEqual(before);
    for (const op of ['listCustomers', 'findCustomerByPhone']) {
      expect((await h.asStaff(op, valid[op])).status, op).toBe(200);
    }
  });

  it("another shop's customer is not_found, for read, update, consent and erase", async () => {
    const other = await startCustomersHarness();
    try {
      const theirs = await addCustomer(other, { name: 'Other Shop', phone: '+919800000502' });
      const before = await customerRow(other, theirs.code);
      const calls: Array<[string, Record<string, unknown>]> = [
        ['readCustomer', { customerId: theirs.code }],
        ['updateCustomer', { customerId: theirs.code, version: 1, name: 'Hijack', phone: '98000 00503', group: 'Regular' }],
        ['recordConsent', { customerId: theirs.code, kind: 'opt_in', source: 'counter' }],
        ['eraseCustomer', { customerId: theirs.code, version: 1, deletionRequestRef: 'REQ-9', reason: 'No' }],
      ];
      for (const [op, body] of calls) {
        const res = await h.asOwner(op, body);
        expect(res.status, op).toBe(404);
        expect(res.body, op).toMatchObject({ code: 'not_found' });
      }
      expect(await customerRow(other, theirs.code)).toEqual(before);
      expect((await h.asStaff('findCustomerByPhone', { phone: '98000 00502' })).body.customer).toBeNull();
    } finally {
      await other.close();
    }
  });
});
