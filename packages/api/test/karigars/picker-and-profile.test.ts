/** The karigar picker (EP-16-S8) and a karigar's own profile (EP-16-S11, S12). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { readMyKarigarProfile } from '../../src/karigars/read-my-karigar-profile.js';
import {
  addFinishedJob,
  FORBIDDEN_KEY,
  type KarigarHarness,
  keysOf,
  seedKarigar,
  startKarigarHarness,
} from './karigar-test-helpers.js';
describeDb('karigar picker and own profile (EP-16-S8, S11, S12)', () => {
  let h: KarigarHarness;
  beforeAll(async () => {
    h = await startKarigarHarness();
    await seedKarigar(h, 'KG-03', 'Old Hand', '+919840030303', 70, ['Antique'], null, 'deactivated');
  });
  afterAll(async () => {
    await h?.close();
  });
  describe('picker', () => {
    const picker = (body: Record<string, unknown> = {}, session = h.session) => h.call('listKarigarPicker', body, { session });
    it('AC1: staff get only the active karigars, with id, name, specialties and wastageBp', async () => {
      const res = await picker();
      expect(res).toEqual({
        status: 200,
        body: {
          ok: true,
          items: [
            { id: 'KG-01', name: 'Lakshmi Devi', specialties: ['Chettinad'], wastageBp: 70 },
            { id: 'KG-02', name: 'Mahesh Soni', specialties: ['Kundan', 'Polki'], wastageBp: 80 },
            { id: 'KG-04', name: 'Vijay Kumar', specialties: ['Antique', 'Temple'], wastageBp: 80 },
          ],
          nextCursor: null,
          pageSize: 50,
        },
      });
    });
    it('the owner may use it too, and it pages by code', async () => {
      const first = await picker({ pageSize: 2 }, h.owner);
      expect((first.body.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['KG-01', 'KG-02']);
      const second = await picker({ pageSize: 2, cursor: first.body.nextCursor }, h.owner);
      expect((second.body.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['KG-04']);
      expect(second.body.nextCursor).toBeNull();
    });
    it('carries no phone, location, scorecard, rating or money field', async () => {
      const keys = new Set(keysOf((await picker()).body));
      for (const key of ['phone', 'email', 'workshopLocation', 'metalLossBp', 'openJobs', 'goldWithG', 'finishedJobs']) {
        expect(keys.has(key), key).toBe(false);
      }
      expect([...keys].filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    });
    it('AC2: a karigar session answers 403', async () => {
      expect(await picker({}, h.karigarSession)).toEqual({
        status: 403,
        body: { code: 'forbidden', message: 'A karigar can only work on their own jobs.' },
      });
    });
    it('a karigar that is deactivated later drops out of the picker', async () => {
      await h.pool.query("update karigars set status = 'deactivated' where shop_id = $1 and code = 'KG-02'", [h.shop.shopId]);
      expect(((await picker()).body.items as Array<{ id: string }>).map((i) => i.id)).toEqual(['KG-01', 'KG-04']);
      await h.pool.query("update karigars set status = 'active' where shop_id = $1 and code = 'KG-02'", [h.shop.shopId]);
    });
  });
  describe('own profile', () => {
    const profile = (session = h.karigarSession, body: Record<string, unknown> = {}) =>
      h.call('readMyKarigarProfile', body, { session });
    it('S12 AC1: the karigar linked to KG-04 gets only that record', async () => {
      await addFinishedJob(h, { code: 'MO-2026-701', karigarId: h.ids['KG-04'], issuedUnits: 1_000_000, lossUnits: 5_000, settledAt: '2026-11-05T10:00:00Z' });
      expect(await profile()).toEqual({
        status: 200,
        body: {
          ok: true,
          profile: {
            id: 'KG-04',
            name: 'Vijay Kumar',
            phone: '+919840040404',
            workshopLocation: null,
            specialties: ['Antique', 'Temple'],
            wastageBp: 80,
            finishedJobs: 1,
          },
        },
      });
    });
    it('S12 AC2: it takes no id, so asking for another karigar changes nothing', async () => {
      const res = await profile(h.karigarSession, { karigarId: 'KG-01', id: 'KG-01' });
      expect((res.body.profile as { id: string }).id).toBe('KG-04');
    });
    it('S12 AC4: no scorecard figure, rating, money or language', async () => {
      const keys = keysOf((await profile()).body);
      expect(keys.filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
      for (const key of ['metalLossBp', 'daysLate', 'lastGapsG', 'email', 'openJobs', 'goldWithG']) expect(keys).not.toContain(key);
    });
    it('S12 AC5: a caller whose user has no karigar record gets profile null, not an error', async () => {
      // The table makes every karigar user carry a record and a session ends when the role changes, so
      // the empty answer is proved on the handler with a user who has none.
      const ctx = { shop: h.shop, by: { id: h.userId, name: 'Rajesh Verma', role: 'karigar' }, at: new Date() };
      const result = await readMyKarigarProfile({ client: h.pool } as never, ctx as never, {});
      expect(result).toEqual({ ok: true, profile: null });
    });
    it('staff and owner are refused', async () => {
      const expected = { status: 403, body: { code: 'forbidden', message: 'Only a karigar can read their own profile.' } };
      expect(await profile(h.session)).toEqual(expected);
      expect(await profile(h.owner)).toEqual(expected);
    });
  });
});
