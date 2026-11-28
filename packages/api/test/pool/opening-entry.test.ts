/**
 * Create Opening Entry (EP-18-S2): the owner records the pool's starting balance once; a second
 * attempt is refused with a sentence that points to an adjustment; staff and karigar are refused;
 * the same Idempotency-Key stores one entry.
 */
import { POOL_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import { addLedgerEntry, newPoolApiShop, poolAudits, poolBalance, storedEntries } from './pool-api-helpers.js';
const OWNER_ONLY = { code: 'forbidden', message: 'Only the owner can record the opening balance of the metal pool.' };
describeDb('EP-18-S2 the owner records the opening balance', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true });
  });
  afterAll(async () => {
    await h?.close();
  });
  it('AC1: 812.5800 g is stored as one opening entry of delta 8125800 and the balance reads 812.5800 g', async () => {
    const s = await newPoolApiShop(h);
    const res = await h.call('createOpeningEntry', { amountG: '812.5800', note: 'Safe count, 1 Nov' }, { session: s.owner });
    expect(res).toEqual({ status: 200, body: { ok: true, id: 'PL-001' } });
    expect(await storedEntries(h.pool, s.shop)).toEqual([
      {
        code: 'PL-001',
        kind: 'opening',
        delta_units: 8125800,
        note: 'Safe count, 1 Nov',
        ref_type: null,
        ref_id: null,
        actor_name: 'Sanjay Seth',
      },
    ]);
    expect(await poolBalance(h.pool, s.shop)).toBe(8125800);
    const balance = await h.call('readPoolBalance', {}, { session: s.owner });
    expect(balance.body).toMatchObject({ ok: true, balanceUnits: 8125800, balanceG: '812.5800' });
  });
  it('AC1: writes a pool_opening_recorded audit entry with integer units and the note as reason', async () => {
    const s = await newPoolApiShop(h);
    await h.call('createOpeningEntry', { amountG: '812.5800', note: 'Safe count, 1 Nov' }, { session: s.owner });
    const [audit, ...rest] = await poolAudits(h.pool, s.shop);
    expect(rest).toEqual([]);
    expect(audit).toMatchObject({
      kind: 'pool_opening_recorded',
      entity_type: 'metal_pool',
      entity_id: 'metal-pool',
      reference: 'PL-001',
      reason: 'Safe count, 1 Nov',
      actor_name: 'Sanjay Seth',
      actor_role: 'owner',
    });
    expect(audit.before_value).toMatchObject({ balanceG: 0 });
    expect(audit.after_value).toEqual({ balanceG: 8125800, deltaG: 8125800 });
  });
  it('AC2: a second attempt answers 422 opening_exists with a sentence that points to an adjustment', async () => {
    const s = await newPoolApiShop(h);
    expect((await h.call('createOpeningEntry', { amountG: '812.5800' }, { session: s.owner })).status).toBe(200);
    const second = await h.call('createOpeningEntry', { amountG: '10.0000' }, { session: s.owner });
    expect(second).toEqual({ status: 422, body: { code: 'opening_exists', message: POOL_MESSAGES.openingExists } });
    expect(second.body.message).toMatch(/adjustment/);
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
    expect(await poolBalance(h.pool, s.shop)).toBe(8125800);
    expect(await poolAudits(h.pool, s.shop)).toHaveLength(1);
  });
  it('AC2: any earlier entry, not only an opening one, refuses the opening balance', async () => {
    const s = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, s.shop, { kind: 'adjustment', deltaUnits: 1000, note: 'Found gold' });
    const res = await h.call('createOpeningEntry', { amountG: '5.0000' }, { session: s.owner });
    expect(res).toMatchObject({ status: 422, body: { code: 'opening_exists' } });
  });
  it('AC3: staff and karigar get 403 and nothing is stored', async () => {
    const s = await newPoolApiShop(h);
    for (const session of [s.staff, s.karigar]) {
      const res = await h.call('createOpeningEntry', { amountG: '812.5800' }, { session });
      expect(res).toEqual({ status: 403, body: OWNER_ONLY });
    }
    expect(await storedEntries(h.pool, s.shop)).toEqual([]);
  });
  it('AC4: the same Idempotency-Key sent twice stores one entry and answers the same id', async () => {
    const s = await newPoolApiShop(h);
    const first = await h.call('createOpeningEntry', { amountG: '812.5800' }, { session: s.owner, idempotencyKey: 'open-1' });
    const again = await h.call('createOpeningEntry', { amountG: '812.5800' }, { session: s.owner, idempotencyKey: 'open-1' });
    expect(first).toEqual({ status: 200, body: { ok: true, id: 'PL-001' } });
    expect(again).toEqual(first);
    expect(await storedEntries(h.pool, s.shop)).toHaveLength(1);
    expect(await poolBalance(h.pool, s.shop)).toBe(8125800);
  });
  it('AC5: zero, negative, over-precise or missing amounts are validation errors on amountG', async () => {
    const s = await newPoolApiShop(h);
    for (const body of [{ amountG: '0.0000' }, { amountG: '-5.0000' }, { amountG: '1.23456' }, { amountG: 812.58 }, {}]) {
      const res = await h.call('createOpeningEntry', body, { session: s.owner });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation', field: 'amountG' });
    }
    expect(await storedEntries(h.pool, s.shop)).toEqual([]);
  });
});
