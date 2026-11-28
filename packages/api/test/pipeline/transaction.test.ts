import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { insertScoped } from '../../src/db/shop-context.js';
import { INTERNAL_MESSAGE } from '../../src/pipeline/api-errors.js';
import { addKarigar, addPiece, describeDb, testPool } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import { REFUSAL_SENTENCE } from '../support/fixture-operations.js';

describeDb('one transaction per operation (EP-03-S6, S4 AC4)', () => {
  let h: Harness;
  /** A separate connection pool: reads only what has been committed. */
  let reader: pg.Pool;
  let gate: () => Promise<void> = async () => {};
  beforeAll(async () => {
    h = await startHarness({ gate: () => gate() });
    reader = testPool(2);
  });
  afterAll(async () => {
    await h.close();
    await reader.end();
  });
  beforeEach(() => {
    h.commits.length = 0;
    h.logged.length = 0;
    gate = async () => {};
  });

  const pieceRow = async (tag: string) =>
    (await reader.query('select note, version from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, tag])).rows[0];

  it('AC1, S4 AC4: a write followed by a DomainError leaves nothing behind, and no after-commit hook runs', async () => {
    await addPiece(h.pool, h.shop, 'TAG-T-1');
    const res = await h.call('writeThenRefuse', { pieceId: 'TAG-T-1' }, { session: h.session });
    expect(res).toEqual({ status: 422, body: { code: 'rule_refused', message: REFUSAL_SENTENCE } });
    expect(await pieceRow('TAG-T-1')).toEqual({ note: null, version: 1 });
    expect(h.commits).toEqual([]);
  });

  it('AC2, AC3: two writes commit together, no reader sees one without the other; the hook runs once', async () => {
    const karigarId = await addKarigar(h.pool, h.shop, 'KG-T-2');
    await insertScoped(h.pool, h.shop, 'parcels', { code: 'BATCH-2026-T2', karigar_id: karigarId, po_ref: 'PO-OLD' });
    await insertScoped(h.pool, h.shop, 'metal_pools', {});
    let reached!: () => void;
    let release!: () => void;
    const atGate = new Promise<void>((r) => {
      reached = r;
    });
    const released = new Promise<void>((r) => {
      release = r;
    });
    gate = async () => {
      reached();
      await released;
    };

    const pending = h.call('parcelWithPoolEntry', { parcelId: 'BATCH-2026-T2' }, { session: h.session });
    await atGate;
    const seen = async () => ({
      poRef: (await reader.query('select po_ref from parcels where shop_id = $1 and code = $2', [h.shop.shopId, 'BATCH-2026-T2']))
        .rows[0].po_ref,
      entries: Number(
        (await reader.query('select count(*) from pool_entries where shop_id = $1 and ref_id = $2', [h.shop.shopId, 'BATCH-2026-T2']))
          .rows[0].count,
      ),
    });
    // The parcel is updated inside the transaction, the pool entry not yet written: a reader sees neither.
    expect(await seen()).toEqual({ poRef: 'PO-OLD', entries: 0 });
    expect(h.commits).toEqual([]);
    release();
    expect(await pending).toEqual({ status: 200, body: { ok: true } });
    expect(await seen()).toEqual({ poRef: 'PO-WITH-POOL', entries: 1 });
    expect(h.commits).toEqual(['parcelWithPoolEntry']);
  });

  it('AC4: two parallel updates of the same piece: one succeeds, the other gets conflict', async () => {
    await addPiece(h.pool, h.shop, 'TAG-T-4');
    const results = await Promise.all(
      ['from A', 'from B'].map((note) => h.call('updatePieceNote', { pieceId: 'TAG-T-4', version: 1, note }, { session: h.session })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = results.find((r) => r.status === 409);
    expect(conflict?.body).toEqual({ code: 'conflict', message: 'Someone else changed this piece. Reload and try again.' });
    const row = await pieceRow('TAG-T-4');
    expect(row.version).toBe(2);
    expect(['from A', 'from B']).toContain(row.note);
  });

  it('AC5: a connection that drops mid-operation rolls back and answers an error; the next request works', async () => {
    await addPiece(h.pool, h.shop, 'TAG-T-5');
    const res = await h.call('dropConnection', { pieceId: 'TAG-T-5' }, { session: h.session });
    expect(res).toEqual({ status: 500, body: { code: 'internal', message: INTERNAL_MESSAGE } });
    expect(h.logged).toHaveLength(1);
    expect(await pieceRow('TAG-T-5')).toEqual({ note: null, version: 1 });
    const next = await h.call('updatePieceNote', { pieceId: 'TAG-T-5', version: 1, note: 'after' }, { session: h.session });
    expect(next).toEqual({ status: 200, body: { ok: true } });
    expect(await pieceRow('TAG-T-5')).toEqual({ note: 'after', version: 2 });
  });
});
