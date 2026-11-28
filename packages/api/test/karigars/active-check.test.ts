/**
 * The shared "karigar is active" check and the allowance in force (EP-16-S8 AC3, AC4 server side,
 * S7 AC4). EP-19 and EP-21 call assertKarigarActive inside their own transactions.
 */
import { DomainError } from '@goldsmith/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertScoped } from '../../src/db/shop-context.js';
import { withTransaction } from '../../src/db/transaction.js';
import { assertKarigarActive, readAllowanceInForce } from '../../src/karigars/index.js';
import { ValidationError } from '../../src/pipeline/api-errors.js';
import { addKarigar, describeDb } from '../db/db-test-helpers.js';
import { expectExactlyOne, releaseTogether } from '../support/concurrency.js';
import { type KarigarHarness, karigarRow, startKarigarHarness } from './karigar-test-helpers.js';

describeDb('assertKarigarActive and readAllowanceInForce (EP-16-S8, S7)', () => {
  let h: KarigarHarness;
  beforeAll(async () => {
    h = await startKarigarHarness();
  });
  afterAll(async () => {
    await h?.close();
  });
  const check = (code: string) =>
    withTransaction(h.pool, (client) => assertKarigarActive({ client, afterCommit: () => {} }, h.shop, code));

  it('returns the karigar and its allowance when active', async () => {
    expect(await check('KG-02')).toEqual({ id: h.ids['KG-02'], code: 'KG-02', name: 'Mahesh Soni', wastageBp: 80 });
  });

  it('AC3: a deactivated karigar is refused with a sentence naming them', async () => {
    await h.pool.query(`update karigars set status = 'deactivated' where id = $1`, [h.ids['KG-01']]);
    await expect(check('KG-01')).rejects.toThrow(DomainError);
    await expect(check('KG-01')).rejects.toThrow('Lakshmi Devi is no longer active. Pick another karigar.');
  });

  it('AC4: an unknown karigar is "Say which karigar it came from."', async () => {
    const err = await check('KG-99').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ code: 'validation', field: 'karigarId', message: 'Say which karigar it came from.' });
  });

  it('another shop’s karigar is unknown', async () => {
    const other = await h.pool.query<{ id: string }>(`insert into shops (name) values ('Other') returning id`);
    const shopId = other.rows[0].id;
    await h.pool.query(
      `insert into karigars (shop_id, code, name, email, wastage_bp) values ($1, 'KG-77', 'Elsewhere', 'e@example.test', 70)`,
      [shopId],
    );
    await expect(check('KG-77')).rejects.toThrow('Say which karigar it came from.');
  });

  it('reads the allowance in force, and refuses an unknown karigar', async () => {
    expect(await readAllowanceInForce(h.pool, h.shop, 'KG-04')).toBe(80);
    await expect(readAllowanceInForce(h.pool, h.shop, 'KG-99')).rejects.toThrow('Say which karigar it came from.');
  });

  describe('S7 AC4: a deactivation and a job for the same karigar cannot both succeed', () => {
    const rounds = [0, 30, 0, 30, 60, 10];
    it.each(rounds.map((delay, i) => [i, delay]))('round %i (deactivation starts %i ms after the job check)', async (i, delay) => {
      const code = `KG-C${i}`;
      const karigarId = await addKarigar(h.pool, h.shop, code);
      const version = (await karigarRow(h, code)).version;
      const jobCode = `MO-2026-C${i}`;
      const createJob = async () => {
        try {
          await withTransaction(h.pool, async (client) => {
            await assertKarigarActive({ client, afterCommit: () => {} }, h.shop, code);
            await new Promise((r) => setTimeout(r, 40));
            await insertScoped(client, h.shop, 'karigar_jobs', {
              code: jobCode,
              karigar_id: karigarId,
              target_gross_units: 1,
              target_net_units: 1,
              tolerance_units: 1,
              gold_issued_units: 1,
            });
          });
          return { status: 200, body: {} };
        } catch (err) {
          return { status: 422, body: { message: (err as Error).message } };
        }
      };
      const deactivate = async () => {
        await new Promise((r) => setTimeout(r, delay));
        return h.asOwner('updateKarigarStatus', { karigarId: code, version, status: 'deactivated' });
      };
      const [job, deactivation] = await releaseTogether([createJob, deactivate]);
      expectExactlyOne([job, deactivation]);
      const jobs = await h.pool.query('select 1 from karigar_jobs where karigar_id = $1', [karigarId]);
      const row = await karigarRow(h, code);
      if (job.status === 200) {
        expect(jobs.rows).toHaveLength(1);
        expect(row.status).toBe('active');
        expect(deactivation.status).toBe(422);
        expect(deactivation.body.message).toBe(`${code} has open jobs: ${jobCode}. Hand them over before deactivating.`);
      } else {
        expect(jobs.rows).toHaveLength(0);
        expect(row.status).toBe('deactivated');
        expect(job.body.message).toContain('is no longer active');
      }
    });
  });
});
