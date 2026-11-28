/**
 * List Karigars (EP-16-S9): the owner's directory with each karigar's open jobs, gold with them
 * and metal loss. The server orders it, worst first: active karigars with a loss figure by how
 * far the loss is over their allowance (loss minus allowance, in basis points, highest first),
 * then active karigars with no figure, then deactivated ones, each tie by code. Paging carries
 * an offset in the cursor, because the order is computed, not a column. No rating, no money.
 */
import { type contract, unitsToGrams } from '@goldsmith/shared';
import { ValidationError } from '../pipeline/api-errors.js';
import { clampPageSize, INVALID_CURSOR_MESSAGE } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { decodeTextCursor, encodeTextCursor } from '../users/text-cursor.js';
import { loadScorecards } from './scorecard.js';
interface DirectoryRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string;
  workshop_location: string | null;
  wastage_bp: number;
  status: 'active' | 'deactivated';
  version: number;
  specialties: string[];
  account_status: 'pending_activation' | 'active' | 'deactivated' | null;
}
type Item = Awaited<ReturnType<Handler<typeof contract.listKarigars>>>['items'][number];
/** Group 0: active with a figure, 1: active without one, 2: deactivated. */
const group = (i: Item): number => (i.status === 'deactivated' ? 2 : i.metalLossBp === null ? 1 : 0);
const overAllowance = (i: Item): number => (i.metalLossBp ?? 0) - i.wastageBp;
export function compareDirectory(a: Item, b: Item): number {
  return (
    group(a) - group(b) ||
    (group(a) === 0 ? overAllowance(b) - overAllowance(a) : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = Number(decodeTextCursor(cursor)[0]);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
  return offset;
}
export const listKarigars: Handler<typeof contract.listKarigars> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const offset = offsetOf(input.cursor);
  const { rows } = await tx.client.query<DirectoryRow>(
    `select k.id, k.code, k.name, k.phone, k.email, k.workshop_location, k.wastage_bp, k.status, k.version,
            coalesce((select array_agg(s.specialty order by s.position) from karigar_specialties s
                       where s.karigar_id = k.id), '{}') as specialties,
            (select u.status from users u where u.shop_id = k.shop_id and u.karigar_id = k.id
              order by (u.status = 'deactivated'), u.created_at desc limit 1) as account_status
       from karigars k where k.shop_id = $1`,
    [ctx.shop.shopId],
  );
  const cards = await loadScorecards(
    tx.client,
    ctx.shop,
    rows.map((r) => r.id),
  );
  const ordered = rows
    .map((row) => {
      const card = cards.get(row.id);
      const item: Item = {
        id: row.code,
        name: row.name,
        phone: row.phone,
        email: row.email,
        workshopLocation: row.workshop_location,
        specialties: row.specialties,
        wastageBp: row.wastage_bp,
        status: row.status,
        version: row.version,
        accountStatus: row.account_status ?? 'none',
        openJobs: card?.openJobs ?? 0,
        goldWithG: unitsToGrams(card?.goldWithUnits ?? 0),
        metalLossBp: card?.metalLossBp ?? null,
        finishedJobs: card?.finishedJobs ?? 0,
      };
      return { item, uuid: row.id };
    })
    .sort((a, b) => compareDirectory(a.item, b.item));
  const page = ordered.slice(offset, offset + pageSize);
  const last = page.at(-1);
  const nextCursor =
    offset + pageSize < ordered.length && last ? encodeTextCursor([String(offset + pageSize), last.uuid]) : null;
  return { ok: true, items: page.map((p) => p.item), nextCursor, pageSize };
};
