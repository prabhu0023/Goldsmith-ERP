/**
 * Forward-only SQL migrations (EP-02-S1). Files live in one folder and are applied in file-name
 * order. Two name formats:
 * - legacy `NNNN_name.sql` (0001 to 0015; never add another), version = NNNN;
 * - `YYYYMMDDTHHMM_name.sql`, a UTC timestamp (`npm run db:new -- <name>`), version = YYYYMMDDHHMM.
 * Legacy names sort before every timestamp name. A pending file is applied even when its name
 * sorts before one already applied (two branches merged in either order). Each file and its `schema_migrations` row commit in one transaction, so a failed
 * file leaves neither schema changes nor a history row. An advisory lock keeps two runs from
 * applying at the same time. A file changed after it was applied, or an applied file that is no
 * longer on disk, stops the run before anything is applied.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

export interface Migration {
  /** NNNN for a legacy file, YYYYMMDDHHMM for a timestamp file. */
  version: number;
  /** The file's version prefix as written: `0007` or `20261121T1030`. */
  prefix: string;
  name: string;
  file: string;
  sql: string;
  /** sha256 hex of the file bytes. */
  checksum: string;
}

export interface MigrationStatusRow {
  version: number;
  /** `0007` or `20261121T1030`. */
  prefix: string;
  name: string;
  /** ISO time in UTC, or null when not applied yet. */
  appliedAt: string | null;
  checksum: string;
  /** `missing`: in the history table, but its file is no longer on disk. */
  state: 'applied' | 'pending' | 'changed' | 'missing';
}

export class MigrationChecksumError extends Error {
  constructor(
    public readonly file: string,
    public readonly storedChecksum: string,
    public readonly currentChecksum: string,
  ) {
    super(
      `Migration ${file} was changed after it was applied (checksum ${storedChecksum} in the database, ${currentChecksum} on disk). Nothing was applied.`,
    );
    this.name = 'MigrationChecksumError';
  }
}

export class MigrationMissingError extends Error {
  constructor(public readonly files: string[]) {
    super(
      `Applied migration ${files.join(', ')} ${files.length === 1 ? 'is' : 'are'} missing from the migrations folder (restore the file; never delete or renumber an applied migration). Nothing was applied.`,
    );
    this.name = 'MigrationMissingError';
  }
}
const FILE_PATTERN = /^(\d{4}|\d{8}T\d{4})_([a-z0-9_]+)\.sql$/;
const NAME_PATTERN = /^[a-z0-9_]+$/;
/** Arbitrary constant shared by every migration run on a database. */
const ADVISORY_LOCK_KEY = 72020001;

const toPath = (dir: string | URL): string => (dir instanceof URL ? fileURLToPath(dir) : dir);

const versionOf = (prefix: string): number => Number(prefix.replace('T', ''));

/** `7` → `0007`, `202611211030` → `20261121T1030`. */
export function prefixOf(version: number): string {
  const digits = String(version);
  return digits.length <= 4 ? digits.padStart(4, '0') : `${digits.slice(0, 8)}T${digits.slice(8)}`;
}

/** Migration files in `dir`, sorted by file name. Other files (e.g. .gitkeep) are ignored. */
export function listMigrationFiles(dir: string | URL): Migration[] {
  const path = toPath(dir);
  const migrations: Migration[] = [];
  for (const file of readdirSync(path)) {
    const m = FILE_PATTERN.exec(file);
    if (!m) continue;
    const bytes = readFileSync(join(path, file));
    migrations.push({
      version: versionOf(m[1]),
      prefix: m[1],
      name: m[2],
      file,
      sql: bytes.toString('utf8'),
      checksum: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  migrations.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(
        `Two migrations share number ${migrations[i].prefix}: ${migrations[i - 1].file} and ${migrations[i].file} (rename the one not yet merged with npm run db:new)`,
      );
    }
  }
  return migrations;
}

interface HistoryRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
}

const CREATE_HISTORY = `create table if not exists schema_migrations (
  version bigint primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
)`;

/** A history table made before timestamp names holds `version integer`, too small for YYYYMMDDHHMM. */
const WIDEN_HISTORY = `do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = current_schema() and table_name = 'schema_migrations' and column_name = 'version') = 'integer'
  then alter table schema_migrations alter column version type bigint;
  end if;
end $$`;

const historyFile = (h: HistoryRow): string => `${prefixOf(h.version)}_${h.name}.sql`;
/** History rows whose version has no file on disk, in number order. */
function missingFiles(files: Migration[], history: Map<number, HistoryRow>): HistoryRow[] {
  const onDisk = new Set(files.map((f) => f.version));
  return [...history.values()].filter((h) => !onDisk.has(h.version)).sort((a, b) => a.version - b.version);
}
async function readHistory(client: pg.PoolClient | pg.Pool): Promise<Map<number, HistoryRow>> {
  const exists = await client.query<{ t: string | null }>(`select to_regclass('schema_migrations') as t`);
  if (!exists.rows[0].t) return new Map();
  const res = await client.query<HistoryRow>(
    'select version, name, checksum, applied_at from schema_migrations order by version',
  );
  return new Map(res.rows.map((r) => [r.version, r]));
}

/** Apply every pending migration in `dir`. Returns the ones applied (empty when up to date). */
export async function migrate(pool: pg.Pool, dir: string | URL): Promise<{ applied: Migration[] }> {
  const files = listMigrationFiles(dir);
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      await client.query(CREATE_HISTORY);
      await client.query(WIDEN_HISTORY);
      const history = await readHistory(client);
      const missing = missingFiles(files, history);
      if (missing.length > 0) throw new MigrationMissingError(missing.map(historyFile));
      for (const f of files) {
        const row = history.get(f.version);
        if (row && row.checksum !== f.checksum) throw new MigrationChecksumError(f.file, row.checksum, f.checksum);
      }
      const applied: Migration[] = [];
      // Every file without a history row, in name order, including one that sorts before an applied file.
      for (const f of files) {
        if (history.has(f.version)) continue;
        await client.query('begin');
        try {
          await client.query(f.sql);
          await client.query('insert into schema_migrations (version, name, checksum) values ($1, $2, $3)', [
            f.version,
            f.name,
            f.checksum,
          ]);
          await client.query('commit');
        } catch (e) {
          await client.query('rollback');
          throw new Error(`Migration ${f.file} failed: ${(e as Error).message}`, { cause: e });
        }
        applied.push(f);
      }
      return { applied };
    } finally {
      await client.query('select pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Every migration file and history row, with its state. */
export async function migrationStatus(pool: pg.Pool, dir: string | URL): Promise<MigrationStatusRow[]> {
  const files = listMigrationFiles(dir);
  const history = await readHistory(pool);
  const rows: MigrationStatusRow[] = files.map((f) => {
    const h = history.get(f.version);
    if (!h) {
      return { version: f.version, prefix: f.prefix, name: f.name, appliedAt: null, checksum: f.checksum, state: 'pending' };
    }
    return {
      version: f.version,
      prefix: f.prefix,
      name: f.name,
      appliedAt: h.applied_at.toISOString(),
      checksum: h.checksum,
      state: h.checksum === f.checksum ? 'applied' : 'changed',
    };
  });
  for (const h of missingFiles(files, history)) {
    rows.push({
      version: h.version,
      prefix: prefixOf(h.version),
      name: h.name,
      appliedAt: h.applied_at.toISOString(),
      checksum: h.checksum,
      state: 'missing',
    });
  }
  return rows.sort((a, b) => a.version - b.version);
}

/** `20261121T1030`: the current minute in UTC. */
export function timestampPrefix(now: Date): string {
  const iso = now.toISOString(); // 2026-11-21T10:30:15.000Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/**
 * Create an empty migration `YYYYMMDDTHHMM_<name>.sql` (UTC) in `dir` and return its file name.
 * Refuses a bad name and a timestamp another file in `dir` already uses.
 */
export function newMigrationFile(dir: string | URL, name: string, now: Date = new Date()): string {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Migration name "${name}" must use only a-z, 0-9 and _ (e.g. metal_pool_ledger)`);
  }
  const prefix = timestampPrefix(now);
  const path = toPath(dir);
  const clash = readdirSync(path).find((f) => f.startsWith(`${prefix}_`));
  if (clash) throw new Error(`${clash} already uses ${prefix}; wait a minute and run it again`);
  const file = `${prefix}_${name}.sql`;
  writeFileSync(join(path, file), `-- ${file}: forward-only migration; describe the change here.\n`, { flag: 'wx' });
  return file;
}

/** Drop everything in schema public. Callers decide whether this is allowed (never production). */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
}
