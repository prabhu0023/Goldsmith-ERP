/**
 * What a backup manifest says about the data (EP-38-S1, S7): for every base table in schema
 * public its row count and a checksum over the rows' text form, and for the audit log its count,
 * latest entry, an overall checksum and a short hash per entry. One generic rule covers every
 * table, so a later column or table needs no change here. Weights are bigint and read as text, so
 * they compare as exact integers; a NULL stays NULL in the row text. Connections run in UTC
 * (createPool), so timestamps read the same on both sides. Read these inside the snapshot
 * transaction of the backup, so they describe the same instant as the dump.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
export interface TableStat {
  rows: number;
  /** md5 over the sorted md5 of each row's text; md5('') for an empty table. */
  checksum: string;
}
export interface AuditStats {
  count: number;
  latestAt: string | null;
  latestId: string | null;
  /** sha256 over every `id:hash` pair in (at, id) order; sha256('') for none. */
  checksum: string;
  /** `[id, first 16 hex of md5(row text)]` in (at, id) order. */
  entries: Array<[string, string]>;
}
export interface DbStats {
  tables: Record<string, TableStat>;
  audit: AuditStats;
}
type Queryable = pg.Pool | pg.PoolClient;
const quote = (name: string): string => `"${name.replaceAll('"', '""')}"`;
export async function readTableStats(db: Queryable): Promise<Record<string, TableStat>> {
  const names = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const tables: Record<string, TableStat> = {};
  for (const { table_name: name } of names.rows) {
    const res = await db.query<{ rows: number; checksum: string }>(
      `select count(*) as rows,
              coalesce(md5(string_agg(md5(t::text), ',' order by md5(t::text))), md5('')) as checksum
         from public.${quote(name)} t`,
    );
    tables[name] = { rows: res.rows[0].rows, checksum: res.rows[0].checksum };
  }
  return tables;
}
export async function readAuditStats(db: Queryable): Promise<AuditStats> {
  const res = await db.query<{ id: string; at: Date; hash: string }>(
    `select id, at, left(md5(t::text), 16) as hash from public.audit_entries t order by at, id`,
  );
  const last = res.rows.at(-1);
  const overall = createHash('sha256');
  overall.update(res.rows.map((r) => `${r.id}:${r.hash}`).join(','));
  return {
    count: res.rows.length,
    latestAt: last ? last.at.toISOString() : null,
    latestId: last ? last.id : null,
    checksum: overall.digest('hex'),
    entries: res.rows.map((r): [string, string] => [r.id, r.hash]),
  };
}
const EMPTY_AUDIT: AuditStats = {
  count: 0,
  latestAt: null,
  latestId: null,
  checksum: createHash('sha256').update('').digest('hex'),
  entries: [],
};
export async function readDbStats(db: Queryable): Promise<DbStats> {
  const tables = await readTableStats(db);
  return { tables, audit: 'audit_entries' in tables ? await readAuditStats(db) : EMPTY_AUDIT };
}
