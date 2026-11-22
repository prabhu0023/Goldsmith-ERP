/** Create User and Resend activation (EP-05-S4). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import {
  activationToken,
  OWNER_ONLY,
  refused,
  signIn,
  startUsersHarness,
  type UsersHarness,
  userRow,
} from './user-test-helpers.js';

const DEEPAK = { name: 'Deepak Rao', phone: '+91 90030 71145', email: 'deepak.rao@example.com', role: 'staff' };

describeDb('add a user (EP-05-S4)', () => {
  let h: UsersHarness;
  let deepakId: string;

  beforeAll(async () => {
    h = await startUsersHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const usersWithPhone = async (phoneE164: string) =>
    Number(
      (await h.pool.query('select count(*) from users where shop_id = $1 and phone_e164 = $2', [h.shop.shopId, phoneE164]))
        .rows[0].count,
    );

  it("AC1: adds a pending staff user in the owner's shop, returns its id and mails the activation link", async () => {
    const res = await h.asOwner('createUser', DEEPAK, 'add-deepak');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: expect.any(String) });
    deepakId = res.body.id as string;
    const { rows } = await h.pool.query('select shop_id, name, phone, email, role, status from users where id = $1', [deepakId]);
    expect(rows[0]).toEqual({
      shop_id: h.shop.shopId,
      name: 'Deepak Rao',
      phone: '+919003071145',
      email: 'deepak.rao@example.com',
      role: 'staff',
      status: 'pending_activation',
    });
    expect(h.mailer.messages().filter((m) => m.to === 'deepak.rao@example.com')).toHaveLength(1);
    expect(h.mailer.messages().at(-1)).toMatchObject({ to: 'deepak.rao@example.com', subject: 'Set your JGD password' });
  });

  it('AC2: after activation Deepak signs in with his phone and lands on today', async () => {
    const token = activationToken(h, 'deepak.rao@example.com');
    expect((await h.auth('activateAccount', { token, password: 'counter-2026' })).status).toBe(200);
    const res = await signIn(h, '+91 90030 71145', 'counter-2026');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { userId: deepakId, name: 'Deepak Rao', role: 'staff' }, landingRoute: 'today' });
  });

  it('AC3: a phone an active user already has is refused on field phone and nothing is written', async () => {
    const res = await h.asOwner('createUser', { ...DEEPAK, name: 'Deepak Two', email: 'deepak.two@example.com' });
    expect(res).toEqual({ status: 400, body: { code: 'validation', message: USER_MESSAGES.phoneTaken, field: 'phone' } });
    expect(await usersWithPhone('+919003071145')).toBe(1);
  });

  it('AC4: a staff session is refused with the owner-only sentence', async () => {
    const res = await h.call('createUser', { ...DEEPAK, phone: '+91 90030 71150' }, { session: h.session });
    expect(res).toEqual({ status: 403, body: OWNER_ONLY });
    expect(await usersWithPhone('+919003071150')).toBe(0);
  });

  it.each([
    ['name', { ...DEEPAK, name: '  ' }],
    ['email', { ...DEEPAK, email: '' }],
    ['phone', { ...DEEPAK, phone: '12345' }],
  ])('AC5: an empty or wrong %s is refused as validation on that field', async (field, body) => {
    const res = await h.asOwner('createUser', body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field });
  });

  it('AC6: resend sends a new link and the earlier one stops working; an active user is refused', async () => {
    const add = await h.asOwner('createUser', {
      name: 'Vijay Kumar',
      phone: '+91 90030 71147',
      email: 'vijay.kumar@example.com',
      role: 'staff',
    });
    const vijay = add.body.id as string;
    const first = activationToken(h, 'vijay.kumar@example.com');
    expect(await h.asOwner('resendActivation', { userId: vijay })).toEqual({ status: 200, body: { ok: true } });
    const second = activationToken(h, 'vijay.kumar@example.com');
    expect(second).not.toBe(first);
    expect((await h.auth('checkPasswordLink', { token: first, purpose: 'activation' })).body).toEqual({
      ok: true,
      state: 'expired',
    });
    expect((await h.auth('checkPasswordLink', { token: second, purpose: 'activation' })).body).toEqual({
      ok: true,
      state: 'valid',
    });
    expect(await h.asOwner('resendActivation', { userId: deepakId })).toEqual(refused(USER_MESSAGES.notPending));
    expect(await h.call('resendActivation', { userId: vijay }, { session: h.session })).toEqual({
      status: 403,
      body: OWNER_ONLY,
    });
  });

  it('AC7: the role owner is refused because the shop already has an owner', async () => {
    const res = await h.asOwner('createUser', { ...DEEPAK, phone: '+91 90030 71151', role: 'owner' });
    expect(res).toEqual(refused(USER_MESSAGES.shopHasOwner));
    expect(await usersWithPhone('+919003071151')).toBe(0);
  });

  it('a karigar user needs a free karigar record', async () => {
    const kg04 = await addKarigar(h.pool, h.shop, 'KG-04');
    const lakshmi = { name: 'Lakshmi Devi', phone: '+91 90030 71152', email: 'lakshmi.devi@example.com', role: 'karigar' };
    expect(await h.asOwner('createUser', lakshmi)).toEqual(refused(USER_MESSAGES.linkFirst));
    expect((await h.asOwner('createUser', { ...lakshmi, karigarId: 'KG-99' })).body).toEqual({
      code: 'not_found',
      message: 'Karigar KG-99 was not found.',
    });
    const res = await h.asOwner('createUser', { ...lakshmi, karigarId: 'KG-04' });
    expect(res.status).toBe(200);
    expect(await userRow(h, res.body.id as string)).toMatchObject({ role: 'karigar', karigar_id: kg04 });
    const again = await h.asOwner('createUser', { ...lakshmi, phone: '+91 90030 71153', karigarId: 'KG-04' });
    expect(again).toEqual(refused(USER_MESSAGES.karigarTaken));
  });

  it('a staff user ignores a karigar code', async () => {
    const res = await h.asOwner('createUser', {
      name: 'Meera Nair',
      phone: '+91 90030 71154',
      email: 'meera.nair@example.com',
      role: 'staff',
      karigarId: 'KG-04',
    });
    expect(res.status).toBe(200);
    expect(await userRow(h, res.body.id as string)).toMatchObject({ role: 'staff', karigar_id: null });
  });

  it('a double tap with one idempotency key creates one user and sends one email', async () => {
    const body = { name: 'Arun Pillai', phone: '+91 90030 71155', email: 'arun.pillai@example.com', role: 'staff' };
    const a = await h.asOwner('createUser', body, 'add-arun');
    const b = await h.asOwner('createUser', body, 'add-arun');
    expect(a.status).toBe(200);
    expect(b).toEqual(a);
    expect(await usersWithPhone('+919003071155')).toBe(1);
    expect(h.mailer.messages().filter((m) => m.to === 'arun.pillai@example.com')).toHaveLength(1);
  });

  it('two parallel adds with the same phone create one user', async () => {
    const body = (n: number) => ({
      name: `Parallel ${n}`,
      phone: '+91 90030 71156',
      email: `parallel${n}@example.com`,
      role: 'staff',
    });
    const results = await Promise.all([h.asOwner('createUser', body(1), 'p-1'), h.asOwner('createUser', body(2), 'p-2')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)?.body).toMatchObject({ code: 'validation', field: 'phone' });
    expect(await usersWithPhone('+919003071156')).toBe(1);
  });
});
