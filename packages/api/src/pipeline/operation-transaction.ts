/**
 * One transaction per operation (EP-03-S6). The service function gets a transaction handle and
 * never opens its own connection. It commits only when the function returns; any throw rolls
 * back every write of the call. After-commit hooks (where EP-07 publishes live events) run once
 * after a commit and never after a rollback.
 */
import type pg from 'pg';
import { withTransaction } from '../db/transaction.js';
import type { ErrorLog } from './api-errors.js';

export interface Tx {
  client: pg.PoolClient;
  /** Run `fn` once after this transaction commits; never if it rolls back. */
  afterCommit(fn: () => void | Promise<void>): void;
}

export async function runInTransaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>, log: ErrorLog): Promise<T> {
  const hooks: Array<() => void | Promise<void>> = [];
  const result = await withTransaction(pool, (client) => fn({ client, afterCommit: (hook) => hooks.push(hook) }));
  for (const hook of hooks) {
    try {
      await hook();
    } catch (err) {
      // The operation already committed: a failing hook is logged, not reported to the caller.
      log('[api] after-commit hook failed', err);
    }
  }
  return result;
}
