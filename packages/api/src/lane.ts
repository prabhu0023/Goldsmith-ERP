/**
 * Development lanes (docs/setup/parallel-lanes.md): two worktrees on one machine, each with its
 * own databases and ports, selected by one variable, LANE (a single letter, `a` to `z`).
 *
 * LANE unset: nothing changes (goldsmith_dev, goldsmith_test, api 4000, web 3000).
 * LANE=a: the database names in DATABASE_URL and TEST_DATABASE_URL get the lane added
 * (goldsmith_dev → goldsmith_dev_a, goldsmith_test → goldsmith_a_test, so the test name still
 * ends in `_test`), and the default api port becomes 4000 + n (a = 1, b = 2, …). A name that
 * already carries the lane is kept, and an API_PORT that is set always wins.
 */
type Env = Record<string, string | undefined>;

const LANE_PATTERN = /^[a-z]$/;

export const DEFAULT_API_PORT = 4000;

/** The lane in `env`, or undefined when LANE is unset or empty. Throws on any other value. */
export function readLane(env: Env): string | undefined {
  const lane = env.LANE?.trim();
  if (!lane) return undefined;
  if (!LANE_PATTERN.test(lane)) throw new Error('LANE must be one lower-case letter, a to z');
  return lane;
}

/** 1 for lane a, 2 for lane b, … */
export const laneNumber = (lane: string): number => lane.charCodeAt(0) - 'a'.charCodeAt(0) + 1;

/** Default api port: 4000, or 4000 + n in lane n. */
export const laneApiPort = (lane: string | undefined): number =>
  lane === undefined ? DEFAULT_API_PORT : DEFAULT_API_PORT + laneNumber(lane);

function withDatabaseName(url: string, rename: (name: string) => string): string {
  if (!URL.canParse(url)) return url; // left for the caller's own validation
  const u = new URL(url);
  const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!name) return url;
  u.pathname = `/${encodeURIComponent(rename(name))}`;
  return u.toString();
}

/** goldsmith_dev → goldsmith_dev_<lane>. */
export function laneDatabaseUrl(url: string, lane: string | undefined): string {
  if (lane === undefined) return url;
  return withDatabaseName(url, (name) => (name.endsWith(`_${lane}`) ? name : `${name}_${lane}`));
}

/** goldsmith_test → goldsmith_<lane>_test (still ends in `_test`). */
export function laneTestDatabaseUrl(url: string, lane: string | undefined): string {
  if (lane === undefined) return url;
  return withDatabaseName(url, (name) => {
    if (name.endsWith(`_${lane}_test`)) return name;
    return name.endsWith('_test') ? `${name.slice(0, -'_test'.length)}_${lane}_test` : `${name}_${lane}`;
  });
}

/** TEST_DATABASE_URL of this lane, or undefined when unset. */
export function testDatabaseUrl(env: Env = process.env): string | undefined {
  const url = env.TEST_DATABASE_URL?.trim();
  return url ? laneTestDatabaseUrl(url, readLane(env)) : undefined;
}
