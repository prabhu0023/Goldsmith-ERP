import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import {
  ALERTS_FILE,
  type AlertSink,
  createOperatorNotifier,
  fileSink,
  logSink,
  outboxSink,
} from '../../src/ops/notify-operator.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type BackupFolder, backupFolder, migratedSource, type SourceDatabase } from './ops-test-helpers.js';
const at = (iso: string) => new Date(iso);
const alert = (iso: string, error = 'pg_dump failed (exit 1): server closed the connection') => ({
  environment: 'development',
  kind: 'daily full',
  at: at(iso),
  error,
});
describe('createOperatorNotifier', () => {
  const folders: BackupFolder[] = [];
  afterAll(() => {
    for (const f of folders) f.cleanup();
  });
  const make = (groupMinutes = 60, extra: AlertSink[] = []) => {
    const folder = backupFolder();
    folders.push(folder);
    const lines: string[] = [];
    const notifier = createOperatorNotifier({
      sinks: [logSink((l) => lines.push(l)), fileSink(folder.store), ...extra],
      store: folder.store,
      groupMinutes,
      warn: (l) => lines.push(l),
    });
    return { folder, lines, notifier };
  };
  it('logs, appends alerts.jsonl with environment, kind, time and error', async () => {
    const { folder, lines, notifier } = make();
    expect(await notifier.notify(alert('2026-05-18T01:00:00Z'))).toEqual({ sent: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[development] daily full');
    const file = readFileSync(folder.store.locate(ALERTS_FILE), 'utf8').trim().split('\n');
    expect(file).toHaveLength(1);
    expect(JSON.parse(file[0])).toEqual({
      at: '2026-05-18T01:00:00.000Z',
      environment: 'development',
      kind: 'daily full',
      error: 'pg_dump failed (exit 1): server closed the connection',
    });
  });
  it('alerts the same kind and error once inside the window, again after it or for another error', async () => {
    const { folder, notifier } = make(60);
    const results = [
      await notifier.notify(alert('2026-05-18T01:00:00Z')),
      await notifier.notify(alert('2026-05-18T01:30:00Z')),
      await notifier.notify(alert('2026-05-18T01:45:00Z', 'a different error')),
      await notifier.notify(alert('2026-05-18T02:10:01Z')),
    ];
    expect(results.map((r) => r.sent)).toEqual([true, false, true, true]);
    expect(readFileSync(folder.store.locate(ALERTS_FILE), 'utf8').trim().split('\n')).toHaveLength(3);
  });
  it('does not group when the window is 0', async () => {
    const { notifier } = make(0);
    await notifier.notify(alert('2026-05-18T01:00:00Z'));
    expect((await notifier.notify(alert('2026-05-18T01:00:01Z'))).sent).toBe(true);
  });
  it('redacts URLs and secrets before any sink sees them', async () => {
    const { folder, lines, notifier } = make();
    await notifier.notify(alert('2026-05-18T01:00:00Z', 'cannot reach postgres://postgres:hunter2@db.internal:5432/x; password=hunter2'));
    const text = lines.join('\n') + readFileSync(folder.store.locate(ALERTS_FILE), 'utf8');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('postgres://');
  });
  it('keeps going when one sink fails', async () => {
    const broken: AlertSink = {
      name: 'broken',
      async deliver() {
        throw new Error('sink down');
      },
    };
    const { folder, lines, notifier } = make(60, [broken]);
    expect((await notifier.notify(alert('2026-05-18T01:00:00Z'))).sent).toBe(true);
    expect(lines.some((l) => l.includes('Alert sink broken failed: sink down'))).toBe(true);
    expect(readFileSync(folder.store.locate(ALERTS_FILE), 'utf8')).toContain('daily full');
  });
});
describeDb('outboxSink', () => {
  let db: SourceDatabase;
  beforeAll(async () => {
    db = await migratedSource();
  }, 60000);
  afterAll(async () => {
    await db.drop();
  });
  it('does nothing in a database with no shop', async () => {
    await expect(outboxSink(db.url).deliver(alert('2026-05-18T01:00:00Z'))).resolves.toBeUndefined();
  });
  it('writes one ops.backup_failed row with environment, kind, time and error, and no URL or key', async () => {
    const pool = createPool(db.url, 1);
    try {
      await pool.query(`insert into shops (name) values ('Test shop')`);
      await outboxSink(db.url).deliver(alert('2026-05-18T01:00:00Z', 'pg_dump failed (exit 1): server closed the connection'));
      const rows = await pool.query<{ topic: string; payload: Record<string, string>; published_at: Date | null; created_at: Date }>(
        `select topic, payload, published_at, created_at from outbox_events`,
      );
      expect(rows.rows).toHaveLength(1);
      const row = rows.rows[0];
      expect(row.topic).toBe('ops.backup_failed');
      expect(row.published_at).toBeNull();
      expect(row.payload).toEqual({
        at: '2026-05-18T01:00:00.000Z',
        environment: 'development',
        kind: 'daily full',
        error: 'pg_dump failed (exit 1): server closed the connection',
      });
      expect(JSON.stringify(row.payload)).not.toMatch(/postgres:\/\/|password|BACKUP_ENCRYPTION_KEY|[0-9a-f]{64}/);
    } finally {
      await pool.end();
    }
  });
  it('the notifier survives an unreachable database', async () => {
    const folder = backupFolder();
    try {
      const warnings: string[] = [];
      const notifier = createOperatorNotifier({
        sinks: [fileSink(folder.store), outboxSink('postgres://postgres:postgres@127.0.0.1:1/none')],
        store: folder.store,
        groupMinutes: 60,
        warn: (l) => warnings.push(l),
      });
      expect((await notifier.notify(alert('2026-05-18T01:00:00Z'))).sent).toBe(true);
      expect(warnings.join('\n')).toContain('Alert sink outbox failed');
      expect(readFileSync(folder.store.locate(ALERTS_FILE), 'utf8')).toContain('daily full');
    } finally {
      folder.cleanup();
    }
  }, 30000);
});
