/**
 * EP-07-S11 AC2 and AC5, S2 AC3: every catalogue event of PRODUCTION-SCOPE §1 reaches exactly its
 * audience among two staff, the owner and two karigars, once; a proposed (G26) event is one more
 * catalogue entry. Every delivered envelope has exactly the 7 fields and no business values.
 */
import {
  LIVE_CATALOGUE,
  type LiveCatalogue,
  type LiveCatalogueEntry,
  type LiveEnvelope,
  roleChannel,
} from '@goldsmith/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { addJob, addParcel, karigarOf, type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

type Person = { id: string; token: string };
const PARCEL = 'BATCH-2026-044';

describeDb('EP-07-S11 AC2 the 10 catalogue events plus user.list_changed', () => {
  let h: LiveHarness;
  const people: Record<string, Person> = {};
  const streams: Record<string, LiveTestClient> = {};
  beforeAll(async () => {
    h = await startLiveHarness();
    people.rajesh = await h.user('Rajesh Verma', 'staff');
    people.deepak = await h.user('Deepak Rao', 'staff');
    people.sanjay = await h.user('Sanjay Seth', 'owner');
    people.lakshmi = await h.user('Lakshmi Devi', 'karigar');
    people.mahesh = await h.user('Mahesh Soni', 'karigar');
    await addJob(h.pool, h.shop, 'JOB-0001', await karigarOf(h.pool, people.lakshmi.id));
    await addParcel(h.pool, h.shop, PARCEL, await addKarigar(h.pool, h.shop, 'KG-CAT'));
    for (const [who, p] of Object.entries(people)) streams[who] = await h.connect(p.token);
    for (const who of ['rajesh', 'deepak']) {
      const res = await h.call(
        'subscribeLiveChannel',
        { connectionId: streams[who].hello?.connectionId, channel: `parcel:${PARCEL}` },
        people[who].token,
      );
      expect(res.status).toBe(200);
    }
  });
  afterAll(async () => {
    await h?.close();
  });

  it('S11 AC2: each of the 11 events, published once, reaches exactly its audience once', async () => {
    const { deepak, lakshmi, mahesh } = people;
    await h.emit('piece.billed', { entityId: 'TAG-8841', entityVersion: 8, actorUserId: deepak.id });
    await h.emit('parcel.stopped', { entityId: PARCEL, entityVersion: 3 });
    await h.emit('edit.proposed', { entityId: 'ED-0001', entityVersion: 1 });
    await h.emit('edit.applied', { entityId: 'TAG-8841', entityVersion: 9, proposerUserId: deepak.id });
    await h.emit('lead.alert', { entityId: 'LD-2026-213', entityVersion: 2 });
    await h.emit('karigar_job.status_changed', { entityId: 'JOB-0001', entityVersion: 2, karigarUserId: lakshmi.id });
    await h.emit('parcel.handed_over', { entityId: PARCEL, entityVersion: 4 });
    await h.emit('tag.saved', { entityId: 'TAG-8842', entityVersion: 1, actorUserId: deepak.id, parcelId: PARCEL });
    await h.emit('metal_pool.changed', { entityId: 'metal-pool', entityVersion: 5 });
    await h.emit('user.access_changed', { entityId: mahesh.id, entityVersion: 2, userId: mahesh.id });
    await h.emit('user.list_changed', { entityId: mahesh.id, entityVersion: 2 });
    await streams.mahesh.ended;
    await streams.rajesh.waitFor((m) => m.type === 'event' && m.event.name === 'Metal pool changed');
    await sleep(200);
    const got = (who: string) => streams[who].events().map((e) => e.name);
    expect(got('rajesh')).toEqual([
      'Piece billed by one staff member',
      'Edit applied',
      'Lead arrived / passed its SLA',
      'Karigar job status changed',
      'Parcel handed over by karigar',
      'Tag saved on a shared parcel',
      'Metal pool changed',
    ]);
    expect(got('deepak')).toEqual([
      'Edit applied',
      'Lead arrived / passed its SLA',
      'Karigar job status changed',
      'Parcel handed over by karigar',
      'Metal pool changed',
    ]);
    expect(got('sanjay')).toEqual([
      'Parcel stopped (mismatch or raised problem)',
      'Edit proposed / token sent',
      'Lead arrived / passed its SLA',
      'Karigar job status changed',
      'Metal pool changed',
      'User list changed',
    ]);
    expect(got('lakshmi')).toEqual(['Karigar job status changed']);
    expect(got('mahesh')).toEqual(['User deactivated or role changed']);
    const seen = new Set(Object.values(LIVE_CATALOGUE).map((e) => e.name));
    const delivered = new Set(Object.keys(streams).flatMap(got));
    expect(delivered).toEqual(seen);
  });

  it('S2 AC3: every delivered envelope has exactly the 7 fields and carries no name, phone, weight or money', async () => {
    const all: LiveEnvelope[] = Object.values(streams).flatMap((c) => c.events());
    expect(all.length).toBeGreaterThan(0);
    const { rows } = await h.pool.query<{ name: string; phone: string }>('select name, phone from users where shop_id = $1', [
      h.shop.shopId,
    ]);
    for (const e of all) {
      expect(Object.keys(e).sort()).toEqual(['audience', 'emittedAt', 'entityId', 'entityType', 'entityVersion', 'name', 'seq']);
      const text = JSON.stringify(e);
      for (const u of rows) {
        expect(text).not.toContain(u.name);
        expect(text).not.toContain(u.phone);
      }
      expect(text).not.toMatch(/gross|weight|units|price|amount|₹/i);
    }
  });
});

describe('EP-07-S11 AC5', () => {
  describeDb('a proposed (G26) event', () => {
    const released: LiveCatalogueEntry<Record<string, never>> = {
      topic: 'parcel.released',
      name: 'Parcel released into stock',
      entityType: 'parcel',
      audience: () => ({ channels: [roleChannel('staff'), roleChannel('owner')] }),
      refreshesBadges: true,
    };
    const extended: LiveCatalogue = { ...LIVE_CATALOGUE, 'parcel.released': released };
    let h: LiveHarness;
    beforeAll(async () => {
      h = await startLiveHarness({ catalogue: extended });
    });
    afterAll(async () => {
      await h?.close();
    });

    it('S11 AC5: an extra "Parcel released into stock" entry is delivered with no other change', async () => {
      const rajesh = await h.user('Rajesh Verma');
      const c = await h.connect(rajesh.token);
      // The row a future releaseParcel would record; the shared emitLiveEvent only knows the
      // v1 catalogue, so it is written as emitLiveEvent writes it.
      await h.pool.query(
        `insert into outbox_events (shop_id, topic, payload, created_at, entity_type, entity_id, entity_version, audience)
         values ($1, 'parcel.released', '{}', $2, 'parcel', $3, 5, $4)`,
        [h.shop.shopId, h.clock.now(), PARCEL, JSON.stringify(released.audience({}))],
      );
      await h.live.tick();
      const got = await c.waitFor((m) => m.type === 'event' && m.event.entityId === PARCEL);
      expect(got).toMatchObject({ event: { name: 'Parcel released into stock', entityType: 'parcel', entityVersion: 5 } });
    });
  });
});
