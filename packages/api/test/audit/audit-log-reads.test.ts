/**
 * The owner's security log over the production app (EP-06-S1 AC3, S6 AC4, S8 AC5, S9 to S12):
 * listAuditEntries pages newest first by cursor with the filters on the server, readAuditEntry
 * shows one entry, and nobody but the owner reads either. Tests that count entries use a shop of
 * their own, so entries written by other tests never show up.
 */
import { randomUUID } from 'node:crypto';
import { authContract, contract } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { type AuditWrite, appendAudit, SYSTEM_ACTORS } from '../../src/audit/audit-writer.js';
import { describeDb, newShop, type TestShop } from '../db/db-test-helpers.js';
import { newSession, newUser } from '../support/api-harness.js';
import { startUsersHarness, UNAUTHENTICATED, type UsersHarness } from '../users/user-test-helpers.js';
const REFUSED = { status: 403, body: { code: 'forbidden', message: 'Only the owner can read the security log.' } };
interface OwnedShop {
  shop: TestShop;
  ownerId: string;
  /** Sanjay Seth's session in this shop. */
  owner: string;
}
type Body = Record<string, unknown>;
interface Item {
  id: string;
  at: string;
  kind: string;
  entityId: string | null;
  ref: string | null;
  actorName: string;
  actorRole: string;
  summary: string | null;
}
describeDb('the owner reads the security log (EP-06-S9 to S12)', () => {
  let h: UsersHarness;
  let karigar: string;
  beforeAll(async () => {
    h = await startUsersHarness();
    const karigarId = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar' });
    karigar = await newSession(h.pool, h.shop, karigarId);
  });
  afterAll(async () => {
    await h?.close();
  });
  /** A new shop with its owner Sanjay Seth signed in. */
  const ownedShop = async (): Promise<OwnedShop> => {
    const shop = await newShop(h.pool);
    const ownerId = await newUser(h.pool, shop, { name: 'Sanjay Seth', role: 'owner' });
    return { shop, ownerId, owner: await newSession(h.pool, shop, ownerId) };
  };
  const ownerActor = (s: OwnedShop) => ({ kind: 'user', id: s.ownerId, name: 'Sanjay Seth', role: 'owner' }) as const;
  /** Write one entry in `shop` as the database owner; returns its id. */
  const write = async (shop: TestShop, entry: Omit<AuditWrite, 'shopId'>): Promise<string> =>
    (await appendAudit(h.pool, { shopId: shop.shopId, ...entry })).id;
  const list = (session: string, input: Body = {}) => h.call('listAuditEntries', input, { session });
  const read = (session: string, id: string) => h.call('readAuditEntry', { id }, { session });
  const itemsOf = (res: { body: Body }) => res.body.items as Item[];
  /** Every page of a list, following nextCursor. */
  const allPages = async (session: string, input: Body): Promise<Item[][]> => {
    const pages: Item[][] = [];
    let cursor: string | undefined;
    do {
      const res = await list(session, { ...input, ...(cursor ? { cursor } : {}) });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      pages.push(itemsOf(res));
      cursor = (res.body.nextCursor as string | null) ?? undefined;
    } while (cursor);
    return pages;
  };
  const rowOf = async (id: string) =>
    (await h.pool.query('select row_to_json(a)::text as row from audit_entries a where id = $1', [id])).rows[0]?.row;
  it('S1 AC3: there is no operation that changes or removes an entry', async () => {
    const s = await ownedShop();
    const id = await write(s.shop, {
      at: new Date('2026-11-22T09:02:00Z'),
      actor: ownerActor(s),
      kind: 'stock_out',
      entityId: 'SO-2026-001',
      summary: 'Stock-out of TAG-8841',
    });
    const before = await rowOf(id);
    for (const op of ['updateAuditEntry', 'deleteAuditEntry']) {
      const res = await h.call(op, { id, summary: 'changed' }, { session: s.owner });
      expect(res.status, op).toBe(404);
      expect(res.body.code, op).toBe('not_found');
    }
    expect(await rowOf(id)).toBe(before);
    const auditOps = [...Object.keys(contract), ...Object.keys(authContract)].filter((op) => /audit/i.test(op));
    expect(auditOps.sort()).toEqual(['listAuditEntries', 'readAuditEntry']);
  });
  it('S9 AC1, AC2: entries come newest first with the shop time, action, ref and actor', async () => {
    const s = await ownedShop();
    await write(s.shop, {
      at: new Date('2026-11-22T08:00:00Z'),
      actor: ownerActor(s),
      kind: 'stock_out',
      entityId: 'SO-2026-001',
      summary: 'Stock-out of TAG-1001',
    });
    const id = await write(s.shop, {
      at: new Date('2026-11-22T09:02:00Z'),
      actor: ownerActor(s),
      kind: 'edit_applied',
      entityId: 'ED-2026-014',
      ref: 'TAG-8841',
      summary: 'Edit applied to TAG-8841',
      tokenReference: 'TK-2026-0042',
    });
    const res = await list(s.owner);
    expect(res.status).toBe(200);
    expect(itemsOf(res).map((i) => i.kind)).toEqual(['edit_applied', 'stock_out']);
    expect(itemsOf(res)[0]).toEqual({
      id,
      at: '2026-11-22T09:02:00.000Z',
      atLocal: '2026-11-22T14:32:00.000+05:30',
      kind: 'edit_applied',
      entityType: 'edit',
      entityId: 'ED-2026-014',
      ref: 'TAG-8841',
      actorId: s.ownerId,
      actorName: 'Sanjay Seth',
      actorRole: 'owner',
      summary: 'Edit applied to TAG-8841',
      tokenUsed: true,
    });
    expect(res.body).toMatchObject({ ok: true, nextCursor: null, pageSize: 50 });
  });
  it('S9 AC3: three pages by cursor have every entry once, in order', async () => {
    const s = await ownedShop();
    const base = Date.parse('2026-11-01T04:30:00Z');
    for (let i = 0; i < 7; i++) {
      // Entries 3 and 4 share their time: the id breaks the tie.
      const at = new Date(base + (i === 4 ? 3 : i) * 60_000);
      await write(s.shop, { at, actor: ownerActor(s), kind: 'stock_out', entityId: `SO-2026-00${i}`, summary: `Entry ${i}` });
    }
    const pages = await allPages(s.owner, { pageSize: 3 });
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
    const { rows } = await h.pool.query<{ id: string }>(
      'select id from audit_entries where shop_id = $1 order by at desc, id desc',
      [s.shop.shopId],
    );
    expect(pages.flat().map((i) => i.id)).toEqual(rows.map((r) => r.id));
  });
  it('S9 AC5: a shop with no entries lists none', async () => {
    const s = await ownedShop();
    expect(await list(s.owner)).toEqual({ status: 200, body: { ok: true, items: [], nextCursor: null, pageSize: 50 } });
  });
  it('S9 AC6: with 40,000 entries the first page and a filtered first page each answer in under 2 s', async () => {
    const s = await ownedShop();
    await h.pool.query(
      `insert into audit_entries (shop_id, at, actor_id, actor_name, actor_role, kind, entity_type, entity_id, summary)
       select $1, timestamptz '2026-11-21 10:00:00+00' - i * interval '13 minutes', null, 'System (SLA breach job)',
              'system', (array['edit_applied', 'stock_out', 'lead_marked_late', 'setting_changed'])[1 + i % 4],
              (array['edit', 'stock_out', 'lead', 'setting'])[1 + i % 4], 'REC-' || i, 'Entry ' || i
         from generate_series(1, 40000) as i`,
      [s.shop.shopId],
    );
    await h.pool.query('analyze audit_entries');
    for (const input of [{}, { group: 'edits', actorRole: 'system' }, { entity: 'REC-39996' }]) {
      const started = performance.now();
      const res = await list(s.owner, input);
      const ms = performance.now() - started;
      expect(res.status, JSON.stringify(input)).toBe(200);
      expect(itemsOf(res).length, JSON.stringify(input)).toBeGreaterThan(0);
      expect(ms, JSON.stringify(input)).toBeLessThan(2000);
    }
  });
  it('S10 AC1: the Tag edits group lists only edit entries', async () => {
    const s = await ownedShop();
    const at = (min: number) => new Date(Date.parse('2026-11-22T05:00:00Z') + min * 60_000);
    await write(s.shop, { at: at(1), actor: ownerActor(s), kind: 'edit_applied', entityId: 'ED-1', summary: 'Edit applied' });
    await write(s.shop, { at: at(2), actor: ownerActor(s), kind: 'stock_out', entityId: 'SO-1', summary: 'Stock-out' });
    await write(s.shop, { at: at(3), actor: ownerActor(s), kind: 'edit_refused', entityId: 'ED-2', summary: 'Edit refused' });
    const res = await list(s.owner, { group: 'edits' });
    expect(itemsOf(res).map((i) => i.kind)).toEqual(['edit_refused', 'edit_applied']);
    expect(itemsOf(await list(s.owner, { group: 'all' }))).toHaveLength(3);
  });
  it('S10 AC2: the entity filter matches the entity id or the reference', async () => {
    const s = await ownedShop();
    const at = (min: number) => new Date(Date.parse('2026-11-22T05:00:00Z') + min * 60_000);
    await write(s.shop, { at: at(1), actor: ownerActor(s), kind: 'edit_applied', entityId: 'ED-1', ref: 'TAG-8841', summary: 'a' });
    await write(s.shop, { at: at(2), actor: ownerActor(s), kind: 'stock_out', entityId: 'TAG-8841', summary: 'b' });
    await write(s.shop, { at: at(3), actor: ownerActor(s), kind: 'stock_out', entityId: 'TAG-1001', summary: 'c' });
    const res = await list(s.owner, { entity: ' TAG-8841 ' });
    expect(itemsOf(res).map((i) => i.summary)).toEqual(['b', 'a']);
  });
  it('S10 AC3: actor and shop dates 1 to 7 March 2026 keep exactly the IST days', async () => {
    const s = await ownedShop();
    const rajeshId = await newUser(h.pool, s.shop, { name: 'Rajesh Verma', role: 'staff' });
    const rajesh = { kind: 'user', id: rajeshId, name: 'Rajesh Verma', role: 'staff' } as const;
    const times = ['2026-02-28T18:29:59Z', '2026-02-28T18:30:00Z', '2026-03-07T18:29:59Z', '2026-03-07T18:30:00Z'];
    for (const t of times) {
      await write(s.shop, { at: new Date(t), actor: rajesh, kind: 'stock_out', entityId: `SO-${t}`, summary: t });
    }
    await write(s.shop, {
      at: new Date('2026-03-03T06:00:00Z'),
      actor: ownerActor(s),
      kind: 'stock_out',
      entityId: 'SO-owner',
      summary: 'by the owner',
    });
    const res = await list(s.owner, { actorId: rajeshId, from: '2026-03-01', to: '2026-03-07' });
    expect(itemsOf(res).map((i) => i.at)).toEqual(['2026-03-07T18:29:59.000Z', '2026-02-28T18:30:00.000Z']);
    const oneDay = await list(s.owner, { from: '2026-03-03', to: '2026-03-03' });
    expect(itemsOf(oneDay).map((i) => i.summary)).toEqual(['by the owner']);
  });
  it('S10 AC4: a filter is kept across pages', async () => {
    const s = await ownedShop();
    const base = Date.parse('2026-11-22T05:00:00Z');
    for (let i = 0; i < 10; i++) {
      const kind = i % 2 === 0 ? 'edit_applied' : 'stock_out';
      await write(s.shop, { at: new Date(base + i * 60_000), actor: ownerActor(s), kind, entityId: `R-${i}`, summary: `${i}` });
    }
    const pages = await allPages(s.owner, { group: 'edits', pageSize: 2 });
    expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
    const items = pages.flat();
    expect(items.every((i) => i.kind === 'edit_applied')).toBe(true);
    expect(items.map((i) => i.entityId)).toEqual(['R-8', 'R-6', 'R-4', 'R-2', 'R-0']);
  });
  it('S10: an end date before the start date is refused on the field to', async () => {
    const s = await ownedShop();
    expect(await list(s.owner, { from: '2026-03-07', to: '2026-03-01' })).toEqual({
      status: 400,
      body: { code: 'validation', field: 'to', message: 'The end date must be on or after the start date.' },
    });
    expect((await list(s.owner, { from: '2026-02-30' })).status).toBe(400);
    expect((await list(s.owner, { cursor: 'not-a-cursor' })).body).toMatchObject({ code: 'validation', field: 'cursor' });
  });
  it('S6 AC4, S8 AC5: the System filter lists job and integration entries; Rules lists the pricing change', async () => {
    const s = await ownedShop();
    const at = (min: number) => new Date(Date.parse('2026-11-21T04:00:00Z') + min * 60_000);
    await write(s.shop, {
      at: at(1),
      actor: { kind: 'system', name: 'System (SLA breach job)' },
      kind: 'lead_marked_late',
      entityId: 'LD-2026-401',
      ref: 'LD-2026-401',
      summary: 'Lead LD-2026-401 marked late',
    });
    await write(s.shop, {
      at: at(2),
      actor: { kind: 'system', name: SYSTEM_ACTORS.whatsappIntake },
      kind: 'lead_created',
      entityId: 'LD-2026-402',
      summary: 'Lead LD-2026-402 created from WhatsApp',
    });
    await write(s.shop, { at: at(3), actor: ownerActor(s), kind: 'stock_out', entityId: 'SO-1', summary: 'Stock-out' });
    expect((await h.call('setSetting', { key: 'pricingEnabled', value: true }, { session: s.owner })).status).toBe(200);
    const system = itemsOf(await list(s.owner, { actorRole: 'system' }));
    expect(system.map((i) => [i.kind, i.actorName, i.actorRole])).toEqual([
      ['lead_created', 'WhatsApp intake', 'system'],
      ['lead_marked_late', 'System (SLA breach job)', 'system'],
    ]);
    const rules = itemsOf(await list(s.owner, { group: 'rules' }));
    expect(rules.map((i) => [i.kind, i.entityId, i.actorName])).toEqual([['setting_changed', 'pricingEnabled', 'Sanjay Seth']]);
    const detail = await read(s.owner, rules[0].id);
    expect(detail.body.entry).toMatchObject({ before: { pricingEnabled: false }, after: { pricingEnabled: true } });
  });
  it('S11 AC1: an edit entry shows its weights in units, reason and token reference', async () => {
    const s = await ownedShop();
    const id = await write(s.shop, {
      at: new Date('2026-11-22T09:02:00Z'),
      actor: ownerActor(s),
      kind: 'edit_applied',
      entityId: 'ED-2026-014',
      ref: 'TAG-8841',
      summary: 'Edit applied to TAG-8841',
      reason: 'Re-weighed on the counter scale',
      tokenReference: 'TK-2026-0042',
      before: { grossG: 486500 },
      after: { grossG: 486100 },
    });
    expect(await read(s.owner, id)).toEqual({
      status: 200,
      body: {
        ok: true,
        entry: {
          id,
          at: '2026-11-22T09:02:00.000Z',
          atLocal: '2026-11-22T14:32:00.000+05:30',
          kind: 'edit_applied',
          entityType: 'edit',
          entityId: 'ED-2026-014',
          ref: 'TAG-8841',
          actorId: s.ownerId,
          actorName: 'Sanjay Seth',
          actorRole: 'owner',
          summary: 'Edit applied to TAG-8841',
          tokenUsed: true,
          before: { grossG: 486500 },
          after: { grossG: 486100 },
          reason: 'Re-weighed on the counter scale',
          detail: null,
          tokenReference: 'TK-2026-0042',
          corrects: null,
        },
      },
    });
  });
  it('S11 AC2: a lost lead shows its state and note before and after, and the reason', async () => {
    await h.pool.query(
      `insert into leads (shop_id, code, source, state, customer_name, phone, arrived_at)
       values ($1, 'LD-2026-301', 'counter', 'opened', 'Priya Sharma', '+91 98410 71145', now())`,
      [h.shop.shopId],
    );
    const lost = await h.call('markLeadLost', { leadId: 'LD-2026-301', reason: 'Customer went elsewhere.' }, { session: h.session });
    expect(lost.status).toBe(200);
    const [item] = itemsOf(await h.asOwner('listAuditEntries', { entity: 'LD-2026-301' }));
    expect(item).toMatchObject({ kind: 'lead_lost', actorName: 'Rajesh Verma', actorRole: 'staff', tokenUsed: false });
    const res = await h.asOwner('readAuditEntry', { id: item.id });
    expect(res.body.entry).toMatchObject({
      before: { state: 'opened', note: null },
      after: { state: 'lost', note: 'Customer went elsewhere.' },
      reason: 'Customer went elsewhere.',
      tokenReference: null,
    });
  });
  it('S11 AC4: an unknown id, a non-uuid id or another shop’s entry is not found', async () => {
    const s = await ownedShop();
    const other = await ownedShop();
    const theirs = await write(other.shop, {
      at: new Date('2026-11-22T09:02:00Z'),
      actor: ownerActor(other),
      kind: 'stock_out',
      entityId: 'SO-1',
      summary: 'Stock-out',
    });
    for (const id of [randomUUID(), 'AUD-0001', theirs]) {
      expect(await read(s.owner, id)).toEqual({
        status: 404,
        body: { code: 'not_found', message: `Audit entry ${id} was not found.` },
      });
    }
  });
  it('S11 AC5: a correction names the entry it corrects, which stays as it was', async () => {
    const s = await ownedShop();
    const earlier = await write(s.shop, {
      at: new Date('2026-11-22T09:02:00Z'),
      actor: ownerActor(s),
      kind: 'edit_applied',
      entityId: 'ED-2026-014',
      ref: 'TAG-8841',
      summary: 'Edit applied to TAG-8841',
      before: { grossG: 486500 },
      after: { grossG: 486100 },
    });
    const rowBefore = await rowOf(earlier);
    const before = (await read(s.owner, earlier)).body;
    const correction = await write(s.shop, {
      at: new Date('2026-11-22T10:00:00Z'),
      actor: ownerActor(s),
      kind: 'edit_applied',
      entityId: 'ED-2026-015',
      summary: 'Correction: TAG-8841 gross weight',
      corrects: earlier,
      before: { grossG: 486100 },
      after: { grossG: 486300 },
    });
    const res = await read(s.owner, correction);
    expect(res.body.entry).toMatchObject({
      ref: earlier,
      corrects: { id: earlier, kind: 'edit_applied', at: '2026-11-22T09:02:00.000Z' },
    });
    expect((await read(s.owner, earlier)).body).toEqual(before);
    expect(await rowOf(earlier)).toBe(rowBefore);
  });
  it('S12 AC1: staff listing the log are refused and get no items', async () => {
    expect(await list(h.session)).toEqual(REFUSED);
    expect(await list(h.session, { group: 'edits' })).toEqual(REFUSED);
  });
  it('S12 AC2: a karigar reading an entry is refused', async () => {
    const [item] = itemsOf(await h.asOwner('listAuditEntries', {}));
    expect(await read(karigar, item?.id ?? randomUUID())).toEqual(REFUSED);
    expect(await list(karigar)).toEqual(REFUSED);
  });
  it('S12 AC4: with no session both reads answer unauthenticated', async () => {
    expect(await h.call('listAuditEntries', {})).toEqual(UNAUTHENTICATED);
    expect(await h.call('readAuditEntry', { id: randomUUID() })).toEqual(UNAUTHENTICATED);
  });
});
