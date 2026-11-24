/**
 * Streams whose session is over (EP-07-S3 AC4, S7 AC5): one query over the session ids of the
 * open streams. A session that was signed out, ended or has expired closes its streams. A session
 * ended by a deactivation or role change less than `graceMs` ago is left to the "User deactivated
 * or role changed" delivery, which sends the event first and then closes (EP-07-S10 AC1).
 */
import type pg from 'pg';

const ACCESS_ENDINGS = new Set(['deactivated', 'role_changed']);

export async function endedSessionIds(
  pool: pg.Pool,
  sessionIds: readonly string[],
  now: Date,
  graceMs = 5_000,
): Promise<string[]> {
  const ids = [...new Set(sessionIds)];
  if (ids.length === 0) return [];
  const { rows } = await pool.query<{ id: string; ended_at: Date | null; end_reason: string | null; expires_at: Date }>(
    'select id, ended_at, end_reason, expires_at from sessions where id = any($1::uuid[])',
    [ids],
  );
  const found = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => {
    const s = found.get(id);
    if (!s) return true;
    if (s.ended_at !== null) {
      const recentAccessEnding =
        ACCESS_ENDINGS.has(s.end_reason ?? '') && now.getTime() - s.ended_at.getTime() < graceMs;
      return !recentAccessEnding;
    }
    return s.expires_at.getTime() <= now.getTime();
  });
}
