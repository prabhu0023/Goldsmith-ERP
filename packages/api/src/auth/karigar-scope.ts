/**
 * Karigar scope (EP-05-S3): a karigar reads only their own jobs. Every karigar read filters in
 * SQL by the karigar record on the caller's user row, never by anything the caller sends.
 */
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';

/** The caller's karigars.id, or null when the caller is not linked to a karigar record. */
export async function callerKarigarId(tx: Tx, ctx: OperationCtx): Promise<string | null> {
  const { rows } = await tx.client.query<{ karigar_id: string | null }>(
    'select karigar_id from users where shop_id = $1 and id = $2',
    [ctx.shop.shopId, ctx.by.id],
  );
  return rows[0]?.karigar_id ?? null;
}
