/**
 * The per-receiver check (EP-07-S5, S6). Before an event reaches a stream, the receiving user
 * must be in its audience and may read the entity under the one permission list:
 * ENTITY_READ_PERMISSIONS names operations of OPERATION_RULES and roleMay answers them, for the
 * role stored now (read once per delivery batch, not the role the stream opened with). A karigar
 * reads only their own jobs (users.karigar_id = karigar_jobs.karigar_id); a user event goes only
 * to that user. A failed check drops the event for that stream silently.
 */
import { ENTITY_READ_PERMISSIONS, type LiveEntityType, type RoleId, roleMay } from '@goldsmith/shared';
import type pg from 'pg';
import type { LiveRow } from './publisher.js';

/** What the filter needs of a stream. */
export interface FilterTarget {
  userId: string;
  channels: ReadonlySet<string>;
}

export interface ReceiverFilter {
  may(target: FilterTarget, row: LiveRow): boolean;
}

interface CurrentUser {
  role: RoleId;
  status: string;
  karigarId: string | null;
}

/** Counts every (stream, event) check, for the S5 AC4 "each connection checked once" test. */
export const filterStats = { checks: 0 };

export async function prepareFilter(
  pool: pg.Pool,
  shopId: string,
  rows: readonly LiveRow[],
  targets: readonly FilterTarget[],
): Promise<ReceiverFilter> {
  const users = new Map<string, CurrentUser>();
  const userIds = [...new Set(targets.map((t) => t.userId))];
  if (rows.length > 0 && userIds.length > 0) {
    const { rows: found } = await pool.query<{ id: string; role: RoleId; status: string; karigar_id: string | null }>(
      'select id, role, status, karigar_id from users where shop_id = $1 and id = any($2::uuid[])',
      [shopId, userIds],
    );
    for (const u of found) users.set(u.id, { role: u.role, status: u.status, karigarId: u.karigar_id });
  }
  const jobOwners = new Map<string, string>();
  const jobCodes = rows.filter((r) => r.entityType === 'karigar_job').map((r) => r.entityId);
  if (jobCodes.length > 0 && [...users.values()].some((u) => u.role === 'karigar')) {
    const { rows: jobs } = await pool.query<{ code: string; karigar_id: string }>(
      'select code, karigar_id from karigar_jobs where shop_id = $1 and code = any($2::text[])',
      [shopId, [...new Set(jobCodes)]],
    );
    for (const j of jobs) jobOwners.set(j.code, j.karigar_id);
  }
  return {
    may(target, row) {
      filterStats.checks += 1;
      if (!row.audience.channels.some((c) => target.channels.has(c))) return false;
      if (row.audience.exceptUserId === target.userId) return false;
      const user = users.get(target.userId);
      if (!user) return false;
      // A user event is about that user's own account, also after it was deactivated (S10 AC1).
      if (row.entityType === 'user') return row.entityId === target.userId;
      if (user.status !== 'active') return false;
      const reads: readonly string[] = ENTITY_READ_PERMISSIONS[row.entityType as LiveEntityType] ?? [];
      if (!reads.some((op) => roleMay(user.role, op))) return false;
      if (row.entityType === 'karigar_job' && user.role === 'karigar') {
        return user.karigarId !== null && jobOwners.get(row.entityId) === user.karigarId;
      }
      return true;
    },
  };
}
