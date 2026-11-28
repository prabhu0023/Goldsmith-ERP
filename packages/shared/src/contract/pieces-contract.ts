/**
 * Piece reads (EP-08, FU-013). `readPiece` gives the web a permission-checked read of one piece
 * by its tag number, so the live entity cache has a real fetch when a `piece.*` event arrives.
 * Weights are four-decimal gram strings; there is no price field (pricing is off in v1).
 */
import { z } from 'zod';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

const pieceStatus = z.enum(['draft', 'with_owner', 'stopped', 'in_stock', 'billed', 'scrapped']);

export const piece = z.object({
  tagNo: z.string(),
  name: z.string(),
  kind: z.string().nullable(),
  collection: z.string().nullable(),
  style: z.string().nullable(),
  purity: z.string().nullable(),
  huid: z.string().nullable(),
  grossG: z.string(),
  stoneG: z.string(),
  stoneCount: z.number().int().nullable(),
  size: z.string().nullable(),
  status: pieceStatus,
  version: z.number().int(),
  inStockAt: z.iso.datetime().nullable(),
  soldAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
});

export const pieceOperations = {
  readPiece: defineOperation({
    name: 'readPiece',
    kind: 'read',
    input: z.object({ tagNo: z.string().trim().min(1) }),
    result: z.object({ ok: z.literal(true), piece }),
    errors: ERROR_CODES,
  }),
} as const;
