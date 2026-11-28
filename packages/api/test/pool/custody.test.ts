/**
 * Custody (EP-18-S11): readGoldWithKarigar gives the gold one karigar holds on open jobs (owner
 * names the karigar, a karigar sees only their own); readCustodySummary (owner only) shows where
 * the shop's gold is: pool, with karigars, in parcels, in stock and gone.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addKarigar, addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';
import { addLedgerEntry, addPoolJob, newPoolApiShop, type PoolApiShop } from './pool-api-helpers.js';
describeDb('EP-18-S11 where the gold is', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true });
  });
  afterAll(async () => {
    await h?.close();
  });
  const gold = (session: string, input: Record<string, unknown> = {}) => h.call('readGoldWithKarigar', input, { session });
  /** Lakshmi (KG-LD) holds jobs of 152.4000 g and 34.0000 g. */
  const shopWithJobs = async (): Promise<PoolApiShop> => {
    const s = await newPoolApiShop(h);
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-117', karigarId: s.karigarId, issuedUnits: 1524000 });
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-118', karigarId: s.karigarId, issuedUnits: 340000, status: 'sent' });
    return s;
  };
  it('AC1: the owner reads 186.4000 g across 2 jobs for a karigar with jobs of 152.4000 g and 34.0000 g', async () => {
    const s = await shopWithJobs();
    const res = await gold(s.owner, { karigarId: 'KG-LD' });
    expect(res).toEqual({
      status: 200,
      body: {
        ok: true,
        karigarId: 'KG-LD',
        karigarName: 'Test karigar',
        goldG: '186.4000',
        openJobs: 2,
        jobs: [
          { jobId: 'MO-2026-117', issuedG: '152.4000', returnedG: '0.0000', withKarigarG: '152.4000' },
          { jobId: 'MO-2026-118', issuedG: '34.0000', returnedG: '0.0000', withKarigarG: '34.0000' },
        ],
      },
    });
  });
  it('AC1: a return lowers the gold with the karigar by what was returned', async () => {
    const s = await shopWithJobs();
    await addLedgerEntry(h.pool, s.shop, { kind: 'opening', deltaUnits: 1000000 });
    await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, { session: s.owner });
    const res = await gold(s.owner, { karigarId: 'KG-LD' });
    expect(res.body).toMatchObject({ goldG: '183.9000', openJobs: 2 });
    expect((res.body.jobs as Array<Record<string, string>>)[1]).toEqual({
      jobId: 'MO-2026-118',
      issuedG: '34.0000',
      returnedG: '2.5000',
      withKarigarG: '31.5000',
    });
  });
  it('AC2: a closed job (handed over or settled) no longer counts', async () => {
    const s = await shopWithJobs();
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-100', karigarId: s.karigarId, issuedUnits: 500000, status: 'handed_over' });
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-101', karigarId: s.karigarId, issuedUnits: 500000, status: 'ready', settled: true });
    const res = await gold(s.owner, { karigarId: 'KG-LD' });
    expect(res.body).toMatchObject({ goldG: '186.4000', openJobs: 2 });
    await h.pool.query(`update karigar_jobs set status = 'handed_over' where shop_id = $1 and code = 'MO-2026-117'`, [s.shop.shopId]);
    expect((await gold(s.owner, { karigarId: 'KG-LD' })).body).toMatchObject({ goldG: '34.0000', openJobs: 1 });
  });
  it('AC2: returns above the issue never take the figure below zero', async () => {
    const s = await shopWithJobs();
    await addLedgerEntry(h.pool, s.shop, { kind: 'returned', deltaUnits: 400000, refType: 'job', refId: 'MO-2026-118' });
    const res = await gold(s.owner, { karigarId: 'KG-LD' });
    expect((res.body.jobs as Array<Record<string, string>>)[1].withKarigarG).toBe('0.0000');
  });
  it('AC3: a karigar reads their own figure with no id or with their own code', async () => {
    const s = await shopWithJobs();
    const plain = await gold(s.karigar);
    expect(plain.status).toBe(200);
    expect(plain.body).toMatchObject({ karigarId: 'KG-LD', goldG: '186.4000', openJobs: 2 });
    expect((await gold(s.karigar, { karigarId: 'KG-LD' })).body).toEqual(plain.body);
    expect(JSON.stringify(plain.body)).not.toMatch(/price|INR|pool/i);
  });
  it("AC3: another karigar's code answers not_found to a karigar, as if it did not exist", async () => {
    const s = await shopWithJobs();
    const otherId = await addKarigar(h.pool, s.shop, 'KG-OT');
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-200', karigarId: otherId, issuedUnits: 777000 });
    const res = await gold(s.karigar, { karigarId: 'KG-OT' });
    expect(res).toEqual({ status: 404, body: { code: 'not_found', message: 'Karigar KG-OT was not found.' } });
    const unknown = await gold(s.karigar, { karigarId: 'KG-NOPE' });
    expect(unknown).toEqual({ status: 404, body: { code: 'not_found', message: 'Karigar KG-NOPE was not found.' } });
    expect(JSON.stringify(res.body)).not.toContain('77.7000');
  });
  it('AC3: a karigar whose own karigar has no job reads 0.0000 g, never another karigar\'s figure', async () => {
    const s = await shopWithJobs();
    const otherId = await addKarigar(h.pool, s.shop, 'KG-NJ');
    const userId = await newUser(h.pool, s.shop, { name: 'Ravi Kumar', role: 'karigar', karigarId: otherId });
    const res = await gold(await newSession(h.pool, s.shop, userId));
    expect(res.body).toMatchObject({ karigarId: 'KG-NJ', goldG: '0.0000', openJobs: 0, jobs: [] });
  });
  it('AC4: the owner must say which karigar; an unknown code is not_found; staff are refused', async () => {
    const s = await shopWithJobs();
    expect(await gold(s.owner)).toMatchObject({ status: 400, body: { code: 'validation', field: 'karigarId' } });
    expect(await gold(s.owner, { karigarId: 'KG-NOPE' })).toMatchObject({ status: 404, body: { code: 'not_found' } });
    expect(await gold(s.staff, { karigarId: 'KG-LD' })).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only the owner or the karigar can see the gold with a karigar.' },
    });
  });
  it('AC4: a karigar with no open job reads 0.0000 g across 0 jobs', async () => {
    const s = await newPoolApiShop(h);
    expect((await gold(s.owner, { karigarId: 'KG-LD' })).body).toMatchObject({ goldG: '0.0000', openJobs: 0, jobs: [] });
  });
  describe('readCustodySummary', () => {
    const summary = (session: string) => h.call('readCustodySummary', {}, { session });
    const piece = async (s: PoolApiShop, tag: string, status: string, grossUnits: number, stoneUnits: number) => {
      await addPiece(h.pool, s.shop, tag, { grossUnits, stoneUnits });
      await h.pool.query('update pieces set status = $3 where shop_id = $1 and tag_no = $2', [s.shop.shopId, tag, status]);
    };
    it('AC1: shows the pool, the gold with karigars (total, open jobs, per karigar) and parcel, stock and gone figures', async () => {
      const s = await shopWithJobs();
      await addLedgerEntry(h.pool, s.shop, { kind: 'opening', deltaUnits: 6501800 });
      const second = await addKarigar(h.pool, s.shop, 'KG-04');
      await h.pool.query(`update karigars set name = 'Mohan Das' where id = $1`, [second]);
      await addPoolJob(h.pool, s.shop, { code: 'MO-2026-300', karigarId: second, issuedUnits: 100000 });
      await piece(s, 'TAG-1', 'draft', 500000, 20000);
      await piece(s, 'TAG-2', 'with_owner', 300000, 0);
      await piece(s, 'TAG-3', 'stopped', 100000, 10000);
      await piece(s, 'TAG-4', 'in_stock', 486500, 70600);
      await piece(s, 'TAG-5', 'billed', 200000, 5000);
      await piece(s, 'TAG-6', 'scrapped', 999999, 0);
      const res = await summary(s.owner);
      expect(res).toEqual({
        status: 200,
        body: {
          ok: true,
          poolG: '650.1800',
          withKarigars: {
            totalG: '196.4000',
            openJobs: 3,
            karigars: [
              { karigarId: 'KG-04', name: 'Mohan Das', openJobs: 1, goldG: '10.0000' },
              { karigarId: 'KG-LD', name: 'Test karigar', openJobs: 2, goldG: '186.4000' },
            ],
          },
          inParcelsG: '87.0000',
          inStockG: '41.5900',
          goneG: '19.5000',
        },
      });
    });
    it('AC2: a shop with nothing reads zero everywhere', async () => {
      const s = await newPoolApiShop(h);
      expect((await summary(s.owner)).body).toEqual({
        ok: true,
        poolG: '0.0000',
        withKarigars: { totalG: '0.0000', openJobs: 0, karigars: [] },
        inParcelsG: '0.0000',
        inStockG: '0.0000',
        goneG: '0.0000',
      });
    });
    it('AC3: a closed job leaves the summary', async () => {
      const s = await shopWithJobs();
      await h.pool.query(`update karigar_jobs set settled_at = now() where shop_id = $1 and code = 'MO-2026-117'`, [s.shop.shopId]);
      expect((await summary(s.owner)).body).toMatchObject({ withKarigars: { totalG: '34.0000', openJobs: 1 } });
    });
    it('AC4: staff and karigar are refused', async () => {
      const s = await shopWithJobs();
      const refusal = { code: 'forbidden', message: 'Only the owner can see where the gold is.' };
      expect(await summary(s.staff)).toEqual({ status: 403, body: refusal });
      expect(await summary(s.karigar)).toEqual({ status: 403, body: refusal });
    });
  });
});
