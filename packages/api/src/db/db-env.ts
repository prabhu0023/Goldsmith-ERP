/**
 * The environment the database commands need. Errors name the variable, never its value.
 * With LANE set, both database names are the lane's (src/lane.ts).
 */
import { APP_ENVS, type AppEnv } from '../config.js';
import { laneDatabaseUrl, readLane, testDatabaseUrl } from '../lane.js';

type Env = Record<string, string | undefined>;

export function readDbEnv(env: Env = process.env): {
  databaseUrl: string;
  appEnv: AppEnv;
  lane: string | undefined;
  /** TEST_DATABASE_URL (lane applied), or undefined when unset. */
  testDatabaseUrl: string | undefined;
  /** APP_DATABASE_URL (lane applied), the api's goldsmith_app connection, or undefined when unset. */
  appDatabaseUrl: string | undefined;
} {
  const lane = readLane(env);
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required but missing or empty');
  const appDatabaseUrl = env.APP_DATABASE_URL?.trim();
  const appEnv = env.APP_ENV?.trim();
  if (!appEnv) throw new Error('APP_ENV is required but missing or empty');
  if (!(APP_ENVS as readonly string[]).includes(appEnv)) {
    throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')}`);
  }
  return {
    databaseUrl: laneDatabaseUrl(databaseUrl, lane),
    appEnv: appEnv as AppEnv,
    lane,
    testDatabaseUrl: testDatabaseUrl(env),
    appDatabaseUrl: appDatabaseUrl ? laneDatabaseUrl(appDatabaseUrl, lane) : undefined,
  };
}
