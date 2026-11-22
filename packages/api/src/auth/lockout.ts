/**
 * Account lockout (EP-04-S8, D4): 5 wrong passwords in a row lock the account for 15 minutes.
 * One `sign_in_lockouts` row per user, or per (shop, phone hash) for a phone with no live user,
 * so an unknown number locks the same way and lockout does not reveal which numbers exist.
 * The row is locked (`for update`) for the whole sign-in transaction, so parallel guesses are
 * all counted.
 */
import type pg from 'pg';
import type { AuditActor } from './auth-audit.js';
import { writeAuthAudit } from './auth-audit.js';

type Queryable = pg.Pool | pg.PoolClient;

export const MAX_FAILED_PASSWORDS = 5;
export const LOCK_MINUTES = 15;

const KOLKATA_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "HH:MM" in Asia/Kolkata, 24-hour. */
export const kolkataTime = (date: Date): string => KOLKATA_TIME.format(date);

/** Whose attempts are counted: a user, or a hashed phone with no live user. */
export type LockKey = { shopId: string; userId: string } | { shopId: string; phoneHash: string };

export interface LockRow {
  id: string;
  failedCount: number;
  lockedUntil: Date | null;
}

/** The lockout row for `key`, created when missing and locked for this transaction. */
export async function lockRow(client: pg.PoolClient, key: LockKey): Promise<LockRow> {
  if ('userId' in key) {
    await client.query(
      `insert into sign_in_lockouts (shop_id, user_id) values ($1, $2)
       on conflict (user_id) where user_id is not null do nothing`,
      [key.shopId, key.userId],
    );
  } else {
    await client.query(
      `insert into sign_in_lockouts (shop_id, phone_hash) values ($1, $2)
       on conflict (shop_id, phone_hash) where phone_hash is not null do nothing`,
      [key.shopId, key.phoneHash],
    );
  }
  const where = 'userId' in key ? 'user_id = $2' : 'phone_hash = $2';
  const { rows } = await client.query<{ id: string; failed_count: number; locked_until: Date | null }>(
    `select id, failed_count, locked_until from sign_in_lockouts where shop_id = $1 and ${where} for update`,
    [key.shopId, 'userId' in key ? key.userId : key.phoneHash],
  );
  const row = rows[0];
  return { id: row.id, failedCount: row.failed_count, lockedUntil: row.locked_until };
}

/** One more wrong password; the 5th locks until `at` + 15 minutes. */
export async function recordFailure(
  client: Queryable,
  { lockId, at }: { lockId: string; at: Date },
): Promise<{ locked: boolean; lockedUntil: Date | null }> {
  const lockUntil = new Date(at.getTime() + LOCK_MINUTES * 60_000);
  const { rows } = await client.query<{ failed_count: number; locked_until: Date | null }>(
    `update sign_in_lockouts
        set failed_count = failed_count + 1,
            locked_until = case when failed_count + 1 >= $2 then $3 else locked_until end
      where id = $1
      returning failed_count, locked_until`,
    [lockId, MAX_FAILED_PASSWORDS, lockUntil],
  );
  const row = rows[0];
  return { locked: row.failed_count >= MAX_FAILED_PASSWORDS, lockedUntil: row.locked_until };
}

/** Back to no failures and no lock (a right password, or a lock that has run out). */
export async function resetFailures(client: Queryable, { lockId }: { lockId: string }): Promise<void> {
  await client.query('update sign_in_lockouts set failed_count = 0, locked_until = null where id = $1', [lockId]);
}

/**
 * Unlock (EP-04-S8 AC5): server-only, called by EP-05 on the owner's behalf. Clears the lock and
 * the count at once and audits `account_unlocked` with the actor who unlocked.
 */
export async function unlockAccount(
  client: Queryable,
  { shopId, userId, by, at }: { shopId: string; userId: string; by: AuditActor; at: Date },
): Promise<void> {
  await client.query(
    `update sign_in_lockouts
        set failed_count = 0, locked_until = null, unlocked_by = $3, unlocked_at = $4
      where shop_id = $1 and user_id = $2`,
    [shopId, userId, by.kind === 'user' ? by.id : null, at],
  );
  const { rows } = await client.query<{ name: string }>('select name from users where shop_id = $1 and id = $2', [
    shopId,
    userId,
  ]);
  await writeAuthAudit(client, {
    shopId,
    at,
    actor: by,
    action: 'account_unlocked',
    summary: `${rows[0]?.name ?? 'A user'} was unlocked`,
    detail: { entity: 'user', entityId: userId },
  });
}
