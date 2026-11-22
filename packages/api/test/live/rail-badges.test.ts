/**
 * EP-07-S9 AC1-AC3: rail badge counts come from server data through readRailBadges, by the
 * shared railBadgeCounts rule; a live event only triggers the read. The state change is made in
 * SQL as a stand-in for the epic that will own it (EP-23/24 stop a parcel, EP-26 bills a piece),
 * then the catalogue event is emitted through the outbox as that operation would.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, addPiece, describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { addParcel, type LiveHarness, startLiveHarness } from './live-test-helpers.js';

type Person = { id: string; token: string };
const HOUR = 3_600_000;

describeDb('EP-07-S9 live rail badge counts', () => {
  let h: LiveHarness;
  let sanjay: Person;
  let rajesh: Person;
  let deepak: Person;
  let lakshmi: Person;
  let kg: string;

  const badges = async (p: Person) => {
    const res = await h.call('readRailBadges', {}, p.token);
    expect(res.status).toBe(200);
    return res.body.badges as Record<string, number>;
  };

  beforeAll(async () => {
    h = await startLiveHarness();
    kg = await addKarigar(h.pool, h.shop, 'KG-RB');
    // Decisions 3 for the owner: one mismatched stopped parcel, one open problem on a piece, one late lead.
    const p1 = await addParcel(h.pool, h.shop, 'BATCH-2026-041', kg);
    await h.pool.query(
      `update parcels set status = 'stopped', verdict = 'mismatch', stopped_at = $2 where id = $1`,
      [p1, SERVER_NOW],
    );
    await addParcel(h.pool, h.shop, 'BATCH-2026-044', kg);
    await h.pool.query(
      `insert into pieces (shop_id, location_id, tag_no, name, gross_units, stone_units, status)
       select $1, $2, 'TAG-' || (9000 + n), 'Ring', 486100, 0, 'in_stock' from generate_series(1, 41) n`,
      [h.shop.shopId, h.shop.locationId],
    );
    const tag = await addPiece(h.pool, h.shop, 'TAG-8841');
    await h.pool.query(
      `insert into problems (shop_id, code, target_kind, piece_id, status) values ($1, 'PR-0001', 'piece', $2, 'open')`,
      [h.shop.shopId, tag],
    );
    await h.pool.query(
      `insert into leads (shop_id, code, source, state, arrived_at) values
         ($1, 'LD-2026-201', 'whatsapp', 'needs_glance', $2),
         ($1, 'LD-2026-202', 'whatsapp', 'needs_glance', $3)`,
      [h.shop.shopId, new Date(SERVER_NOW.getTime() - 9 * HOUR), new Date(SERVER_NOW.getTime() - HOUR)],
    );
    sanjay = await h.user('Sanjay Seth', 'owner');
    rajesh = await h.user('Rajesh Verma');
    deepak = await h.user('Deepak Rao');
    lakshmi = await h.user('Lakshmi Devi', 'karigar');
  });

  afterAll(async () => {
    await h?.close();
  });

  it('S9 AC1: Decisions 3 becomes 4 within about 1 second of "Parcel stopped" for BATCH-2026-044', async () => {
    expect(await badges(sanjay)).toEqual({ decisions: 3, leads: 1, parcels: 2, stock: 42 });
    const owner = await h.connect(sanjay.token);
    const { rows } = await h.pool.query<{ version: number }>(
      `update parcels set status = 'stopped', verdict = 'mismatch', stopped_at = $3
        where shop_id = $1 and code = $2 returning version`,
      [h.shop.shopId, 'BATCH-2026-044', SERVER_NOW],
    );
    const t0 = Date.now();
    await h.emit('parcel.stopped', { entityId: 'BATCH-2026-044', entityVersion: rows[0].version });
    await owner.waitFor((m) => m.type === 'event' && m.event.entityId === 'BATCH-2026-044', 1_000);
    expect((await badges(sanjay)).decisions).toBe(4);
    expect(Date.now() - t0).toBeLessThan(1_000);
    owner.close();
  });

  it('S9 AC2: Rajesh\'s Showroom stock 42 becomes 41 within about 1 second of Deepak billing a piece', async () => {
    expect((await badges(rajesh)).stock).toBe(42);
    const r = await h.connect(rajesh.token);
    const { rows } = await h.pool.query<{ version: number }>(
      `update pieces set status = 'billed' where shop_id = $1 and tag_no = 'TAG-8841' returning version`,
      [h.shop.shopId],
    );
    const t0 = Date.now();
    await h.emit('piece.billed', { entityId: 'TAG-8841', entityVersion: rows[0].version, actorUserId: deepak.id });
    await r.waitFor((m) => m.type === 'event' && m.event.name === 'Piece billed by one staff member', 1_000);
    expect((await badges(rajesh)).stock).toBe(41);
    expect(Date.now() - t0).toBeLessThan(1_000);
    r.close();
  });

  it('S9 AC3: the owner\'s Leads badge counts late leads and goes up by 1; the staff badge counts leads needing a glance', async () => {
    const ownerBefore = (await badges(sanjay)).leads;
    const staffBefore = (await badges(rajesh)).leads;
    expect(ownerBefore).toBe(1);
    expect(staffBefore).toBe(2);
    const owner = await h.connect(sanjay.token);
    // LD-2026-202 (opened, not glanced at) passes its 8-hour SLA.
    const { rows } = await h.pool.query<{ version: number }>(
      `update leads set state = 'opened', arrived_at = $2 where shop_id = $1 and code = 'LD-2026-202' returning version`,
      [h.shop.shopId, new Date(SERVER_NOW.getTime() - 8 * HOUR - 60_000)],
    );
    await h.emit('lead.alert', { entityId: 'LD-2026-202', entityVersion: rows[0].version });
    await owner.waitFor((m) => m.type === 'event' && m.event.entityId === 'LD-2026-202', 1_000);
    expect((await badges(sanjay)).leads).toBe(ownerBefore + 1);
    // Staff count leads needing a glance: LD-2026-202 was opened, so one fewer, whatever is late.
    expect(await badges(rajesh)).toEqual({ leads: 1, parcels: 2, stock: 41 });
    owner.close();
  });

  it('a karigar is refused readRailBadges (the karigar app has no rail)', async () => {
    const res = await h.call('readRailBadges', {}, lakshmi.token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('forbidden');
  });
});
