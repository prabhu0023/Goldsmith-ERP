/**
 * `npm run db:create`: create the databases DATABASE_URL and TEST_DATABASE_URL name (with LANE
 * applied) when they do not exist yet. Idempotent; never drops or changes an existing database,
 * so it works on a Docker volume that already holds goldsmith_dev and goldsmith_test.
 */
import { createPool } from './connection.js';

const DATABASE_NAME = /^[a-z0-9_]+$/;

/** The database name in `url`. Only `a-z 0-9 _` is accepted, since it goes into CREATE DATABASE. */
export function databaseName(url: string): string {
  if (!URL.canParse(url)) throw new Error('A database URL is not a valid connection URL');
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!DATABASE_NAME.test(name)) throw new Error(`Database name "${name}" must use only a-z, 0-9 and _`);
  return name;
}

/** Create each database that does not exist. Returns each name and whether this call created it. */
export async function createDatabases(urls: string[]): Promise<{ name: string; created: boolean }[]> {
  const results: { name: string; created: boolean }[] = [];
  for (const url of urls) {
    const name = databaseName(url);
    // Connect to the server's maintenance database: the target may not exist yet.
    const admin = new URL(url);
    admin.pathname = '/postgres';
    const pool = createPool(admin.toString(), 1);
    try {
      const exists = await pool.query('select 1 from pg_database where datname = $1', [name]);
      let created = false;
      if (exists.rowCount === 0) {
        try {
          await pool.query(`create database "${name}"`);
          created = true;
        } catch (e) {
          // 42P04 duplicate_database: another db:create made it in the meantime.
          if ((e as { code?: string }).code !== '42P04') throw e;
        }
      }
      results.push({ name, created });
    } finally {
      await pool.end();
    }
  }
  return results;
}
