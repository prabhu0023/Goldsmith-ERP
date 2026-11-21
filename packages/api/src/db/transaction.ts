/**
 * Run work in one database transaction: commit when `fn` resolves, roll back when it throws.
 * If the connection breaks (an error event, or the rollback itself fails), the client is released
 * with the error so the pool discards it instead of handing a broken connection to the next caller.
 */
import type pg from 'pg';

export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  // A checked-out client has no error listener; without one a dropped connection would crash the process.
  const onError = (err: Error): void => {
    broken = err;
  };
  client.on('error', onError);
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch((rollbackErr: unknown) => {
      broken ??= rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    });
    throw e;
  } finally {
    // A broken client keeps the listener: it is discarded, and a late error event must not crash.
    if (!broken) client.removeListener('error', onError);
    client.release(broken);
  }
}
