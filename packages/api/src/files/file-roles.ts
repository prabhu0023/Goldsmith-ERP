/**
 * Who may do what with files (EP-09 plan decision 8). This is the only file that reads roles for
 * files, so it can be swapped for EP-05's permission list in one place.
 *
 *   Staff, Owner: upload with or without a target; read any attached file.
 *   Karigar: upload only as a bench photo on an own job (no target -> forbidden, S2 AC4; another
 *   karigar's job, or a piece / order copy / lead target -> not_found, S10 AC2, AC3); read only
 *   files on own jobs or their order copies (anything else -> not_found, S6 AC2, S9).
 *   Attach: Staff, Owner on any owner; Karigar only a bench photo on an own job (piece, order
 *   copy, lead -> forbidden, S7 AC4; another karigar's job -> not_found). Detach: Staff, Owner.
 *   List: Staff, Owner any owner; Karigar only an own job (else not_found).
 */
import type { Actor, FileOwnerType, FileRole } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { ForbiddenError, NotFoundError } from '../pipeline/api-errors.js';

type Queryable = pg.Pool | pg.PoolClient;

export interface FileTarget {
  ownerType: FileOwnerType;
  /** The owner's own code: piece tag, order copy code, job MO-…, lead LD-…. */
  ownerId: string;
  role: FileRole;
}

/** How an owner is named in a not-found sentence ("Job MO-2026-001 was not found."). */
export const OWNER_NOUNS: Record<FileOwnerType, string> = {
  piece: 'Piece',
  order_copy: 'Order copy',
  job: 'Job',
  lead: 'Lead',
};

export const isKarigar = (actor: Actor): boolean => actor.role === 'karigar';

/** Staff and Owner read every attached file of their shop. */
export const readsAllAttachedFiles = (actor: Actor): boolean => actor.role === 'staff' || actor.role === 'owner';

/** The karigar record of a karigar user (users.karigar_id), else null. */
export async function karigarIdOf(client: Queryable, shop: ShopContext, actor: Actor): Promise<string | null> {
  if (!isKarigar(actor)) return null;
  const { rows } = await client.query<{ karigar_id: string | null }>(
    'select karigar_id from users where shop_id = $1 and id = $2',
    [shop.shopId, actor.id],
  );
  return rows[0]?.karigar_id ?? null;
}

/** Not found unless job `jobCode` is assigned to the karigar `actor`. */
async function checkOwnJob(client: Queryable, shop: ShopContext, actor: Actor, jobCode: string): Promise<void> {
  const karigarId = await karigarIdOf(client, shop, actor);
  const { rows } = await client.query(
    'select 1 from karigar_jobs where shop_id = $1 and code = $2 and karigar_id = $3',
    [shop.shopId, jobCode, karigarId],
  );
  if (rows.length === 0) throw new NotFoundError(OWNER_NOUNS.job, jobCode);
}
/** Refuses an upload the caller's role does not allow (see the header). */
export async function checkUpload(
  client: Queryable,
  shop: ShopContext,
  actor: Actor,
  target: FileTarget | undefined,
): Promise<void> {
  if (!isKarigar(actor)) return;
  if (!target) throw new ForbiddenError();
  if (target.ownerType !== 'job') throw new NotFoundError(OWNER_NOUNS[target.ownerType], target.ownerId);
  await checkOwnJob(client, shop, actor, target.ownerId);
  if (target.role !== 'bench') throw new ForbiddenError();
}
/**
 * Refuses a Create Attachment the caller's role does not allow: a karigar attaches only a bench
 * photo to an own job (piece, order copy or lead -> forbidden, S7 AC4; another karigar's job ->
 * not_found; another role on an own job -> forbidden).
 */
export async function checkAttach(client: Queryable, shop: ShopContext, actor: Actor, target: FileTarget): Promise<void> {
  if (!isKarigar(actor)) return;
  if (target.ownerType !== 'job') throw new ForbiddenError();
  await checkOwnJob(client, shop, actor, target.ownerId);
  if (target.role !== 'bench') throw new ForbiddenError();
}
/** Delete Attachment: Staff and Owner only (a karigar is forbidden). */
export function checkDetach(actor: Actor): void {
  if (!readsAllAttachedFiles(actor)) throw new ForbiddenError();
}
/** List Attachments: a karigar lists only an own job; anything else is not_found (S9). */
export async function checkList(
  client: Queryable,
  shop: ShopContext,
  actor: Actor,
  ownerType: FileOwnerType,
  ownerId: string,
): Promise<void> {
  if (readsAllAttachedFiles(actor)) return;
  if (ownerType !== 'job') throw new NotFoundError(OWNER_NOUNS[ownerType], ownerId);
  await checkOwnJob(client, shop, actor, ownerId);
}
