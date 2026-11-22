/**
 * Database commands: `migrate`, `status`, `reset`, `seed`, `dev-session <user name>`,
 * `dev-password <user name> <password>`, `create` and `new <name>` (run via `npm run db:<command>`). Reads DATABASE_URL, APP_ENV and LANE
 * (`create` also TEST_DATABASE_URL; `seed` also STORAGE_* for the seed images; `new` reads nothing). Exit code 0 on success, 1 with a
 * one-line error otherwise.
 */
import type { AppEnv } from '../config.js';
import { S3Storage } from '../files/s3-storage.js';
import { readStorageEnv } from '../files/storage-config.js';
import { createPool } from './connection.js';
import { createDatabases } from './create-databases.js';
import { readDbEnv } from './db-env.js';
import { setDevPassword } from './dev-password.js';
import { createDevSession } from './dev-session.js';
import { migrate, migrationStatus, newMigrationFile, resetDatabase } from './migrator.js';
import { seedPrototype } from './seed/seed-database.js';

/** Works from src/db (tsx) and dist/db (built). */
const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url);

async function runMigrate(pool: ReturnType<typeof createPool>): Promise<void> {
  const { applied } = await migrate(pool, MIGRATIONS_DIR);
  if (applied.length === 0) {
    const total = (await migrationStatus(pool, MIGRATIONS_DIR)).filter((r) => r.state === 'applied').length;
    console.log(`Database is up to date (${total} migrations applied).`);
    return;
  }
  for (const m of applied) console.log(`Applied ${m.file}`);
}

async function runStatus(pool: ReturnType<typeof createPool>): Promise<void> {
  const rows = await migrationStatus(pool, MIGRATIONS_DIR);
  if (rows.length === 0) {
    console.log('No migration files.');
    return;
  }
  const table = [
    ['Version', 'Name', 'Applied at (UTC)', 'Checksum', 'State'],
    ...rows.map((r) => [
      r.prefix,
      r.name,
      r.appliedAt ?? '-',
      r.checksum.slice(0, 12),
      r.state,
    ]),
  ];
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)));
  for (const row of table) console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
}

async function runSeed(pool: ReturnType<typeof createPool>, appEnv: AppEnv): Promise<void> {
  // The seed images (EP-09-S13) go to the lane's bucket when STORAGE_* is set; else they are skipped.
  const settings = appEnv === 'production' ? undefined : readStorageEnv();
  const storage = settings ? new S3Storage(settings) : undefined;
  try {
    await storage?.ensureBucket();
    const counts = await seedPrototype(pool, { appEnv, storage, log: console.log });
    console.log('Seeded the prototype data:');
    const width = Math.max(...Object.keys(counts).map((t) => t.length));
    for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(width)}  ${String(n).padStart(4)}`);
    if (storage) {
      const objects = (await storage.listKeys()).filter((k) => k.startsWith('seed/')).length;
      console.log(`Bucket ${storage.bucket} holds ${objects} seed objects.`);
    }
  } finally {
    storage?.close();
  }
}

async function runDevSession(pool: ReturnType<typeof createPool>, appEnv: AppEnv, userName: string): Promise<void> {
  const s = await createDevSession(pool, { appEnv, userName });
  console.log(`Session for ${s.name} (${s.role}), valid until ${s.expiresAt.toISOString()}:`);
  console.log(s.token);
  console.log(`Send it with every api call as the gs_session cookie, e.g.  curl -b 'gs_session=${s.token}' ...`);
}
async function runDevPassword(
  pool: ReturnType<typeof createPool>,
  appEnv: AppEnv,
  userName: string,
  password: string,
): Promise<void> {
  const u = await setDevPassword(pool, { appEnv, userName, password });
  console.log(`Password set for ${u.name} (${u.role}); the user is active and can sign in with phone ${u.phone}.`);
}

const COMMANDS = ['migrate', 'status', 'reset', 'seed', 'dev-session', 'dev-password', 'create', 'new'];

async function main(command: string | undefined, arg: string | undefined, arg2: string | undefined): Promise<void> {
  if (command === undefined || !COMMANDS.includes(command)) {
    throw new Error(
      `Unknown command ${command ?? '(none)'}; use migrate, status, reset, seed, dev-session, dev-password, create or new`,
    );
  }
  if (command === 'new') {
    if (!arg?.trim()) throw new Error('Name the migration: npm run db:new -- metal_pool_ledger');
    const file = newMigrationFile(MIGRATIONS_DIR, arg.trim());
    console.log(`Created packages/api/migrations/${file}`);
    return;
  }
  const { databaseUrl, appEnv, lane, testDatabaseUrl } = readDbEnv();
  if (command === 'create') {
    const urls = testDatabaseUrl ? [databaseUrl, testDatabaseUrl] : [databaseUrl];
    for (const r of await createDatabases(urls)) {
      console.log(`${r.created ? 'Created' : 'Exists '}  ${r.name}${lane ? ` (lane ${lane})` : ''}`);
    }
    return;
  }
  if (lane) console.log(`Lane ${lane}: database ${new URL(databaseUrl).pathname.slice(1)}`);
  // Developers reset only their own development database; staging and production are the deploy pipeline's (S1).
  if (command === 'reset' && appEnv !== 'development') {
    throw new Error(`db:reset is refused when APP_ENV=${appEnv}`);
  }
  if (command === 'dev-session' && !arg?.trim()) {
    throw new Error('Name the user: npm run db:dev-session -- "Rajesh Verma"');
  }
  if (command === 'dev-password' && (!arg?.trim() || !arg2)) {
    throw new Error('Name the user and the password: npm run db:dev-password -- "Rajesh Verma" "counter-2026"');
  }
  const pool = createPool(databaseUrl, 1);
  try {
    if (command === 'migrate') await runMigrate(pool);
    else if (command === 'status') await runStatus(pool);
    else if (command === 'seed') await runSeed(pool, appEnv);
    else if (command === 'dev-session') await runDevSession(pool, appEnv, (arg ?? '').trim());
    else if (command === 'dev-password') await runDevPassword(pool, appEnv, (arg ?? '').trim(), arg2 ?? '');
    else {
      await resetDatabase(pool);
      console.log('Database reset: schema public dropped and recreated.');
      await runMigrate(pool);
    }
  } finally {
    await pool.end();
  }
}

main(process.argv[2], process.argv[3], process.argv[4]).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`.split('\n')[0]);
    process.exit(1);
  },
);
