import { LIVE_CATALOGUE, METAL_POOL_ENTITY_ID } from '@goldsmith/shared';
import type { LiveEnvelope } from '@goldsmith/shared';
import { PrototypeStoreProvider } from '@prototype';
import { describe, expect, it } from 'vitest';
import { initialState } from '../../data/seed';
import { canOpenRoute } from '../../nav';
import { createActionController } from '../../query/action-controller';
import { createConnectionStore } from '../../query/connection';
import { queriesForEvent } from '../../query/event-query-map';
import { createQueryClient, defineQuery } from '../../query/query-client';
import { fakeApi, fakeTimers, flush, networkFail, ok } from '../../query/test-support';
import { renderAs } from '../../test-support/render-as';
import { Builder } from '../leads/OrderCopyBuilder';
import { MetalPool } from '../stock/MetalPool';
import { MetalPoolPage } from './MetalPoolPage';
import { PoolBalance } from './PoolBalance';
import { createAdjustmentEntry, fmtSignedGrams, gramsFieldError, NO_POOL_FILTERS, poolBalanceQuery, poolListInput } from './pool-queries';
const entry = (over: Record<string, unknown>) => ({
  id: 'PL-001',
  at: '2026-11-02T10:00:00.000Z',
  atLocal: '2026-11-02T15:30:00+05:30',
  kind: 'issued',
  deltaG: '-162.4000',
  note: 'Issued for the Sharma haram',
  refType: 'job',
  refId: 'MO-2026-118',
  actorName: 'Sanjay Seth',
  ...over,
});
const balance = (balanceUnits: number, version = 3) => ({ ok: true, balanceUnits, balanceG: `${Math.trunc(balanceUnits / 10000)}.${String(balanceUnits % 10000).padStart(4, '0')}`, version });
const custody = {
  ok: true,
  poolG: '812.5800',
  withKarigars: { totalG: '186.4000', openJobs: 2, karigars: [{ karigarId: 'KG-04', name: 'Murugan', openJobs: 2, goldG: '186.4000' }] },
  inParcelsG: '12.0000',
  inStockG: '4200.0000',
  goneG: '90.0000',
};
type Answer = ReturnType<typeof ok> | ReturnType<typeof networkFail>;
/** A cache whose reads have been answered (or failed) before the screen renders. */
async function cacheWith(answers: { balance?: Answer; entries?: Answer; custody?: Answer; entries8?: Answer }) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  fake.on('readPoolBalance', () => answers.balance ?? ok(balance(8125800)));
  fake.on('listPoolEntries', (input) => ((input as { pageSize?: number }).pageSize === 8 ? (answers.entries8 ?? answers.entries) : answers.entries) ?? ok({ ok: true, items: [], nextCursor: null, pageSize: 50 }));
  fake.on('readCustodySummary', () => answers.custody ?? ok(custody));
  queries.subscribe(poolBalanceQuery, () => {});
  queries.subscribe(defineQuery({ op: 'listPoolEntries', input: poolListInput(NO_POOL_FILTERS) }), () => {});
  queries.subscribe(defineQuery({ op: 'listPoolEntries', input: poolListInput(NO_POOL_FILTERS, 8) }), () => {});
  queries.subscribe(defineQuery({ op: 'readCustodySummary', input: {} }), () => {});
  await flush();
  return { queries, fake };
}
const page = (items: unknown[]) => ok({ ok: true, items, nextCursor: null, pageSize: 50 });
describe('metal pool screen (EP-18-S9, S10, S11, S12)', () => {
  it('S9 AC3: while the reads are pending the owner sees loading and no empty state', () => {
    const html = renderAs('Sanjay Seth', 'owner', <MetalPoolPage />);
    expect(html).toContain('Loading the metal pool balance…');
    expect(html).toContain('Loading the metal pool ledger…');
    expect(html).toContain('Loading the gold custody summary…');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('No movements yet.');
  });
  it('S9 AC4: a failed balance read says so and offers Try again', async () => {
    const { queries } = await cacheWith({ balance: networkFail() });
    const html = renderAs('Sanjay Seth', 'owner', <PoolBalance />, { queries });
    expect(html).toContain('The metal pool balance could not be loaded.');
    expect(html).toContain('Try again');
  });
  it('S9 AC1, AC2: the balance shows to four decimals and the rows show signed grams, reference, actor and note', async () => {
    const rows = [
      entry({}),
      entry({ id: 'PL-002', kind: 'recovered', deltaG: '78.4000', note: 'Scrap TAG-7701', refType: 'piece', refId: 'TAG-7701', actorName: 'System' }),
    ];
    const { queries } = await cacheWith({ entries: page(rows) });
    const html = renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries });
    expect(html).toContain('812.5800');
    expect(html).toContain('g in the metal pool');
    expect(html).toContain('\u2212162.4000 g');
    expect(html).toContain('+78.4000 g');
    for (const text of ['Job MO-2026-118', 'Piece TAG-7701', 'Sanjay Seth', 'Issued for the Sharma haram', 'Issued to a karigar', 'Recovered from scrap']) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/₹|Rs\.?\s|INR|\$/);
  });
  it('S11: the custody summary shows each place the gold is and the gold with each karigar', async () => {
    const { queries } = await cacheWith({ entries: page([entry({})]) });
    const html = renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries });
    for (const text of ['Where the gold is', '186.4000 g', 'Murugan', 'KG-04', '2 open jobs', '12.0000 g', '4200.0000 g', '90.0000 g']) expect(html).toContain(text);
  });
  it('the owner sees the filters, Load more only when a next page exists, and the return and adjustment forms', async () => {
    const more = ok({ ok: true, items: [entry({})], nextCursor: 'c1', pageSize: 50 });
    const { queries } = await cacheWith({ entries: more });
    const html = renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries });
    for (const text of ['Kind', 'Job', 'Piece', 'From', 'To', 'Load more', 'Gold returned from a job', 'Adjust the pool', 'Record the return', 'Record the adjustment']) expect(html).toContain(text);
    const last = await cacheWith({ entries: page([entry({})]) });
    expect(renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries: last.queries })).not.toContain('Load more');
  });
  it('S2: the opening form shows only while the ledger has no entries', async () => {
    const empty = await cacheWith({ entries: page([]) });
    const emptyHtml = renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries: empty.queries });
    expect(emptyHtml).toContain('Record the opening balance');
    expect(emptyHtml).toContain('No movements yet.');
    const full = await cacheWith({ entries: page([entry({})]) });
    expect(renderAs('Sanjay Seth', 'owner', <MetalPoolPage />, { queries: full.queries })).not.toContain('Record the opening balance');
  });
  it('S7 AC5: staff cannot open the route and see only the owner sentence; the karigar sees none of it', () => {
    expect(canOpenRoute('staff', 'metal-pool')).toBe(false);
    expect(canOpenRoute('karigar', 'metal-pool')).toBe(false);
    expect(canOpenRoute('owner', 'metal-pool')).toBe(true);
    const html = renderAs('Rajesh Verma', 'staff', <MetalPoolPage />);
    expect(html).toContain('Only the owner can read the metal pool ledger.');
    expect(html).not.toContain('Record the return');
    expect(html).not.toContain('Loading the');
  });
  it('the card in Showroom stock reads the same server data and links to the page; staff get the balance only', async () => {
    const { queries } = await cacheWith({ entries8: page([entry({})]) });
    const owner = renderAs('Sanjay Seth', 'owner', <MetalPool />, { queries });
    expect(owner).toContain('812.5800');
    expect(owner).toContain('\u2212162.4000 g');
    expect(owner).toContain('See the whole ledger');
    const staff = renderAs('Rajesh Verma', 'staff', <MetalPool />, { queries });
    expect(staff).toContain('812.5800');
    expect(staff).not.toContain('See the whole ledger');
    expect(staff).not.toContain('Loading the latest');
  });
});
describe('pool helpers', () => {
  it('shows a signed gram figure with U+2212 for minus and a plus sign for plus', () => {
    expect(fmtSignedGrams('-162.4000')).toBe('\u2212162.4000 g');
    expect(fmtSignedGrams('78.4000')).toBe('+78.4000 g');
    expect(fmtSignedGrams('+78.4000')).toBe('+78.4000 g');
  });
  it('builds the ledger input from the filters and leaves out empty ones', () => {
    expect(poolListInput(NO_POOL_FILTERS)).toEqual({});
    expect(poolListInput(NO_POOL_FILTERS, 8)).toEqual({ pageSize: 8 });
    expect(poolListInput({ kind: 'issued', job: ' MO-2026-118 ', piece: '', from: '2026-11-01', to: '2026-11-30' })).toEqual({
      kind: 'issued',
      job: 'MO-2026-118',
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });
  it('checks typed grams without floats: up to four decimals, no zero, a minus sign only for an adjustment', () => {
    expect(gramsFieldError('812.5800', false)).toBeNull();
    expect(gramsFieldError('-0.4000', true)).toBeNull();
    expect(gramsFieldError('-0.4000', false)).not.toBeNull();
    expect(gramsFieldError('0', true)).toBe('The weight cannot be zero.');
    expect(gramsFieldError('1.23456', false)).not.toBeNull();
    expect(gramsFieldError('', false)).not.toBeNull();
    expect(gramsFieldError('abc', true)).not.toBeNull();
  });
});
describe('live events and versions (EP-18-S12)', () => {
  const envelope: LiveEnvelope = {
    seq: 1,
    name: LIVE_CATALOGUE['metal_pool.changed'].name,
    entityType: 'metal_pool',
    entityId: METAL_POOL_ENTITY_ID,
    entityVersion: 4,
    emittedAt: '2026-11-02T10:00:00.000Z',
    audience: { channels: ['role:owner'] },
  };
  it('AC3: metal_pool.changed refetches the balance, the ledger and the custody summary', () => {
    const ops = queriesForEvent(envelope, { userId: 'u-owner' }).map((r) => r.op);
    expect(ops).toEqual(expect.arrayContaining(['readPoolBalance', 'listPoolEntries', 'readCustodySummary']));
  });
  it('AC4: an older balance answer never replaces a newer one', async () => {
    const fake = fakeApi();
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
    const answers = [balance(8125800, 5), balance(9999999, 4)];
    fake.on('readPoolBalance', () => ok(answers.shift()));
    queries.subscribe(poolBalanceQuery, () => {});
    await flush();
    expect(queries.getSnapshot(poolBalanceQuery).data).toMatchObject({ balanceG: '812.5800', version: 5 });
    await queries.refetch(poolBalanceQuery);
    expect(queries.getSnapshot(poolBalanceQuery).data).toMatchObject({ balanceG: '812.5800', version: 5 });
  });
  it('a posting reads the balance, the ledger and the custody summary again', async () => {
    const { queries, fake } = await cacheWith({});
    fake.on('createAdjustmentEntry', () => ok({ ok: true, id: 'PL-009' }));
    const controller = createActionController({ def: createAdjustmentEntry, api: fake.api, queries, newKey: () => 'key-1' });
    expect((await controller.run({ adjustmentDeltaG: '-0.4000', reason: 'Safe recount 2 Nov' })).ok).toBe(true);
    await flush();
    expect(fake.callsOf('readPoolBalance')).toHaveLength(2);
    expect(fake.callsOf('listPoolEntries').length).toBeGreaterThanOrEqual(2);
    expect(fake.callsOf('readCustodySummary')).toHaveLength(2);
  });
});
describe('order copy screen (EP-18-S10)', () => {
  const state = initialState();
  const lead = state.leads.find((l) => l.id === 'LD-2026-208');
  if (!lead) throw new Error('seed lead missing');
  const item = lead.items[0];
  const render = (qty: number, queries: Awaited<ReturnType<typeof cacheWith>>['queries'], connection?: ReturnType<typeof createConnectionStore>) =>
    renderAs(
      'Sanjay Seth',
      'owner',
      <PrototypeStoreProvider>
        <Builder lead={lead} item={{ ...item, qty, approxWeightG: 80 }} />
      </PrototypeStoreProvider>,
      { queries, connection },
    );
  it('AC1: shows the balance of the metal pool from the server', async () => {
    const { queries } = await cacheWith({});
    const html = render(2, queries);
    expect(html).toContain('812.5800 g in the metal pool');
    expect(html).not.toContain('The metal pool holds');
  });
  it('AC2: warns with the balance when the gold entered is above it', async () => {
    const { queries } = await cacheWith({});
    expect(render(12, queries)).toContain('The metal pool holds 812.5800 g.');
  });
  it('AC4: no warning while the balance read has not answered', () => {
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fakeApi().api, now: clock.now, timers: clock.timers });
    expect(render(12, queries)).not.toContain('The metal pool holds');
  });
  it('AC5: sending is disabled offline and says why', async () => {
    const { queries } = await cacheWith({});
    const connection = createConnectionStore({ windowLike: { navigator: { onLine: false }, addEventListener: () => {}, removeEventListener: () => {} } });
    const html = render(2, queries, connection);
    expect(html).toMatch(/<button(?=[^>]*disabled="")[^>]*>Send the order copy</);
    expect(html).toContain(connection.getSnapshot().reason);
  });
});
