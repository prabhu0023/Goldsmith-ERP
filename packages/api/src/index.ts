import type pg from 'pg';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createPool } from './db/connection.js';
import { systemClock } from './pipeline/server-clock.js';
import { sessionResolverFor } from './pipeline/session-resolver.js';
import { handlers } from './services/index.js';

function start(): void {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[api] ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  let pool: pg.Pool | undefined;
  if (config.databaseUrl) {
    pool = createPool(config.databaseUrl);
    // An idle connection that drops is discarded by the pool; log it instead of crashing.
    pool.on('error', (err) => console.error(`[api] database connection error: ${err.message}`));
  }
  const sessions = sessionResolverFor(config, pool, systemClock);

  const server = createApp(config, { pool, sessions, handlers }).listen(config.port, () => {
    console.log(`[api] ready on http://localhost:${config.port} (APP_ENV=${config.appEnv})`);
  });
  server.on('error', (err) => {
    console.error(`[api] could not start: ${err.message}`);
    process.exit(1);
  });
}

start();
