/**
 * Put the net gold of a scrapped piece back in the pool (EP-18-S6). Internal: the scrap
 * operation of EP-27 calls it. The weight is read from the piece on the server, never from the
 * caller, and a piece is recovered once.
 */
import { DomainError, netUnits, POOL_MESSAGES } from '@goldsmith/shared';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';
import { lockPool } from './lock-pool.js';
import { type PostedEntry, postPoolEntry } from './post-pool-entry.js';

export async function postRecovery(tx: Tx, ctx: OperationCtx, input: { tagNo: string }): Promise<PostedEntry> {
  // The pool lock first, so two recoveries of one piece run one after the other.
  await lockPool(tx, ctx.shop);
  const piece = await tx.client.query<{ gross_units: number; stone_units: number }>(
    'select gross_units, stone_units from pieces where shop_id = $1 and tag_no = $2',
    [ctx.shop.shopId, input.tagNo],
  );
  if (!piece.rows[0]) throw new NotFoundError('Piece', input.tagNo);
  const net = netUnits(piece.rows[0].gross_units, piece.rows[0].stone_units);
  if (net <= 0) throw new DomainError(`${input.tagNo} has no gold weight to put back in the pool.`);
  const earlier = await tx.client.query(
    `select 1 from pool_entries where shop_id = $1 and kind = 'recovered' and ref_id = $2`,
    [ctx.shop.shopId, input.tagNo],
  );
  if (earlier.rows.length > 0) throw new DomainError(POOL_MESSAGES.alreadyRecovered);
  return postPoolEntry(tx, ctx, {
    kind: 'recovered',
    deltaUnits: net,
    note: `Scrap: ${input.tagNo}`,
    ref: { type: 'piece', id: input.tagNo },
  });
}
