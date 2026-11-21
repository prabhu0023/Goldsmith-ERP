/**
 * The environment the database commands need. Errors name the variable, never its value.
 */
import { APP_ENVS, type AppEnv } from '../config.js';

type Env = Record<string, string | undefined>;

export function readDbEnv(env: Env = process.env): { databaseUrl: string; appEnv: AppEnv } {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required but missing or empty');
  const appEnv = env.APP_ENV?.trim();
  if (!appEnv) throw new Error('APP_ENV is required but missing or empty');
  if (!(APP_ENVS as readonly string[]).includes(appEnv)) {
    throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')}`);
  }
  return { databaseUrl, appEnv: appEnv as AppEnv };
}
