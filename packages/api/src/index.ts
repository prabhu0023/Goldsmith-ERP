import type pg from 'pg';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createPool } from './db/connection.js';
import { productionJobs } from './jobs/production-jobs.js';
import { createScheduler, type Scheduler } from './jobs/scheduler.js';
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
    pool = createPool(config.databaseUrl, 10, {
      connectTimeoutMs: config.databaseConnectTimeoutMs,
      queryTimeoutMs: config.databaseQueryTimeoutMs,
    });
    // An idle connection that drops is discarded by the pool; log it instead of crashing.
    pool.on('error', (err) => console.error(`[api] database connection error: ${err.message}`));
  }
  const sessions = sessionResolverFor(config, pool, systemClock);

  let scheduler: Scheduler | undefined;
  const server = createApp(config, { pool, sessions, handlers }).listen(config.port, () => {
    console.log(`[api] ready on http://localhost:${config.port} (APP_ENV=${config.appEnv})`);
    if (config.jobsEnabled && pool) {
      scheduler = createScheduler({ pool, clock: systemClock, jobs: productionJobs, pollMs: config.jobsPollIntervalMs });
      scheduler.start();
      console.log(`[jobs] scheduler started (poll ${config.jobsPollIntervalMs} ms)`);
    }
  });
  server.on('error', (err) => {
    console.error(`[api] could not start: ${err.message}`);
    process.exit(1);
  });

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[api] ${signal}: stopping`);
    await scheduler?.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool?.end();
    process.exit(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shutdown(signal).catch((err: unknown) => {
        console.error(`[api] shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      });
    });
  }
}

start();
