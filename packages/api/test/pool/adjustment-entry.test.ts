/**
 * Create Adjustment Entry (EP-18-S8): the owner corrects the pool by a signed amount with a
 * written reason. The reason is required, zero is refused, an adjustment cannot take the pool
 * below zero, and only the owner may post one.
 */
import { POOL_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import { addLedgerEntry, newPoolApiShop, type PoolApiShop, poolAudits, poolBalance, storedEntries } from './pool-api-helpers.js';
const OWNER_ONLY = { code: 'forbidden', message: 'Only the owner can adjust the metal pool.' };
describeDb('EP-18-S8 the owner adjusts the pool', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true });
  });
  afterAll(async () => {
    await h?.close();
  });
  const shopWith = async (units: number): Promise<PoolApiShop> => {
    const s = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, s.shop, { kind: 'opening', deltaUnits: units, note: 'Opening balance' });
    return s;
  };
  it('AC1: -0.4000 g with a reason lowers 650.1800 g to 649.7800 g and stores an adjustment entry', async () => {
    const s = await shopWith(6501800);
    const res = await h.call(
      'createAdjustmentEntry',
      { adjustmentDeltaG: '-0.4000', reason: 'Safe recount 2 Nov' },
      { session: s.owner },
    );
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'PL-002' } });
    expect(await poolBalance(h.pool, s.shop)).toBe(6497800);
    expect((await h.call('readPoolBalance', {}, { session: s.owner })).body.balanceG).toBe('649.7800');
    expect((await storedEntries(h.pool, s.shop))[1]).toMatchObject({
      kind: 'adjustment',
      delta_units: -4000,
      note: 'Safe recount 2 Nov',
      ref_type: null,
      ref_id: null,
    });
  });
  it('AC1: a positive adjustment raises the balance', async () => {
    const s = await shopWith(6501800);
    const res = await h.call('createAdjustmentEntry', { adjustmentDeltaG: '1.5000', reason: 'Found in the scrap tray' }, { session: s.owner });
    expect(res.status).toBe(200);
    expect(await poolBalance(h.pool, s.shop)).toBe(6516800);
  });
  it('AC2: writes a pool_adjusted audit entry with the reason and integer units', async () => {
    const s = await shopWith(6501800);
    await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-0.4000', reason: 'Safe recount 2 Nov' }, { session: s.owner });
    const audits = await poolAudits(h.pool, s.shop);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      kind: 'pool_adjusted',
      entity_type: 'metal_pool',
      entity_id: 'metal-pool',
      reference: 'PL-002',
      reason: 'Safe recount 2 Nov',
      actor_name: 'Sanjay Seth',
      actor_role: 'owner',
    });
    expect(audits[0].before_value).toMatchObject({ balanceG: 6501800 });
    expect(audits[0].after_value).toEqual({ balanceG: 6497800, deltaG: -4000 });
  });
  it("AC3: a reason of 'ok', spaces or nothing is a validation error on reason and stores nothing", async () => {
    const s = await shopWith(6501800);
    for (const body of [
      { adjustmentDeltaG: '-0.4000', reason: 'ok' },
      { adjustmentDeltaG: '-0.4000', reason: '     ' },
      { adjustmentDeltaG: '-0.4000' },
      { adjustmentDeltaG: '-0.4000', reason: 'x'.repeat(501) },
    ]) {
      const res = await h.call('createAdjustmentEntry', body, { session: s.owner });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation', field: 'reason' });
    }
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
    expect(await poolBalance(h.pool, s.shop)).toBe(6501800);
  });
  it('AC3: a zero adjustment is a validation error on adjustmentDeltaG', async () => {
    const s = await shopWith(6501800);
    for (const zero of ['0', '0.0000', '-0.0000']) {
      const res = await h.call('createAdjustmentEntry', { adjustmentDeltaG: zero, reason: 'Recount' }, { session: s.owner });
      expect(res).toMatchObject({ status: 400, body: { code: 'validation', field: 'adjustmentDeltaG' } });
    }
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
  });
  it('AC4: -12.0000 g on a 10.0000 g pool is refused with the issue sentence and changes nothing', async () => {
    const s = await shopWith(100000);
    const res = await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-12.0000', reason: 'Recount' }, { session: s.owner });
    expect(res).toEqual({ status: 422, body: { code: 'pool_insufficient', message: POOL_MESSAGES.insufficient } });
    expect(res.body.message).toBe('The metal pool does not have that much gold to issue.');
    expect(await poolBalance(h.pool, s.shop)).toBe(100000);
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
    expect(await poolAudits(h.pool, s.shop)).toEqual([]);
  });
  it('AC4: an adjustment to exactly zero is allowed', async () => {
    const s = await shopWith(100000);
    const res = await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-10.0000', reason: 'Emptied for audit' }, { session: s.owner });
    expect(res.status).toBe(200);
    expect(await poolBalance(h.pool, s.shop)).toBe(0);
  });
  it('AC5: staff and karigar get 403 and nothing is stored', async () => {
    const s = await shopWith(6501800);
    for (const session of [s.staff, s.karigar]) {
      const res = await h.call('createAdjustmentEntry', { adjustmentDeltaG: '-0.4000', reason: 'Safe recount' }, { session });
      expect(res).toEqual({ status: 403, body: OWNER_ONLY });
    }
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
  });
});
