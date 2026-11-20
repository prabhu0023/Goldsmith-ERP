/**
 * Database commands: `migrate`, `status`, `reset` (run via `npm run db:<command>`).
 * Reads DATABASE_URL and APP_ENV. Exit code 0 on success, 1 with a one-line error otherwise.
 */
import { createPool } from './connection.js';
import { readDbEnv } from './db-env.js';
import { migrate, migrationStatus, resetDatabase } from './migrator.js';

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

async function main(command: string | undefined): Promise<void> {
  if (command !== 'migrate' && command !== 'status' && command !== 'reset') {
    throw new Error(`Unknown command ${command ?? '(none)'}; use migrate, status or reset`);
  }
  const { databaseUrl, appEnv } = readDbEnv();
  if (command === 'reset' && appEnv === 'production') {
    throw new Error('db:reset is refused when APP_ENV=production');
  }
  const pool = createPool(databaseUrl, 1);
  try {
    if (command === 'migrate') await runMigrate(pool);
    else if (command === 'status') await runStatus(pool);
    else {
      await resetDatabase(pool);
      console.log('Database reset: schema public dropped and recreated.');
      await runMigrate(pool);
    }
  } finally {
    await pool.end();
  }
}

main(process.argv[2]).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`.split('\n')[0]);
    process.exit(1);
  },
);
