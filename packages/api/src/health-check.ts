/**
 * Database check for Read Health (EP-03-S10): a trivial read that gives up after a short
 * timeout, so a database that does not answer is reported `down` instead of hanging.
 */
import type pg from 'pg';

/** Resolve `promise`, or `fallback` after `ms`; a later rejection of `promise` is ignored. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

export async function checkDatabase(pool: pg.Pool | undefined, timeoutMs: number): Promise<'up' | 'down'> {
  if (!pool) return 'down';
  const query = pool.query('select 1').then((): 'up' | 'down' => 'up');
  return withTimeout(query, timeoutMs, 'down');
}
