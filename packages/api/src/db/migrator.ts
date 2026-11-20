/**
 * Forward-only SQL migrations (EP-02-S1). Files are `NNNN_name.sql` in one folder, applied in
 * number order. Each file and its `schema_migrations` row commit in one transaction, so a failed
 * file leaves neither schema changes nor a history row. An advisory lock keeps two runs from
 * applying at the same time. A file changed after it was applied stops the run before anything
 * is applied.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

export interface Migration {
  version: number;
  name: string;
  file: string;
  sql: string;
  /** sha256 hex of the file bytes. */
  checksum: string;
}

export interface MigrationStatusRow {
  version: number;
  name: string;
  /** ISO time in UTC, or null when not applied yet. */
  appliedAt: string | null;
  checksum: string;
  state: 'applied' | 'pending' | 'changed';
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

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
/** Arbitrary constant shared by every migration run on a database. */
const ADVISORY_LOCK_KEY = 72020001;

const toPath = (dir: string | URL): string => (dir instanceof URL ? fileURLToPath(dir) : dir);

/** Migration files in `dir`, sorted by number. Other files (e.g. .gitkeep) are ignored. */
export function listMigrationFiles(dir: string | URL): Migration[] {
  const path = toPath(dir);
  const migrations: Migration[] = [];
  for (const file of readdirSync(path)) {
    const m = FILE_PATTERN.exec(file);
    if (!m) continue;
    const bytes = readFileSync(join(path, file));
    migrations.push({
      version: Number(m[1]),
      name: m[2],
      file,
      sql: bytes.toString('utf8'),
      checksum: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  migrations.sort((a, b) => a.version - b.version);
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i].version === migrations[i - 1].version) {
      throw new Error(
        `Two migrations share number ${migrations[i].file.slice(0, 4)}: ${migrations[i - 1].file} and ${migrations[i].file}`,
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
  version integer primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
)`;

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
      const history = await readHistory(client);
      for (const f of files) {
        const row = history.get(f.version);
        if (row && row.checksum !== f.checksum) throw new MigrationChecksumError(f.file, row.checksum, f.checksum);
      }
      const applied: Migration[] = [];
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
    if (!h) return { version: f.version, name: f.name, appliedAt: null, checksum: f.checksum, state: 'pending' };
    return {
      version: f.version,
      name: f.name,
      appliedAt: h.applied_at.toISOString(),
      checksum: h.checksum,
      state: h.checksum === f.checksum ? 'applied' : 'changed',
    };
  });
  return rows;
}

/** Drop everything in schema public. Callers decide whether this is allowed (never production). */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('drop schema public cascade; create schema public;');
}
