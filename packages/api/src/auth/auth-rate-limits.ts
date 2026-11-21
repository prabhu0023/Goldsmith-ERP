/**
 * Sign-in and reset-link rate limits (EP-04-S9). Fixed-window counters in PostgreSQL
 * (`auth_rate_counters`), so they survive a restart and are shared by api instances. Counted per
 * phone and per device (the client address), both keyed on HMAC-SHA256(SESSION_SECRET, value):
 * a phone has low entropy and a plain hash of it is easy to reverse. The counters are written in
 * their own short committed transaction, before any user lookup, password check, link or email.
 */
import { createHmac } from 'node:crypto';
import type pg from 'pg';
import type { AuthLimitsConfig } from '../config.js';
import { withTransaction } from '../db/transaction.js';
import { AuthRateLimitedError } from '../pipeline/api-errors.js';

export type AuthLimits = AuthLimitsConfig;

/** HMAC-SHA256 hex of a phone number or client address. */
export function phoneKey(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export type AuthLimitKind = 'sign_in' | 'reset';

/** Count this request; throws AuthRateLimitedError when the phone or the device is over its limit. */
export async function checkAuthLimits(
  pool: pg.Pool,
  {
    shopId,
    kind,
    phoneHash,
    deviceHash,
    now,
    limits,
  }: { shopId: string; kind: AuthLimitKind; phoneHash: string; deviceHash: string; now: Date; limits: AuthLimits },
): Promise<void> {
  const windowMs = limits.windowMinutes * 60_000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const perPhone = kind === 'sign_in' ? limits.signInPerPhone : limits.resetPerPhone;
  const perDevice = kind === 'sign_in' ? limits.signInPerDevice : limits.resetPerDevice;
  const [phoneHits, deviceHits] = await withTransaction(pool, async (client) => {
    const hit = async (bucket: string) =>
      (
        await client.query<{ hits: number }>(
          `insert into auth_rate_counters (shop_id, bucket, window_start, hits) values ($1, $2, $3, 1)
           on conflict (shop_id, bucket, window_start) do update set hits = auth_rate_counters.hits + 1
           returning hits`,
          [shopId, bucket, windowStart],
        )
      ).rows[0].hits;
    return [await hit(`${kind}:phone:${phoneHash}`), await hit(`${kind}:device:${deviceHash}`)];
  });
  if (phoneHits > perPhone || deviceHits > perDevice) throw new AuthRateLimitedError();
}
