/**
 * EP-07-S6: a karigar's stream carries only their own user channel; job events reach them only
 * for their own jobs, checked again by the receiver filter (karigar scope).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { addJob, karigarOf, type LiveHarness, type LiveTestClient, startLiveHarness } from './live-test-helpers.js';

const JOB_NAME = 'Karigar job status changed';
const gotEntity = (c: LiveTestClient, id: string) => c.events().some((e) => e.entityId === id);
const waitEntity = (c: LiveTestClient, id: string) => c.waitFor((m) => m.type === 'event' && m.event.entityId === id);

describeDb('EP-07-S6 karigar receives only own-job events', () => {
  let h: LiveHarness;
  let lakshmi: { id: string; token: string };
  let mahesh: { id: string; token: string };
  let sanjay: { id: string; token: string };
  let l: LiveTestClient;
  let m: LiveTestClient;
  let r: LiveTestClient;
  beforeAll(async () => {
    h = await startLiveHarness();
    lakshmi = await h.user('Lakshmi Devi', 'karigar');
    mahesh = await h.user('Mahesh Soni', 'karigar');
    sanjay = await h.user('Sanjay Seth', 'owner');
    await addJob(h.pool, h.shop, 'JOB-L-01', await karigarOf(h.pool, lakshmi.id));
    await addJob(h.pool, h.shop, 'JOB-M-01', await karigarOf(h.pool, mahesh.id));
    l = await h.connect(lakshmi.token);
    m = await h.connect(mahesh.token);
    r = await h.connect((await h.user('Rajesh Verma')).token);
  });
  afterAll(async () => {
    await h?.close();
  });

  it('S6 rule: a karigar stream joins only its user channel, never role:staff or role:owner', () => {
    expect(l.hello?.channels).toEqual([`user:${lakshmi.id}`]);
  });

  it("S6 AC1: Lakshmi receives nothing when Mahesh Soni's job changes status", async () => {
    await h.emit('karigar_job.status_changed', { entityId: 'JOB-M-01', entityVersion: 2, karigarUserId: mahesh.id });
    await waitEntity(m, 'JOB-M-01');
    await waitEntity(r, 'JOB-M-01');
    expect(gotEntity(l, 'JOB-M-01')).toBe(false);
  });

  it('S6 AC2: her own job changing status reaches her phone within about 1 second', async () => {
    const t0 = Date.now();
    await h.emit('karigar_job.status_changed', { entityId: 'JOB-L-01', entityVersion: 2, karigarUserId: lakshmi.id });
    const got = await waitEntity(l, 'JOB-L-01');
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(got).toMatchObject({ event: { name: JOB_NAME, entityType: 'karigar_job', entityVersion: 2 } });
  });

  it('S6 AC2 rule: her job event addressed to another karigar user is still dropped by the own-job check', async () => {
    await h.emit('karigar_job.status_changed', { entityId: 'JOB-M-01', entityVersion: 3, karigarUserId: lakshmi.id });
    await waitEntity(r, 'JOB-M-01');
    expect(l.events().filter((e) => e.entityId === 'JOB-M-01')).toEqual([]);
  });

  it('S6 AC3: piece billed, lead alert, edit proposed and metal pool events never reach a karigar', async () => {
    await h.emit('piece.billed', { entityId: 'TAG-6001', entityVersion: 2, actorUserId: sanjay.id });
    await h.emit('lead.alert', { entityId: 'LD-2026-601', entityVersion: 1 });
    await h.emit('edit.proposed', { entityId: 'ED-601', entityVersion: 1 });
    await h.emit('metal_pool.changed', { entityId: 'metal-pool', entityVersion: 4 });
    await waitEntity(r, 'metal-pool');
    for (const c of [l, m]) {
      expect(c.events().filter((e) => ['piece', 'lead', 'piece_edit', 'metal_pool'].includes(e.entityType))).toEqual([]);
    }
  });

  it("S6 AC4: when the owner changes Lakshmi's role she receives the event on her user channel", async () => {
    const { rows } = await h.pool.query<{ version: number }>('select version from users where id = $1', [lakshmi.id]);
    const res = await h.call('updateUserRole', { userId: lakshmi.id, version: rows[0].version, role: 'staff' }, sanjay.token);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const got = await l.waitFor((x) => x.type === 'event' && x.event.entityType === 'user');
    expect(got).toMatchObject({ event: { name: 'User deactivated or role changed', entityId: lakshmi.id } });
    expect(got.type === 'event' && got.event.audience.channels).toEqual([`user:${lakshmi.id}`]);
    expect(gotEntity(m, lakshmi.id)).toBe(false);
  });

  it('S6 AC5: a karigar whose record has no jobs gets only user-channel events and no job events', async () => {
    // users_karigar_matches_role makes every karigar user have a karigar record; the nearest
    // state is a record with no jobs. A job event wrongly addressed to them is dropped.
    const ravi = await h.user('Ravi Unlinked', 'karigar', { karigarId: await addKarigar(h.pool, h.shop, 'KG-NOJOBS') });
    const c = await h.connect(ravi.token);
    expect(c.hello?.channels).toEqual([`user:${ravi.id}`]);
    await h.emit('karigar_job.status_changed', { entityId: 'JOB-M-01', entityVersion: 4, karigarUserId: ravi.id });
    await waitEntity(m, 'JOB-M-01');
    await h.emit('user.access_changed', { entityId: ravi.id, entityVersion: 1, userId: ravi.id });
    await waitEntity(c, ravi.id);
    expect(c.events().map((e) => e.entityType)).toEqual(['user']);
  });
});
