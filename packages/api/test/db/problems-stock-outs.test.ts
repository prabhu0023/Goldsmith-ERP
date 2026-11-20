import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  addKarigar,
  addPiece,
  columnsOf,
  describeDb,
  expectPgError,
  newShop,
  type TestShop,
  testPool,
} from './db-test-helpers.js';

describeDb('problems, scrap requests and stock-outs (EP-02-S10)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  const addProblem = (
    shopId: string,
    kind: string,
    targets: { pieceId?: string; parcelId?: string; jobId?: string },
    status = 'open',
  ) =>
    pool.query(
      `insert into problems (shop_id, code, target_kind, piece_id, parcel_id, job_id, text, raised_by_role, status)
       values ($1, $2, $3, $4, $5, $6, 'Clasp loose', 'staff', $7)`,
      [
        shopId,
        `PR-${randomUUID().slice(0, 8)}`,
        kind,
        targets.pieceId ?? null,
        targets.parcelId ?? null,
        targets.jobId ?? null,
        status,
      ],
    );
  const addScrap = (shopId: string, pieceId: string, status = 'pending') =>
    pool.query(
      `insert into scrap_requests (shop_id, code, piece_id, reason, status) values ($1, $2, $3, 'Broken', $4)`,
      [shopId, `SR-${randomUUID().slice(0, 8)}`, pieceId, status],
    );
  const addStockOut = async (shop: TestShop, code: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into stock_outs (shop_id, code, invoice_no, at) values ($1, $2, 'INV-2026-0412', now()) returning id`,
        [shop.shopId, code],
      )
    ).rows[0].id;
  const addStockOutPiece = (shop: TestShop, stockOutId: string, pieceId: string, position: number) =>
    pool.query('insert into stock_out_pieces (shop_id, stock_out_id, piece_id, position) values ($1, $2, $3, $4)', [
      shop.shopId,
      stockOutId,
      pieceId,
      position,
    ]);

  it('rejects an unknown problem target kind and status', async () => {
    const shop = await newShop(pool);
    const pieceId = await addPiece(pool, shop, 'TAG-1');
    await expectPgError(addProblem(shop.shopId, 'lead', { pieceId }), '23514');
    await expectPgError(addProblem(shop.shopId, 'piece', { pieceId }, 'resolved'), '23514');
    await addProblem(shop.shopId, 'piece', { pieceId });
  });

  it('requires a problem to point only at the column of its kind', async () => {
    const shop = await newShop(pool);
    const pieceId = await addPiece(pool, shop, 'TAG-1');
    const karigarId = await addKarigar(pool, shop);
    const parcel = await pool.query<{ id: string }>(
      `insert into parcels (shop_id, location_id, code, karigar_id) values ($1, $2, 'B-1', $3) returning id`,
      [shop.shopId, shop.locationId, karigarId],
    );
    await expectPgError(addProblem(shop.shopId, 'piece', { pieceId, parcelId: parcel.rows[0].id }), '23514');
    await expectPgError(addProblem(shop.shopId, 'piece', { parcelId: parcel.rows[0].id }), '23514');
    await expectPgError(addProblem(shop.shopId, 'piece', { pieceId: randomUUID() }), '23503');
    await addProblem(shop.shopId, 'parcel', { parcelId: parcel.rows[0].id });
  });

  it('rejects an unknown scrap status and an unknown piece', async () => {
    const shop = await newShop(pool);
    const pieceId = await addPiece(pool, shop, 'TAG-7701');
    await expectPgError(addScrap(shop.shopId, pieceId, 'approved'), '23514');
    await expectPgError(addScrap(shop.shopId, randomUUID()), '23503');
    await addScrap(shop.shopId, pieceId);
  });

  it('records a stock-out with one row per piece, and each piece leaves once', async () => {
    const shop = await newShop(pool);
    const a = await addPiece(pool, shop, 'TAG-8841');
    const b = await addPiece(pool, shop, 'TAG-8802');
    const first = await addStockOut(shop, 'SO-101');
    await addStockOutPiece(shop, first, a, 0);
    await addStockOutPiece(shop, first, b, 1);
    const { rows } = await pool.query(
      `select s.invoice_no, p.tag_no from stock_out_pieces sp
         join stock_outs s on s.id = sp.stock_out_id join pieces p on p.id = sp.piece_id
        where sp.stock_out_id = $1 order by sp.position`,
      [first],
    );
    expect(rows).toEqual([
      { invoice_no: 'INV-2026-0412', tag_no: 'TAG-8841' },
      { invoice_no: 'INV-2026-0412', tag_no: 'TAG-8802' },
    ]);
    await expectPgError(addStockOutPiece(shop, first, a, 2), '23505');
    const second = await addStockOut(shop, 'SO-102');
    await expectPgError(addStockOutPiece(shop, second, a, 0), '23505');
    await pool.query('update pieces set stock_out_id = $1 where id = $2', [first, a]);
    await expectPgError(pool.query('update pieces set stock_out_id = $1 where id = $2', [randomUUID(), b]), '23503');
  });

  it('keeps amount_inr nullable without a default and requires an invoice number', async () => {
    const cols = await columnsOf(pool, 'stock_outs');
    expect(cols.amount_inr).toMatchObject({ type: 'numeric', nullable: true, default: null });
    expect(cols.invoice_no).toMatchObject({ type: 'text', nullable: false });
  });
});
