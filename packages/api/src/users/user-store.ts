/**
 * Reads and guards shared by the user operations (EP-05-S4 to S13). Every user write first
 * locks the shop row, which serialises user changes per shop, so the one-owner rule (S9), phone
 * uniqueness (S4) and the one-user-per-karigar rule (S13) cannot be beaten by two parallel
 * requests. The partial unique indexes back the same rules up; withUniqueViolations turns
 * their violations into the same answers.
 */
import { DomainError, type RoleId, USER_MESSAGES } from '@goldsmith/shared';
import type { ShopContext } from '../db/shop-context.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';

export type UserStatus = 'pending_activation' | 'active' | 'deactivated';

export interface UserRow {
  id: string;
  name: string;
  phone: string;
  phone_e164: string | null;
  email: string;
  role: RoleId;
  status: UserStatus;
  /** The karigar record's uuid, or null. */
  karigar_id: string | null;
  /** The karigar record's code ("KG-04"), or null. */
  karigar_code: string | null;
  has_password: boolean;
  version: number;
}

export interface KarigarRef {
  id: string;
  code: string;
}

/**
 * Lock the shop row for this transaction, so user changes in one shop run one at a time.
 * `for no key update` conflicts with itself but not with the key-share locks that foreign-key
 * inserts take, so other writes in the shop (including the target user's own) do not queue
 * behind it or deadlock with it.
 */
export async function lockShopForUsers(tx: Tx, shop: ShopContext): Promise<void> {
  await tx.client.query('select id from shops where id = $1 for no key update', [shop.shopId]);
}

/**
 * The user, locked for this transaction (`for no key update`, as for the shop row); a miss (or
 * another shop's user) is not_found.
 */
export async function loadUserForUpdate(tx: Tx, shop: ShopContext, userId: string): Promise<UserRow> {
  const { rows } = await tx.client.query<UserRow>(
    `select u.id, u.name, u.phone, u.phone_e164, u.email, u.role, u.status, u.karigar_id,
            k.code as karigar_code, u.password_hash is not null as has_password, u.version
       from users u
       left join karigars k on k.shop_id = u.shop_id and k.id = u.karigar_id
      where u.shop_id = $1 and u.id = $2
      for no key update of u`,
    [shop.shopId, userId],
  );
  const user = rows[0];
  if (!user) throw new NotFoundError('User', userId);
  return user;
}

/** Refuse a phone number another user who is not deactivated already signs in with. */
export async function assertPhoneFree(
  tx: Tx,
  shop: ShopContext,
  phoneE164: string,
  excludeUserId?: string,
): Promise<void> {
  const { rows } = await tx.client.query(
    `select 1 from users
      where shop_id = $1 and phone_e164 = $2 and status <> 'deactivated' and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [shop.shopId, phoneE164, excludeUserId ?? null],
  );
  if (rows.length > 0) throw new ValidationError('phone', USER_MESSAGES.phoneTaken);
}

/** The karigar record with this code; a miss is not_found. */
export async function resolveKarigar(tx: Tx, shop: ShopContext, code: string): Promise<KarigarRef> {
  const { rows } = await tx.client.query<KarigarRef>('select id, code from karigars where shop_id = $1 and code = $2', [
    shop.shopId,
    code,
  ]);
  const karigar = rows[0];
  if (!karigar) throw new NotFoundError('Karigar', code);
  return karigar;
}

/** Refuse a karigar record another user who is not deactivated is already linked to. */
export async function assertKarigarFree(
  tx: Tx,
  shop: ShopContext,
  karigarId: string,
  excludeUserId?: string,
): Promise<void> {
  const { rows } = await tx.client.query(
    `select 1 from users
      where shop_id = $1 and karigar_id = $2 and status <> 'deactivated' and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [shop.shopId, karigarId, excludeUserId ?? null],
  );
  if (rows.length > 0) throw new DomainError(USER_MESSAGES.karigarTaken);
}

/** Run `fn`, answering a unique violation of a users rule with that rule's sentence. */
export async function withUniqueViolations<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
    if (code === '23505') {
      if (constraint === 'users_shop_phone_e164_live' || constraint === 'users_shop_phone_live') {
        throw new ValidationError('phone', USER_MESSAGES.phoneTaken);
      }
      if (constraint === 'users_one_live_owner') throw new DomainError(USER_MESSAGES.shopHasOwner);
      if (constraint === 'users_karigar_live') throw new DomainError(USER_MESSAGES.karigarTaken);
    }
    throw err;
  }
}
