/** The karigar scorecard (EP-16-S10), computed from the job and parcel rows. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import {
  addFinishedJob,
  addJob,
  addParcel,
  FORBIDDEN_KEY,
  type KarigarHarness,
  keysOf,
  seedKarigar,
  startKarigarHarness,
} from './karigar-test-helpers.js';
describeDb('karigar scorecard (EP-16-S10)', () => {
  let h: KarigarHarness;
  const scorecard = (karigarId: string, session = h.owner) => h.call('readKarigarScorecard', { karigarId }, { session });
  beforeAll(async () => {
    h = await startKarigarHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  it('AC1: two settled jobs (447.3000 g with 6.3000 g loss, 160.0000 g with 2.3000 g loss) give 142 bp', async () => {
    const id = h.ids['KG-02'];
    await addFinishedJob(h, { code: 'MO-2026-201', karigarId: id, issuedUnits: 4_473_000, lossUnits: 63_000, settledAt: '2026-11-05T10:00:00Z', title: 'Kundan set' });
    await addFinishedJob(h, { code: 'MO-2026-202', karigarId: id, issuedUnits: 1_600_000, lossUnits: 23_000, settledAt: '2026-11-08T10:00:00Z' });
    const res = await scorecard('KG-02');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      karigar: { id: 'KG-02', name: 'Mahesh Soni', status: 'active', wastageBp: 80 },
      scorecard: { metalLossBp: 142, daysLate: 0, finishedJobs: 2, lastGapsG: [], averageGapG: null },
      jobs: [
        { id: 'MO-2026-202', title: null, status: 'handed_over', goldIssuedG: '160.0000', lossG: '2.3000', dueDate: null },
        { id: 'MO-2026-201', title: 'Kundan set', status: 'handed_over', goldIssuedG: '447.3000', lossG: '6.3000', dueDate: null },
      ],
    });
  });
  it('AC2: three released parcels give gaps 0.0280, 0.0330, 0.1380, newest first, and their average', async () => {
    const id = h.ids['KG-01'];
    await addParcel(h, { code: 'B-1', karigarId: id, releasedAt: '2026-11-01T10:00:00Z', gapUnits: -1380 });
    await addParcel(h, { code: 'B-2', karigarId: id, releasedAt: '2026-11-02T10:00:00Z', gapUnits: 330 });
    await addParcel(h, { code: 'B-3', karigarId: id, releasedAt: '2026-11-03T10:00:00Z', gapUnits: -280 });
    await addParcel(h, { code: 'B-4', karigarId: id, status: 'open', gapUnits: 9999 });
    const { scorecard: card } = (await scorecard('KG-01')).body as { scorecard: Record<string, unknown> };
    expect(card).toMatchObject({ lastGapsG: ['0.0280', '0.0330', '0.1380'], averageGapG: '0.0663', metalLossBp: null, finishedJobs: 0 });
  });
  it('AC3: eight released parcels give only the six newest', async () => {
    const id = await seedKarigar(h, 'KG-05', 'Eight Parcels', '+919840050505', 80, ['Temple'], null);
    for (let n = 1; n <= 8; n++) {
      await addParcel(h, { code: `E-${n}`, karigarId: id, releasedAt: `2026-11-0${n}T10:00:00Z`, gapUnits: n * 10 });
    }
    const { scorecard: card } = (await scorecard('KG-05')).body as { scorecard: { lastGapsG: string[] } };
    expect(card.lastGapsG).toEqual(['0.0080', '0.0070', '0.0060', '0.0050', '0.0040', '0.0030']);
  });
  it('AC4: days late are whole Asia/Kolkata days after the agreed date; an early handover adds none', async () => {
    const id = await seedKarigar(h, 'KG-06', 'Late Hand', '+919840060606', 80, ['Temple'], null);
    // Agreed 10 Nov 12:00 IST, handed over 13 Nov 00:30 IST (12 Nov 19:00 UTC): 3 days in Kolkata, 2 in UTC.
    await addFinishedJob(h, {
      code: 'MO-2026-301',
      karigarId: id,
      issuedUnits: 1_000_000,
      lossUnits: 0,
      dueDate: '2026-11-10T12:00:00+05:30',
      settledAt: '2026-11-13T00:30:00+05:30',
    });
    await addFinishedJob(h, {
      code: 'MO-2026-302',
      karigarId: id,
      issuedUnits: 1_000_000,
      lossUnits: 0,
      dueDate: '2026-11-20T12:00:00+05:30',
      confirmedDate: '2026-11-22T12:00:00+05:30',
      settledAt: '2026-11-18T12:00:00+05:30',
    });
    const { scorecard: card } = (await scorecard('KG-06')).body as { scorecard: Record<string, unknown> };
    expect(card).toMatchObject({ daysLate: 3, finishedJobs: 2, metalLossBp: 0 });
  });
  it('the confirmed date, not the due date, is the agreed date', async () => {
    const id = await seedKarigar(h, 'KG-11', 'Confirmed', '+919840111111', 80, ['Temple'], null);
    await addFinishedJob(h, {
      code: 'MO-2026-311',
      karigarId: id,
      issuedUnits: 1_000_000,
      lossUnits: 0,
      dueDate: '2026-11-01T12:00:00+05:30',
      confirmedDate: '2026-11-04T12:00:00+05:30',
      settledAt: '2026-11-06T12:00:00+05:30',
    });
    expect(((await scorecard('KG-11')).body as { scorecard: { daysLate: number } }).scorecard.daysLate).toBe(2);
  });
  it('a karigar with no finished job shows no loss figure, and open jobs are not finished', async () => {
    const res = await scorecard('KG-04');
    expect(res.body).toMatchObject({
      scorecard: { metalLossBp: null, daysLate: 0, finishedJobs: 0, lastGapsG: [], averageGapG: null },
      jobs: [{ id: 'MO-2026-118', status: 'sent', goldIssuedG: '0.0001', lossG: null }],
    });
  });
  it('a parcel that is not released does not count toward the loss', async () => {
    const id = await seedKarigar(h, 'KG-12', 'Open Parcel', '+919840121212', 80, ['Temple'], null);
    const jobId = await addJob(h, { code: 'MO-2026-321', karigarId: id, issuedUnits: 1_000_000, settledAt: '2026-11-05T10:00:00Z' });
    await addParcel(h, { code: 'P-321', karigarId: id, jobId, status: 'released', releasedAt: '2026-11-05T10:00:00Z', lossUnits: 10_000 });
    await addParcel(h, { code: 'P-321b', karigarId: id, jobId, status: 'stopped', lossUnits: 90_000 });
    expect(((await scorecard('KG-12')).body as { scorecard: { metalLossBp: number } }).scorecard.metalLossBp).toBe(100);
  });
  it('AC5: no rating, price or money field in the answer, and the old figures are gone from the table', async () => {
    const body = (await scorecard('KG-02')).body;
    expect(keysOf(body).filter((k) => FORBIDDEN_KEY.test(k))).toEqual([]);
    const { rows } = await h.pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'karigars' and table_schema = current_schema()",
    );
    const columns = rows.map((r) => r.column_name);
    for (const dropped of ['rating', 'finished_jobs', 'late_days', 'metal_loss_pct', 'wastage_pct', 'specialty']) {
      expect(columns).not.toContain(dropped);
    }
    const gapTable = await h.pool.query("select to_regclass('karigar_gap_history') as t");
    expect(gapTable.rows[0].t).toBeNull();
  });
  describe('refusals', () => {
    it('an unknown karigar is not_found', async () => {
      expect(await scorecard('KG-99')).toEqual({ status: 404, body: { code: 'not_found', message: 'Karigar KG-99 was not found.' } });
    });
    it('staff and a karigar get the owner-only sentence', async () => {
      const expected = { status: 403, body: { code: 'forbidden', message: 'Only the owner can see the karigar scorecard.' } };
      expect(await scorecard('KG-02', h.session)).toEqual(expected);
      expect(await scorecard('KG-04', h.karigarSession)).toEqual(expected);
    });
  });
});
