/** List Users and Unlock (EP-05-S11 AC1-AC3, AC5-AC7). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { newUser, newUserWithPassword } from '../support/api-harness.js';
import {
  auditOf,
  OWNER_ONLY,
  PASSWORD,
  signIn,
  startUsersHarness,
  type UsersHarness,
  WRONG_PASSWORD,
} from './user-test-helpers.js';

interface Item {
  id: string;
  name: string;
  phone: string;
  role: string;
  status: string;
  karigarId: string | null;
  lockedUntil: string | null;
  lockedUntilLocal: string | null;
}

describeDb('the user directory (EP-05-S11)', () => {
  let h: UsersHarness;
  let deepak: string;
  let lakshmi: string;
  let vijay: string;
  let meera: string;

  beforeAll(async () => {
    h = await startUsersHarness();
    deepak = await newUserWithPassword(h.pool, h.shop, { name: 'Deepak Rao', phone: '+91 90030 71145', password: PASSWORD });
    const kg04 = await addKarigar(h.pool, h.shop, 'KG-04');
    lakshmi = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar', karigarId: kg04 });
    vijay = await newUser(h.pool, h.shop, { name: 'Vijay Kumar', status: 'deactivated' });
    meera = await newUser(h.pool, h.shop, { name: 'Meera Nair', status: 'pending_activation' });
  });

  afterAll(async () => {
    await h?.close();
  });

  const list = async (body: Record<string, unknown> = {}) => {
    const res = await h.asOwner('listUsers', body);
    expect(res.status).toBe(200);
    return res.body as { items: Item[]; nextCursor: string | null; pageSize: number };
  };

  it('AC1: lists every user of the shop by name with phone, role and status', async () => {
    const page = await list();
    expect(page.items.map((u) => u.name)).toEqual([
      'Deepak Rao',
      'Lakshmi Devi',
      'Meera Nair',
      'Rajesh Verma',
      'Sanjay Seth',
      'Vijay Kumar',
    ]);
    expect(page.items.find((u) => u.id === h.ownerId)).toMatchObject({ phone: '+91 98410 33333', role: 'owner', status: 'active' });
    expect(page.items.find((u) => u.id === lakshmi)).toMatchObject({ role: 'karigar', karigarId: 'KG-04' });
    expect(page.items.find((u) => u.id === h.userId)).toMatchObject({ role: 'staff', karigarId: null, lockedUntil: null });
    expect(page.nextCursor).toBeNull();
  });

  it("AC1: another shop's users are not listed", async () => {
    const other = await startUsersHarness();
    try {
      const names = ((await other.asOwner('listUsers', {})).body.items as Item[]).map((u) => u.name);
      expect(names).toEqual(['Rajesh Verma', 'Sanjay Seth']);
    } finally {
      await other.close();
    }
  });

  it('AC2: a staff session is refused', async () => {
    expect(await h.call('listUsers', {}, { session: h.session })).toEqual({ status: 403, body: OWNER_ONLY });
  });

  it('AC3: the next page loads with a cursor', async () => {
    const names: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list({ pageSize: 2, ...(cursor ? { cursor } : {}) });
      expect(page.items.length).toBeLessThanOrEqual(2);
      names.push(...page.items.map((u) => u.name));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(names).toEqual((await list()).items.map((u) => u.name));
    const bad = await h.asOwner('listUsers', { cursor: 'not-a-cursor' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'validation', field: 'cursor' });
  });

  it('AC5, AC7: deactivated and not yet activated users show their status', async () => {
    const page = await list();
    expect(page.items.find((u) => u.id === vijay)?.status).toBe('deactivated');
    expect(page.items.find((u) => u.id === meera)?.status).toBe('pending_activation');
  });

  it('AC6: a locked user shows when the lock ends; Unlock lets him sign in at once and is audited', async () => {
    for (let i = 0; i < 5; i++) await signIn(h, '+91 90030 71145', 'wrong-password');
    expect((await signIn(h, '+91 90030 71145')).status).toBe(422);
    const locked = (await list()).items.find((u) => u.id === deepak);
    expect(locked).toMatchObject({ lockedUntil: '2026-11-21T10:15:00.000Z', lockedUntilLocal: '15:45' });

    expect(await h.call('unlockUser', { userId: deepak }, { session: h.session })).toEqual({ status: 403, body: OWNER_ONLY });
    expect(await h.asOwner('unlockUser', { userId: deepak })).toEqual({ status: 200, body: { ok: true } });
    expect((await signIn(h, '+91 90030 71145')).status).toBe(200);
    expect((await list()).items.find((u) => u.id === deepak)).toMatchObject({ lockedUntil: null, lockedUntilLocal: null });
    const entries = await auditOf(h, 'account_unlocked', deepak);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actor_id: h.ownerId, actor_name: 'Sanjay Seth', actor_role: 'owner' });
  });

  it('AC6: a wrong password still counts after an unlock', async () => {
    const res = await signIn(h, '+91 90030 71145', 'wrong-password');
    expect({ status: res.status, body: res.body }).toEqual(WRONG_PASSWORD);
  });
});
