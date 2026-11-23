/**
 * Every state change is audited in its own transaction (EP-06-S2, S3 AC1, S6 AC3, S7 AC3/AC4),
 * through the production app as the goldsmith_app role: markLeadLost writes one lead_lost entry
 * with only the changed fields, a failed insert rolls the change back, a refused call writes
 * nothing, and the actor is always the session's.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appendAudit } from '../../src/audit/audit-writer.js';
import { withTransaction } from '../../src/db/transaction.js';
import { INTERNAL_MESSAGE } from '../../src/pipeline/api-errors.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, SERVER_NOW, startHarness } from '../support/api-harness.js';
import { type MutableClock, mutableClock } from '../support/test-clock.js';

const REASON = 'Customer went elsewhere.';

interface EntryRow {
  id: string;
  at: Date;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  reason: string | null;
  reference: string | null;
  token_reference: string | null;
  before_value: unknown;
  after_value: unknown;
}

describeDb('state changes are audited in their transaction (EP-06-S2)', () => {
  let h: Harness;
  let clock: MutableClock;
  let karigar: string;

  beforeAll(async () => {
    clock = mutableClock(SERVER_NOW);
    h = await startHarness({ production: true, clock });
    const karigarId = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar' });
    karigar = await newSession(h.pool, h.shop, karigarId);
  });

  afterAll(async () => {
    await h?.close();
  });

  const addLead = async (code: string, state = 'opened') => {
    await h.pool.query(
      `insert into leads (shop_id, code, source, state, customer_name, phone, arrived_at)
       values ($1, $2, 'counter', $3, 'Priya Sharma', '+91 98410 71145', $4)`,
      [h.shop.shopId, code, state, SERVER_NOW],
    );
  };
  const lead = async (code: string) =>
    (
      await h.pool.query<{ state: string; note: string | null; version: number }>(
        'select state, note, version from leads where shop_id = $1 and code = $2',
        [h.shop.shopId, code],
      )
    ).rows[0];
  const entriesOf = async (entityId: string): Promise<EntryRow[]> =>
    (
      await h.pool.query<EntryRow>(
        `select id, at, actor_id, actor_name, actor_role, kind, entity_type, entity_id, summary, reason, reference,
                token_reference, before_value, after_value
           from audit_entries where shop_id = $1 and entity_id = $2 order by at desc, id desc`,
        [h.shop.shopId, entityId],
      )
    ).rows;
  const markLost = (leadId: string, session = h.session, extra: Record<string, unknown> = {}) =>
    h.call('markLeadLost', { leadId, reason: REASON, ...extra }, { session });

  it('S2 AC1, S3 AC1, S7 AC4: markLeadLost writes one lead_lost entry with only the changed fields', async () => {
    await addLead('LD-2026-213');
    expect(await markLost('LD-2026-213')).toEqual({ status: 200, body: { ok: true } });
    expect((await lead('LD-2026-213')).state).toBe('lost');
    const entries = await entriesOf('LD-2026-213');
    expect(entries).toEqual([
      {
        id: expect.any(String),
        at: SERVER_NOW,
        actor_id: h.userId,
        actor_name: 'Rajesh Verma',
        actor_role: 'staff',
        kind: 'lead_lost',
        entity_type: 'lead',
        entity_id: 'LD-2026-213',
        summary: 'Lead LD-2026-213 marked lost',
        reason: REASON,
        reference: 'LD-2026-213',
        token_reference: null,
        before_value: { state: 'opened', note: null },
        after_value: { state: 'lost', note: REASON },
      },
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Priya|customer_?name|71145/i);
  });

  it('S2 AC2: when the audit insert fails the change rolls back and the caller gets internal', async () => {
    await addLead('LD-2026-214');
    const suffix = randomUUID().replaceAll('-', '');
    const fn = `audit_refuse_${suffix}`;
    const trigger = `audit_refuse_${suffix}`;
    await h.pool.query(
      `create function ${fn}() returns trigger language plpgsql as $$
       begin
         if new.shop_id = '${h.shop.shopId}' then raise exception 'audit insert refused by the test'; end if;
         return new;
       end $$`,
    );
    try {
      await h.pool.query(`create trigger ${trigger} before insert on audit_entries for each row execute function ${fn}()`);
      expect(await markLost('LD-2026-214')).toEqual({
        status: 500,
        body: { code: 'internal', message: INTERNAL_MESSAGE },
      });
    } finally {
      await h.pool.query(`drop trigger if exists ${trigger} on audit_entries`);
      await h.pool.query(`drop function if exists ${fn}()`);
    }
    expect(await lead('LD-2026-214')).toMatchObject({ state: 'opened', note: null, version: 1 });
    expect(await entriesOf('LD-2026-214')).toEqual([]);
  });

  it('S2 AC3: a refused, forbidden or conflicting call writes no entry', async () => {
    await addLead('LD-2026-215', 'converted');
    expect(await markLost('LD-2026-215')).toEqual({
      status: 422,
      body: { code: 'rule_refused', message: 'A converted lead cannot be marked lost.' },
    });
    expect(await entriesOf('LD-2026-215')).toEqual([]);

    await addLead('LD-2026-216');
    expect((await markLost('LD-2026-216', karigar)).status).toBe(403);
    expect(await lead('LD-2026-216')).toMatchObject({ state: 'opened', version: 1 });
    expect(await entriesOf('LD-2026-216')).toEqual([]);

    // Someone else saves the lead while markLeadLost waits on its row: the versioned write conflicts.
    await addLead('LD-2026-217');
    const other = await h.pool.connect();
    try {
      await other.query('begin');
      await other.query(`update leads set note = 'Called back' where shop_id = $1 and code = 'LD-2026-217'`, [
        h.shop.shopId,
      ]);
      const xid = (await other.query<{ xid: string }>('select pg_current_xact_id()::text as xid')).rows[0].xid;
      const pending = markLost('LD-2026-217');
      await waitForWaiterOn(h, xid);
      await other.query('commit');
      const res = await pending;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('conflict');
    } finally {
      other.release();
    }
    expect(await lead('LD-2026-217')).toMatchObject({ state: 'opened', note: 'Called back' });
    expect(await entriesOf('LD-2026-217')).toEqual([]);
  });

  it('S2 AC5: two changes read back newest first, in the order they committed', async () => {
    await addLead('LD-2026-218');
    await addLead('LD-2026-219');
    clock.set(new Date('2026-11-21T10:05:00.000Z'));
    expect((await markLost('LD-2026-218')).status).toBe(200);
    clock.advance(1000);
    expect((await markLost('LD-2026-219')).status).toBe(200);
    clock.set(SERVER_NOW);
    const { rows } = await h.pool.query<{ entity_id: string; at: Date }>(
      `select entity_id, at from audit_entries
        where shop_id = $1 and entity_id in ('LD-2026-218', 'LD-2026-219') order by at desc, id desc`,
      [h.shop.shopId],
    );
    expect(rows).toEqual([
      { entity_id: 'LD-2026-219', at: new Date('2026-11-21T10:05:01.000Z') },
      { entity_id: 'LD-2026-218', at: new Date('2026-11-21T10:05:00.000Z') },
    ]);
  });

  it('S6 AC3: a body claiming to be System or another person is ignored; the actor is the session user', async () => {
    await addLead('LD-2026-220');
    const res = await markLost('LD-2026-220', h.session, {
      actorRole: 'system',
      actorName: 'Scheduler',
      by: { id: randomUUID(), name: 'Sanjay Seth', role: 'owner' },
    });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await entriesOf('LD-2026-220')).toEqual([
      expect.objectContaining({ actor_id: h.userId, actor_name: 'Rajesh Verma', actor_role: 'staff' }),
    ]);
  });

  it('S7 AC3: a karigar hand-over entry (job_handed_over, covered by rule) is accepted by the writer and the database', async () => {
    const lakshmi = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar' });
    await withTransaction(h.pool, (client) =>
      appendAudit(client, {
        shopId: h.shop.shopId,
        at: SERVER_NOW,
        actor: { kind: 'user', id: lakshmi, name: 'Lakshmi Devi', role: 'karigar' },
        kind: 'job_handed_over',
        entityId: 'MO-2026-118',
        ref: 'MO-2026-118',
        summary: 'Job MO-2026-118 handed over',
        before: { status: 'ready' },
        after: { status: 'handed_over' },
      }),
    );
    expect(await entriesOf('MO-2026-118')).toEqual([
      expect.objectContaining({
        actor_id: lakshmi,
        actor_name: 'Lakshmi Devi',
        actor_role: 'karigar',
        kind: 'job_handed_over',
        entity_type: 'job',
      }),
    ]);
  });
});

/** Wait until another session waits for transaction `xid` to end (a row lock it holds). */
async function waitForWaiterOn(h: Harness, xid: string): Promise<void> {
  for (let i = 0; i < 250; i++) {
    const { rows } = await h.pool.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_locks
        where locktype = 'transactionid' and not granted and transactionid::text = $1`,
      [xid],
    );
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`No session waited on transaction ${xid}`);
}
