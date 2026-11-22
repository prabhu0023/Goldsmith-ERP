/**
 * The live publisher (EP-07-S1, S2, S7). It reads only committed outbox rows, so no client can
 * see a change that rolled back:
 *   - stamp(): give each unsent catalogue row the next sequence number of its shop's stream, in
 *     commit (insert) order, and mark it sent. The per-shop counter in live_streams is row-locked
 *     and only raised, so sequence numbers never go backwards or repeat, even with two publishers
 *     (two API processes) stamping at once. A stamped row is never stamped again after a restart.
 *   - tail(): the stamped rows of a shop after a sequence number, for delivery and replay.
 *   - prune(): forget rows older than the replay window; a resume from before it gets refetch_all.
 * Rows whose topic is not in the catalogue are never stamped (S11 AC3).
 */
import { LIVE_CATALOGUE, type LiveCatalogue, type LiveEnvelope, liveEntryFor, liveEnvelopeSchema } from '@goldsmith/shared';
import type pg from 'pg';
import { withTransaction } from '../db/transaction.js';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Clock } from '../pipeline/server-clock.js';

/** One stamped live event as stored. */
export interface LiveRow {
  id: string;
  shopId: string;
  topic: string;
  seq: number;
  entityType: string;
  entityId: string;
  entityVersion: number;
  audience: { channels: string[]; exceptUserId?: string };
  createdAt: Date;
  publishedAt: Date;
}

export interface StreamState {
  /** The last sequence number given out on the shop's stream (0 before the first). */
  lastSeq: number;
  /** The highest sequence number already pruned (0 when nothing was). */
  prunedThrough: number;
}

export interface LivePublisherOptions {
  pool: pg.Pool;
  clock: Clock;
  /** The event registry; a proposed (G26) entry is one more key. */
  catalogue?: LiveCatalogue;
  /** Called after each stamp() commit with the rows it stamped, in sequence order per shop. */
  onRows?: (rows: LiveRow[]) => void;
  log: ErrorLog;
  /** Rows stamped per transaction. */
  batchSize?: number;
  /** Stamp and prune only these shops' rows (tests share one database); every shop when unset. */
  shopIds?: readonly string[];
}

export interface LivePublisher {
  stamp(): Promise<LiveRow[]>;
  tail(shopId: string, afterSeq: number, limit?: number): Promise<LiveRow[]>;
  /** The envelope a client gets, or null (logged) when the row does not make a valid one. */
  toEnvelope(row: LiveRow): LiveEnvelope | null;
  /** Delete live rows published more than `windowMs` ago; returns how many went. */
  prune(windowMs: number): Promise<number>;
  streamState(shopId: string): Promise<StreamState>;
}

interface StoredRow {
  id: string;
  shop_id: string;
  topic: string;
  live_seq: string | null;
  entity_type: string;
  entity_id: string;
  entity_version: number;
  audience: LiveRow['audience'];
  created_at: Date;
  published_at: Date | null;
}

const COLUMNS =
  'id, shop_id, topic, live_seq, entity_type, entity_id, entity_version, audience, created_at, published_at';

const toRow = (r: StoredRow, seq = Number(r.live_seq), publishedAt = r.published_at as Date): LiveRow => ({
  id: r.id,
  shopId: r.shop_id,
  topic: r.topic,
  seq,
  entityType: r.entity_type,
  entityId: r.entity_id,
  entityVersion: r.entity_version,
  audience: r.audience,
  createdAt: r.created_at,
  publishedAt,
});

export function createLivePublisher({
  pool,
  clock,
  catalogue = LIVE_CATALOGUE,
  onRows,
  log,
  batchSize = 200,
  shopIds,
}: LivePublisherOptions): LivePublisher {
  const topics = Object.keys(catalogue);

  async function stamp(): Promise<LiveRow[]> {
    const stamped = await withTransaction(pool, async (client) => {
      const { rows } = await client.query<StoredRow>(
        `select ${COLUMNS} from outbox_events
          where live_seq is null and entity_type is not null and topic = any($1::text[])
            and ($3::uuid[] is null or shop_id = any($3::uuid[]))
          order by insert_order
          for update skip locked
          limit $2`,
        [topics, batchSize, shopIds ?? null],
      );
      if (rows.length === 0) return [];
      const byShop = new Map<string, StoredRow[]>();
      for (const r of rows) byShop.set(r.shop_id, [...(byShop.get(r.shop_id) ?? []), r]);
      const publishedAt = clock.now();
      const out: LiveRow[] = [];
      // Lock the shop streams in one order, so two publishers cannot deadlock.
      for (const shopId of [...byShop.keys()].sort()) {
        const shopRows = byShop.get(shopId) as StoredRow[];
        await client.query('insert into live_streams (shop_id) values ($1) on conflict (shop_id) do nothing', [shopId]);
        const counter = await client.query<{ last_seq: string }>(
          'update live_streams set last_seq = last_seq + $2 where shop_id = $1 returning last_seq',
          [shopId, shopRows.length],
        );
        const first = Number(counter.rows[0].last_seq) - shopRows.length + 1;
        const seqs = shopRows.map((_, i) => first + i);
        await client.query(
          `update outbox_events o set live_seq = v.seq, published_at = $3
             from unnest($1::uuid[], $2::bigint[]) as v(id, seq)
            where o.id = v.id`,
          [shopRows.map((r) => r.id), seqs, publishedAt],
        );
        shopRows.forEach((r, i) => {
          out.push(toRow(r, seqs[i], publishedAt));
        });
      }
      return out;
    });
    if (stamped.length > 0) onRows?.(stamped);
    return stamped;
  }

  async function tail(shopId: string, afterSeq: number, limit = 500): Promise<LiveRow[]> {
    const { rows } = await pool.query<StoredRow>(
      `select ${COLUMNS} from outbox_events
        where shop_id = $1 and live_seq > $2
        order by live_seq
        limit $3`,
      [shopId, afterSeq, limit],
    );
    return rows.map((r) => toRow(r));
  }

  function toEnvelope(row: LiveRow): LiveEnvelope | null {
    const entry = liveEntryFor(row.topic, catalogue);
    const parsed = entry
      ? liveEnvelopeSchema.safeParse({
          seq: row.seq,
          name: entry.name,
          entityType: row.entityType,
          entityId: row.entityId,
          entityVersion: row.entityVersion,
          emittedAt: row.createdAt.toISOString(),
          audience: row.audience,
        })
      : null;
    if (parsed?.success) return parsed.data;
    log('[live] outbox row does not make a valid envelope; not sent', {
      id: row.id,
      topic: row.topic,
      seq: row.seq,
      issues: parsed?.error.issues ?? 'unknown topic',
    });
    return null;
  }

  async function prune(windowMs: number): Promise<number> {
    const cutoff = new Date(clock.now().getTime() - windowMs);
    const { rows } = await pool.query<{ deleted: string }>(
      `with gone as (
         delete from outbox_events
          where live_seq is not null and published_at < $1
            and ($2::uuid[] is null or shop_id = any($2::uuid[]))
          returning shop_id, live_seq
       ), highest as (
         select shop_id, max(live_seq) as seq, count(*) as n from gone group by shop_id
       ), raised as (
         update live_streams s set pruned_through = greatest(s.pruned_through, h.seq)
           from highest h where s.shop_id = h.shop_id
       )
       select coalesce(sum(n), 0) as deleted from highest`,
      [cutoff, shopIds ?? null],
    );
    return Number(rows[0].deleted);
  }

  async function streamState(shopId: string): Promise<StreamState> {
    const { rows } = await pool.query<{ last_seq: string; pruned_through: string }>(
      'select last_seq, pruned_through from live_streams where shop_id = $1',
      [shopId],
    );
    const row = rows[0];
    return row ? { lastSeq: Number(row.last_seq), prunedThrough: Number(row.pruned_through) } : { lastSeq: 0, prunedThrough: 0 };
  }

  return { stamp, tail, toEnvelope, prune, streamState };
}
