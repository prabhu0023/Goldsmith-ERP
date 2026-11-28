/**
 * What was sent after a restore point (EP-38-S9). After a restore the shop must not resend
 * what already went out, and staff must redo the work that was lost. `listSendsSince` reads the
 * live database (read-only) for a time window: outbox events of the `notify.*` and `wishes.*`
 * topics, wishes, broadcasts, and the audit entries of the kinds `wishes_sent`, `broadcast_sent`
 * and `activation_link_sent`. `lostWorkSince` counts audit entries by kind in the same window.
 * Every query selects codes, ids, kinds and times only: never an outbox payload, a message text,
 * a name, a phone number or a token. What the provider did with a message (message id, template,
 * delivery status) needs the notification stories (EP-11, EP-12) and is not listed.
 */
import type pg from 'pg';
import { createPool } from '../db/connection.js';
export const SEND_AUDIT_KINDS = ['wishes_sent', 'broadcast_sent', 'activation_link_sent'] as const;
export interface SendWindow {
  since: Date;
  /** Inclusive end of the window; open-ended when undefined. */
  until?: Date;
}
export interface OutboxSend {
  id: string;
  topic: string;
  createdAt: string;
  publishedAt: string | null;
}
export interface WishSend {
  code: string;
  kind: string;
  at: string;
}
export interface BroadcastSend {
  code: string;
  audience: string;
  at: string;
  recipients: number;
}
export interface AuditSend {
  id: string;
  kind: string;
  at: string;
  entityType: string | null;
  entityId: string | null;
}
export interface SendsList {
  window: { since: string; until: string | null };
  outbox: OutboxSend[];
  wishes: WishSend[];
  broadcasts: BroadcastSend[];
  audit: AuditSend[];
}
export interface LostWork {
  window: { since: string; until: string | null };
  total: number;
  byKind: Record<string, number>;
}
const iso = (d: Date): string => d.toISOString();
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
/** An ISO date (UTC midnight) or date-time with an explicit zone; anything else is refused. */
export function parseInstant(text: string, flag: string): Date {
  const date = ISO_INSTANT.test(text) ? new Date(text) : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${flag} must be an ISO time with a zone, e.g. 2026-05-18T09:30:00Z or 2026-05-18`);
  }
  return date;
}
type Queryable = pg.Pool | pg.PoolClient;
export async function listSendsSince(db: Queryable, window: SendWindow): Promise<SendsList> {
  const range = [window.since, window.until ?? null];
  const outbox = await db.query<{ id: string; topic: string; created_at: Date; published_at: Date | null }>(
    `select id, topic, created_at, published_at from outbox_events
      where (topic like 'notify.%' or topic like 'wishes.%')
        and created_at >= $1 and ($2::timestamptz is null or created_at <= $2)
      order by created_at, id`,
    range,
  );
  const wishes = await db.query<{ code: string; kind: string; at: Date }>(
    `select code, kind, at from wishes
      where at >= $1 and ($2::timestamptz is null or at <= $2) order by at, code`,
    range,
  );
  const broadcasts = await db.query<{ code: string; audience: string; at: Date; recipients: number }>(
    `select b.code, b.audience, b.at,
            (select count(*) from broadcast_recipients r where r.broadcast_id = b.id) as recipients
       from broadcasts b
      where b.at >= $1 and ($2::timestamptz is null or b.at <= $2) order by b.at, b.code`,
    range,
  );
  const audit = await db.query<{ id: string; kind: string; at: Date; entity_type: string | null; entity_id: string | null }>(
    `select id, kind, at, entity_type, entity_id from audit_entries
      where kind = any($3) and at >= $1 and ($2::timestamptz is null or at <= $2) order by at, id`,
    [...range, [...SEND_AUDIT_KINDS]],
  );
  return {
    window: { since: iso(window.since), until: window.until ? iso(window.until) : null },
    outbox: outbox.rows.map((r) => ({
      id: r.id,
      topic: r.topic,
      createdAt: iso(r.created_at),
      publishedAt: r.published_at ? iso(r.published_at) : null,
    })),
    wishes: wishes.rows.map((r) => ({ code: r.code, kind: r.kind, at: iso(r.at) })),
    broadcasts: broadcasts.rows.map((r) => ({
      code: r.code,
      audience: r.audience,
      at: iso(r.at),
      recipients: r.recipients,
    })),
    audit: audit.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      at: iso(r.at),
      entityType: r.entity_type,
      entityId: r.entity_id,
    })),
  };
}
/** Counts of audit entries by kind in the window: the work done since the restore point. */
export async function lostWorkSince(db: Queryable, window: SendWindow): Promise<LostWork> {
  const res = await db.query<{ kind: string; n: number }>(
    `select kind, count(*) as n from audit_entries
      where at >= $1 and ($2::timestamptz is null or at <= $2) group by kind order by kind`,
    [window.since, window.until ?? null],
  );
  const byKind: Record<string, number> = {};
  for (const r of res.rows) byKind[r.kind] = r.n;
  return {
    window: { since: iso(window.since), until: window.until ? iso(window.until) : null },
    total: res.rows.reduce((sum, r) => sum + r.n, 0),
    byKind,
  };
}
/** Both lists from one read-only transaction on the database `url`. */
export async function readSendsAndLostWork(
  url: string,
  window: SendWindow,
): Promise<{ sends: SendsList; lostWork: LostWork }> {
  const pool = createPool(url, 1);
  try {
    const client = await pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      return { sends: await listSendsSince(client, window), lostWork: await lostWorkSince(client, window) };
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
}
