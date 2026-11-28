/**
 * The one way gold enters or leaves the metal pool (EP-18-S1, S3, S4, S5). It runs inside the
 * operation's transaction, takes the pool lock before it reads the balance, refuses an entry that
 * would take the balance below zero, writes the ledger entry and the new balance together and
 * records the live event in the same transaction. Weights are integers of 0.0001 g.
 */
import { METAL_POOL_ENTITY_ID, POOL_MESSAGES, type PoolEntryKind, type PoolRefType, poolBalanceAfter } from '@goldsmith/shared';
import { nextCode } from '../db/codes.js';
import { insertScoped } from '../db/shop-context.js';
import { isInTransaction } from '../db/transaction.js';
import { emitLiveEvent } from '../live/emit-live-event.js';
import { ApiError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';
import { lockPool } from './lock-pool.js';

export interface PoolEntryInput {
  kind: PoolEntryKind;
  /** Signed units of 0.0001 g: negative for issued, positive for opening, returned and recovered. */
  deltaUnits: number;
  note?: string | null;
  /** The job or piece the entry is about; set both fields or none. */
  ref?: { type: PoolRefType; id: string } | null;
}

export interface PostedEntry {
  /** The entry's code, PL-001 style. */
  code: string;
  balanceUnits: number;
  /** The pool row's version after the entry. */
  version: number;
}

const refusesSign = (kind: PoolEntryKind, deltaUnits: number): boolean =>
  kind === 'issued' ? deltaUnits > 0 : kind === 'adjustment' ? false : deltaUnits < 0;

export async function postPoolEntry(tx: Tx, ctx: OperationCtx, input: PoolEntryInput): Promise<PostedEntry> {
  if (!isInTransaction(tx.client)) throw new Error('postPoolEntry must run inside a transaction');
  const { kind, deltaUnits, ref = null } = input;
  if (!Number.isSafeInteger(deltaUnits) || deltaUnits === 0) {
    throw new Error('A pool entry needs a non-zero whole number of units');
  }
  if (refusesSign(kind, deltaUnits)) throw new Error(`A ${kind} pool entry cannot have ${deltaUnits < 0 ? 'a negative' : 'a positive'} amount`);
  if (ref !== null && (!ref.type || !ref.id)) throw new Error('A pool entry reference needs both a type and an id');

  const pool = await lockPool(tx, ctx.shop);
  let balanceUnits: number;
  try {
    balanceUnits = poolBalanceAfter(pool.balanceUnits, deltaUnits);
  } catch {
    throw new ApiError('pool_insufficient', POOL_MESSAGES.insufficient);
  }
  const code = await nextCode(tx.client, ctx.shop, { table: 'pool_entries', prefix: 'PL', pad: 3 });
  await insertScoped(tx.client, ctx.shop, 'pool_entries', {
    metal_pool_id: pool.id,
    code,
    at: ctx.at,
    kind,
    delta_units: deltaUnits,
    note: input.note ?? null,
    ref_type: ref?.type ?? null,
    ref_id: ref?.id ?? null,
    actor_id: ctx.by.id,
    actor_name: ctx.by.name,
  });
  const updated = await tx.client.query<{ version: number }>(
    'update metal_pools set balance_units = $2 where id = $1 returning version',
    [pool.id, balanceUnits],
  );
  const version = updated.rows[0].version;
  await emitLiveEvent(tx, ctx.shop, 'metal_pool.changed', {
    entityId: METAL_POOL_ENTITY_ID,
    entityVersion: version,
    at: ctx.at,
    payload: { kind },
  });
  return { code, balanceUnits, version };
}
