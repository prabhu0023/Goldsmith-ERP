/**
 * EP-07-S5: every event is checked per receiver against the one permission list, with the role
 * stored at delivery time; a failed check drops it silently for that stream.
 */
import type { LiveAudience } from '@goldsmith/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadShopContext } from '../../src/db/shop-context.js';
import { emitLiveEvent } from '../../src/live/emit-live-event.js';
import { filterStats } from '../../src/live/receiver-filter.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { inTransaction, type LiveHarness, type LiveTestClient, startLiveHarness } from './live-test-helpers.js';

const gotEntity = (c: LiveTestClient, entityId: string) => c.events().some((e) => e.entityId === entityId);
const waitEntity = (c: LiveTestClient, entityId: string) =>
  c.waitFor((m) => m.type === 'event' && m.event.entityId === entityId);

describeDb('EP-07-S5 per-receiver permission filter', () => {
  let h: LiveHarness;
  let rajesh: { id: string; token: string };
  let lakshmi: { id: string; token: string };
  let r: LiveTestClient;
  let s: LiveTestClient;
  let k: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    rajesh = await h.user('Rajesh Verma');
    const sanjay = await h.user('Sanjay Seth', 'owner');
    lakshmi = await h.user('Lakshmi Devi', 'karigar');
    r = await h.connect(rajesh.token);
    s = await h.connect(sanjay.token);
    k = await h.connect(lakshmi.token);
  });
  afterAll(async () => {
    await h?.close();
  });

  /** Emit, then overwrite the catalogue's audience before the commit (a wrong audience on purpose). */
  async function emitWithAudience(entityId: string, audience: LiveAudience): Promise<void> {
    await inTransaction(h.pool, async (tx) => {
      const shop = await loadShopContext(tx.client, h.shop.shopId);
      await emitLiveEvent(tx, shop, 'piece.billed', { entityId, entityVersion: 3, at: h.clock.now(), actorUserId: 'nobody' });
      await tx.client.query(
        "update outbox_events set audience = $3 where shop_id = $1 and entity_id = $2 and topic = 'piece.billed'",
        [h.shop.shopId, entityId, JSON.stringify(audience)],
      );
    });
  }

  it('S5 AC1: a lead alert for LD-2026-213 reaches Rajesh (Staff) and Sanjay (Owner), not Lakshmi (Karigar)', async () => {
    await h.emit('lead.alert', { entityId: 'LD-2026-213', entityVersion: 2 });
    await waitEntity(r, 'LD-2026-213');
    await waitEntity(s, 'LD-2026-213');
    expect(gotEntity(k, 'LD-2026-213')).toBe(false);
  });

  it('S5 AC2: a piece-billed event wrongly addressed to the karigar role and user never reaches a karigar', async () => {
    await emitWithAudience('TAG-7001', { channels: ['role:staff', 'role:karigar', `user:${lakshmi.id}`] });
    await waitEntity(r, 'TAG-7001');
    expect(gotEntity(k, 'TAG-7001')).toBe(false);
  });

  it('S5 AC3: the role stored at delivery time decides, not the role the stream opened with', async () => {
    const deepak = await h.user('Deepak Rao');
    const d = await h.connect(deepak.token);
    // Staff -> Karigar in the same second as the event, before any session is revoked.
    const record = await addKarigar(h.pool, h.shop, 'KG-DEEPAK');
    await h.pool.query("update users set role = 'karigar', karigar_id = $2 where id = $1", [deepak.id, record]);
    await h.emit('lead.alert', { entityId: 'LD-2026-214', entityVersion: 1 });
    await waitEntity(r, 'LD-2026-214');
    expect(gotEntity(d, 'LD-2026-214')).toBe(false);
    expect(h.live.connections().find((c) => c.userId === deepak.id)?.role).toBe('staff');
    d.close();
  });
});

describe('EP-07-S5 AC4', () => {
  describeDb('ten streams', () => {
    let h: LiveHarness;
    const clients: LiveTestClient[] = [];
    beforeAll(async () => {
      h = await startLiveHarness();
      for (let i = 0; i < 10; i += 1) clients.push(await h.connect((await h.user(`Staff ${i}`)).token));
    });
    afterAll(async () => {
      await h?.close();
    });

    it('S5 AC4: with 10 open streams each is checked once and the event arrives within about 1 second of commit', async () => {
      const before = filterStats.checks;
      const committed = Date.now();
      await h.emit('lead.alert', { entityId: 'LD-2026-400', entityVersion: 1 });
      await Promise.all(clients.map((c) => waitEntity(c, 'LD-2026-400')));
      expect(Date.now() - committed).toBeLessThan(1_000);
      expect(filterStats.checks - before).toBe(10);
    });
  });
});
