/**
 * Read Piece (EP-08, FU-013): one piece of the caller's shop by its tag number, for the shop
 * floor. An unknown tag, or another shop's tag, answers not_found. Weights go out as four-decimal
 * gram strings; there is no price.
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';

interface PieceRow {
  tag_no: string;
  name: string;
  kind: string | null;
  collection: string | null;
  style: string | null;
  purity: string | null;
  huid: string | null;
  gross_units: string;
  stone_units: string;
  stone_count: number | null;
  size: string | null;
  status: 'draft' | 'with_owner' | 'stopped' | 'in_stock' | 'billed' | 'scrapped';
  version: number;
  in_stock_at: Date | null;
  sold_at: Date | null;
  note: string | null;
}

export const readPiece: Handler<typeof contract.readPiece> = async (tx, ctx, input) => {
  const { rows } = await tx.client.query<PieceRow>(
    `select tag_no, name, kind, collection, style, purity, huid, gross_units::text as gross_units,
            stone_units::text as stone_units, stone_count, size, status, version, in_stock_at, sold_at, note
       from pieces where shop_id = $1 and tag_no = $2`,
    [ctx.shop.shopId, input.tagNo],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Piece', input.tagNo);
  return {
    ok: true,
    piece: {
      tagNo: row.tag_no,
      name: row.name,
      kind: row.kind,
      collection: row.collection,
      style: row.style,
      purity: row.purity,
      huid: row.huid,
      grossG: unitsToGrams(Number(row.gross_units)),
      stoneG: unitsToGrams(Number(row.stone_units)),
      stoneCount: row.stone_count,
      size: row.size,
      status: row.status,
      version: row.version,
      inStockAt: row.in_stock_at?.toISOString() ?? null,
      soldAt: row.sold_at?.toISOString() ?? null,
      note: row.note,
    },
  };
};
