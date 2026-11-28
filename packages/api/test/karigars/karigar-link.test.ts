/** Give a karigar portal access (EP-16-S6). */
import { KARIGAR_MESSAGES, USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';
import { refused, userRow } from '../users/user-test-helpers.js';
import {
  auditEntries,
  type KarigarHarness,
  karigarRow,
  seedKarigar,
  startKarigarHarness,
  validation,
} from './karigar-test-helpers.js';
const OWNER_SENTENCE = 'Only the owner can give a karigar portal access.';
describeDb('give a karigar portal access (EP-16-S6)', () => {
  let h: KarigarHarness;
  const link = (body: Record<string, unknown>) => h.asOwner('linkKarigarAccount', body);
  const usersOf = async (karigarId: string) =>
    (await h.pool.query('select * from users where shop_id = $1 and karigar_id = $2', [h.shop.shopId, karigarId])).rows;
  beforeAll(async () => {
    h = await startKarigarHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  it('AC1: portal access for KG-05 creates a pending karigar user with its phone and email, and mails one activation email', async () => {
    const created = await h.asOwner('onboardKarigar', {
      name: 'Anil Verma',
      phone: '98410 55555',
      email: 'anil.verma@example.com',
      specialties: ['Kundan'],
      wastageBp: 90,
    });
    expect(created.body).toEqual({ ok: true, id: 'KG-05' });
    const karigar = await karigarRow(h, 'KG-05');
    expect(await link({ karigarId: 'KG-05' })).toEqual({ status: 200, body: { ok: true } });
    const users = await usersOf(karigar.id);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      name: 'Anil Verma',
      phone: '+919841055555',
      email: 'anil.verma@example.com',
      role: 'karigar',
      status: 'pending_activation',
      karigar_id: karigar.id,
    });
    expect(h.mailer.messages().filter((m) => m.to === 'anil.verma@example.com')).toHaveLength(1);
  });
  it('AC1 audit: one karigar_linked entry on the karigar (found by its code), plus user_added and activation_link_sent', async () => {
    const entries = await auditEntries(h, ['karigar_linked', 'user_added', 'activation_link_sent']);
    const linked = entries.filter((e) => e.entity_type === 'karigar' && e.entity_id === 'KG-05');
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ kind: 'karigar_linked', reference: 'KG-05', actor_name: 'Sanjay Seth', actor_role: 'owner' });
    const created = await h.pool.query(
      `select kind from audit_entries where shop_id = $1 and summary like '%Anil Verma%' order by at, id`,
      [h.shop.shopId],
    );
    expect(created.rows.map((r) => r.kind)).toEqual(expect.arrayContaining(['user_added', 'activation_link_sent', 'karigar_linked']));
    const listed = await h.asOwner('listAuditEntries', { entity: 'KG-05' });
    expect((listed.body.items as Array<{ kind: string }>).map((e) => e.kind)).toContain('karigar_linked');
  });
  it('AC2: a second user for KG-04 answers "This karigar already has an account."', async () => {
    const before = await usersOf(h.ids['KG-04']);
    expect(await link({ karigarId: 'KG-04' })).toEqual(refused(USER_MESSAGES.karigarTaken));
    const other = await newUser(h.pool, h.shop, { name: 'Murugan K', role: 'karigar', phone: '+919840040499' });
    expect(await link({ karigarId: 'KG-04', userId: other })).toEqual(refused('This karigar already has an account.'));
    expect(await usersOf(h.ids['KG-04'])).toEqual(before);
    expect((await userRow(h, other)).karigar_id).not.toBe(h.ids['KG-04']);
  });
  it('AC3: a deactivated karigar is refused and no user is created', async () => {
    const id = await seedKarigar(h, 'KG-09', 'Old Hand', '+919840090909', 80, ['Antique'], null, 'deactivated');
    expect(await link({ karigarId: 'KG-09' })).toEqual(refused(KARIGAR_MESSAGES.deactivatedLoginFirst));
    expect(await usersOf(id)).toEqual([]);
  });
  it('AC4: an existing karigar user with the karigar phone is linked, and no email is sent', async () => {
    const id = await seedKarigar(h, 'KG-07', 'Ravi Achari', '+919840070707', 80, ['Temple'], null);
    const userId = await newUser(h.pool, h.shop, { name: 'Ravi Achari', role: 'karigar', phone: '98400 70707' });
    const mails = h.mailer.messages().length;
    const before = await userRow(h, userId);
    expect(await link({ karigarId: 'KG-07', userId })).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, userId)).toMatchObject({ karigar_id: id, version: before.version + 1, status: 'active' });
    expect(h.mailer.messages()).toHaveLength(mails);
    const listed = await h.asOwner('listAuditEntries', { entity: 'KG-07' });
    expect((listed.body.items as Array<{ kind: string }>).map((e) => e.kind)).toEqual(['karigar_linked']);
  });
  it('linking the same user again changes nothing and writes no second entry', async () => {
    const userId = (await usersOf(h.ids['KG-04']))[0].id as string;
    const before = await userRow(h, userId);
    const entries = (await auditEntries(h, ['karigar_linked'])).length;
    expect(await link({ karigarId: 'KG-04', userId })).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, userId)).toEqual(before);
    expect(await auditEntries(h, ['karigar_linked'])).toHaveLength(entries);
  });
  it('refuses a staff user, a user with another phone, an unknown user and an unknown karigar', async () => {
    await seedKarigar(h, 'KG-08', 'Hari Om', '+919840080808', 80, ['Polki'], null);
    expect(await link({ karigarId: 'KG-08', userId: h.userId })).toEqual(refused(USER_MESSAGES.onlyKarigarLinks));
    const stranger = await newUser(h.pool, h.shop, { name: 'Hari Om', role: 'karigar', phone: '+919840000001' });
    expect(await link({ karigarId: 'KG-08', userId: stranger })).toEqual(validation('userId', KARIGAR_MESSAGES.userPhoneDiffers));
    expect((await userRow(h, stranger)).karigar_id).not.toBe(h.ids['KG-08']);
    const missing = await link({ karigarId: 'KG-08', userId: '00000000-0000-4000-8000-000000000000' });
    expect(missing.status).toBe(404);
    expect(await link({ karigarId: 'KG-99' })).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Karigar KG-99 was not found.' },
    });
  });
  it('a phone another live user signs in with is refused on the create path', async () => {
    const id = await seedKarigar(h, 'KG-10', 'Dev Anand', '+919840101010', 80, ['Meenakari'], null);
    await newUser(h.pool, h.shop, { name: 'Someone Else', role: 'staff', phone: '+919840101010' });
    expect(await link({ karigarId: 'KG-10' })).toEqual(validation('phone', USER_MESSAGES.phoneTaken));
    expect(await usersOf(id)).toEqual([]);
  });
  it('a karigar without a phone number is refused on the create path', async () => {
    await h.pool.query("update karigars set phone = null where shop_id = $1 and code = 'KG-10'", [h.shop.shopId]);
    expect(await link({ karigarId: 'KG-10' })).toEqual(validation('karigarId', KARIGAR_MESSAGES.phoneMissing));
  });
  it('AC5: staff and karigar sessions are refused before anything is stored', async () => {
    const users = (await h.pool.query('select count(*)::int as n from users where shop_id = $1', [h.shop.shopId])).rows[0].n;
    const expected = { status: 403, body: { code: 'forbidden', message: OWNER_SENTENCE } };
    expect(await h.call('linkKarigarAccount', { karigarId: 'KG-01' }, { session: h.session })).toEqual(expected);
    expect(await h.call('linkKarigarAccount', { karigarId: 'KG-01' }, { session: h.karigarSession })).toEqual(expected);
    expect((await h.pool.query('select count(*)::int as n from users where shop_id = $1', [h.shop.shopId])).rows[0].n).toBe(users);
  });
  describe('validation', () => {
    it('needs a karigar id', async () => {
      const res = await link({});
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'validation', field: 'karigarId' });
    });
  });
});
