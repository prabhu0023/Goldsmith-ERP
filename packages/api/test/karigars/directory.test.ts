/** The owner's karigar directory (EP-16-S9). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';
import {
  addFinishedJob,
  addJob,
  FORBIDDEN_KEY,
  type KarigarHarness,
  keysOf,
  seedKarigar,
  startKarigarHarness,
} from './karigar-test-helpers.js';
interface Item {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  workshopLocation: string | null;
  specialties: string[];
  wastageBp: number;
  status: string;
  version: number;
  accountStatus: string;
  openJobs: number;
  goldWithG: string;
  metalLossBp: number | null;
  finishedJobs: number;
}
describeDb('karigar directory (EP-16-S9)', () => {
  let h: KarigarHarness;
  const list = (body: Record<string, unknown> = {}, session = h.owner) => h.call('listKarigars', body, { session });
  const items = async (body: Record<string, unknown> = {}) => (await list(body)).body.items as Item[];
  beforeAll(async () => {
    h = await startKarigarHarness();
    // Loss over a 100 g issue: Mahesh 142 bp (allowance 80, +62), Vijay 75 (-5), Lakshmi 60 (allowance 70, -10).
    const finish = (code: string, karigarId: string, lossUnits: number) =>
      addFinishedJob(h, { code, karigarId, issuedUnits: 1_000_000, lossUnits, settledAt: '2026-11-05T10:00:00Z' });
    await finish('MO-2026-401', h.ids['KG-02'], 14_200);
    await finish('MO-2026-402', h.ids['KG-04'], 7_500);
    await finish('MO-2026-403', h.ids['KG-01'], 6_000);
    await addJob(h, { code: 'MO-2026-404', karigarId: h.ids['KG-01'], issuedUnits: 1_600_000, status: 'ready' });
    await seedKarigar(h, 'KG-05', 'Anil Verma', '+919840050505', 90, ['Kundan'], 'Salem');
    const gone = await seedKarigar(h, 'KG-06', 'Old Hand', '+919840060606', 70, ['Antique'], null, 'deactivated');
    await addFinishedJob(h, { code: 'MO-2026-405', karigarId: gone, issuedUnits: 1_000_000, lossUnits: 50_000, settledAt: '2026-11-05T10:00:00Z' });
  });
  afterAll(async () => {
    await h?.close();
  });
  it('AC1: orders Mahesh (+62 bp), Vijay (-5), Lakshmi (-10), then no figure, then deactivated', async () => {
    const res = await items();
    expect(res.map((i) => `${i.name} ${i.metalLossBp}`)).toEqual([
      'Mahesh Soni 142',
      'Vijay Kumar 75',
      'Lakshmi Devi 60',
      'Anil Verma null',
      'Old Hand 500',
    ]);
    expect(res.map((i) => i.status)).toEqual(['active', 'active', 'active', 'active', 'deactivated']);
  });
  it('AC2: each card has the record, open jobs, gold with the karigar and the account status', async () => {
    const byId = Object.fromEntries((await items()).map((i) => [i.id, i]));
    expect(byId['KG-01']).toEqual({
      id: 'KG-01',
      name: 'Lakshmi Devi',
      phone: '+919840010101',
      email: 'kg-01@example.com',
      workshopLocation: 'Kanchipuram',
      specialties: ['Chettinad'],
      wastageBp: 70,
      status: 'active',
      version: 1,
      accountStatus: 'none',
      openJobs: 1,
      goldWithG: '160.0000',
      metalLossBp: 60,
      finishedJobs: 1,
    });
    expect(byId['KG-02']).toMatchObject({ specialties: ['Kundan', 'Polki'], openJobs: 0, goldWithG: '0.0000', accountStatus: 'none' });
    expect(byId['KG-04']).toMatchObject({ accountStatus: 'active', openJobs: 1, goldWithG: '0.0001' });
  });
  it('shows a pending account, and a deactivated account when no live one remains', async () => {
    const karigarId = (await h.pool.query("select id from karigars where code = 'KG-05' and shop_id = $1", [h.shop.shopId])).rows[0].id;
    const userId = await newUser(h.pool, h.shop, {
      name: 'Anil Verma',
      role: 'karigar',
      phone: '+919840050505',
      status: 'pending_activation',
      karigarId,
    });
    const anil = async () => (await items()).find((i) => i.id === 'KG-05');
    expect((await anil())?.accountStatus).toBe('pending_activation');
    await h.pool.query("update users set status = 'deactivated' where id = $1", [userId]);
    expect((await anil())?.accountStatus).toBe('deactivated');
  });
  it('AC3: a karigar with no finished job shows no figure ("None yet")', async () => {
    const anil = (await items()).find((i) => i.id === 'KG-05');
    expect(anil).toMatchObject({ metalLossBp: null, finishedJobs: 0 });
  });
  it('AC4: no rating, price or money field', async () => {
    const body = (await list()).body;
    expect(keysOf(body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
  });
  it('pages in the same order with a cursor that carries the offset', async () => {
    const first = await list({ pageSize: 2 });
    expect((first.body.items as Item[]).map((i) => i.id)).toEqual(['KG-02', 'KG-04']);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await list({ pageSize: 2, cursor: first.body.nextCursor });
    expect((second.body.items as Item[]).map((i) => i.id)).toEqual(['KG-01', 'KG-05']);
    const third = await list({ pageSize: 2, cursor: second.body.nextCursor });
    expect((third.body.items as Item[]).map((i) => i.id)).toEqual(['KG-06']);
    expect(third.body.nextCursor).toBeNull();
    expect(await list({ cursor: 'not-a-cursor' })).toMatchObject({ status: 400, body: { code: 'validation', field: 'cursor' } });
  });
  it('AC5: staff and a karigar get the owner-only sentence', async () => {
    const expected = { status: 403, body: { code: 'forbidden', message: 'Only the owner can see the karigar directory.' } };
    expect(await list({}, h.session)).toEqual(expected);
    expect(await list({}, h.karigarSession)).toEqual(expected);
  });
  describe('AC6: fifty karigars with jobs', () => {
    it('load in under 2000 ms', async () => {
      for (let n = 20; n < 70; n++) {
        const id = await seedKarigar(h, `KG-${n}`, `Karigar ${n}`, `+9198400${String(n).padStart(5, '0')}`, 80, ['Temple'], null);
        await addFinishedJob(h, { code: `MO-2026-5${n}`, karigarId: id, issuedUnits: 1_000_000, lossUnits: n * 100, settledAt: '2026-11-05T10:00:00Z' });
        await addJob(h, { code: `MO-2026-6${n}`, karigarId: id, issuedUnits: 500_000 });
      }
      const started = performance.now();
      const res = await list({ pageSize: 60 });
      const elapsed = performance.now() - started;
      expect(res.status).toBe(200);
      expect((res.body.items as Item[]).length).toBe(55);
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
