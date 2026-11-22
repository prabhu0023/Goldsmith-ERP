/**
 * Karigar scope (EP-05-S3): a karigar sees only their own jobs, with no customer, price or
 * weight fields. Served by the production contract, handlers and permission check.
 */
import { PLANNED_OPERATIONS, refusalFor, roleMay } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { insertScoped } from '../../src/db/shop-context.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';

const JOB_KEYS = [
  'code',
  'title',
  'style',
  'qty',
  'purity',
  'status',
  'dueDate',
  'confirmedDate',
  'stopped',
  'referenceImageKey',
].sort();

describeDb('karigar scope (EP-05-S3)', () => {
  let h: Harness;
  let lakshmi: string;
  let other: string;

  async function addJob(code: string, karigarId: string, extra: Record<string, unknown> = {}): Promise<void> {
    await insertScoped(h.pool, h.shop, 'karigar_jobs', {
      code,
      karigar_id: karigarId,
      title: `Job ${code}`,
      style: 'Jhumka',
      qty: 2,
      purity: '22K',
      note: 'Customer Meena Iyer, quoted 84,000',
      target_gross_units: 120_000,
      target_net_units: 110_000,
      tolerance_units: 500,
      gold_issued_units: 125_000,
      ...extra,
    });
  }

  beforeAll(async () => {
    h = await startHarness({ production: true });
    const kg04 = await addKarigar(h.pool, h.shop, 'KG-04');
    const kg01 = await addKarigar(h.pool, h.shop, 'KG-01');
    const lakshmiId = await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar', karigarId: kg04 });
    const otherId = await newUser(h.pool, h.shop, { name: 'Murugan K', role: 'karigar', karigarId: kg01 });
    lakshmi = await newSession(h.pool, h.shop, lakshmiId);
    other = await newSession(h.pool, h.shop, otherId);
    await addJob('MO-2026-101', kg04, { ref_image_key: 'jobs/MO-2026-101/ref.jpg', due_date: '2026-11-28T00:00:00Z' });
    await addJob('MO-2026-102', kg04);
    await addJob('MO-2026-103', kg04, { status: 'accepted', confirmed_date: '2026-11-27T00:00:00Z' });
    await addJob('MO-2026-201', kg01, { ref_image_key: 'jobs/MO-2026-201/ref.jpg' });
  });

  afterAll(async () => {
    await h?.close();
  });

  it("AC1: another karigar's job answers not_found and shows none of its fields", async () => {
    const res = await h.call('readMyJob', { jobId: 'MO-2026-201' }, { session: lakshmi });
    expect(res).toEqual({ status: 404, body: { code: 'not_found', message: 'Job MO-2026-201 was not found.' } });
  });

  it('AC2: the job list holds only her own jobs, by code, page by page', async () => {
    const all = await h.call('listMyJobs', {}, { session: lakshmi });
    expect(all.status).toBe(200);
    expect((all.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual([
      'MO-2026-101',
      'MO-2026-102',
      'MO-2026-103',
    ]);
    expect(all.body.nextCursor).toBeNull();

    const first = await h.call('listMyJobs', { pageSize: 2 }, { session: lakshmi });
    expect((first.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual(['MO-2026-101', 'MO-2026-102']);
    const second = await h.call(
      'listMyJobs',
      { pageSize: 2, cursor: first.body.nextCursor },
      { session: lakshmi },
    );
    expect((second.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual(['MO-2026-103']);
    expect(second.body.nextCursor).toBeNull();

    const theirs = await h.call('listMyJobs', {}, { session: other });
    expect((theirs.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual(['MO-2026-201']);
  });

  it('refuses a cursor that is not one of ours', async () => {
    const res = await h.call('listMyJobs', { cursor: 'not-a-cursor' }, { session: lakshmi });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field: 'cursor' });
  });

  it("AC3: her own job's reference image key is readable; another karigar's is not", async () => {
    const own = await h.call('readMyJob', { jobId: 'MO-2026-101' }, { session: lakshmi });
    expect(own.status).toBe(200);
    expect(own.body).toEqual({
      ok: true,
      job: {
        code: 'MO-2026-101',
        title: 'Job MO-2026-101',
        style: 'Jhumka',
        qty: 2,
        purity: '22K',
        status: 'sent',
        dueDate: '2026-11-28T00:00:00.000Z',
        confirmedDate: null,
        stopped: false,
        referenceImageKey: 'jobs/MO-2026-101/ref.jpg',
      },
    });
    const theirs = await h.call('readMyJob', { jobId: 'MO-2026-201' }, { session: lakshmi });
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body)).not.toContain('ref.jpg');
  });

  it('AC4: a karigar is refused shop-floor and owner operations by the central check', async () => {
    expect(await h.call('markLeadLost', { leadId: 'LD-2026-001' }, { session: lakshmi })).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'A karigar can only work on their own jobs.' },
    });
    expect(await h.call('listJobRuns', {}, { session: lakshmi })).toEqual({
      status: 403,
      body: { code: 'forbidden', message: refusalFor('listJobRuns') },
    });
    const shopFloor = PLANNED_OPERATIONS.filter((op) =>
      /Lead|Customer|stock|Stock|Parcel|Tag|qcTick|Hold|Wishes|Broadcast|Scrap|Edit|Report/.test(op),
    );
    expect(shopFloor.length).toBeGreaterThan(10);
    for (const op of shopFloor) expect(roleMay('karigar', op), op).toBe(false);
  });

  it('refuses the own-job reads to staff', async () => {
    expect(await h.call('listMyJobs', {}, { session: h.session })).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only a karigar can do this, on their own job.' },
    });
  });

  it('AC5: a job carries exactly the bench fields, no customer, price or weight', async () => {
    const list = await h.call('listMyJobs', {}, { session: lakshmi });
    for (const job of list.body.items as Array<Record<string, unknown>>) expect(Object.keys(job).sort()).toEqual(JOB_KEYS);
    const one = await h.call('readMyJob', { jobId: 'MO-2026-103' }, { session: lakshmi });
    expect(Object.keys(one.body.job as object).sort()).toEqual(JOB_KEYS);
    const text = JSON.stringify([list.body, one.body]);
    for (const leak of ['Meena', '84,000', '120000', '125000', 'units', 'note']) expect(text).not.toContain(leak);
  });
});
