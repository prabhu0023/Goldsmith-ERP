/** Consent (EP-17-S2 AC2, S6 AC3, AC4, S7 AC1, AC3, AC4). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { SYSTEM_ACTORS } from '../../src/audit/audit-writer.js';
import { recordConsentEvent } from '../../src/customers/index.js';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import {
  addCustomer,
  auditCount,
  consentRows,
  type CustomersHarness,
  customerAudit,
  customerRow,
  startCustomersHarness,
} from './customer-test-helpers.js';

describeDb('consent (EP-17-S6, S7)', () => {
  let h: CustomersHarness;
  beforeAll(async () => {
    h = await startCustomersHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it('S6 AC3: recording consent for a customer who is not opted in writes an opt_in event and sets optedIn', async () => {
    const ravi = await addCustomer(h, { name: 'Ravi Shankar', phone: '+919800000201' });
    const res = await h.asStaff('recordConsent', { customerId: ravi.code, kind: 'opt_in', source: 'form' });
    expect(res).toEqual({ status: 200, body: { ok: true, optedIn: true, recorded: true } });
    expect((await customerRow(h, ravi.code))?.opted_in).toBe(true);
    expect(await consentRows(h, ravi.code)).toMatchObject([{ kind: 'opt_in', source: 'form', recorded_by: h.userId }]);
    const audit = await customerAudit(h, 'customer_consent_recorded', ravi.code);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: h.userId, entity_type: 'customer', before_value: { optedIn: false }, after_value: { optedIn: true, consentSource: 'form' } });
  });

  it('S6 AC4: recording opt-in again writes no event and no entry, and returns the current consent', async () => {
    const meera = await addCustomer(h, { name: 'Meera Iyer', phone: '+919800000202', optedIn: true });
    const entries = await auditCount(h);
    const before = await customerRow(h, meera.code);
    const res = await h.asStaff('recordConsent', { customerId: meera.code, kind: 'opt_in', source: 'counter' });
    expect(res).toEqual({ status: 200, body: { ok: true, optedIn: true, recorded: false } });
    expect(await consentRows(h, meera.code)).toHaveLength(0);
    expect(await auditCount(h)).toBe(entries);
    expect(await customerRow(h, meera.code)).toEqual(before);
  });

  it('S7 AC1, AC4: an opt-out at the counter is effective at once; repeating it writes nothing', async () => {
    const priya = await addCustomer(h, { name: 'Priya Malhotra', phone: '+919800000203', optedIn: true });
    const res = await h.asStaff('recordConsent', { customerId: priya.code, kind: 'opt_out', source: 'counter' });
    expect(res).toEqual({ status: 200, body: { ok: true, optedIn: false, recorded: true } });
    expect((await customerRow(h, priya.code))?.opted_in).toBe(false);
    expect(await consentRows(h, priya.code)).toMatchObject([{ kind: 'opt_out', source: 'counter', recorded_by: h.userId }]);
    expect(await customerAudit(h, 'customer_opted_out', priya.code)).toHaveLength(1);
    const again = await h.asStaff('recordConsent', { customerId: priya.code, kind: 'opt_out', source: 'counter' });
    expect(again.body).toEqual({ ok: true, optedIn: false, recorded: false });
    expect(await consentRows(h, priya.code)).toHaveLength(1);
  });

  it('S2 AC2: the latest event wins and the history shows newest first with who and when', async () => {
    const c = await addCustomer(h, { name: 'Flip Flop', phone: '+919800000204' });
    await h.asStaff('recordConsent', { customerId: c.code, kind: 'opt_in', source: 'counter' });
    await h.asOwner('recordConsent', { customerId: c.code, kind: 'opt_out', source: 'form' });
    await h.asStaff('recordConsent', { customerId: c.code, kind: 'opt_in', source: 'form' });
    const read = await h.asStaff('readCustomer', { customerId: c.code });
    const customer = read.body.customer as { optedIn: boolean; consent: Array<Record<string, unknown>> };
    expect(customer.optedIn).toBe(true);
    expect(customer.consent.map((e) => [e.kind, e.source, e.recordedBy])).toEqual([
      ['opt_in', 'form', 'Rajesh Verma'],
      ['opt_out', 'form', 'Sanjay Seth'],
      ['opt_in', 'counter', 'Rajesh Verma'],
    ]);
    expect(customer.consent[0]).toMatchObject({ at: SERVER_NOW.toISOString(), atLocal: '2026-11-21T15:30:00.000+05:30' });
  });

  it('S6 AC5: a source only the system sets is refused from a user session', async () => {
    const c = await addCustomer(h, { name: 'Source Test', phone: '+919800000205' });
    for (const source of ['whatsapp_reply', 'import']) {
      const res = await h.asStaff('recordConsent', { customerId: c.code, kind: 'opt_in', source });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation' });
    }
    expect(await consentRows(h, c.code)).toHaveLength(0);
  });

  it('S7 AC3: the STOP path writes whatsapp_reply from System through recordConsentEvent, with a System audit entry', async () => {
    const c = await addCustomer(h, { name: 'Stop Sender', phone: '+919800000206', optedIn: true });
    const client = await h.pool.connect();
    try {
      await client.query('begin');
      const outcome = await recordConsentEvent(client, h.shop, {
        customerId: c.id,
        customerCode: c.code,
        kind: 'opt_out',
        source: 'whatsapp_reply',
        actor: { kind: 'system', name: SYSTEM_ACTORS.whatsappIntake },
        at: SERVER_NOW,
      });
      await client.query('commit');
      expect(outcome).toEqual({ optedIn: false, recorded: true });
    } finally {
      client.release();
    }
    expect((await customerRow(h, c.code))?.opted_in).toBe(false);
    expect(await consentRows(h, c.code)).toMatchObject([{ kind: 'opt_out', source: 'whatsapp_reply', recorded_by: null }]);
    const audit = await customerAudit(h, 'customer_opted_out', c.code);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: null, actor_name: 'WhatsApp intake', actor_role: 'system', after_value: { consentSource: 'whatsapp_reply' } });
  });

  it('S6: an unknown or erased customer is not_found', async () => {
    const erased = await addCustomer(h, { name: 'Erased customer', phone: null, status: 'erased' });
    for (const code of ['CU-998', erased.code]) {
      const res = await h.asStaff('recordConsent', { customerId: code, kind: 'opt_in', source: 'counter' });
      expect(res.status).toBe(404);
    }
  });
});
