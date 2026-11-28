/**
 * List Pool Entries (EP-18-S9): the owner's ledger, newest first on (at desc, id desc), keyset
 * paged with the shared cursor (pipeline/paging.ts). Every filter is a where clause, so a later
 * page keeps the filters of the first. Shop dates are Asia/Kolkata calendar days: `from` starts at
 * its 00:00 IST and `to` ends before the next day's 00:00 IST. `deltaG` is signed, four decimals.
 */
import { addShopDays, type contract, formatShopTime, type OperationResult, type PoolEntryKind, shopDateTime, unitsToGrams } from '@goldsmith/shared';
import { ValidationError } from '../pipeline/api-errors.js';
import { clampPageSize, decodeCursor, encodeCursor, INVALID_CURSOR_MESSAGE } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
interface EntryRow {
  id: string;
  code: string;
  at: Date;
  kind: PoolEntryKind;
  delta_units: number;
  note: string | null;
  ref_type: 'job' | 'piece' | null;
  ref_id: string | null;
  actor_name: string;
  page_sort: string;
}
type Item = OperationResult<'listPoolEntries'>['items'][number];
const toItem = (row: EntryRow): Item => ({
  id: row.code,
  at: row.at.toISOString(),
  atLocal: formatShopTime(row.at.getTime()),
  kind: row.kind,
  deltaG: unitsToGrams(row.delta_units),
  note: row.note,
  refType: row.ref_type,
  refId: row.ref_id,
  actorName: row.actor_name,
});
export const listPoolEntries: Handler<typeof contract.listPoolEntries> = async (tx, ctx, input) => {
  const { from, to, kind, job, piece, cursor } = input;
  // ISO dates compare as text.
  if (from !== undefined && to !== undefined && to < from) {
    throw new ValidationError('to', 'The end date must be on or after the start date.');
  }
  const pageSize = clampPageSize(input.pageSize);
  const params: unknown[] = [ctx.shop.shopId];
  let where = 'where shop_id = $1';
  const add = (clause: (n: string) => string, value: unknown) => {
    params.push(value);
    where += ` and ${clause(`$${params.length}`)}`;
  };
  if (kind !== undefined) add((n) => `kind = ${n}`, kind);
  if (job !== undefined) add((n) => `(ref_type = 'job' and ref_id = ${n})`, job);
  if (piece !== undefined) add((n) => `(ref_type = 'piece' and ref_id = ${n})`, piece);
  if (from !== undefined) add((n) => `at >= ${n}::timestamptz`, new Date(shopDateTime(from, 0, 0)));
  if (to !== undefined) add((n) => `at < ${n}::timestamptz`, new Date(shopDateTime(addShopDays(to, 1), 0, 0)));
  if (cursor !== undefined) {
    const [sortText, id] = decodeCursor(cursor);
    params.push(sortText, id);
    where += ` and (at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(pageSize + 1);
  const rows = await tx.client
    .query<EntryRow>(
      `select id, code, at, kind, delta_units, note, ref_type, ref_id, actor_name, at::text as page_sort
         from pool_entries
        ${where}
        order by at desc, id desc
        limit $${params.length}`,
      params,
    )
    .then(
      (res) => res.rows,
      (err: unknown) => {
        // A well-formed cursor whose time PostgreSQL cannot read: data exception.
        if (cursor !== undefined && String((err as { code?: unknown }).code ?? '').startsWith('22')) {
          throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
        }
        throw err;
      },
    );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeCursor([last.page_sort, last.id]) : null;
  return { ok: true, items: page.map(toItem), nextCursor, pageSize };
};
