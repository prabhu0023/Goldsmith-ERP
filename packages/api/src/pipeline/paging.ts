/**
 * Cursor paging for list operations (EP-03-S9). Keyset paging on (sort timestamptz desc, id
 * desc): the id is the unique tie-breaker, so pages stay stable when rows are added between
 * requests. The cursor is base64url JSON `[sortText, id]` of the last row the caller received,
 * where sortText is PostgreSQL's own text for the timestamp (keeps microseconds). It carries
 * nothing the caller could not already read.
 */
import type pg from 'pg';
import { z } from 'zod';
import { assertIdentifier } from '../db/shop-context.js';
import { ValidationError } from './api-errors.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** The page size the server uses: the default when unset, never above the maximum. */
export function clampPageSize(requested?: number): number {
  return Math.min(requested ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

type CursorKey = [sortText: string, id: string];
/** PostgreSQL's timestamptz text, e.g. 2026-11-21 10:00:00.123456+00. */
const PG_TIMESTAMPTZ = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}){0,2}$/;
const cursorSchema = z.tuple([z.string().regex(PG_TIMESTAMPTZ), z.uuid()]);
export const INVALID_CURSOR_MESSAGE = 'The cursor is not valid. Start again from the first page.';

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(text: string): CursorKey {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
  }
  const parsed = cursorSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
  return parsed.data;
}

export interface PageQuery {
  table: string;
  shopId: string;
  /** Columns returned besides `id`. */
  columns: readonly string[];
  /** A timestamptz column; the list is ordered by it, newest first, then by id. */
  sortColumn: string;
  cursor?: string;
  /** Already clamped (clampPageSize). */
  pageSize: number;
}

export interface Page<Row> {
  rows: Array<Row & { id: string }>;
  /** Null on the last page. */
  nextCursor: string | null;
}

export async function pageQuery<Row extends object>(
  client: pg.Pool | pg.PoolClient,
  { table, shopId, columns, sortColumn, cursor, pageSize }: PageQuery,
): Promise<Page<Row>> {
  for (const name of [table, sortColumn, ...columns]) assertIdentifier(name);
  const params: unknown[] = [shopId];
  let after = '';
  if (cursor !== undefined) {
    const [sortText, id] = decodeCursor(cursor);
    params.push(sortText, id);
    after = ` and (${sortColumn}, id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(pageSize + 1);
  const limit = `$${params.length}`;
  const select = [...columns, 'id', `${sortColumn}::text as page_sort`].join(', ');
  const rows = await client
    .query<Row & { id: string; page_sort: string }>(
      `select ${select} from ${table}
        where shop_id = $1${after}
        order by ${sortColumn} desc, id desc
        limit ${limit}`,
      params,
    )
    .then(
      (res) => res.rows,
      (err: unknown) => {
        // A well-formed cursor whose time PostgreSQL cannot read (e.g. month 13): data exception.
        if (cursor !== undefined && String((err as { code?: unknown }).code ?? '').startsWith('22')) {
          throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
        }
        throw err;
      },
    );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeCursor([last.page_sort, last.id]) : null;
  return { rows: page.map(({ page_sort: _sort, ...row }) => row as unknown as Row & { id: string }), nextCursor };
}
