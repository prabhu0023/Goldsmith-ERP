/**
 * Database commands: `migrate`, `status`, `reset`, `seed`, `dev-session <user name>` (run via `npm run db:<command>`).
 * Reads DATABASE_URL and APP_ENV. Exit code 0 on success, 1 with a one-line error otherwise.
 */
import type { AppEnv } from '../config.js';
import { createPool } from './connection.js';
import { readDbEnv } from './db-env.js';
import { createDevSession } from './dev-session.js';
import { migrate, migrationStatus, resetDatabase } from './migrator.js';
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
    ['Number', 'Name', 'Applied at (UTC)', 'Checksum', 'State'],
    ...rows.map((r) => [
      String(r.version).padStart(4, '0'),
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
  const counts = await seedPrototype(pool, { appEnv });
  console.log('Seeded the prototype data:');
  const width = Math.max(...Object.keys(counts).map((t) => t.length));
  for (const [table, n] of Object.entries(counts)) console.log(`  ${table.padEnd(width)}  ${String(n).padStart(4)}`);
}

async function runDevSession(pool: ReturnType<typeof createPool>, appEnv: AppEnv, userName: string): Promise<void> {
  const s = await createDevSession(pool, { appEnv, userName });
  console.log(`Session for ${s.name} (${s.role}), valid until ${s.expiresAt.toISOString()}:`);
  console.log(s.sessionId);
  console.log(`Send it with every api call as the header  x-dev-session: ${s.sessionId}`);
}
const COMMANDS = ['migrate', 'status', 'reset', 'seed', 'dev-session'];

async function main(command: string | undefined, arg: string | undefined): Promise<void> {
  if (command === undefined || !COMMANDS.includes(command)) {
    throw new Error(`Unknown command ${command ?? '(none)'}; use migrate, status, reset, seed or dev-session`);
  }
  const { databaseUrl, appEnv } = readDbEnv();
  // Developers reset only their own development database; staging and production are the deploy pipeline's (S1).
  if (command === 'reset' && appEnv !== 'development') {
    throw new Error(`db:reset is refused when APP_ENV=${appEnv}`);
  }
  if (command === 'dev-session' && !arg?.trim()) {
    throw new Error('Name the user: npm run db:dev-session -- "Rajesh Verma"');
  }
  const pool = createPool(databaseUrl, 1);
  try {
    if (command === 'migrate') await runMigrate(pool);
    else if (command === 'status') await runStatus(pool);
    else if (command === 'seed') await runSeed(pool, appEnv);
    else if (command === 'dev-session') await runDevSession(pool, appEnv, (arg ?? '').trim());
    else {
      await resetDatabase(pool);
      console.log('Database reset: schema public dropped and recreated.');
      await runMigrate(pool);
    }
  } finally {
    await pool.end();
  }
}

main(process.argv[2], process.argv[3]).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`.split('\n')[0]);
    process.exit(1);
  },
);
