import { gramsToUnits, POOL_MESSAGES, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, ValidationError } from '../../src/pipeline/api-errors.js';
import { assertPoolConsistent, checkPoolConsistency } from '../../src/pool/pool-consistency.js';
import { postIssue } from '../../src/pool/post-issue.js';
import { postPoolEntry } from '../../src/pool/post-pool-entry.js';
import { postRecovery } from '../../src/pool/post-recovery.js';
import { addPiece, describeDb, expectPgError, testPool } from '../db/db-test-helpers.js';
import { balanceOf, entryCount, inTransaction, newPoolShop } from './pool-test-helpers.js';

const units = (g: string): number => {
  const r = gramsToUnits(g);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};

describeDb('metal pool posting core (EP-18-S1, S3, S4, S5, S6, S12)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(25);
  });
  afterAll(async () => {
    await pool.end();
  });

  describe('S1 storage and the posting function', () => {
    it('AC1: accepts the five kinds and refuses any other', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      for (const [kind, deltaUnits] of [
        ['opening', 10],
        ['issued', -10],
        ['returned', 10],
        ['recovered', 10],
        ['adjustment', -10],
        ['adjustment', 10],
      ] as const) {
        await inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind, deltaUnits }));
      }
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(7);
      const row = await pool.query<{ metal_pool_id: string }>('select metal_pool_id from pool_entries where shop_id = $1 limit 1', [
        ctx.shop.shopId,
      ]);
      await expectPgError(
        pool.query(
          `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units)
           values ($1, $2, $3, 'PL-900', now(), 'melted', 1)`,
          [ctx.shop.shopId, ctx.shop.locationId, row.rows[0].metal_pool_id],
        ),
        '23514',
      );
    });

    it('AC1: stores integer deltas, the reference, the actor and the server time', async () => {
      const { ctx, userId } = await newPoolShop(pool, units('812.58'));
      const posted = await inTransaction(pool, (tx) =>
        postPoolEntry(tx, ctx, { kind: 'adjustment', deltaUnits: -125, note: 'Scale drift', ref: { type: 'job', id: 'MO-2026-118' } }),
      );
      expect(posted.code).toBe('PL-002');
      const { rows } = await pool.query(
        'select kind, delta_units, note, ref_type, ref_id, actor_id, actor_name, at from pool_entries where shop_id = $1 and code = $2',
        [ctx.shop.shopId, posted.code],
      );
      expect(rows[0]).toEqual({
        kind: 'adjustment',
        delta_units: -125,
        note: 'Scale drift',
        ref_type: 'job',
        ref_id: 'MO-2026-118',
        actor_id: userId,
        actor_name: 'Sanjay Seth',
        at: ctx.at,
      });
    });

    it('AC1: a reference is both type and id, or neither', async () => {
      const { ctx } = await newPoolShop(pool, 1000);
      const poolId = (await pool.query('select id from metal_pools where shop_id = $1', [ctx.shop.shopId])).rows[0].id;
      await expectPgError(
        pool.query(
          `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units, ref_type)
           values ($1, $2, $3, 'PL-901', now(), 'issued', -1, 'job')`,
          [ctx.shop.shopId, ctx.shop.locationId, poolId],
        ),
        '23514',
      );
      await expect(
        inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind: 'issued', deltaUnits: -1, ref: { type: 'job', id: '' } })),
      ).rejects.toThrow(/both a type and an id/);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC2: the stored balance cannot go below zero', async () => {
      const { ctx } = await newPoolShop(pool, 1000);
      await expectPgError(pool.query('update metal_pools set balance_units = -1 where shop_id = $1', [ctx.shop.shopId]), '23514');
    });

    it('AC4: an update, delete or truncate of an entry is refused by the database', async () => {
      const { ctx } = await newPoolShop(pool, 1000);
      const { shopId } = ctx.shop;
      await expectPgError(pool.query(`update pool_entries set note = 'x' where shop_id = $1`, [shopId]), 'P0001');
      await expectPgError(pool.query('delete from pool_entries where shop_id = $1', [shopId]), 'P0001');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await expectPgError(client.query('truncate pool_entries'), 'P0001');
      } finally {
        await client.query('rollback');
        client.release();
      }
      expect(await entryCount(pool, shopId)).toBe(1);
    });

    it('AC5: the consistency check passes when the ledger sums to the balance and fails with both numbers when not', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind: 'issued', deltaUnits: -1000 }));
      expect(await checkPoolConsistency(pool, ctx.shop)).toEqual({ balanceUnits: 8124800, ledgerUnits: 8124800, ok: true });
      await assertPoolConsistent(pool, ctx.shop);
      await pool.query('update metal_pools set balance_units = balance_units + 10 where shop_id = $1', [ctx.shop.shopId]);
      expect(await checkPoolConsistency(pool, ctx.shop)).toEqual({ balanceUnits: 8124810, ledgerUnits: 8124800, ok: false });
      await expect(assertPoolConsistent(pool, ctx.shop)).rejects.toThrow('812.4810 g does not match the ledger sum 812.4800 g');
    });

    it('AC6: the server sets the shop and the location of every entry', async () => {
      const { ctx } = await newPoolShop(pool, 1000);
      const posted = await inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind: 'returned', deltaUnits: 5 }));
      const { rows } = await pool.query('select shop_id, location_id from pool_entries where shop_id = $1 and code = $2', [
        ctx.shop.shopId,
        posted.code,
      ]);
      expect(rows[0]).toEqual({ shop_id: ctx.shop.shopId, location_id: ctx.shop.locationId });
    });

    it('a rollback leaves neither the entry nor the balance changed', async () => {
      const { ctx } = await newPoolShop(pool, 5000);
      await expect(
        inTransaction(pool, async (tx) => {
          await postPoolEntry(tx, ctx, { kind: 'issued', deltaUnits: -2000 });
          throw new Error('caller failed afterwards');
        }),
      ).rejects.toThrow('caller failed afterwards');
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(5000);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('refuses to run outside a transaction', async () => {
      const { ctx } = await newPoolShop(pool, 5000);
      const client = await pool.connect();
      try {
        await expect(
          postPoolEntry({ client, afterCommit: () => {} }, ctx, { kind: 'issued', deltaUnits: -1 }),
        ).rejects.toThrow(/inside a transaction/);
      } finally {
        client.release();
      }
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(5000);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('refuses a zero, fractional or wrong-sign amount', async () => {
      const { ctx } = await newPoolShop(pool, 5000);
      for (const [kind, deltaUnits] of [
        ['issued', 0],
        ['issued', -1.5],
        ['issued', 5],
        ['opening', -5],
        ['returned', -5],
        ['recovered', -5],
        ['adjustment', 0],
      ] as const) {
        await expect(inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind, deltaUnits })), `${kind} ${deltaUnits}`).rejects.toThrow();
      }
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('creates the pool row when the shop has none', async () => {
      const { ctx } = await newPoolShop(pool, 0);
      await pool.query('delete from metal_pools where shop_id = $1', [ctx.shop.shopId]);
      const posted = await inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind: 'opening', deltaUnits: 700 }));
      expect(posted).toMatchObject({ code: 'PL-001', balanceUnits: 700 });
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(700);
    });
  });

  describe('S3 issue', () => {
    it('AC1: 162.4000 g from 812.5800 g leaves 650.1800 g, one entry, one reference', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      const posted = await inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-2026-118', amountUnits: units('162.4') }));
      expect(posted.balanceUnits).toBe(6501800);
      expect(unitsToGrams(posted.balanceUnits)).toBe('650.1800');
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(6501800);
      const { rows } = await pool.query(
        'select kind, delta_units, ref_type, ref_id from pool_entries where shop_id = $1 and code = $2',
        [ctx.shop.shopId, posted.code],
      );
      expect(rows[0]).toEqual({ kind: 'issued', delta_units: -1624000, ref_type: 'job', ref_id: 'MO-2026-118' });
      await assertPoolConsistent(pool, ctx.shop);
    });

    it('AC2: a rollback of the caller leaves the entry and the balance unchanged', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await expect(
        inTransaction(pool, async (tx) => {
          await postIssue(tx, ctx, { jobCode: 'MO-2026-118', amountUnits: units('162.4') });
          throw new Error('job creation failed');
        }),
      ).rejects.toThrow('job creation failed');
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(8125800);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC3: an issue without a job code is refused', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await expect(inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: '', amountUnits: 1000 }))).rejects.toThrow(/job code/);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC4: an issue outside a transaction is refused', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      const client = await pool.connect();
      try {
        await expect(postIssue({ client, afterCommit: () => {} }, ctx, { jobCode: 'MO-1', amountUnits: 1000 })).rejects.toThrow(
          /inside a transaction/,
        );
      } finally {
        client.release();
      }
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(8125800);
    });
  });

  describe('S4 refusal above the balance', () => {
    it('AC1: 162.4000 g against 150.0000 g is refused with pool_insufficient and the sentence, and nothing changes', async () => {
      const { ctx } = await newPoolShop(pool, units('150'));
      const attempt = inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-2026-118', amountUnits: units('162.4') }));
      await expect(attempt).rejects.toMatchObject({ code: 'pool_insufficient', message: 'The metal pool does not have that much gold to issue.' });
      await expect(attempt).rejects.toBeInstanceOf(ApiError);
      expect(POOL_MESSAGES.insufficient).toBe('The metal pool does not have that much gold to issue.');
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(1500000);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC2: an issue of exactly the balance succeeds and leaves 0.0000 g', async () => {
      const { ctx } = await newPoolShop(pool, units('150'));
      const posted = await inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-1', amountUnits: units('150') }));
      expect(unitsToGrams(posted.balanceUnits)).toBe('0.0000');
    });

    it('AC3: a negative, zero or fractional amount is refused as validation on goldIssuedG', async () => {
      const { ctx } = await newPoolShop(pool, units('150'));
      for (const amountUnits of [-5, 0, 0.5, Number.NaN]) {
        const attempt = inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-1', amountUnits }));
        await expect(attempt, String(amountUnits)).rejects.toBeInstanceOf(ValidationError);
        await expect(attempt, String(amountUnits)).rejects.toMatchObject({ code: 'validation', field: 'goldIssuedG' });
      }
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC4: the database check is a second guard against a negative balance', async () => {
      const { ctx } = await newPoolShop(pool, 100);
      await expectPgError(pool.query('update metal_pools set balance_units = balance_units - 101 where shop_id = $1', [ctx.shop.shopId]), '23514');
    });
  });

  describe('S5 concurrency', () => {
    const issue = (ctx: Awaited<ReturnType<typeof newPoolShop>>['ctx'], jobCode: string, g: string) =>
      inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode, amountUnits: units(g) })).then(
        () => 'ok',
        (e: unknown) => (e instanceof ApiError ? e.code : 'crashed'),
      );

    it('AC1: two 60 g issues on 100 g: one wins, one is refused', async () => {
      const { ctx } = await newPoolShop(pool, units('100'));
      const results = await Promise.all([issue(ctx, 'MO-A', '60'), issue(ctx, 'MO-B', '60')]);
      expect(results.sort()).toEqual(['ok', 'pool_insufficient']);
      expect(unitsToGrams(await balanceOf(pool, ctx.shop.shopId))).toBe('40.0000');
      await assertPoolConsistent(pool, ctx.shop);
    });

    it('AC2: two 40 g issues on 100 g both win', async () => {
      const { ctx } = await newPoolShop(pool, units('100'));
      expect(await Promise.all([issue(ctx, 'MO-A', '40'), issue(ctx, 'MO-B', '40')])).toEqual(['ok', 'ok']);
      expect(unitsToGrams(await balanceOf(pool, ctx.shop.shopId))).toBe('20.0000');
      await assertPoolConsistent(pool, ctx.shop);
    });

    it('AC3: an issue racing a negative adjustment cannot overdraw the pool', async () => {
      const { ctx } = await newPoolShop(pool, units('100'));
      const adjust = inTransaction(pool, (tx) => postPoolEntry(tx, ctx, { kind: 'adjustment', deltaUnits: -units('60') })).then(
        () => 'ok',
        (e: unknown) => (e instanceof ApiError ? e.code : 'crashed'),
      );
      const results = await Promise.all([issue(ctx, 'MO-A', '60'), adjust]);
      expect(results.sort()).toEqual(['ok', 'pool_insufficient']);
      expect(unitsToGrams(await balanceOf(pool, ctx.shop.shopId))).toBe('40.0000');
      await assertPoolConsistent(pool, ctx.shop);
    });

    it('AC4 and AC5: 20 concurrent 10 g issues on 150 g give exactly 15 wins and 5 refusals, ledger equals balance 0.0000 g', async () => {
      const { ctx } = await newPoolShop(pool, units('150'));
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => issue(ctx, `MO-C-${i}`, '10')));
      expect(results.filter((r) => r === 'ok')).toHaveLength(15);
      expect(results.filter((r) => r === 'pool_insufficient')).toHaveLength(5);
      const balance = await balanceOf(pool, ctx.shop.shopId);
      expect(unitsToGrams(balance)).toBe('0.0000');
      expect(await checkPoolConsistency(pool, ctx.shop)).toEqual({ balanceUnits: 0, ledgerUnits: 0, ok: true });
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(16);
      const codes = (await pool.query('select code from pool_entries where shop_id = $1', [ctx.shop.shopId])).rows.map((r) => r.code);
      expect(new Set(codes).size).toBe(16);
    });
  });

  describe('S6 recovery', () => {
    // TAG-7701 Temple Haram: gross 90.0000 g, stones 11.6000 g, net 78.4000 g.
    const addScrap = (shop: { shopId: string; locationId: string }, tag = 'TAG-7701') =>
      addPiece(pool, shop, tag, { grossUnits: units('90'), stoneUnits: units('11.6') });

    it('AC1: a piece with net 78.4000 g takes the pool from 812.5800 g to 890.9800 g', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await addScrap(ctx.shop);
      const posted = await inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-7701' }));
      expect(posted.balanceUnits).toBe(8909800);
      expect(unitsToGrams(posted.balanceUnits)).toBe('890.9800');
      const { rows } = await pool.query(
        'select kind, delta_units, ref_type, ref_id from pool_entries where shop_id = $1 and code = $2',
        [ctx.shop.shopId, posted.code],
      );
      expect(rows[0]).toEqual({ kind: 'recovered', delta_units: 784000, ref_type: 'piece', ref_id: 'TAG-7701' });
      await assertPoolConsistent(pool, ctx.shop);
    });

    it('AC2: a second recovery of the same piece is refused', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await addScrap(ctx.shop);
      await inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-7701' }));
      await expect(inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-7701' }))).rejects.toThrow(POOL_MESSAGES.alreadyRecovered);
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(8909800);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(2);
    });

    it('AC2: two recoveries of the same piece at once post one entry (the database index is the backstop)', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await addScrap(ctx.shop);
      const results = await Promise.allSettled([
        inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-7701' })),
        inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-7701' })),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(8909800);
      await expectPgError(
        pool.query(
          `insert into pool_entries (shop_id, location_id, metal_pool_id, code, at, kind, delta_units, ref_type, ref_id)
           select shop_id, location_id, metal_pool_id, 'PL-950', now(), 'recovered', 1, 'piece', 'TAG-7701' from pool_entries where shop_id = $1 limit 1`,
          [ctx.shop.shopId],
        ),
        '23505',
      );
    });

    it('AC3: a rollback of the caller leaves the entry and the balance unchanged', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await addScrap(ctx.shop);
      await expect(
        inTransaction(pool, async (tx) => {
          await postRecovery(tx, ctx, { tagNo: 'TAG-7701' });
          throw new Error('scrap failed');
        }),
      ).rejects.toThrow('scrap failed');
      expect(await balanceOf(pool, ctx.shop.shopId)).toBe(8125800);
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });

    it('AC4: a piece with no net gold, or no piece at all, is refused', async () => {
      const { ctx } = await newPoolShop(pool, units('812.58'));
      await addPiece(pool, ctx.shop, 'TAG-ZERO', { grossUnits: 1000, stoneUnits: 1000 });
      await expect(inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-ZERO' }))).rejects.toThrow(/no gold weight/);
      await expect(inTransaction(pool, (tx) => postRecovery(tx, ctx, { tagNo: 'TAG-NONE' }))).rejects.toMatchObject({
        code: 'not_found',
        message: 'Piece TAG-NONE was not found.',
      });
      expect(await entryCount(pool, ctx.shop.shopId)).toBe(1);
    });
  });

  describe('S12 live event', () => {
    const events = async (shopId: string) =>
      (
        await pool.query(
          `select topic, entity_type, entity_id, entity_version, payload from outbox_events where shop_id = $1 order by id`,
          [shopId],
        )
      ).rows;

    it('AC2: a rolled-back posting leaves no outbox row', async () => {
      const { ctx } = await newPoolShop(pool, units('100'));
      await expect(
        inTransaction(pool, async (tx) => {
          await postIssue(tx, ctx, { jobCode: 'MO-1', amountUnits: units('10') });
          throw new Error('rolled back');
        }),
      ).rejects.toThrow('rolled back');
      expect(await events(ctx.shop.shopId)).toEqual([]);
    });

    it('AC2: a committed posting leaves one metal_pool.changed row with the new version and no weights', async () => {
      const { ctx } = await newPoolShop(pool, units('100'));
      const posted = await inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-1', amountUnits: units('10') }));
      const rows = await events(ctx.shop.shopId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        topic: 'metal_pool.changed',
        entity_type: 'metal_pool',
        entity_id: 'metal-pool',
        entity_version: posted.version,
        payload: { kind: 'issued' },
      });
      expect(posted.version).toBe(2);
    });

    it('a refused posting leaves no outbox row', async () => {
      const { ctx } = await newPoolShop(pool, units('1'));
      await expect(inTransaction(pool, (tx) => postIssue(tx, ctx, { jobCode: 'MO-1', amountUnits: units('10') }))).rejects.toMatchObject({
        code: 'pool_insufficient',
      });
      expect(await events(ctx.shop.shopId)).toEqual([]);
    });
  });
});
