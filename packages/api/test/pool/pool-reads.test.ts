/**
 * The owner's reads of the pool (EP-18-S9, S10): listPoolEntries pages newest first by cursor with
 * signed four-decimal grams and filters on the server; readPoolBalance is for staff and owner.
 * Tests that count entries use a shop of their own.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import { addLedgerEntry, newPoolApiShop, type PoolApiShop } from './pool-api-helpers.js';
const LEDGER_REFUSED = { code: 'forbidden', message: 'Only the owner can read the metal pool ledger.' };
const KARIGAR_REFUSED = { code: 'forbidden', message: 'A karigar can only work on their own jobs.' };
interface Item {
  id: string;
  at: string;
  atLocal: string;
  kind: string;
  deltaG: string;
  note: string | null;
  refType: string | null;
  refId: string | null;
  actorName: string;
}
describeDb('EP-18-S9 the owner reads the ledger', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true });
  });
  afterAll(async () => {
    await h?.close();
  });
  const list = (s: PoolApiShop, input: Record<string, unknown> = {}, session = s.owner) =>
    h.call('listPoolEntries', input, { session });
  const itemsOf = (res: { body: Record<string, unknown> }) => res.body.items as Item[];
  /** Opening 812.5800 g, then an issue of 162.4000 g for MO-2026-122 and a recovery of 78.4000 g from TAG-7701. */
  const sampleShop = async (): Promise<PoolApiShop> => {
    const s = await newPoolApiShop(h);
    const w = (code: string, at: string, kind: 'opening' | 'issued' | 'recovered', deltaUnits: number, ref?: [string, string]) =>
      addLedgerEntry(h.pool, s.shop, {
        code,
        at,
        kind,
        deltaUnits,
        note: `${kind} note`,
        refType: ref ? (ref[0] as 'job' | 'piece') : null,
        refId: ref ? ref[1] : null,
      });
    await w('PL-001', '2026-11-01T04:00:00Z', 'opening', 8125800);
    await w('PL-002', '2026-11-02T04:00:00Z', 'issued', -1624000, ['job', 'MO-2026-122']);
    await w('PL-003', '2026-11-03T04:00:00Z', 'recovered', 784000, ['piece', 'TAG-7701']);
    return s;
  };
  it('AC1: lists newest first with signed four-decimal grams, the reference, the actor and shop time', async () => {
    const s = await sampleShop();
    const res = await list(s);
    expect(res.status).toBe(200);
    expect(itemsOf(res).map((i) => [i.id, i.kind, i.deltaG])).toEqual([
      ['PL-003', 'recovered', '78.4000'],
      ['PL-002', 'issued', '-162.4000'],
      ['PL-001', 'opening', '812.5800'],
    ]);
    expect(itemsOf(res)[1]).toEqual({
      id: 'PL-002',
      at: '2026-11-02T04:00:00.000Z',
      atLocal: '2026-11-02T09:30:00.000+05:30',
      kind: 'issued',
      deltaG: '-162.4000',
      note: 'issued note',
      refType: 'job',
      refId: 'MO-2026-122',
      actorName: 'Sanjay Seth',
    });
    expect(res.body).toMatchObject({ nextCursor: null, pageSize: 50 });
    expect(JSON.stringify(res.body)).not.toMatch(/price|amountINR|rupee|\bINR\b/i);
  });
  it('AC2: filters by kind, job and piece', async () => {
    const s = await sampleShop();
    expect(itemsOf(await list(s, { kind: 'issued' })).map((i) => i.id)).toEqual(['PL-002']);
    expect(itemsOf(await list(s, { job: 'MO-2026-122' })).map((i) => i.id)).toEqual(['PL-002']);
    expect(itemsOf(await list(s, { piece: 'TAG-7701' })).map((i) => i.id)).toEqual(['PL-003']);
    expect(itemsOf(await list(s, { job: 'TAG-7701' }))).toEqual([]);
    expect(itemsOf(await list(s, { kind: 'issued', piece: 'TAG-7701' }))).toEqual([]);
  });
  it('AC3: filters by Asia/Kolkata day: an entry at 20:00 UTC on 31 Oct is on 1 Nov', async () => {
    const s = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, s.shop, { code: 'PL-001', at: '2026-10-31T20:00:00Z', kind: 'opening', deltaUnits: 1000 });
    await addLedgerEntry(h.pool, s.shop, { code: 'PL-002', at: '2026-10-31T17:00:00Z', kind: 'adjustment', deltaUnits: 1000 });
    expect(itemsOf(await list(s, { from: '2026-11-01', to: '2026-11-01' })).map((i) => i.id)).toEqual(['PL-001']);
    expect(itemsOf(await list(s, { from: '2026-10-31', to: '2026-10-31' })).map((i) => i.id)).toEqual(['PL-002']);
    expect(itemsOf(await list(s, { to: '2026-10-31' })).map((i) => i.id)).toEqual(['PL-002']);
    expect(itemsOf(await list(s, { from: '2026-11-02' }))).toEqual([]);
    const backwards = await list(s, { from: '2026-11-02', to: '2026-11-01' });
    expect(backwards).toMatchObject({ status: 400, body: { code: 'validation', field: 'to' } });
  });
  it('AC4: 120 entries come in pages of 50, 50 and 20 by cursor, newest first, each once, filters kept', async () => {
    const s = await newPoolApiShop(h);
    const row = await h.pool.query<{ id: string }>('insert into metal_pools (shop_id, balance_units) values ($1, 120) returning id', [
      s.shop.shopId,
    ]);
    await h.pool.query(
      `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units, actor_name)
       select $1, $2, $3, 'PL-' || lpad(n::text, 3, '0'), timestamptz '2026-11-01 00:00:00+00' + (n / 2) * interval '1 minute',
              'adjustment', 1, 'Seed'
         from generate_series(1, 120) n`,
      [s.shop.shopId, s.shop.locationId, row.rows[0].id],
    );
    const pages: Item[][] = [];
    let cursor: string | undefined;
    do {
      const res = await list(s, { kind: 'adjustment', ...(cursor ? { cursor } : {}) });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      pages.push(itemsOf(res));
      cursor = (res.body.nextCursor as string | null) ?? undefined;
    } while (cursor);
    expect(pages.map((p) => p.length)).toEqual([50, 50, 20]);
    const ids = pages.flat().map((i) => i.id);
    expect(new Set(ids).size).toBe(120);
    const times = pages.flat().map((i) => i.at);
    expect([...times].sort().reverse()).toEqual(times);
    const small = await list(s, { pageSize: 7 });
    expect(itemsOf(small)).toHaveLength(7);
    expect(small.body.pageSize).toBe(7);
  });
  it('AC4: a malformed cursor, a page size of 0 and an unknown kind are validation errors', async () => {
    const s = await sampleShop();
    for (const body of [{ cursor: 'not-a-cursor' }, { pageSize: 0 }, { kind: 'melted' }, { from: 'yesterday' }]) {
      const res = await list(s, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe('validation');
    }
  });
  it('AC5: staff and karigar are refused the ledger', async () => {
    const s = await sampleShop();
    expect(await list(s, {}, s.staff)).toEqual({ status: 403, body: LEDGER_REFUSED });
    expect(await list(s, {}, s.karigar)).toEqual({ status: 403, body: LEDGER_REFUSED });
  });
  it("AC5: another shop's entries never show", async () => {
    const mine = await sampleShop();
    const other = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, other.shop, { code: 'PL-001', kind: 'opening', deltaUnits: 5 });
    expect(itemsOf(await list(other)).map((i) => i.deltaG)).toEqual(['0.0005']);
    expect(itemsOf(await list(mine))).toHaveLength(3);
  });
});
describeDb('EP-18-S10 reading the pool balance', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ production: true });
  });
  afterAll(async () => {
    await h?.close();
  });
  it('AC1: staff and owner read the balance as units and grams, with the pool version', async () => {
    const s = await newPoolApiShop(h);
    await addLedgerEntry(h.pool, s.shop, { kind: 'opening', deltaUnits: 8125800 });
    for (const session of [s.staff, s.owner]) {
      const res = await h.call('readPoolBalance', {}, { session });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, balanceUnits: 8125800, balanceG: '812.5800' });
      expect(res.body.version).toBeGreaterThanOrEqual(1);
    }
  });
  it('AC2: a shop with no pool yet reads 0.0000 g at version 0', async () => {
    const s = await newPoolApiShop(h);
    const res = await h.call('readPoolBalance', {}, { session: s.staff });
    expect(res).toEqual({ status: 200, body: { ok: true, balanceUnits: 0, balanceG: '0.0000', version: 0 } });
  });
  it('AC3: the version moves with every posting', async () => {
    const s = await newPoolApiShop(h);
    await h.call('createOpeningEntry', { amountG: '10.0000' }, { session: s.owner });
    const first = (await h.call('readPoolBalance', {}, { session: s.owner })).body.version as number;
    await h.call('createAdjustmentEntry', { adjustmentDeltaG: '1.0000', reason: 'Recount' }, { session: s.owner });
    const second = (await h.call('readPoolBalance', {}, { session: s.owner })).body.version as number;
    expect(second).toBe(first + 1);
  });
  it('AC4: a karigar is refused', async () => {
    const s = await newPoolApiShop(h);
    expect(await h.call('readPoolBalance', {}, { session: s.karigar })).toEqual({ status: 403, body: KARIGAR_REFUSED });
  });
});
