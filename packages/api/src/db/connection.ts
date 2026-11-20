/**
 * PostgreSQL connection pool. Every connection runs in UTC, and BIGINT (int8) columns, which
 * hold weights in units of 0.0001 g, come back as plain numbers (an error if one ever exceeds
 * Number.MAX_SAFE_INTEGER, instead of silently losing precision).
 */
import pg from 'pg';

const INT8_OID = 20;

pg.types.setTypeParser(INT8_OID, (value: string): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`bigint ${value} is outside the safe integer range`);
  return n;
});

export function createPool(url: string, max = 10): pg.Pool {
  return new pg.Pool({ connectionString: url, max, options: '-c TimeZone=UTC' });
}
