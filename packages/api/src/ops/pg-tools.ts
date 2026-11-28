/**
 * PostgreSQL client tools for backup and restore (EP-38). The host has no `pg_dump`, so the
 * default runs the Postgres container's own pg_dump and pg_restore through `docker exec`
 * (same version as the server): the container is BACKUP_PG_CONTAINER, else the one publishing
 * the DATABASE_URL port. When docker or that container is missing, the host's own tools are used.
 * The password goes to the child through its PGPASSWORD environment variable, never on a command
 * line. Creating and dropping databases use a normal connection to the `postgres` database.
 * Callers apply the guards (ops-guards.ts) first; this module does not decide what is allowed.
 */
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { PassThrough, type Readable } from 'node:stream';
import { promisify } from 'node:util';
import { createPool } from '../db/connection.js';
import { databaseName } from '../db/create-databases.js';
import { assertTargetAbsent } from './ops-guards.js';
const run = promisify(execFile);
export interface DumpOptions {
  databaseUrl: string;
  /** A snapshot exported by pg_export_snapshot(), so the dump matches the manifest statistics. */
  snapshot?: string;
}
export interface PgTools {
  /** Custom-format dump as a stream. The stream errors when pg_dump fails. */
  dump(options: DumpOptions): Readable;
  /** Restore a custom-format dump read from `input` into the existing, empty `databaseUrl`. */
  restore(options: { databaseUrl: string; input: Readable }): Promise<void>;
  /** Create `name` next to the database `adminUrl` names; refuses a name that exists. */
  createDatabase(adminUrl: string, name: string): Promise<void>;
  /** Drop `name` (with force) when it exists. */
  dropDatabase(adminUrl: string, name: string): Promise<void>;
}
type Runner = { kind: 'docker'; container: string } | { kind: 'host' };
interface Connection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}
function connectionOf(databaseUrl: string): Connection {
  if (!URL.canParse(databaseUrl)) throw new Error('DATABASE_URL is not a valid connection URL');
  const u = new URL(databaseUrl);
  return {
    host: u.hostname || '127.0.0.1',
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: databaseName(databaseUrl),
  };
}
const adminUrlFor = (url: string): string => {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
};
/** The Postgres container: BACKUP_PG_CONTAINER, else the one publishing `port`; host tools otherwise. */
export async function findRunner(port: string, container: string | undefined): Promise<Runner> {
  if (container) return { kind: 'docker', container };
  try {
    const { stdout } = await run('docker', ['ps', '--filter', `publish=${port}`, '--format', '{{.Names}}']);
    const name = stdout.split('\n')[0]?.trim();
    if (name) return { kind: 'docker', container: name };
  } catch {
    // no docker: fall through to the host tools
  }
  return { kind: 'host' };
}
const STDERR_LIMIT = 2000;
function collectStderr(child: ChildProcess): () => string {
  let text = '';
  child.stderr?.on('data', (d: Buffer) => {
    text = (text + d.toString()).slice(-STDERR_LIMIT);
  });
  return () => text.trim();
}
export function createPgTools(options: { container?: string } = {}): PgTools {
  const runners = new Map<string, Promise<Runner>>();
  const runnerFor = (port: string): Promise<Runner> => {
    let r = runners.get(port);
    if (!r) {
      r = findRunner(port, options.container);
      runners.set(port, r);
    }
    return r;
  };
  /** Start `tool` with `args` in the container (inside it the server is 127.0.0.1:5432) or on the host. */
  async function start(tool: string, args: string[], conn: Connection, stdin: boolean): Promise<ChildProcess> {
    const runner = await runnerFor(conn.port);
    const env = { ...process.env, PGPASSWORD: conn.password };
    if (runner.kind === 'docker') {
      const connArgs = ['-h', '127.0.0.1', '-p', '5432', '-U', conn.user, '-d', conn.database];
      const exec = ['exec', ...(stdin ? ['-i'] : []), '-e', 'PGPASSWORD', runner.container, tool, ...connArgs, ...args];
      return spawn('docker', exec, { env, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    }
    const connArgs = ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.database];
    return spawn(tool, [...connArgs, ...args], { env, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  }
  return {
    dump({ databaseUrl, snapshot }) {
      const out = new PassThrough();
      const conn = connectionOf(databaseUrl);
      const args = ['--format=custom', ...(snapshot ? [`--snapshot=${snapshot}`] : [])];
      start('pg_dump', args, conn, false).then(
        (child) => {
          const stderr = collectStderr(child);
          child.stdout?.pipe(out, { end: false });
          child.on('error', (e) => out.destroy(new Error(`pg_dump could not start: ${e.message}`)));
          child.on('close', (code) => {
            if (code === 0) out.end();
            else out.destroy(new Error(`pg_dump failed (exit ${code}): ${stderr() || 'no message'}`));
          });
        },
        (e: unknown) => out.destroy(e instanceof Error ? e : new Error(String(e))),
      );
      return out;
    },
    async restore({ databaseUrl, input }) {
      const conn = connectionOf(databaseUrl);
      const child = await start('pg_restore', ['--exit-on-error', '--no-owner'], conn, true);
      const stderr = collectStderr(child);
      const done = new Promise<void>((resolve, reject) => {
        child.on('error', (e) => reject(new Error(`pg_restore could not start: ${e.message}`)));
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`pg_restore failed (exit ${code}): ${stderr() || 'no message'}`)),
        );
        input.on('error', (e) => {
          child.kill();
          reject(e);
        });
      });
      child.stdin?.on('error', () => {}); // a failed pg_restore closes its input; `done` reports why
      input.pipe(child.stdin as NonNullable<ChildProcess['stdin']>);
      await done;
    },
    async createDatabase(adminUrl, name) {
      databaseName(adminUrl);
      const pool = createPool(adminUrlFor(adminUrl), 1);
      try {
        const exists = await pool.query('select 1 from pg_database where datname = $1', [name]);
        assertTargetAbsent(name, (exists.rowCount ?? 0) > 0);
        await pool.query(`create database "${checkedName(name)}"`);
      } finally {
        await pool.end();
      }
    },
    async dropDatabase(adminUrl, name) {
      const pool = createPool(adminUrlFor(adminUrl), 1);
      try {
        await pool.query(`drop database if exists "${checkedName(name)}" with (force)`);
      } finally {
        await pool.end();
      }
    },
  };
}
function checkedName(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Database name "${name}" must use only a-z, 0-9 and _`);
  return name;
}
