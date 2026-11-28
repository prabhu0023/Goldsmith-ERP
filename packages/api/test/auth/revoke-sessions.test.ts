import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { hashSecret, revokeAllSessions } from '../../src/auth/session-store.js';
import { insertScoped } from '../../src/db/shop-context.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUserWithPassword, SERVER_NOW, startHarness, tokenFrom } from '../support/api-harness.js';

const PASSWORD = 'gold2026!';
const UNAUTHENTICATED = { status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } };
const lead = { customerName: 'Meena Iyer', items: [{ name: 'Chain', qty: 1 }] };

describeDb('end all sessions of a user at once (EP-04-S13)', () => {
  let h: Harness;
  let gate: () => Promise<void> = async () => {};
  let vijay: string;
  let deepak: string;

  beforeAll(async () => {
    h = await startHarness({ gate: () => gate(), poolSize: 12 });
    vijay = await newUserWithPassword(h.pool, h.shop, {
      name: 'Vijay Kumar',
      role: 'karigar',
      phone: '+91 98410 77777',
      password: PASSWORD,
    });
    deepak = await newUserWithPassword(h.pool, h.shop, {
      name: 'Deepak Rao',
      role: 'staff',
      phone: '+91 98410 22222',
      password: PASSWORD,
    });
    const karigarId = await addKarigar(h.pool, h.shop, 'KG-R-1');
    await insertScoped(h.pool, h.shop, 'metal_pools', {});
    for (const code of ['BATCH-2026-R1', 'BATCH-2026-R2']) {
      await insertScoped(h.pool, h.shop, 'parcels', { code, karigar_id: karigarId, po_ref: 'PO-OLD' });
    }
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    gate = async () => {};
  });

  const signIn = async (phone: string) => {
    const res = await h.auth('signIn', { phone, password: PASSWORD });
    expect(res.status).toBe(200);
    return { token: tokenFrom(res.setCookie) ?? '', body: res.body };
  };
  const revoke = (userId: string, reason: 'deactivated' | 'role_changed') =>
    runInTransaction(
      h.pool,
      (tx) => revokeAllSessions(tx.client, { shopId: h.shop.shopId, userId, reason, actor: { kind: 'system' }, at: SERVER_NOW }),
      () => {},
    );
  const poolEntries = async (parcelId: string) =>
    Number(
      (await h.pool.query('select count(*) from pool_entries where shop_id = $1 and ref_id = $2', [h.shop.shopId, parcelId]))
        .rows[0].count,
    );

  it('AC1, AC2: both of Vijay\'s sessions end in one call with deactivated; both tokens are refused; audited with the count', async () => {
    const phoneA = (await signIn('+91 98410 77777')).token;
    const phoneB = (await signIn('+91 98410 77777')).token;
    expect(await revoke(vijay, 'deactivated')).toBe(2);
    const { rows } = await h.pool.query('select ended_at, end_reason from sessions where token_hash = any($1)', [
      [hashSecret(phoneA), hashSecret(phoneB)],
    ]);
    expect(rows).toEqual([
      { ended_at: SERVER_NOW, end_reason: 'deactivated' },
      { ended_at: SERVER_NOW, end_reason: 'deactivated' },
    ]);
    for (const token of [phoneA, phoneB]) {
      expect(await h.call('createLead', lead, { session: token })).toEqual(UNAUTHENTICATED);
    }
    const audit = await h.pool.query(
      `select actor_id, actor_name, actor_role, detail from audit_entries where shop_id = $1 and kind = 'sessions_ended'`,
      [h.shop.shopId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_id: null, actor_name: 'System', actor_role: 'system' });
    expect(JSON.parse(audit.rows[0].detail)).toEqual({ entity: 'user', entityId: vijay, reason: 'deactivated', count: 2 });
  });

  it('AC3: after a role change and revoke, the next sign-in carries the new role', async () => {
    const old = (await signIn('+91 98410 22222')).token;
    await runInTransaction(
      h.pool,
      async (tx) => {
        const karigarId = await addKarigar(tx.client, h.shop, 'KG-R-DEEPAK');
        await tx.client.query(`update users set role = 'karigar', karigar_id = $2 where id = $1`, [deepak, karigarId]);
        await revokeAllSessions(tx.client, {
          shopId: h.shop.shopId,
          userId: deepak,
          reason: 'role_changed',
          actor: { kind: 'system' },
          at: SERVER_NOW,
        });
      },
      () => {},
    );
    expect(await h.call('createLead', lead, { session: old })).toEqual(UNAUTHENTICATED);
    const next = await signIn('+91 98410 22222');
    expect(next.body).toMatchObject({ user: { role: 'karigar' }, landingRoute: 'k-jobs' });
    const { rows } = await h.pool.query('select role_at_issue from sessions where token_hash = $1', [hashSecret(next.token)]);
    expect(rows).toEqual([{ role_at_issue: 'karigar' }]);
  });

  it('a session whose role at issue is no longer the user\'s role is refused even without a revoke', async () => {
    const stale = await newSession(h.pool, h.shop, h.userId, { roleAtIssue: 'owner' });
    expect(await h.call('createLead', lead, { session: stale })).toEqual(UNAUTHENTICATED);
    expect((await h.auth('readCurrentSession', {}, { token: stale })).status).toBe(401);
  });

  it('AC5: the server-only functions have no route, for a signed-in staff user', async () => {
    for (const name of ['revokeAllSessions', 'unlockAccount', 'issueActivationLink']) {
      const res = await h.auth(name, { userId: h.userId }, { token: h.session });
      expect({ status: res.status, body: res.body }, name).toEqual({
        status: 404,
        body: { code: 'not_found', message: `There is no operation named ${name}.` },
      });
    }
    const ops = await h.call('revokeAllSessions', { userId: h.userId }, { session: h.session });
    expect(ops).toEqual({ status: 404, body: { code: 'not_found', message: 'There is no operation named revokeAllSessions.' } });
  });

  it('concurrency: an operation in flight completes before the revoke, which waits for it', async () => {
    const token = await newSession(h.pool, h.shop, deepak);
    let revoked: Promise<number> | undefined;
    let revokeDone = false;
    let doneAtGate: boolean | undefined;
    gate = async () => {
      revoked = revoke(deepak, 'deactivated').finally(() => {
        revokeDone = true;
      });
      await sleep(200);
      doneAtGate = revokeDone;
    };
    expect(await h.call('parcelWithPoolEntry', { parcelId: 'BATCH-2026-R1' }, { session: token })).toEqual({
      status: 200,
      body: { ok: true },
    });
    // The operation's confirm row-locked the session, so the revoke could not commit under it.
    expect(doneAtGate).toBe(false);
    expect(await revoked).toBeGreaterThanOrEqual(1);
    expect(await poolEntries('BATCH-2026-R1')).toBe(1);
    expect(await h.call('createLead', lead, { session: token })).toEqual(UNAUTHENTICATED);
  });

  it('concurrency: an operation after the revoke is refused and writes nothing', async () => {
    const token = await newSession(h.pool, h.shop, vijay);
    await revoke(vijay, 'deactivated');
    expect(await h.call('parcelWithPoolEntry', { parcelId: 'BATCH-2026-R2' }, { session: token })).toEqual(UNAUTHENTICATED);
    expect(await poolEntries('BATCH-2026-R2')).toBe(0);
  });
});
