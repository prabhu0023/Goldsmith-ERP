/**
 * The owner's reads of the audit log (EP-06-S9 to S11). Lists are newest first on (at desc,
 * id desc), keyset paged with the shared cursor format (pipeline/paging.ts), and every filter is
 * a where clause, so a later page keeps the filters of the first. Shop dates are Asia/Kolkata
 * calendar days: `from` starts at its 00:00 IST and `to` ends before the next day's 00:00 IST.
 */
import {
  type AuditAction,
  type AuditActorRole,
  type AuditGroupId,
  addShopDays,
  formatShopTime,
  kindsOfGroup,
  type OperationResult,
  shopDateTime,
} from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import { decodeCursor, encodeCursor, INVALID_CURSOR_MESSAGE } from '../pipeline/paging.js';
type Queryable = pg.Pool | pg.PoolClient;
export type AuditEntryItem = OperationResult<'listAuditEntries'>['items'][number];
export type AuditEntryDetail = OperationResult<'readAuditEntry'>['entry'];
export interface AuditListFilters {
  group?: AuditGroupId;
  /** An entity code or id; matches the entity id or the reference. */
  entity?: string;
  actorId?: string;
  actorRole?: AuditActorRole;
  /** Shop dates (YYYY-MM-DD), both inclusive. */
  from?: string;
  to?: string;
}
export interface AuditListQuery extends AuditListFilters {
  cursor?: string;
  /** Already clamped (clampPageSize). */
  pageSize: number;
}
interface EntryRow {
  id: string;
  at: Date;
  kind: AuditAction;
  entity_type: string | null;
  entity_id: string | null;
  reference: string | null;
  actor_id: string | null;
  actor_name: string;
  actor_role: AuditActorRole;
  summary: string | null;
  token_reference: string | null;
}
interface DetailRow extends EntryRow {
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  detail: string | null;
}
const ITEM_COLUMNS = `id, at, kind, entity_type, entity_id, reference, actor_id, actor_name, actor_role, summary,
  token_reference`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const toItem = (row: EntryRow): AuditEntryItem => ({
  id: row.id,
  at: row.at.toISOString(),
  atLocal: formatShopTime(row.at.getTime()),
  kind: row.kind,
  entityType: row.entity_type,
  entityId: row.entity_id,
  ref: row.reference,
  actorId: row.actor_id,
  actorName: row.actor_name,
  actorRole: row.actor_role,
  summary: row.summary,
  tokenUsed: row.token_reference !== null,
});
export async function listEntries(
  client: Queryable,
  shop: ShopContext,
  { cursor, pageSize, group, entity, actorId, actorRole, from, to }: AuditListQuery,
): Promise<{ items: AuditEntryItem[]; nextCursor: string | null }> {
  const params: unknown[] = [shop.shopId];
  let where = 'where shop_id = $1';
  const add = (clause: (n: string) => string, value: unknown) => {
    params.push(value);
    where += ` and ${clause(`$${params.length}`)}`;
  };
  if (group !== undefined && group !== 'all') add((n) => `kind = any(${n}::text[])`, [...kindsOfGroup(group)]);
  if (entity !== undefined) add((n) => `(entity_id = ${n} or reference = ${n})`, entity);
  if (actorId !== undefined) add((n) => `actor_id = ${n}::uuid`, actorId);
  if (actorRole !== undefined) add((n) => `actor_role = ${n}`, actorRole);
  if (from !== undefined) add((n) => `at >= ${n}::timestamptz`, new Date(shopDateTime(from, 0, 0)));
  if (to !== undefined) add((n) => `at < ${n}::timestamptz`, new Date(shopDateTime(addShopDays(to, 1), 0, 0)));
  if (cursor !== undefined) {
    const [sortText, id] = decodeCursor(cursor);
    params.push(sortText, id);
    where += ` and (at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(pageSize + 1);
  const rows = await client
    .query<EntryRow & { page_sort: string }>(
      `select ${ITEM_COLUMNS}, at::text as page_sort
         from audit_entries
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
  return { items: page.map(toItem), nextCursor };
}
/**
 * One entry with its before and after values, reason and token reference (S11). An id that is
 * not a uuid, or not an entry of this shop, is not found. `corrects` names the earlier entry
 * when the reference is the id of an entry in the same shop (S11 AC5).
 */
export async function readEntry(client: Queryable, shop: ShopContext, id: string): Promise<AuditEntryDetail> {
  if (!UUID.test(id)) throw new NotFoundError('Audit entry', id);
  const { rows } = await client.query<DetailRow>(
    `select ${ITEM_COLUMNS}, before_value, after_value, reason, detail
       from audit_entries where shop_id = $1 and id = $2::uuid`,
    [shop.shopId, id],
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Audit entry', id);
  let corrects: AuditEntryDetail['corrects'] = null;
  if (row.reference !== null && UUID.test(row.reference)) {
    const earlier = await client.query<{ id: string; kind: AuditAction; at: Date }>(
      'select id, kind, at from audit_entries where shop_id = $1 and id = $2::uuid',
      [shop.shopId, row.reference],
    );
    const found = earlier.rows[0];
    if (found) corrects = { id: found.id, kind: found.kind, at: found.at.toISOString() };
  }
  return {
    ...toItem(row),
    before: row.before_value,
    after: row.after_value,
    reason: row.reason,
    detail: row.detail,
    tokenReference: row.token_reference,
    corrects,
  };
}
