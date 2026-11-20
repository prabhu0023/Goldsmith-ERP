/**
 * Vitest global setup for the database tests. With TEST_DATABASE_URL set, it wipes that database
 * (schema public) once per run and applies every migration. Without it, database tests are skipped locally; CI must set it.
 */
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';

export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    if (process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
    console.warn('database tests skipped: TEST_DATABASE_URL is not set');
    return;
  }
  const pool = createPool(url, 1);
  try {
    await pool.query('drop schema if exists public cascade; create schema public;');
    await migrate(pool, new URL('../../migrations/', import.meta.url));
  } finally {
    await pool.end();
  }
}
