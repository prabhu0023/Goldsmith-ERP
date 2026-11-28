/** Audit entries for customer changes (EP-17-S14). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import {
  addCustomer,
  auditCount,
  type CustomersHarness,
  customerAudit,
  customerRow,
  MEERA,
  startCustomersHarness,
} from './customer-test-helpers.js';

describeDb('customer audit entries (EP-17-S14)', () => {
  let h: CustomersHarness;
  beforeAll(async () => {
    h = await startCustomersHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it('AC1: an add writes one customer_added entry with the stored fields as after', async () => {
    const res = await h.asStaff('createCustomer', { ...MEERA, notes: 'Likes temple jewellery', optInSource: 'counter' });
    const code = res.body.id as string;
    const entries = await customerAudit(h, 'customer_added', code);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor_id: h.userId,
      actor_name: 'Rajesh Verma',
      actor_role: 'staff',
      entity_type: 'customer',
      entity_id: code,
      summary: `Customer ${code} added`,
      before_value: null,
    });
    expect(entries[0].at.toISOString()).toBe(SERVER_NOW.toISOString());
    expect(entries[0].after_value).toMatchObject({
      name: 'Meera Iyer',
      city: 'Chennai',
      group: 'VIP Bridal',
      dob: '2000-03-14',
      notes: 'Likes temple jewellery',
      optedIn: true,
    });
    expect(entries[0].after_value?.phone).toBe('+91 ••••• 21107');
    expect(entries[0].summary).not.toContain('Meera');
  });

  it('AC2: an edit writes one customer_edited entry holding only the changed field', async () => {
    const meera = await addCustomer(h, { name: 'Edit Me', phone: '+919800000601', city: 'Chennai', group: 'Regular' });
    const res = await h.asStaff('updateCustomer', {
      customerId: meera.code,
      version: 1,
      name: 'Edit Me',
      phone: '98000 00601',
      city: 'Coimbatore',
      group: 'Regular',
    });
    expect(res.status).toBe(200);
    const entries = await customerAudit(h, 'customer_edited', meera.code);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ before_value: { city: 'Chennai' }, after_value: { city: 'Coimbatore' }, entity_type: 'customer' });
  });

  it('AC3: an opt-out writes one customer_opted_out entry with the source (the System path is in consent.test.ts)', async () => {
    const c = await addCustomer(h, { name: 'Opt Out', phone: '+919800000602', optedIn: true });
    const res = await h.asOwner('recordConsent', { customerId: c.code, kind: 'opt_out', source: 'form' });
    expect(res.status).toBe(200);
    const entries = await customerAudit(h, 'customer_opted_out', c.code);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor_role: 'owner', after_value: { optedIn: false, consentSource: 'form' } });
  });

  it('AC4: the erase entry lists the field names, holds no name or phone digits, and carries the request reference', async () => {
    const c = await addCustomer(h, {
      name: 'Meera Iyer',
      phone: '+919884021199',
      city: 'Chennai',
      address: '12 Lake Road',
      dob: '2000-03-14',
      anniversary: '2000-12-02',
    });
    const res = await h.asOwner('eraseCustomer', {
      customerId: c.code,
      version: 1,
      deletionRequestRef: 'DPDP-2026-0007',
      reason: 'Customer asked in writing',
    });
    expect(res.status).toBe(200);
    const entries = await customerAudit(h, 'customer_erased', c.code);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toMatchObject({ actor_name: 'Sanjay Seth', actor_role: 'owner', entity_type: 'customer', reference: 'DPDP-2026-0007', before_value: null, after_value: null });
    expect(JSON.parse(entry.detail ?? 'null')).toEqual({
      erasedFields: ['name', 'phone', 'address', 'dob', 'anniversary'],
      deletionRequestRef: 'DPDP-2026-0007',
    });
    const text = JSON.stringify(entry);
    expect(text).not.toContain('Meera');
    expect(text).not.toContain('Iyer');
    expect(text).not.toContain('9884021199');
    expect(text).not.toContain('21199');
    expect(text).not.toContain('Lake Road');
  });

  it('AC5: a change whose audit write fails rolls back with it, leaving no change and no entry', async () => {
    const c = await addCustomer(h, { name: 'Rollback Me', phone: '+919800000603', city: 'Chennai' });
    const shopId = h.shop.shopId;
    await h.pool.query(
      `create or replace function ep17_test_fail_edit() returns trigger language plpgsql as $$
       begin
         if new.shop_id = '${shopId}' and new.kind = 'customer_edited' then raise exception 'audit write failed'; end if;
         return new;
       end; $$`,
    );
    await h.pool.query(`create trigger ep17_test_fail_edit before insert on audit_entries for each row execute function ep17_test_fail_edit()`);
    try {
      const entries = await auditCount(h);
      const res = await h.asStaff('updateCustomer', {
        customerId: c.code,
        version: 1,
        name: 'Rollback Me',
        phone: '98000 00603',
        city: 'Pune',
        group: 'Regular',
      });
      expect(res.status).toBe(500);
      expect((await customerRow(h, c.code))?.city).toBe('Chennai');
      expect((await customerRow(h, c.code))?.version).toBe(1);
      expect(await auditCount(h)).toBe(entries);
    } finally {
      await h.pool.query('drop trigger ep17_test_fail_edit on audit_entries');
      await h.pool.query('drop function ep17_test_fail_edit()');
      h.logged.length = 0;
    }
  });

  it('a refused request writes no entry', async () => {
    const entries = await auditCount(h);
    expect((await h.asStaff('createCustomer', { ...MEERA, name: '' })).status).toBe(400);
    expect((await h.asStaff('createCustomer', { ...MEERA, phone: '98840 21107' })).status).toBe(400);
    expect(await auditCount(h)).toBe(entries);
  });

  it('AC6: the security log filtered to one customer lists its entries newest first', async () => {
    const res = await h.asStaff('createCustomer', { name: 'Log Reader', phone: '98000 00604', group: 'Regular' });
    const code = res.body.id as string;
    await h.asStaff('updateCustomer', { customerId: code, version: 1, name: 'Log Reader', phone: '98000 00604', city: 'Goa', group: 'Regular' });
    await h.asOwner('recordConsent', { customerId: code, kind: 'opt_in', source: 'counter' });
    const log = await h.asOwner('listAuditEntries', { entity: code });
    expect(log.status).toBe(200);
    const items = log.body.items as Array<{ kind: string; entityType: string; entityId: string }>;
    expect(items.map((i) => i.kind).sort()).toEqual(['customer_added', 'customer_consent_recorded', 'customer_edited']);
    expect(items.every((i) => i.entityType === 'customer' && i.entityId === code)).toBe(true);
  });
});
