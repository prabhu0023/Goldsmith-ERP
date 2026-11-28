import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { insertScoped } from '../../src/db/shop-context.js';
import { withTransaction } from '../../src/db/transaction.js';
import {
  RowNotFoundError,
  StaleWriteError,
  updateVersioned,
  VERSIONED_ENTITIES,
  type VersionedTable,
} from '../../src/db/versioned.js';
import { addKarigar, addPiece, describeDb, newShop, type TestShop, testPool } from './db-test-helpers.js';

/** Wait until the backend `pid` is blocked on a lock (its UPDATE is queued behind another writer). */
async function waitForLock(pool: pg.Pool, pid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await pool.query('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`backend ${pid} never waited for a lock`);
}

const version = async (pool: pg.Pool, table: string, id: string): Promise<number> =>
  (await pool.query(`select version from ${table} where id = $1`, [id])).rows[0].version;

describeDb('versioned updates and stale-write conflicts (EP-02-S14)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('lets the first of two concurrent writers win and rejects the second', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-8841');
    await pool.query(`update pieces set note = 'one' where id = $1`, [id]);
    await pool.query(`update pieces set note = 'two' where id = $1`, [id]);
    expect(await version(pool, 'pieces', id)).toBe(3);

    const a = await pool.connect();
    const b = await pool.connect();
    try {
      const readA = (await a.query('select version from pieces where id = $1', [id])).rows[0].version;
      const readB = (await b.query('select version from pieces where id = $1', [id])).rows[0].version;
      expect([readA, readB]).toEqual([3, 3]);

      await a.query('begin');
      await b.query('begin');
      const rowA = await updateVersioned(a, shop, {
        table: 'pieces',
        id,
        expectedVersion: readA,
        set: { note: 'from A', stone_count: 5 },
      });
      expect(rowA.version).toBe(4);

      const pidB = (await b.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
      const resultB = updateVersioned(b, shop, {
        table: 'pieces',
        id,
        expectedVersion: readB,
        set: { note: 'from B' },
      }).then(
        () => null,
        (e: unknown) => e,
      );
      await waitForLock(pool, pidB);
      await a.query('commit');

      const errB = await resultB;
      expect(errB).toBeInstanceOf(StaleWriteError);
      expect(errB).toMatchObject({ entity: 'Piece', id, expectedVersion: 3, code: 'STALE_WRITE' });
      expect((errB as Error).message).toBe(
        `Piece ${id} was changed by someone else (expected version 3); reload and try again.`,
      );
      await b.query('rollback');
    } finally {
      a.release();
      b.release();
    }

    const { rows } = await pool.query('select version, note, stone_count from pieces where id = $1', [id]);
    expect(rows[0]).toEqual({ version: 4, note: 'from A', stone_count: 5 });
  });

  it('throws the same error for each versioned table', async () => {
    const shop = await newShop(pool);
    const karigarId = await addKarigar(pool, shop);
    const pieceId = await addPiece(pool, shop, 'TAG-1');
    const lead = await insertScoped<{ id: string }>(pool, shop, 'leads', { code: 'LD-1', source: 'counter' });
    const rows: Record<VersionedTable, { id: string; set: Record<string, unknown> }> = {
      pieces: { id: pieceId, set: { note: 'x' } },
      parcels: {
        id: (await insertScoped<{ id: string }>(pool, shop, 'parcels', { code: 'BATCH-1', karigar_id: karigarId })).id,
        set: { po_ref: 'PO-1' },
      },
      leads: { id: lead.id, set: { note: 'x' } },
      lead_items: {
        id: (await insertScoped<{ id: string }>(pool, shop, 'lead_items', { lead_id: lead.id, position: 0 })).id,
        set: { qty: 2 },
      },
      karigar_jobs: {
        id: (
          await insertScoped<{ id: string }>(pool, shop, 'karigar_jobs', {
            code: 'MO-1',
            karigar_id: karigarId,
            target_gross_units: 1,
            target_net_units: 1,
            tolerance_units: 1,
            gold_issued_units: 1,
          })
        ).id,
        set: { note: 'x' },
      },
      piece_edits: {
        id: (
          await insertScoped<{ id: string }>(pool, shop, 'piece_edits', {
            code: 'ED-1',
            piece_id: pieceId,
            field: 'name',
            before_text: 'a',
            after_text: 'b',
          })
        ).id,
        set: { reason: 'x' },
      },
      metal_pools: {
        id: (await insertScoped<{ id: string }>(pool, shop, 'metal_pools', {})).id,
        set: { balance_units: 10 },
      },
      users: {
        id: (
          await insertScoped<{ id: string }>(pool, shop, 'users', {
            name: 'Rajesh Verma',
            phone: '+919841011111',
            email: 'rajesh@example.test',
            role: 'staff',
          })
        ).id,
        set: { name: 'Rajesh V' },
      },
      customers: {
        id: (
          await insertScoped<{ id: string }>(pool, shop, 'customers', {
            code: 'CU-1',
            name: 'Meera Iyer',
            phone: '+919884021107',
            customer_group: 'Regular',
          })
        ).id,
        set: { city: 'Chennai' },
      },
    };
    for (const [table, entity] of Object.entries(VERSIONED_ENTITIES) as [VersionedTable, string][]) {
      const { id, set } = rows[table];
      const updated = await updateVersioned(pool, shop, { table, id, expectedVersion: 1, set });
      expect(updated.version).toBe(2);
      const stale = updateVersioned(pool, shop, { table, id, expectedVersion: 1, set });
      await expect(stale).rejects.toBeInstanceOf(StaleWriteError);
      await expect(stale).rejects.toMatchObject({ entity, id, expectedVersion: 1, code: 'STALE_WRITE' });
      expect(await version(pool, table, id)).toBe(2);
    }
  });

  it('rolls back the whole transaction when one row in it is stale', async () => {
    const shop: TestShop = await newShop(pool);
    const karigarId = await addKarigar(pool, shop);
    const parcel = await insertScoped<{ id: string }>(pool, shop, 'parcels', { code: 'BATCH-1', karigar_id: karigarId });
    const p1 = await addPiece(pool, shop, 'TAG-1');
    const p2 = await addPiece(pool, shop, 'TAG-2');
    await pool.query(`update pieces set note = 'saved by someone else' where id = $1`, [p2]);

    const work = withTransaction(pool, async (c) => {
      await updateVersioned(c, shop, { table: 'parcels', id: parcel.id, expectedVersion: 1, set: { po_ref: 'PO-9' } });
      await updateVersioned(c, shop, { table: 'pieces', id: p1, expectedVersion: 1, set: { note: 'checked' } });
      await updateVersioned(c, shop, { table: 'pieces', id: p2, expectedVersion: 1, set: { note: 'checked' } });
    });
    await expect(work).rejects.toMatchObject({ name: 'StaleWriteError', entity: 'Piece', id: p2 });

    const parcelRow = (await pool.query('select version, po_ref from parcels where id = $1', [parcel.id])).rows[0];
    expect(parcelRow).toEqual({ version: 1, po_ref: null });
    const p1Row = (await pool.query('select version, note from pieces where id = $1', [p1])).rows[0];
    expect(p1Row).toEqual({ version: 1, note: null });
  });

  it('reports a nonexistent id as RowNotFoundError, not a conflict (FU-002)', async () => {
    const shop = await newShop(pool);
    const missing = '00000000-0000-4000-8000-000000000000';
    const work = updateVersioned(pool, shop, { table: 'pieces', id: missing, expectedVersion: 1, set: { note: 'x' } });
    await expect(work).rejects.toBeInstanceOf(RowNotFoundError);
    await expect(work).rejects.toMatchObject({ entity: 'Piece', id: missing, code: 'ROW_NOT_FOUND' });
  });

  it("reports another shop's row as RowNotFoundError and leaves it unchanged (FU-002)", async () => {
    const mine = await newShop(pool);
    const theirs = await newShop(pool, 'Other shop');
    const id = await addPiece(pool, theirs, 'TAG-8841');
    const work = updateVersioned(pool, mine, { table: 'pieces', id, expectedVersion: 1, set: { note: 'taken over' } });
    await expect(work).rejects.toBeInstanceOf(RowNotFoundError);
    const { rows } = await pool.query('select version, note from pieces where id = $1', [id]);
    expect(rows[0]).toEqual({ version: 1, note: null });
  });

  it('still reports a genuine version mismatch as StaleWriteError (FU-002)', async () => {
    const shop = await newShop(pool);
    const id = await addPiece(pool, shop, 'TAG-8841');
    await pool.query(`update pieces set note = 'moved on' where id = $1`, [id]);
    const work = updateVersioned(pool, shop, { table: 'pieces', id, expectedVersion: 1, set: { note: 'x' } });
    await expect(work).rejects.toBeInstanceOf(StaleWriteError);
    await expect(work).rejects.not.toBeInstanceOf(RowNotFoundError);
  });

  it('lets exactly one of 20 concurrent writers succeed', async () => {
    const wide = testPool(25);
    try {
      const shop = await newShop(wide);
      const id = await addPiece(wide, shop, 'TAG-1');
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          withTransaction(wide, (c) =>
            updateVersioned(c, shop, { table: 'pieces', id, expectedVersion: 1, set: { note: `writer ${i}` } }),
          ),
        ),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(19);
      for (const r of rejected) expect(r.reason).toBeInstanceOf(StaleWriteError);
      expect(await version(wide, 'pieces', id)).toBe(2);
    } finally {
      await wide.end();
    }
  });
});
