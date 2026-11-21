/**
 * PostgreSQL connection pool. Every connection runs in UTC, and BIGINT (int8) columns, which
 * hold weights in units of 0.0001 g, come back as plain numbers (an error if one ever exceeds
 * Number.MAX_SAFE_INTEGER, instead of silently losing precision).
 *
 * The api server's pool also gets timeouts (DATABASE_CONNECT_TIMEOUT_MS, DATABASE_QUERY_TIMEOUT_MS),
 * so a database that accepts connections but never answers cannot hold pool slots forever. The
 * database CLI (migrate, seed) passes none, so a long migration is never cut off.
 */
import pg from 'pg';

const INT8_OID = 20;

pg.types.setTypeParser(INT8_OID, (value: string): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} is outside the safe integer range`);
  return n;
});

export interface PoolTimeouts {
  /** Give up opening a connection (or waiting for a free slot) after this many ms. */
  connectTimeoutMs: number;
  /** Cancel a statement on the server (statement_timeout) and stop waiting for its answer
   * on the client (query_timeout) after this many ms. */
  queryTimeoutMs: number;
}

export function createPool(url: string, max = 10, timeouts?: PoolTimeouts): pg.Pool {
  return new pg.Pool({
    connectionString: url,
    max,
    options: '-c TimeZone=UTC',
    ...(timeouts && {
      connectionTimeoutMillis: timeouts.connectTimeoutMs,
      query_timeout: timeouts.queryTimeoutMs,
      statement_timeout: timeouts.queryTimeoutMs,
    }),
  });
}
