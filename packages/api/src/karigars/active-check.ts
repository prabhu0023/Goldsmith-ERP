/**
 * The karigar checks other epics call inside their own transactions (EP-16-S8, S5): job creation
 * (EP-19) and parcel arrival (EP-21) call `assertKarigarActive` before they write, and job
 * creation stores `readAllowanceInForce` on the job it issues.
 */
import { DomainError, KARIGAR_MESSAGES, karigarInactiveMessage } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';

export interface ActiveKarigar {
  id: string;
  code: string;
  name: string;
  wastageBp: number;
}

interface Row {
  id: string;
  code: string;
  name: string;
  status: string;
  wastage_bp: number;
}

/**
 * The karigar with this code, which must exist and be active. The row is locked `for share`
 * until the transaction ends, so Update Karigar status (which locks it `for update`) waits for
 * the caller's write and then sees its open job; an unknown karigar is
 * "Say which karigar it came from." and a deactivated one "<name> is no longer active. Pick another karigar."
 */
export async function assertKarigarActive(tx: Tx, shop: ShopContext, karigarCode: string): Promise<ActiveKarigar> {
  const { rows } = await tx.client.query<Row>(
    'select id, code, name, status, wastage_bp from karigars where shop_id = $1 and code = $2 for share',
    [shop.shopId, karigarCode],
  );
  const row = rows[0];
  if (!row) throw new ValidationError('karigarId', KARIGAR_MESSAGES.noKarigar);
  if (row.status !== 'active') throw new DomainError(karigarInactiveMessage(row.name));
  return { id: row.id, code: row.code, name: row.name, wastageBp: row.wastage_bp };
}

/** The allowance (whole basis points) a job issued now to this karigar is judged against. */
export async function readAllowanceInForce(
  client: pg.Pool | pg.PoolClient,
  shop: ShopContext,
  karigarCode: string,
): Promise<number> {
  const { rows } = await client.query<{ wastage_bp: number }>(
    'select wastage_bp from karigars where shop_id = $1 and code = $2',
    [shop.shopId, karigarCode],
  );
  if (!rows[0]) throw new ValidationError('karigarId', KARIGAR_MESSAGES.noKarigar);
  return rows[0].wastage_bp;
}
