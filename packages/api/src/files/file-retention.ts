/**
 * Retention (EP-09-S12): files past the keep period of their retention class are removed. Class
 * `po` is kept FILE_RETENTION_PO_DAYS; class `standard` (photos, references, bench photos) is kept
 * forever unless FILE_RETENTION_STANDARD_DAYS is set.
 *
 * For each file due: delete the original, thumbnail and display objects. When any delete fails
 * the file is left as it is (not counted as removed) and the next run tries again (AC4). Otherwise
 * the row gets removed_at (links and downloads answer not_found from then on, AC3), its
 * attachments are deleted, and one `file_removed_by_retention` entry is written per owner by the
 * system actor "System (retention run)". The run ends with one log line of counts per class (AC5).
 *
 * One run removes at most `batchSize` files (default RETENTION_BATCH, oldest first), so a run after
 * a long gap does not hold locks and a connection for every due file; the next run continues.
 *
 * Only the scheduler runs it (daily 03:00 Asia/Kolkata); there is no contract operation, so no
 * user session can call it. `runFileRetention` is the manual trigger for tests.
 */
import type { FileOwnerType, FileRole } from '@goldsmith/shared';
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
import { systemActorName } from '../jobs/job-audit.js';
import type { JobDefinition } from '../jobs/job-definition.js';
import { runInTransaction, type Tx } from '../pipeline/operation-transaction.js';
import { ROLE_LABELS } from './attachments.js';
import { type FileActor, writeFileAudit } from './file-audit.js';
import { OWNER_NOUNS } from './file-roles.js';
import type { ObjectStorage } from './object-storage.js';
import type { FileLog, RetentionClass } from './store-file.js';

const LABEL = 'retention run';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionPeriods {
  /** Days a `po` file is kept. */
  poDays: number;
  /** Days a `standard` file is kept; undefined keeps it forever. */
  standardDays?: number;
}

/** Most files one retention run removes. */
export const RETENTION_BATCH = 500;
export interface FileRetentionDeps {
  storage: ObjectStorage;
  retention: RetentionPeriods;
  log: FileLog;
  /** Most files one run removes; default RETENTION_BATCH. */
  batchSize?: number;
}

export interface RetentionCounts {
  po: number;
  standard: number;
  /** Files whose objects could not all be deleted (tried again next run). */
  failed: number;
}

interface DueFile {
  id: string;
  code: string;
  retention_class: RetentionClass;
  storage_key: string;
  thumbnail_key: string | null;
  display_key: string | null;
}

const cutoff = (now: Date, days: number | undefined): Date | null =>
  days === undefined ? null : new Date(now.getTime() - days * DAY_MS);

/** Remove the shop's files past their keep period at `now`, in the caller's transaction. */
export async function applyRetention(
  tx: Tx,
  shop: ShopContext,
  deps: FileRetentionDeps,
  now: Date,
): Promise<RetentionCounts> {
  const counts: RetentionCounts = { po: 0, standard: 0, failed: 0 };
  const { rows: due } = await tx.client.query<DueFile>(
    `select id, code, retention_class, storage_key, thumbnail_key, display_key
       from stored_files
      where shop_id = $1 and removed_at is null
        and ((retention_class = 'po' and uploaded_at < $2)
          or (retention_class = 'standard' and $3::timestamptz is not null and uploaded_at < $3))
      order by uploaded_at, code
      limit $4
      for update skip locked`,
    [
      shop.shopId,
      cutoff(now, deps.retention.poDays),
      cutoff(now, deps.retention.standardDays),
      deps.batchSize ?? RETENTION_BATCH,
    ],
  );
  const actor: FileActor = { id: null, name: systemActorName(LABEL), role: 'system' };
  for (const file of due) {
    const keys = [file.storage_key, file.thumbnail_key, file.display_key].filter((k): k is string => k !== null);
    let deleted = true;
    for (const key of keys) {
      try {
        await deps.storage.delete(key);
      } catch (err) {
        deleted = false;
        deps.log(`[files] retention could not delete an object of ${file.code} (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    if (!deleted) {
      counts.failed += 1;
      continue;
    }
    const { rows: owners } = await tx.client.query<{ owner_type: FileOwnerType; role: FileRole; owner_code: string }>(
      `delete from attachments a where a.shop_id = $1 and a.file_id = $2
       returning a.owner_type, a.role,
         coalesce(
           (select tag_no from pieces where shop_id = a.shop_id and id = a.piece_id),
           (select code from order_copies where shop_id = a.shop_id and id = a.order_copy_id),
           (select code from karigar_jobs where shop_id = a.shop_id and id = a.job_id),
           (select code from leads where shop_id = a.shop_id and id = a.lead_id)) as owner_code`,
      [shop.shopId, file.id],
    );
    await tx.client.query('update stored_files set removed_at = $3 where shop_id = $1 and id = $2', [
      shop.shopId,
      file.id,
      now,
    ]);
    owners.sort((a, b) => a.owner_code.localeCompare(b.owner_code) || a.role.localeCompare(b.role));
    for (const o of owners) {
      await writeFileAudit(tx.client, shop, actor, {
        kind: 'file_removed_by_retention',
        at: now,
        summary: `${ROLE_LABELS[o.role]} ${file.code} removed by retention from ${OWNER_NOUNS[o.owner_type].toLowerCase()} ${o.owner_code}`,
        reference: o.owner_code,
        before: [file.code],
        after: [],
      });
    }
    counts[file.retention_class] += 1;
  }
  return counts;
}

const countsLine = (c: RetentionCounts): string =>
  `[jobs] file-retention removed po=${c.po} standard=${c.standard} failed=${c.failed}`;

/** The scheduled job: daily at 03:00 Asia/Kolkata, per shop. */
export function fileRetentionJob(deps: FileRetentionDeps): JobDefinition {
  return {
    name: 'file-retention',
    label: LABEL,
    schedule: { kind: 'daily', hour: 3, minute: 0 },
    maxAttempts: 3,
    async handler(tx, ctx) {
      const counts = await applyRetention(tx, ctx.shop, deps, ctx.now);
      tx.afterCommit(() => deps.log(countsLine(counts)));
    },
  };
}

/** Manual trigger (tests): one retention run for `shop` at `now` in its own transaction. */
export async function runFileRetention(
  pool: pg.Pool,
  shop: ShopContext,
  deps: FileRetentionDeps,
  now: Date,
): Promise<RetentionCounts> {
  return runInTransaction(
    pool,
    async (tx) => {
      const counts = await applyRetention(tx, shop, deps, now);
      tx.afterCommit(() => deps.log(countsLine(counts)));
      return counts;
    },
    (message, err) => deps.log(`${message} (${err instanceof Error ? err.message : String(err)})`),
  );
}
