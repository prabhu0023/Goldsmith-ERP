/**
 * Reads and guards shared by the karigar write operations (EP-16). A write that may touch the
 * linked user takes the shop lock first (lockShopForUsers, as every user write does), then the
 * karigar row `for update`, so the order is the same everywhere and two writes cannot deadlock.
 */
import { KARIGAR_MESSAGES } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { StaleWriteError } from '../db/versioned.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';

export type KarigarStatus = 'active' | 'deactivated';

export interface KarigarRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string;
  workshop_location: string | null;
  wastage_bp: number;
  status: KarigarStatus;
  version: number;
}

/** The karigar with this code, locked `for update`; a miss (or another shop's karigar) is not_found. */
export async function loadKarigarForUpdate(tx: Tx, shop: ShopContext, code: string): Promise<KarigarRow> {
  const { rows } = await tx.client.query<KarigarRow>(
    `select id, code, name, phone, email, workshop_location, wastage_bp, status, version
       from karigars where shop_id = $1 and code = $2 for update`,
    [shop.shopId, code],
  );
  if (!rows[0]) throw new NotFoundError('Karigar', code);
  return rows[0];
}

/** Refuse a write that read an older version, before anything is written (also when it would change nothing). */
export function assertVersion(karigar: KarigarRow, expectedVersion: number): void {
  if (karigar.version !== expectedVersion) throw new StaleWriteError('Karigar', karigar.id, expectedVersion);
}

/** The karigar's specialties in the order they were saved. */
export async function readSpecialties(client: pg.Pool | pg.PoolClient, karigarId: string): Promise<string[]> {
  const { rows } = await client.query<{ specialty: string }>(
    'select specialty from karigar_specialties where karigar_id = $1 order by position',
    [karigarId],
  );
  return rows.map((r) => r.specialty);
}

/** Replace the karigar's specialties with `names`, in that order. */
export async function replaceSpecialties(tx: Tx, shop: ShopContext, karigarId: string, names: readonly string[]): Promise<void> {
  await tx.client.query('delete from karigar_specialties where shop_id = $1 and karigar_id = $2', [shop.shopId, karigarId]);
  for (const [position, specialty] of names.entries()) {
    await tx.client.query(
      'insert into karigar_specialties (shop_id, karigar_id, specialty, position) values ($1, $2, $3, $4)',
      [shop.shopId, karigarId, specialty, position],
    );
  }
}

/** The trimmed name; an empty one is the owner's sentence, not a generic validation message. */
export function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') throw new ValidationError('name', KARIGAR_MESSAGES.nameRequired);
  return trimmed;
}

/** Trimmed, non-empty, de-duplicated specialty names in the order given; none at all is refused. */
export function cleanSpecialties(names: readonly string[]): string[] {
  const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n !== ''))];
  if (clean.length === 0) throw new ValidationError('specialties', KARIGAR_MESSAGES.specialtyRequired);
  return clean;
}

/** The one live (not deactivated) user linked to this karigar record, or null. */
export async function findLiveLinkedUserId(tx: Tx, shop: ShopContext, karigarId: string): Promise<string | null> {
  const { rows } = await tx.client.query<{ id: string }>(
    `select id from users where shop_id = $1 and karigar_id = $2 and status <> 'deactivated'`,
    [shop.shopId, karigarId],
  );
  return rows[0]?.id ?? null;
}

/** Run `fn`, answering a duplicate karigar phone with the same sentence as a duplicate user phone. */
export async function withKarigarUniqueViolations<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const { code, constraint } = (err ?? {}) as { code?: unknown; constraint?: unknown };
    if (code === '23505' && constraint === 'karigars_shop_phone') {
      throw new ValidationError('phone', KARIGAR_MESSAGES.phoneTaken);
    }
    throw err;
  }
}
