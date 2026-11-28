/**
 * EP-08: every user write records `user.list_changed` for the owner channel, so a second browser
 * of the owner shows a new or changed user within about a second. The shop has one live owner, so
 * "a second owner stream" is the owner's second browser. Staff and karigar streams receive
 * nothing; a write that rolls back emits nothing; the affected user still gets only
 * `user.access_changed`.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type LiveHarness, type LiveTestClient, sleep, startLiveHarness } from './live-test-helpers.js';

const NAME = 'User list changed';
type Person = { id: string; token: string };

describeDb('EP-08 user.list_changed for the owner (D-B 4)', () => {
  let h: LiveHarness;
  let sanjay: Person;
  let rajesh: Person;
  let lakshmi: Person;
  let desk: LiveTestClient;
  let phone: LiveTestClient;
  let staffStream: LiveTestClient;
  let karigarStream: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    sanjay = await h.user('Sanjay Seth', 'owner');
    rajesh = await h.user('Rajesh Verma', 'staff');
    lakshmi = await h.user('Lakshmi Devi', 'karigar');
    desk = await h.connect(sanjay.token);
    phone = await h.connect(sanjay.token);
    staffStream = await h.connect(rajesh.token);
    karigarStream = await h.connect(lakshmi.token);
  });
  afterAll(async () => {
    await h?.close();
  });
  const listEvents = (c: LiveTestClient) => c.events().filter((e) => e.name === NAME);
  const versionOf = async (userId: string) =>
    (await h.pool.query<{ version: number }>('select version from users where id = $1', [userId])).rows[0].version;
  const outboxCount = async () =>
    Number(
      (await h.pool.query('select count(*) from outbox_events where shop_id = $1 and topic = $2', [h.shop.shopId, 'user.list_changed']))
        .rows[0].count,
    );
  const newUser = (phoneNo: string, name = 'Deepak Rao') =>
    h.call('createUser', { name, phone: phoneNo, email: 'deepak@example.test', role: 'staff' }, sanjay.token, {
      'Idempotency-Key': `key-${phoneNo}`,
    });

  it('the owner\'s second browser gets the event within 1 second of createUser; staff and karigar get nothing', async () => {
    const t0 = Date.now();
    const created = await newUser('98410 22222');
    expect(created.status).toBe(200);
    const id = created.body.id as string;
    await phone.waitFor((m) => m.type === 'event' && m.event.name === NAME && m.event.entityId === id, 1_000);
    expect(Date.now() - t0).toBeLessThan(1_000);
    const event = listEvents(phone).find((e) => e.entityId === id);
    expect(event).toMatchObject({ entityType: 'user', entityId: id, entityVersion: await versionOf(id) });
    expect(listEvents(desk).filter((e) => e.entityId === id)).toHaveLength(1);
    await sleep(200);
    expect(staffStream.events().filter((e) => e.entityType === 'user')).toEqual([]);
    expect(karigarStream.events().filter((e) => e.entityType === 'user')).toEqual([]);
  });

  it('a createUser that rolls back emits nothing', async () => {
    const before = await outboxCount();
    const seen = listEvents(phone).length;
    const refused = await newUser('98410 22222', 'Same Phone');
    expect(refused.status).toBeGreaterThanOrEqual(400);
    await sleep(300);
    expect(await outboxCount()).toBe(before);
    expect(listEvents(phone)).toHaveLength(seen);
  });

  it('each other user write emits one event, and the deactivated user still gets only user.access_changed', async () => {
    const vijay = await h.user('Vijay Kumar');
    const vijayStream = await h.connect(vijay.token);
    const before = await outboxCount();
    const res = await h.call('deactivateUser', { userId: vijay.id, version: await versionOf(vijay.id) }, sanjay.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    await vijayStream.ended;
    await phone.waitFor((m) => m.type === 'event' && m.event.name === NAME && m.event.entityId === vijay.id, 1_000);
    expect(await outboxCount()).toBe(before + 1);
    expect(vijayStream.events().map((e) => e.name)).toEqual(['User deactivated or role changed']);
    const reactivated = await h.call('reactivateUser', { userId: vijay.id, version: await versionOf(vijay.id) }, sanjay.token);
    expect(reactivated.status).toBe(200);
    expect(await outboxCount()).toBe(before + 2);
  });
});
