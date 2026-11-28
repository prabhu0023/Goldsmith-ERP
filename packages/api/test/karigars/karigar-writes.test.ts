/**
 * The karigar write operations (EP-16-S2 to S5, S7): onboardKarigar, updateKarigarDetails,
 * updateKarigarWastage and updateKarigarStatus over the production app, owner only.
 */
import { KARIGAR_MESSAGES, USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readAllowanceInForce } from '../../src/karigars/index.js';
import { describeDb } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW } from '../support/api-harness.js';
import { userRow } from '../users/user-test-helpers.js';
import {
  auditEntries,
  FORBIDDEN,
  KARIGAR_AUDIT_KINDS,
  type KarigarHarness,
  karigarCount,
  karigarRow,
  ruleRefused,
  startKarigarHarness,
  validation,
} from './karigar-test-helpers.js';

const NEW_KARIGAR = {
  name: 'Ravi Achari',
  phone: '98400 50505',
  email: 'ravi.achari@example.com',
  workshopLocation: 'Salem',
  specialties: ['Temple', 'Kundan'],
  wastageBp: 90,
};

describeDb('karigar writes (EP-16)', () => {
  let h: KarigarHarness;
  beforeAll(async () => {
    h = await startKarigarHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  const karigarAudits = async () => auditEntries(h, KARIGAR_AUDIT_KINDS);

  describe('S2: only the owner writes, before validation', () => {
    it('AC1, AC3, AC4, AC6: staff and karigar are refused every write, even an invalid one, and nothing is stored', async () => {
      const before = { count: await karigarCount(h), audits: (await auditEntries(h)).length, vijay: await karigarRow(h, 'KG-04') };
      const calls: Array<[string, unknown]> = [
        ['onboardKarigar', NEW_KARIGAR],
        ['onboardKarigar', { ...NEW_KARIGAR, name: '' }],
        ['updateKarigarDetails', { karigarId: 'KG-04', version: 1, name: 'Vijay K', phone: '98400 99999', email: 'v@example.com', specialties: ['Temple'] }],
        ['updateKarigarWastage', { karigarId: 'KG-02', version: 1, wastageBp: 120 }],
        ['updateKarigarStatus', { karigarId: 'KG-01', version: 1, status: 'deactivated' }],
      ];
      for (const session of [h.session, h.karigarSession]) {
        for (const [op, body] of calls) expect(await h.call(op, body, { session }), op).toEqual(FORBIDDEN);
      }
      expect(await karigarCount(h)).toBe(before.count);
      expect((await auditEntries(h)).length).toBe(before.audits);
      expect(await karigarRow(h, 'KG-04')).toEqual(before.vijay);
      expect((await karigarRow(h, 'KG-02')).wastage_bp).toBe(80);
    });
  });

  describe('S3: add a karigar', () => {
    it('AC1: stores KG-05 at 0.9% as active and English with one karigar_onboarded entry, the code returned', async () => {
      const res = await h.asOwner('onboardKarigar', NEW_KARIGAR);
      expect(res).toEqual({ status: 200, body: { ok: true, id: 'KG-05' } });
      expect(await karigarRow(h, 'KG-05')).toMatchObject({
        code: 'KG-05',
        name: 'Ravi Achari',
        phone: '+919840050505',
        email: 'ravi.achari@example.com',
        workshop_location: 'Salem',
        wastage_bp: 90,
        status: 'active',
        language: 'English',
        deactivated_at: null,
        open_since: '2026-11-21',
        version: 1,
        specialties: ['Temple', 'Kundan'],
      });
      const entries = await karigarAuditsOf('KG-05');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        kind: 'karigar_onboarded',
        entity_type: 'karigar',
        entity_id: 'KG-05',
        actor_id: h.ownerId,
        actor_name: 'Sanjay Seth',
        actor_role: 'owner',
        before_value: null,
      });
      expect(entries[0].at).toEqual(SERVER_NOW);
      expect(entries[0].after_value).toMatchObject({ name: 'Ravi Achari', wastageBp: 90, status: 'active', specialties: ['Temple', 'Kundan'] });
    });
    const karigarAuditsOf = async (code: string) => (await karigarAudits()).filter((e) => e.entity_id === code);

    it('AC2: an empty or blank name is refused with the sentence and nothing is stored', async () => {
      const count = await karigarCount(h);
      for (const name of ['', '   ']) {
        expect(await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, name, phone: '98400 60606' })).toEqual(
          validation('name', KARIGAR_MESSAGES.nameRequired),
        );
      }
      expect(await karigarCount(h)).toBe(count);
    });
    it('AC3: no specialty is refused with the sentence and nothing is stored', async () => {
      const count = await karigarCount(h);
      for (const specialties of [[], ['  ']]) {
        expect(await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, specialties, phone: '98400 60606' })).toEqual(
          validation('specialties', KARIGAR_MESSAGES.specialtyRequired),
        );
      }
      expect(await karigarCount(h)).toBe(count);
    });
    it('AC4: 1.5% and 0.5% are refused with the range sentence, and 0.705% as a validation error', async () => {
      const count = await karigarCount(h);
      for (const wastageBp of [150, 50, 59, 121]) {
        expect(await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, wastageBp, phone: '98400 60606' })).toEqual(
          ruleRefused(KARIGAR_MESSAGES.wastageRange),
        );
      }
      const fractional = await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, wastageBp: 70.5, phone: '98400 60606' });
      expect(fractional.status).toBe(400);
      expect(fractional.body).toMatchObject({ code: 'validation', field: 'wastageBp' });
      expect(await karigarCount(h)).toBe(count);
    });
    it('refuses a phone that is not a mobile number, an email that is not one, and a phone another karigar has', async () => {
      const count = await karigarCount(h);
      const phone = await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, phone: '12345' });
      expect(phone.status).toBe(400);
      expect(phone.body).toMatchObject({ code: 'validation', field: 'phone' });
      const email = await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, email: 'not-an-email', phone: '98400 60606' });
      expect(email.status).toBe(400);
      expect(email.body).toMatchObject({ code: 'validation', field: 'email' });
      expect(await h.asOwner('onboardKarigar', { ...NEW_KARIGAR, phone: '+91 98400 10101' })).toEqual(
        validation('phone', KARIGAR_MESSAGES.phoneTaken),
      );
      expect(await karigarCount(h)).toBe(count);
    });
    it('keeps the shop on the server: a shopId in the body is ignored', async () => {
      const res = await h.asOwner('onboardKarigar', {
        ...NEW_KARIGAR,
        name: 'Shop Check',
        phone: '98400 70707',
        shopId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(200);
      const { rows } = await h.pool.query('select shop_id from karigars where code = $1 and shop_id = $2', [
        res.body.id,
        h.shop.shopId,
      ]);
      expect(rows).toHaveLength(1);
    });
    it('AC6: the same Idempotency-Key twice stores one karigar and answers the same code', async () => {
      const body = { ...NEW_KARIGAR, name: 'Twice Sent', phone: '98400 80808' };
      const first = await h.asOwner('onboardKarigar', body, 'ep16-add-twice');
      const second = await h.asOwner('onboardKarigar', body, 'ep16-add-twice');
      expect(first.status).toBe(200);
      expect(second).toEqual(first);
      const { rows } = await h.pool.query(`select code from karigars where shop_id = $1 and name = 'Twice Sent'`, [h.shop.shopId]);
      expect(rows).toHaveLength(1);
    });
  });

  describe('S4: edit details', () => {
    const details = (over: Record<string, unknown> = {}) => ({
      karigarId: 'KG-01',
      version: 1,
      name: 'Lakshmi Devi',
      phone: '+91 98400 10101',
      email: 'kg-01@example.com',
      workshopLocation: 'Kumbakonam',
      specialties: ['Chettinad', 'Temple'],
      ...over,
    });
    it('AC1: stores the new location and specialty, raises the version by one and leaves the rest', async () => {
      const before = await karigarRow(h, 'KG-01');
      expect(await h.asOwner('updateKarigarDetails', details({ version: before.version }))).toEqual({ status: 200, body: { ok: true } });
      const after = await karigarRow(h, 'KG-01');
      expect(after).toMatchObject({
        workshop_location: 'Kumbakonam',
        specialties: ['Chettinad', 'Temple'],
        version: before.version + 1,
        code: 'KG-01',
        wastage_bp: 70,
        status: 'active',
        name: 'Lakshmi Devi',
      });
      const [entry] = (await karigarAudits()).filter((e) => e.kind === 'karigar_edited' && e.entity_id === 'KG-01');
      expect(entry.before_value).toEqual({ workshopLocation: 'Kanchipuram', specialties: ['Chettinad'] });
      expect(entry.after_value).toEqual({ workshopLocation: 'Kumbakonam', specialties: ['Chettinad', 'Temple'] });
    });
    it('saving what is stored changes nothing: no new version, no entry', async () => {
      const before = await karigarRow(h, 'KG-01');
      const audits = (await auditEntries(h)).length;
      expect(await h.asOwner('updateKarigarDetails', details({ version: before.version }))).toEqual({ status: 200, body: { ok: true } });
      expect(await karigarRow(h, 'KG-01')).toEqual(before);
      expect((await auditEntries(h)).length).toBe(audits);
    });
    it("AC2: a linked karigar's new phone and email also change the user, in one transaction, with both entries", async () => {
      const kg = await karigarRow(h, 'KG-04');
      const user = await userRow(h, h.karigarUserId);
      const res = await h.asOwner(
        'updateKarigarDetails',
        details({ karigarId: 'KG-04', version: kg.version, name: 'Vijay Kumar', phone: '98400 44444', email: 'vijay.new@example.com', workshopLocation: undefined, specialties: ['Antique', 'Temple'] }),
      );
      expect(res).toEqual({ status: 200, body: { ok: true } });
      expect(await karigarRow(h, 'KG-04')).toMatchObject({ phone: '+919840044444', email: 'vijay.new@example.com', version: kg.version + 1 });
      expect(await userRow(h, h.karigarUserId)).toMatchObject({
        phone: '+919840044444',
        email: 'vijay.new@example.com',
        version: user.version + 1,
        status: 'active',
      });
      const kinds = (await auditEntries(h)).filter((e) => e.entity_type === 'user' && e.kind === 'user_edited').length;
      expect(kinds).toBe(1);
      expect((await karigarAudits()).filter((e) => e.kind === 'karigar_edited' && e.entity_id === 'KG-04')).toHaveLength(1);
    });
    it('AC3: a phone another user signs in with is refused and neither record changes', async () => {
      await newUser(h.pool, h.shop, { name: 'Deepak Rao', phone: '+91 98410 22222' });
      const kg = await karigarRow(h, 'KG-04');
      const user = await userRow(h, h.karigarUserId);
      const res = await h.asOwner(
        'updateKarigarDetails',
        details({ karigarId: 'KG-04', version: kg.version, name: 'Vijay Kumar', phone: '98410 22222', email: 'vijay.new@example.com', specialties: ['Antique', 'Temple'] }),
      );
      expect(res).toEqual(validation('phone', USER_MESSAGES.phoneTaken));
      expect(await karigarRow(h, 'KG-04')).toEqual(kg);
      expect(await userRow(h, h.karigarUserId)).toEqual(user);
    });
    it('AC3: a phone another karigar has is refused', async () => {
      const kg = await karigarRow(h, 'KG-01');
      const res = await h.asOwner('updateKarigarDetails', details({ version: kg.version, phone: '98400 20202' }));
      expect(res).toEqual(validation('phone', KARIGAR_MESSAGES.phoneTaken));
      expect(await karigarRow(h, 'KG-01')).toEqual(kg);
    });
    it('AC4: an empty name or no specialty is refused with the sentence and nothing changes', async () => {
      const kg = await karigarRow(h, 'KG-01');
      expect(await h.asOwner('updateKarigarDetails', details({ version: kg.version, name: '  ' }))).toEqual(
        validation('name', KARIGAR_MESSAGES.nameRequired),
      );
      expect(await h.asOwner('updateKarigarDetails', details({ version: kg.version, specialties: [] }))).toEqual(
        validation('specialties', KARIGAR_MESSAGES.specialtyRequired),
      );
      expect(await karigarRow(h, 'KG-01')).toEqual(kg);
    });
    it('AC5: an older version is a conflict and nothing changes', async () => {
      const kg = await karigarRow(h, 'KG-01');
      const res = await h.asOwner('updateKarigarDetails', details({ version: kg.version - 1, name: 'Lakshmi D.' }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('conflict');
      expect(await karigarRow(h, 'KG-01')).toEqual(kg);
    });
    it('AC6: wastageBp, status and id keys are validation refusals', async () => {
      const kg = await karigarRow(h, 'KG-01');
      for (const extra of [{ wastageBp: 100 }, { status: 'deactivated' }, { id: 'KG-09' }]) {
        const res = await h.asOwner('updateKarigarDetails', details({ version: kg.version, name: 'Changed', ...extra }));
        expect(res.status, JSON.stringify(extra)).toBe(400);
        expect(res.body.code).toBe('validation');
      }
      expect(await karigarRow(h, 'KG-01')).toEqual(kg);
    });
    it('an unknown karigar is not_found', async () => {
      expect(await h.asOwner('updateKarigarDetails', details({ karigarId: 'KG-99' }))).toEqual({
        status: 404,
        body: { code: 'not_found', message: 'Karigar KG-99 was not found.' },
      });
    });
  });

  describe('S5: change the allowance', () => {
    it('AC1: moves KG-02 from 0.8% to 1.0%, raises the version and records before and after with the reason', async () => {
      const kg = await karigarRow(h, 'KG-02');
      const res = await h.asOwner('updateKarigarWastage', { karigarId: 'KG-02', version: kg.version, wastageBp: 100, reason: 'Heavier pieces' });
      expect(res).toEqual({ status: 200, body: { ok: true } });
      expect(await karigarRow(h, 'KG-02')).toMatchObject({ wastage_bp: 100, version: kg.version + 1 });
      const [entry] = (await karigarAudits()).filter((e) => e.kind === 'karigar_wastage_changed');
      expect(entry).toMatchObject({ entity_id: 'KG-02', reason: 'Heavier pieces', before_value: { wastageBp: 80 }, after_value: { wastageBp: 100 } });
    });
    it('AC2: 1.25% is refused with the range sentence and the allowance stays', async () => {
      const kg = await karigarRow(h, 'KG-02');
      for (const wastageBp of [125, 59]) {
        expect(await h.asOwner('updateKarigarWastage', { karigarId: 'KG-02', version: kg.version, wastageBp })).toEqual(
          ruleRefused(KARIGAR_MESSAGES.wastageRange),
        );
      }
      expect(await karigarRow(h, 'KG-02')).toEqual(kg);
    });
    it('AC3: the allowance in force now is the new value', async () => {
      expect(await readAllowanceInForce(h.pool, h.shop, 'KG-02')).toBe(100);
    });
    it('AC5: the same value again changes nothing and writes no entry', async () => {
      const kg = await karigarRow(h, 'KG-02');
      const audits = (await auditEntries(h)).length;
      expect(await h.asOwner('updateKarigarWastage', { karigarId: 'KG-02', version: kg.version, wastageBp: 100 })).toEqual({
        status: 200,
        body: { ok: true },
      });
      expect(await karigarRow(h, 'KG-02')).toEqual(kg);
      expect((await auditEntries(h)).length).toBe(audits);
    });
    it('an older version is a conflict', async () => {
      const kg = await karigarRow(h, 'KG-02');
      const res = await h.asOwner('updateKarigarWastage', { karigarId: 'KG-02', version: kg.version - 1, wastageBp: 90 });
      expect(res.status).toBe(409);
      expect((await karigarRow(h, 'KG-02')).wastage_bp).toBe(100);
    });
  });

  describe('S7: deactivate and reactivate', () => {
    const status = (karigarId: string, version: number, to: 'active' | 'deactivated', reason?: string) =>
      h.asOwner('updateKarigarStatus', { karigarId, version, status: to, reason });
    it('AC1: KG-04 with an open job is refused, naming the job, and nothing changes', async () => {
      const kg = await karigarRow(h, 'KG-04');
      const user = await userRow(h, h.karigarUserId);
      expect(await status('KG-04', kg.version, 'deactivated')).toEqual(
        ruleRefused('KG-04 has open jobs: MO-2026-118. Hand them over before deactivating.'),
      );
      expect(await karigarRow(h, 'KG-04')).toEqual(kg);
      expect(await userRow(h, h.karigarUserId)).toEqual(user);
    });
    it('a handed-over job does not stop a deactivation', async () => {
      await h.pool.query(`update karigar_jobs set status = 'handed_over' where shop_id = $1 and code = 'MO-2026-118'`, [h.shop.shopId]);
      const kg = await karigarRow(h, 'KG-04');
      expect((await status('KG-04', kg.version, 'deactivated')).status).toBe(200);
      expect((await karigarRow(h, 'KG-04')).status).toBe('deactivated');
      expect((await status('KG-04', kg.version + 1, 'active')).status).toBe(200);
      await h.pool.query(`update users set status = 'active', deactivated_at = null where id = $1`, [h.karigarUserId]);
      await h.pool.query(`update karigar_jobs set status = 'sent' where shop_id = $1 and code = 'MO-2026-118'`, [h.shop.shopId]);
    });
    it('AC3: deactivates KG-05 and its linked user and ends the sessions, all together, with the entries', async () => {
      const userId = await newUser(h.pool, h.shop, {
        name: 'Ravi Achari',
        role: 'karigar',
        phone: '+919840050505',
        email: 'ravi.achari@example.com',
        karigarId: (await karigarRow(h, 'KG-05')).id,
      });
      const token = await newSession(h.pool, h.shop, userId);
      expect((await h.call('listMyJobs', {}, { session: token })).status).toBe(200);
      const kg = await karigarRow(h, 'KG-05');
      const seen = new Set((await auditEntries(h)).map((e) => e.id));
      expect(await status('KG-05', kg.version, 'deactivated', 'Left the shop')).toEqual({ status: 200, body: { ok: true } });
      expect(await karigarRow(h, 'KG-05')).toMatchObject({ status: 'deactivated', version: kg.version + 1 });
      expect((await karigarRow(h, 'KG-05')).deactivated_at).toEqual(SERVER_NOW);
      expect(await userRow(h, userId)).toMatchObject({ status: 'deactivated' });
      expect((await h.call('listMyJobs', {}, { session: token })).status).toBe(401);
      const { rows } = await h.pool.query(`select count(*)::int as n from sessions where user_id = $1 and ended_at is null`, [userId]);
      expect(rows[0].n).toBe(0);
      const kinds = (await auditEntries(h)).filter((e) => !seen.has(e.id));
      expect(kinds.map((e) => e.kind).sort()).toEqual(['karigar_deactivated', 'sessions_ended', 'user_deactivated']);
      const entry = kinds.find((e) => e.kind === 'karigar_deactivated');
      expect(entry).toMatchObject({ entity_id: 'KG-05', reason: 'Left the shop', before_value: { status: 'active' }, after_value: { status: 'deactivated' } });
    });
    it('refuses to deactivate a deactivated karigar, and to reactivate an active one', async () => {
      const kg05 = await karigarRow(h, 'KG-05');
      expect(await status('KG-05', kg05.version, 'deactivated')).toEqual(ruleRefused(KARIGAR_MESSAGES.alreadyDeactivated));
      const kg01 = await karigarRow(h, 'KG-01');
      expect(await status('KG-01', kg01.version, 'active')).toEqual(ruleRefused(KARIGAR_MESSAGES.alreadyActive));
    });
    it('S4: a deactivated karigar can still be edited', async () => {
      const kg = await karigarRow(h, 'KG-05');
      const res = await h.asOwner('updateKarigarDetails', {
        karigarId: 'KG-05',
        version: kg.version,
        name: 'Ravi Achari',
        phone: '98400 50505',
        email: 'ravi.achari@example.com',
        workshopLocation: 'Erode',
        specialties: ['Temple', 'Kundan'],
      });
      expect(res.status).toBe(200);
      expect((await karigarRow(h, 'KG-05')).workshop_location).toBe('Erode');
    });
    it('AC5: reactivating clears deactivated_at and leaves the user deactivated', async () => {
      const kg = await karigarRow(h, 'KG-05');
      expect(await status('KG-05', kg.version, 'active')).toEqual({ status: 200, body: { ok: true } });
      expect(await karigarRow(h, 'KG-05')).toMatchObject({ status: 'active', deactivated_at: null });
      const { rows } = await h.pool.query(`select status from users where shop_id = $1 and email = 'ravi.achari@example.com'`, [h.shop.shopId]);
      expect(rows[0].status).toBe('deactivated');
      const entry = (await karigarAudits()).find((e) => e.kind === 'karigar_reactivated' && e.entity_id === 'KG-05');
      expect(entry).toMatchObject({ entity_id: 'KG-05', before_value: { status: 'deactivated' }, after_value: { status: 'active' } });
    });
    it('an older version is a conflict', async () => {
      const kg = await karigarRow(h, 'KG-01');
      const res = await status('KG-01', kg.version - 1, 'deactivated');
      expect(res.status).toBe(409);
      expect((await karigarRow(h, 'KG-01')).status).toBe('active');
    });
  });
});
