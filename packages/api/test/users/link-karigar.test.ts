/** Link Karigar (EP-05-S13). */
import { USER_MESSAGES } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { insertScoped } from '../../src/db/shop-context.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { newSession, newUser } from '../support/api-harness.js';
import { OWNER_ONLY, refused, startUsersHarness, type UsersHarness, userRow } from './user-test-helpers.js';

describeDb('link a karigar user to a karigar record (EP-05-S13)', () => {
  let h: UsersHarness;
  let kg04: string;
  let lakshmi: string;

  const addJob = (code: string, karigarId: string) =>
    insertScoped(h.pool, h.shop, 'karigar_jobs', {
      code,
      karigar_id: karigarId,
      target_gross_units: 1,
      target_net_units: 1,
      tolerance_units: 1,
      gold_issued_units: 1,
    });

  beforeAll(async () => {
    h = await startUsersHarness();
    kg04 = await addKarigar(h.pool, h.shop, 'KG-04');
    const kg01 = await addKarigar(h.pool, h.shop, 'KG-01');
    await addJob('MO-2026-101', kg04);
    await addJob('MO-2026-102', kg04);
    await addJob('MO-2026-201', kg01);
    lakshmi = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar' });
  });

  afterAll(async () => {
    await h?.close();
  });

  const link = async (userId: string, karigarId: string) =>
    h.asOwner('linkKarigar', { userId, version: (await userRow(h, userId)).version, karigarId });

  it('AC1: links Lakshmi to KG-04, and her job list shows only KG-04 jobs', async () => {
    const before = await userRow(h, lakshmi);
    expect(await link(lakshmi, 'KG-04')).toEqual({ status: 200, body: { ok: true } });
    expect(await userRow(h, lakshmi)).toMatchObject({ karigar_id: kg04, version: before.version + 1 });
    const session = await newSession(h.pool, h.shop, lakshmi);
    const jobs = await h.call('listMyJobs', {}, { session });
    expect((jobs.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual(['MO-2026-101', 'MO-2026-102']);
  });

  it('AC2: a record another live user is linked to is refused', async () => {
    const second = await newUser(h.pool, h.shop, { name: 'Murugan K', role: 'karigar' });
    const before = await userRow(h, second);
    expect(await link(second, 'KG-04')).toEqual(refused(USER_MESSAGES.karigarTaken));
    expect(await userRow(h, second)).toEqual(before);
  });

  it('AC3: a staff user cannot be linked', async () => {
    expect(await link(h.userId, 'KG-04')).toEqual(refused(USER_MESSAGES.onlyKarigarLinks));
  });

  it('AC4: an unknown karigar record is not_found', async () => {
    expect(await link(lakshmi, 'KG-99')).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Karigar KG-99 was not found.' },
    });
  });

  it('AC5: a staff session is refused', async () => {
    const res = await h.call('linkKarigar', { userId: lakshmi, version: 2, karigarId: 'KG-01' }, { session: h.session });
    expect(res).toEqual({ status: 403, body: OWNER_ONLY });
  });

  it('a stale version is a conflict', async () => {
    const res = await h.asOwner('linkKarigar', { userId: lakshmi, version: 1, karigarId: 'KG-01' });
    expect(res.status).toBe(409);
    expect((await userRow(h, lakshmi)).karigar_id).toBe(kg04);
  });
});
