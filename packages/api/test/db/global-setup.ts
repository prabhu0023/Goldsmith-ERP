/**
 * Vitest global setup for the database tests. With TEST_DATABASE_URL set, it wipes that database
 * (schema public) once per run and applies every migration. Without it, database tests are skipped locally; CI must set it.
 * The database name must end in `_test` (test-db-guard.ts), or the run stops before touching it.
 * With STORAGE_ENDPOINT set it also ensures the test bucket (<bucket>-test, storage-config.ts) and
 * empties it; without it the S3 storage tests are skipped locally, and CI must set it.
 * The api's role goldsmith_app (FU-001) gets LOGIN first, with APP_DATABASE_URL's credentials or
 * the local defaults, so tests can connect as it (db-test-helpers.ts appRolePool).
 */
import { credentialsOf, ensureAppLoginRole } from '../../src/db/app-role.js';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { testDatabaseUrl } from '../../src/lane.js';
import { testStorage } from '../files/storage-test-helpers.js';
import { assertWipeableTestDatabase } from './test-db-guard.js';

export async function setup(): Promise<void> {
  await setupStorage();
  // With LANE set, the lane's test database (goldsmith_test → goldsmith_<lane>_test).
  const url = testDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
    console.warn('database tests skipped: TEST_DATABASE_URL is not set');
    return;
  }
  assertWipeableTestDatabase(url);
  const pool = createPool(url, 1);
  try {
    await ensureAppLoginRole(pool, credentialsOf(process.env.APP_DATABASE_URL));
    await pool.query('drop schema if exists public cascade; create schema public;');
    await migrate(pool, new URL('../../migrations/', import.meta.url));
  } finally {
    await pool.end();
  }
}

async function setupStorage(): Promise<void> {
  const storage = testStorage();
  if (!storage) {
    if (process.env.CI) throw new Error('STORAGE_ENDPOINT is required in CI');
    console.warn('S3 storage tests skipped: STORAGE_ENDPOINT is not set');
    return;
  }
  if (!storage.bucket.endsWith('-test')) {
    throw new Error(`Test bucket "${storage.bucket}" does not end in -test; the tests empty it, so they refuse to run`);
  }
  try {
    await storage.ensureBucket();
    for (const key of await storage.listKeys()) await storage.delete(key);
  } finally {
    storage.close();
  }
}
