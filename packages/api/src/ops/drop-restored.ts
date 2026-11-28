/**
 * Drop a throwaway restore database (EP-38-S6). The same guards as the restore apply, so only a
 * `goldsmith_restore...` database of this lane can go, never the live database and never in
 * production. The drop uses WITH (FORCE), which also ends sessions still connected to the copy.
 */
import type { OpsEnv } from './ops-env.js';
import { assertRestoreTarget } from './ops-guards.js';
import type { PgTools } from './pg-tools.js';
import { databaseExists } from './restore-db.js';
export async function dropRestored(
  deps: { env: Pick<OpsEnv, 'databaseUrl' | 'appEnv' | 'lane'>; tools: PgTools },
  options: { name: string; allowStaging?: boolean },
): Promise<{ dropped: boolean }> {
  const { env, tools } = deps;
  assertRestoreTarget({
    name: options.name,
    liveDatabase: new URL(env.databaseUrl).pathname.slice(1),
    appEnv: env.appEnv,
    lane: env.lane,
    allowStaging: options.allowStaging,
  });
  const existed = await databaseExists(env.databaseUrl, options.name);
  if (existed) await tools.dropDatabase(env.databaseUrl, options.name);
  return { dropped: existed };
}
