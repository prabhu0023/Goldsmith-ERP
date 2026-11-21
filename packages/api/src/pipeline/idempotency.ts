/**
 * Idempotent creates (EP-03-S8). A create request with an Idempotency-Key header claims
 * (key, operation, user) in the operation's transaction before the service function runs:
 *
 *   - `insert ... on conflict do nothing`: a parallel request with the same key waits on the
 *     unique index until the first transaction ends. If the first committed, this insert does
 *     nothing and the stored result id is replayed; if it rolled back, this insert wins and the
 *     operation runs.
 *   - The result id is stored in the same transaction, so only successful results are kept.
 */
import type pg from 'pg';
import type { Tx } from './operation-transaction.js';

export interface ClaimKeyInput {
  key: string;
  operation: string;
  userId: string;
  shopId: string;
  /** The server clock's time; the record expires `retentionHours` later. */
  now: Date;
  retentionHours: number;
}

/** A fresh claim (run the operation, then completeKey) or the id a previous request created. */
export type ClaimResult = { claimId: string } | { replay: string };

export async function claimKey(tx: Tx, input: ClaimKeyInput): Promise<ClaimResult> {
  const { key, operation, userId, shopId, now, retentionHours } = input;
  const expiresAt = new Date(now.getTime() + retentionHours * 3600_000);
  const inserted = await tx.client.query<{ id: string }>(
    `insert into idempotency_records (shop_id, key, operation, user_id, created_at, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (key, operation, user_id) do nothing
     returning id`,
    [shopId, key, operation, userId, now, expiresAt],
  );
  if (inserted.rows[0]) return { claimId: inserted.rows[0].id };
  const existing = await tx.client.query<{ result_id: string | null }>(
    'select result_id from idempotency_records where key = $1 and operation = $2 and user_id = $3',
    [key, operation, userId],
  );
  const resultId = existing.rows[0]?.result_id;
  // Claims are completed in the transaction that made them, so a committed claim has a result.
  if (!resultId) throw new Error(`Idempotency record for ${operation} has no result id`);
  return { replay: resultId };
}

export async function completeKey(tx: Tx, claimId: string, resultId: string): Promise<void> {
  await tx.client.query('update idempotency_records set result_id = $2 where id = $1', [claimId, resultId]);
}

/** Remove every record whose expiry has passed; returns how many were removed. */
export async function deleteExpiredIdempotencyRecords(pool: pg.Pool, now: Date): Promise<number> {
  const res = await pool.query('delete from idempotency_records where expires_at <= $1', [now]);
  return res.rowCount ?? 0;
}
