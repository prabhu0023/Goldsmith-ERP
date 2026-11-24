import type pg from 'pg';
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { auditGrantProblems } from './db/app-role.js';
import { createPool } from './db/connection.js';
import { fileRetentionJob } from './files/file-retention.js';
import type { FilesDeps } from './files/files-router.js';
import { storageFromConfig } from './files/storage-config.js';
import { productionJobs } from './jobs/production-jobs.js';
import { createLiveChannel, type LiveChannel } from './live/live-channel.js';
import { createScheduler, type Scheduler } from './jobs/scheduler.js';
import { systemClock } from './pipeline/server-clock.js';
import { sessionResolverFor } from './pipeline/session-resolver.js';

/**
 * The api must not be able to change audit entries (EP-06-S1, FU-001): staging and production
 * stop when its connection can; development warns (APP_DATABASE_URL unset uses DATABASE_URL).
 */
async function checkAuditGrants(config: ReturnType<typeof loadConfig>, pool: pg.Pool): Promise<void> {
  let problem: boolean;
  try {
    problem = await auditGrantProblems(pool);
  } catch (err) {
    console.error(`[api] could not check the audit grants: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!problem) return;
  const message = 'the database connection can change audit entries; set APP_DATABASE_URL to the goldsmith_app role';
  if (config.appEnv === 'development') {
    console.warn(`[api] warning: ${message}`);
    return;
  }
  console.error(`[api] ${message}`);
  process.exit(1);
}

async function start(): Promise<void> {
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
  const databaseUrl = config.appDatabaseUrl ?? config.databaseUrl;
  if (databaseUrl) {
    pool = createPool(databaseUrl, 10, {
      connectTimeoutMs: config.databaseConnectTimeoutMs,
      queryTimeoutMs: config.databaseQueryTimeoutMs,
    });
    // An idle connection that drops is discarded by the pool; log it instead of crashing.
    pool.on('error', (err) => console.error(`[api] database connection error: ${err.message}`));
    void checkAuditGrants(config, pool);
  }
  const sessions = sessionResolverFor(config, pool, systemClock);

  // File storage (EP-09): off when STORAGE_BUCKET is unset; the bucket is created when missing.
  const storage = storageFromConfig(config);
  let files: FilesDeps | undefined;
  if (storage) {
    try {
      await storage.ensureBucket();
    } catch (err) {
      console.error(`[files] object storage is not reachable: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
    files = {
      storage,
      limits: { maxBytes: config.fileMaxBytes },
      linkSecret: config.sessionSecret,
      ttlSeconds: config.fileLinkTtlSeconds,
      log: console.log,
    };
    console.log(`[files] object storage bucket ${storage.bucket} ready`);
  }
  // Retention (EP-09-S12) runs only when there is a store to remove files from.
  const jobs = storage
    ? [
        ...productionJobs,
        fileRetentionJob({
          storage,
          retention: { poDays: config.fileRetentionPoDays, standardDays: config.fileRetentionStandardDays },
          log: console.log,
        }),
      ]
    : productionJobs;
  let scheduler: Scheduler | undefined;
  // The live channel (EP-07): one per process, serving GET /api/live (Server-Sent Events, D3).
  const live: LiveChannel | undefined = pool
    ? createLiveChannel({ pool, sessions, clock: systemClock, appUrl: config.appUrl, log: console.error })
    : undefined;
  const server = createApp(config, { pool, sessions, files, live }).listen(config.port, () => {
    console.log(`[api] ready on http://localhost:${config.port} (APP_ENV=${config.appEnv})`);
    if (live) {
      live.start();
      console.log('[live] channel started (GET /api/live)');
    }
    if (config.jobsEnabled && pool) {
      scheduler = createScheduler({ pool, clock: systemClock, jobs, pollMs: config.jobsPollIntervalMs });
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
    // Open streams would keep server.close waiting: end them first.
    await live?.stop();
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

start().catch((err: unknown) => {
  console.error(`[api] could not start: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
