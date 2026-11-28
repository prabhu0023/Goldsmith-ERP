/**
 * Create Return Entry (EP-18-S7): the owner records gold a karigar gave back for a job. The
 * return is capped at the job's issued gold less earlier returns, an unknown job is not found,
 * and gold with the karigar drops by what was returned.
 */
import { POOL_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import {
  addLedgerEntry,
  addPoolJob,
  newPoolApiShop,
  type PoolApiShop,
  poolAudits,
  poolBalance,
  storedEntries,
} from './pool-api-helpers.js';
const OWNER_ONLY = { code: 'forbidden', message: 'Only the owner can record gold returned to the metal pool.' };
describeDb('EP-18-S7 the owner records gold returned for a job', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true, poolSize: 12 });
  });
  afterAll(async () => {
    await h?.close();
  });
  /** A pool of 650.1800 g and job MO-2026-118 with 34.0000 g issued. */
  const shopWithJob = async (): Promise<PoolApiShop> => {
    const s = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, s.shop, { kind: 'opening', deltaUnits: 6501800, note: 'Opening balance' });
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-118', karigarId: s.karigarId, issuedUnits: 340000 });
    return s;
  };
  const withKarigar = async (s: PoolApiShop, jobId = 'MO-2026-118'): Promise<string | undefined> => {
    const res = await h.call('readGoldWithKarigar', { karigarId: s.karigarCode }, { session: s.owner });
    return (res.body.jobs as Array<{ jobId: string; withKarigarG: string }>).find((j) => j.jobId === jobId)?.withKarigarG;
  };
  it('AC1: 2.5000 g back on MO-2026-118 stores a returned entry for the job and raises the balance by 2.5000 g', async () => {
    const s = await shopWithJob();
    const res = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, { session: s.owner });
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'PL-002' } });
    const entries = await storedEntries(h.pool, s.shop);
    expect(entries[1]).toMatchObject({ code: 'PL-002', kind: 'returned', delta_units: 25000, ref_type: 'job', ref_id: 'MO-2026-118' });
    expect(await poolBalance(h.pool, s.shop)).toBe(6526800);
    const balance = await h.call('readPoolBalance', {}, { session: s.owner });
    expect(balance.body.balanceG).toBe('652.6800');
  });
  it('AC2: a further 32.0000 g is refused (31.5000 g is left), a returned amount that fits is accepted', async () => {
    const s = await shopWithJob();
    await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, { session: s.owner });
    const refused = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '32.0000' }, { session: s.owner });
    expect(refused).toEqual({ status: 422, body: { code: 'rule_refused', message: POOL_MESSAGES.returnTooMuch } });
    expect(await poolBalance(h.pool, s.shop)).toBe(6526800);
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(2);
    const rest = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '31.5000' }, { session: s.owner });
    expect(rest.status).toBe(200);
    expect(await withKarigar(s)).toBe('0.0000');
    const more = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '0.0001' }, { session: s.owner });
    expect(more).toMatchObject({ status: 422, body: { code: 'rule_refused' } });
  });
  it('AC2: an unknown job answers not_found and stores nothing', async () => {
    const s = await shopWithJob();
    const res = await h.call('createReturnEntry', { jobId: 'MO-2026-999', amountG: '1.0000' }, { session: s.owner });
    expect(res).toEqual({ status: 404, body: { code: 'not_found', message: 'Job MO-2026-999 was not found.' } });
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
  });
  it('AC3: gold with the karigar for the job reads 34.0000 g, then 31.5000 g after the return', async () => {
    const s = await shopWithJob();
    expect(await withKarigar(s)).toBe('34.0000');
    await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, { session: s.owner });
    expect(await withKarigar(s)).toBe('31.5000');
  });
  it('AC4: writes a pool_return_recorded audit entry that names the job, in integer units', async () => {
    const s = await shopWithJob();
    await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000', note: 'Filings weighed in' }, { session: s.owner });
    const audits = await poolAudits(h.pool, s.shop);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: 'pool_return_recorded',
      entity_type: 'metal_pool',
      entity_id: 'metal-pool',
      reference: 'MO-2026-118',
      reason: 'Filings weighed in',
      actor_role: 'owner',
    });
    expect(audits[0].after_value).toEqual({ balanceG: 6526800, deltaG: 25000 });
  });
  it('AC5: staff and karigar get 403; zero or a missing job or amount is a validation error', async () => {
    const s = await shopWithJob();
    for (const session of [s.staff, s.karigar]) {
      const res = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '2.5000' }, { session });
      expect(res).toEqual({ status: 403, body: OWNER_ONLY });
    }
    const zero = await h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '0.0000' }, { session: s.owner });
    expect(zero).toMatchObject({ status: 400, body: { code: 'validation', field: 'amountG' } });
    const noJob = await h.call('createReturnEntry', { amountG: '1.0000' }, { session: s.owner });
    expect(noJob).toMatchObject({ status: 400, body: { code: 'validation', field: 'jobId' } });
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
  });
  it('plan decision 7: a job that is already handed over still accepts a return within its issued gold', async () => {
    const s = await newPoolApiShop(h);
    await addPoolJob(h.pool, s.shop, { code: 'MO-2026-050', karigarId: s.karigarId, issuedUnits: 100000, status: 'handed_over' });
    const res = await h.call('createReturnEntry', { jobId: 'MO-2026-050', amountG: '4.0000' }, { session: s.owner });
    expect(res.status).toBe(200);
  });
  it('S5: two returns at once on one job cannot both fit: one succeeds and one is refused', async () => {
    const s = await shopWithJob();
    const calls = await Promise.all(
      [1, 2].map(() => h.call('createReturnEntry', { jobId: 'MO-2026-118', amountG: '20.0000' }, { session: s.owner })),
    );
    expect(calls.map((c) => c.status).sort()).toEqual([200, 422]);
    expect(await poolBalance(h.pool, s.shop)).toBe(6501800 + 200000);
  });
});
