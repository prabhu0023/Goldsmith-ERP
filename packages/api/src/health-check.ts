/**
 * Database check for Read Health (EP-03-S10): a trivial read that gives up after a short
 * timeout, so a database that does not answer is reported `down` instead of hanging.
 *
 * The probe opens its own short-lived connection with the pool's settings instead of borrowing
 * a pool slot, and that connection carries the health timeout as its connect, query and
 * statement timeout. A hung database therefore never holds one of the pool's slots, and the
 * probe's socket is destroyed when its timeout passes.
 */
import pg from 'pg';

/** Resolve `promise`, or `fallback` after `ms`; a later rejection of `promise` is ignored. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

async function probe(options: pg.ClientConfig, timeoutMs: number): Promise<'up' | 'down'> {
  const client = new pg.Client({
    ...options,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  });
  client.on('error', () => {});
  try {
    await client.connect();
    await client.query('select 1');
    return 'up';
  } finally {
    // Not awaited: on a hung connection end() destroys the socket and resolves on its own.
    client.end().catch(() => {});
  }
}

export async function checkDatabase(pool: pg.Pool | undefined, timeoutMs: number): Promise<'up' | 'down'> {
  if (!pool) return 'down';
  return withTimeout(probe(pool.options, timeoutMs), timeoutMs, 'down');
}
