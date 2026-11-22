/** Audit of every user lifecycle change (EP-05-S14). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { fixedClock } from '../../src/pipeline/server-clock.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { auditOf, refused, startUsersHarness, type UsersHarness, userRow } from './user-test-helpers.js';

/** 11:15 in Asia/Kolkata. */
const AT = new Date('2026-11-21T05:45:00.000Z');
const KINDS = ['user_added', 'user_edited', 'role_changed', 'user_deactivated', 'user_reactivated', 'karigar_linked'];

describeDb('audit every user lifecycle change (EP-05-S14)', () => {
  let h: UsersHarness;
  let deepak: string;

  beforeAll(async () => {
    h = await startUsersHarness({ clock: fixedClock(AT) });
    await addKarigar(h.pool, h.shop, 'KG-04');
    await addKarigar(h.pool, h.shop, 'KG-05');
  });

  afterAll(async () => {
    await h?.close();
  });

  const version = async (userId: string) => (await userRow(h, userId)).version;
  /** Who and when, on every entry of this file. */
  const byOwner = () => ({ actor_id: h.ownerId, actor_name: 'Sanjay Seth', actor_role: 'owner', at: AT });

  it('AC1: adding Deepak at 11:15 IST writes user_added at 05:45 UTC with masked phone and email', async () => {
    const res = await h.asOwner('createUser', {
      name: 'Deepak Rao',
      phone: '+91 90030 71145',
      email: 'deepak.rao@example.com',
      role: 'staff',
    });
    deepak = res.body.id as string;
    const entries = await auditOf(h, 'user_added', deepak);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      ...byOwner(),
      detail: { entity: 'user', entityId: deepak },
      before_value: null,
      after_value: { name: 'Deepak Rao', role: 'staff', phone: '+91 ••••• 71145', email: 'd•••@example.com' },
    });
  });

  it('user_edited has the masked before and after values', async () => {
    await h.asOwner('updateUserProfile', {
      userId: deepak,
      version: await version(deepak),
      name: 'Deepak Rao',
      phone: '+91 90030 71146',
      email: 'deepak.rao@example.com',
    });
    const [entry] = await auditOf(h, 'user_edited', deepak);
    expect(entry).toMatchObject({
      ...byOwner(),
      before_value: { name: 'Deepak Rao', phone: '+91 ••••• 71145', email: 'd•••@example.com' },
      after_value: { name: 'Deepak Rao', phone: '+91 ••••• 71146', email: 'd•••@example.com' },
    });
  });

  it('AC2: a role change from staff to karigar writes role_changed with before and after role', async () => {
    await h.asOwner('updateUserRole', { userId: deepak, version: await version(deepak), role: 'karigar', karigarId: 'KG-04' });
    const [entry] = await auditOf(h, 'role_changed', deepak);
    expect(entry).toMatchObject({
      ...byOwner(),
      before_value: { role: 'staff', karigarId: null },
      after_value: { role: 'karigar', karigarId: 'KG-04' },
    });
  });

  it('karigar_linked has the before and after karigar codes', async () => {
    await h.asOwner('linkKarigar', { userId: deepak, version: await version(deepak), karigarId: 'KG-05' });
    const [entry] = await auditOf(h, 'karigar_linked', deepak);
    expect(entry).toMatchObject({ ...byOwner(), before_value: { karigarId: 'KG-04' }, after_value: { karigarId: 'KG-05' } });
  });

  it('user_deactivated and user_reactivated have the status and the reason', async () => {
    await h.asOwner('deactivateUser', { userId: deepak, version: await version(deepak), reason: 'Moved away' });
    await h.asOwner('reactivateUser', { userId: deepak, version: await version(deepak) });
    const [off] = await auditOf(h, 'user_deactivated', deepak);
    expect(off).toMatchObject({
      ...byOwner(),
      detail: { entity: 'user', entityId: deepak, reason: 'Moved away' },
      before_value: { status: 'pending_activation' },
      after_value: { status: 'deactivated' },
    });
    const [on] = await auditOf(h, 'user_reactivated', deepak);
    expect(on).toMatchObject({
      ...byOwner(),
      before_value: { status: 'deactivated' },
      after_value: { status: 'pending_activation' },
    });
  });

  it('AC3: a deactivation refused by the one-owner guard, and other refused changes, write no entry', async () => {
    const owner = await version(h.ownerId);
    expect(await h.asOwner('deactivateUser', { userId: h.ownerId, version: owner })).toEqual(
      refused(USER_MESSAGES.shopNeedsOwner),
    );
    expect(await auditOf(h, 'user_deactivated', h.ownerId)).toEqual([]);
    expect((await h.asOwner('updateUserRole', { userId: deepak, version: 1, role: 'staff' })).status).toBe(409);
    expect(
      (await h.call('deactivateUser', { userId: deepak, version: await version(deepak) }, { session: h.session })).status,
    ).toBe(403);
    expect(await auditOf(h, 'role_changed', deepak)).toHaveLength(1);
    expect(await auditOf(h, 'user_deactivated', deepak)).toHaveLength(1);
  });

  it('AC4: each lifecycle kind was written exactly once', async () => {
    const { rows } = await h.pool.query<{ kind: string; n: string }>(
      `select kind, count(*) as n from audit_entries where shop_id = $1 and kind = any($2) group by kind order by kind`,
      [h.shop.shopId, KINDS],
    );
    expect(Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]))).toEqual(
      Object.fromEntries(KINDS.map((k) => [k, 1])),
    );
  });

  it('AC5: no entry holds a full phone number', async () => {
    const { rows } = await h.pool.query<{ text: string }>(
      `select concat_ws(' ', actor_name, summary, detail::text, reference, before_value::text, after_value::text) as text
         from audit_entries where shop_id = $1`,
      [h.shop.shopId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(KINDS.length);
    for (const { text } of rows) {
      expect(text.replace(/[^0-9]/g, ' ')).not.toMatch(/9003071145|9003071146|9841033333/);
      expect(text).not.toMatch(/90030 7114[56]|98410 33333/);
    }
  });
});
