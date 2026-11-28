/** Erase Customer personal data (EP-17-S13). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import {
  addCustomer,
  addHistory,
  auditCount,
  consentRows,
  type CustomersHarness,
  customerRow,
  startCustomersHarness,
} from './customer-test-helpers.js';

describeDb('erasing a customer (EP-17-S13)', () => {
  let h: CustomersHarness;
  let meera: { id: string; code: string };
  const request = (customerId: string, version: number, extra: Record<string, unknown> = {}) => ({
    customerId,
    version,
    deletionRequestRef: 'DPDP-2026-0007',
    reason: 'Customer asked in writing',
    ...extra,
  });
  beforeAll(async () => {
    h = await startCustomersHarness();
    meera = await addCustomer(h, {
      name: 'Meera Iyer',
      phone: '+919884021107',
      city: 'Chennai',
      address: '12 Lake Road',
      dob: '2000-03-14',
      anniversary: '2000-12-02',
      notes: 'Likes temple jewellery',
      optedIn: true,
    });
    await h.asStaff('recordConsent', { customerId: meera.code, kind: 'opt_out', source: 'counter' });
    await h.asStaff('recordConsent', { customerId: meera.code, kind: 'opt_in', source: 'form' });
    await addHistory(h, meera.id, [
      { tag: 'TAG-7521', name: 'Chettinad Haram', units: 784000, on: '2026-10-12T00:00:00Z' },
      { tag: 'TAG-6690', name: 'Polki Kada pair', units: 574900, on: '2026-02-10T00:00:00Z' },
    ]);
  });
  afterAll(async () => {
    await h?.close();
  });

  it('AC5: staff is refused, and a missing deletion reference or reason is refused; nothing changes', async () => {
    const before = await customerRow(h, meera.code);
    const entries = await auditCount(h);
    const staff = await h.asStaff('eraseCustomer', request(meera.code, before?.version ?? 1));
    expect(staff).toEqual({ status: 403, body: { code: 'forbidden', message: 'Only the owner can erase a customer.' } });
    const noRef = await h.asOwner('eraseCustomer', request(meera.code, before?.version ?? 1, { deletionRequestRef: '  ' }));
    expect(noRef).toEqual({ status: 400, body: { code: 'validation', message: 'Add the deletion request reference.', field: 'deletionRequestRef' } });
    const noReason = await h.asOwner('eraseCustomer', request(meera.code, before?.version ?? 1, { reason: '' }));
    expect(noReason).toEqual({ status: 400, body: { code: 'validation', message: 'Add the reason for erasing this customer.', field: 'reason' } });
    expect(await customerRow(h, meera.code)).toEqual(before);
    expect(await auditCount(h)).toBe(entries);
  });

  it('a stale version is a conflict and nothing changes', async () => {
    const before = await customerRow(h, meera.code);
    const res = await h.asOwner('eraseCustomer', request(meera.code, (before?.version ?? 1) - 1));
    expect(res.status).toBe(409);
    expect(await customerRow(h, meera.code)).toEqual(before);
  });

  it('AC1: clears name, phone, address, dob and anniversary, sets erased and opted out, version +1', async () => {
    const before = await customerRow(h, meera.code);
    const res = await h.asOwner('eraseCustomer', request(meera.code, before?.version ?? 1));
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const after = await customerRow(h, meera.code);
    expect(after).toMatchObject({
      name: 'Erased customer',
      phone: null,
      address: null,
      dob: null,
      anniversary: null,
      status: 'erased',
      opted_in: false,
      version: (before?.version ?? 0) + 1,
      city: 'Chennai',
      notes: 'Likes temple jewellery',
    });
  });

  it('AC2: the history rows remain, linked to the erased record', async () => {
    const { rows } = await h.pool.query(
      'select tag_no, name, pure_units from customer_history where customer_id = $1 order by on_at desc',
      [meera.id],
    );
    expect(rows).toEqual([
      { tag_no: 'TAG-7521', name: 'Chettinad Haram', pure_units: 784000 },
      { tag_no: 'TAG-6690', name: 'Polki Kada pair', pure_units: 574900 },
    ]);
  });

  it('AC3: the consent events stay as proof, and the customer is opted out', async () => {
    const events = await consentRows(h, meera.code);
    expect(events.map((e) => e.kind)).toEqual(['opt_out', 'opt_in']);
    expect((await customerRow(h, meera.code))?.opted_in).toBe(false);
  });

  it('AC4: the directory and the phone match no longer find her', async () => {
    expect((await h.asStaff('listCustomers', { search: 'iyer' })).body.items).toEqual([]);
    expect((await h.asStaff('listCustomers', { search: '98840 21107' })).body.items).toEqual([]);
    expect((await h.asStaff('listCustomers', { search: 'erased' })).body.items).toEqual([]);
    expect((await h.asStaff('findCustomerByPhone', { phone: '98840 21107' })).body.customer).toBeNull();
    expect((await h.asStaff('readCustomer', { customerId: meera.code })).status).toBe(404);
  });

  it('AC6: erasing an erased customer is not_found and nothing changes', async () => {
    const before = await customerRow(h, meera.code);
    const entries = await auditCount(h);
    const res = await h.asOwner('eraseCustomer', request(meera.code, before?.version ?? 1));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
    expect(await customerRow(h, meera.code)).toEqual(before);
    expect(await auditCount(h)).toBe(entries);
  });

  it('the erased phone can be added again as a new customer', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Meera Iyer', phone: '98840 21107', group: 'Regular' });
    expect(res.status).toBe(200);
  });
});
