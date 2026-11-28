/**
 * Telling the operator that a backup failed or is missing (EP-38-S5). One small interface,
 * `OperatorNotifier`, with three sinks today: a line on stderr, an `alerts.jsonl` line in the
 * lane's backup folder (always works, even when the database is down), and an outbox_events row
 * with topic `ops.backup_failed` that the notifications engine (EP-11) will deliver later.
 * Nothing is sent to a person from here. The text is redacted: no URL, key or personal data.
 * The same kind and error inside the grouping window is alerted once.
 */
import { createPool } from '../db/connection.js';
import { loadShopContext } from '../db/shop-context.js';
import { emitOutboxEvent } from '../jobs/outbox.js';
import { redactErrorText } from '../jobs/redact-error-text.js';
import type { BackupStore } from './backup-store.js';
export const ALERTS_FILE = 'alerts.jsonl';
export interface OperatorAlert {
  environment: string;
  /** What failed: `daily full` or `file storage`. */
  kind: string;
  at: Date;
  error: string;
}
export interface AlertResult {
  /** False when the alert repeated one already sent inside the grouping window. */
  sent: boolean;
}
export interface OperatorNotifier {
  notify(alert: OperatorAlert): Promise<AlertResult>;
}
export interface AlertSink {
  readonly name: string;
  deliver(alert: OperatorAlert): Promise<void>;
}
interface AlertLine {
  at: string;
  environment: string;
  kind: string;
  error: string;
}
const lineOf = (alert: OperatorAlert): AlertLine => ({
  at: alert.at.toISOString(),
  environment: alert.environment,
  kind: alert.kind,
  error: alert.error,
});
export function logSink(write: (line: string) => void = (l) => console.error(l)): AlertSink {
  return {
    name: 'log',
    async deliver(a) {
      write(`ALERT [${a.environment}] ${a.kind} backup problem at ${a.at.toISOString()}: ${a.error}`);
    },
  };
}
export function fileSink(store: BackupStore): AlertSink {
  return {
    name: 'alerts.jsonl',
    async deliver(a) {
      await store.appendLine(ALERTS_FILE, JSON.stringify(lineOf(a)));
    },
  };
}
/** The outbox row of the (single) shop of `databaseUrl`; skipped when the database has no shop yet. */
export function outboxSink(databaseUrl: string): AlertSink {
  return {
    name: 'outbox',
    async deliver(a) {
      const pool = createPool(databaseUrl, 1);
      try {
        const shop = await pool.query<{ id: string }>('select id from shops order by created_at, id limit 1');
        if (shop.rows.length === 0) return;
        const ctx = await loadShopContext(pool, shop.rows[0].id);
        const client = await pool.connect();
        try {
          await emitOutboxEvent(client, ctx, 'ops.backup_failed', lineOf(a) as unknown as Record<string, unknown>, a.at);
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    },
  };
}
export interface NotifierOptions {
  sinks: AlertSink[];
  store: BackupStore;
  groupMinutes: number;
  /** Where a sink's own failure is reported; it never stops the other sinks. */
  warn?: (line: string) => void;
}
export function createOperatorNotifier(options: NotifierOptions): OperatorNotifier {
  const warn = options.warn ?? ((l: string) => console.error(l));
  return {
    async notify(raw) {
      const alert: OperatorAlert = { ...raw, error: redactErrorText(raw.error) };
      if (await repeatsRecent(options.store, alert, options.groupMinutes)) return { sent: false };
      for (const sink of options.sinks) {
        try {
          await sink.deliver(alert);
        } catch (e) {
          warn(`Alert sink ${sink.name} failed: ${redactErrorText(e)}`);
        }
      }
      return { sent: true };
    },
  };
}
async function repeatsRecent(store: BackupStore, alert: OperatorAlert, minutes: number): Promise<boolean> {
  if (minutes <= 0) return false;
  const text = (await store.readText(ALERTS_FILE)) ?? '';
  const since = alert.at.getTime() - minutes * 60_000;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const prev = JSON.parse(line) as AlertLine;
      const at = Date.parse(prev.at);
      if (
        prev.kind === alert.kind &&
        prev.environment === alert.environment &&
        prev.error === alert.error &&
        at >= since &&
        at <= alert.at.getTime()
      ) {
        return true;
      }
    } catch {
      // a torn line is ignored
    }
  }
  return false;
}
