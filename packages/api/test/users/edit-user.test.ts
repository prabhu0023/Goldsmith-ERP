/** Update User profile (EP-05-S5). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newUserWithPassword } from '../support/api-harness.js';
import {
  OWNER_ONLY,
  PASSWORD,
  signIn,
  startUsersHarness,
  type UsersHarness,
  userRow,
  WRONG_PASSWORD,
} from './user-test-helpers.js';

describeDb("edit a user's name, phone and email (EP-05-S5)", () => {
  let h: UsersHarness;
  let deepak: string;

  beforeAll(async () => {
    h = await startUsersHarness();
    deepak = await newUserWithPassword(h.pool, h.shop, {
      name: 'Deepak Rao',
      phone: '+91 90030 71145',
      email: 'deepak.rao@example.com',
      password: PASSWORD,
    });
  });

  afterAll(async () => {
    await h?.close();
  });

  const edit = (version: number, changes: Record<string, unknown> = {}) =>
    h.asOwner('updateUserProfile', {
      userId: deepak,
      version,
      name: 'Deepak Rao',
      phone: '+91 90030 71146',
      email: 'deepak.rao@example.com',
      ...changes,
    });

  it('AC1: a new phone is saved and the version goes to 2', async () => {
    expect((await userRow(h, deepak)).version).toBe(1);
    expect(await edit(1)).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, deepak)).toMatchObject({ phone: '+919003071146', version: 2 });
  });

  it('AC2: his password works with the new number and not with the old one', async () => {
    expect((await signIn(h, '+91 90030 71146')).status).toBe(200);
    const old = await signIn(h, '+91 90030 71145');
    expect({ status: old.status, body: old.body }).toEqual(WRONG_PASSWORD);
  });

  it('AC3: a save on version 1 after version 2 is a conflict and changes nothing', async () => {
    const res = await edit(1, { name: 'Deepak R', phone: '+91 90030 71149' });
    expect(res).toEqual({
      status: 409,
      body: { code: 'conflict', message: 'Someone else changed this user. Reload and try again.' },
    });
    expect(await userRow(h, deepak)).toMatchObject({ name: 'Deepak Rao', phone: '+919003071146', version: 2 });
  });

  it("AC4: another active user's phone is refused on field phone", async () => {
    await newUserWithPassword(h.pool, h.shop, { name: 'Vijay Kumar', phone: '+91 90030 71147', password: PASSWORD });
    const res = await edit(2, { phone: '+91 90030 71147' });
    expect(res).toEqual({ status: 400, body: { code: 'validation', message: USER_MESSAGES.phoneTaken, field: 'phone' } });
    expect(await userRow(h, deepak)).toMatchObject({ phone: '+919003071146', version: 2 });
  });

  it('AC5: a staff session is refused', async () => {
    const res = await h.call(
      'updateUserProfile',
      { userId: deepak, version: 2, name: 'X', phone: '+91 90030 71148', email: 'x@example.com' },
      { session: h.session },
    );
    expect(res).toEqual({ status: 403, body: OWNER_ONLY });
  });

  it('keeps the role, the status and open sessions', async () => {
    const session = await signIn(h, '+91 90030 71146');
    expect(await edit(2, { email: 'deepak@example.com' })).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, deepak)).toMatchObject({ role: 'staff', status: 'active', email: 'deepak@example.com' });
    expect((await h.auth('readCurrentSession', {}, { token: session.token ?? '' })).status).toBe(200);
  });

  it('an unknown user is not_found', async () => {
    const res = await h.asOwner('updateUserProfile', {
      userId: '00000000-0000-4000-8000-000000000000',
      version: 1,
      name: 'X',
      phone: '+91 90030 71148',
      email: 'x@example.com',
    });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
  });
});
