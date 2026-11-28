import { dirname } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { listSendsSince, lostWorkSince, parseInstant, readSendsAndLostWork } from '../../src/ops/sends-after.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type BackupFolder, backupFolder, migratedSource, runOpsCli, type SourceDatabase } from './ops-test-helpers.js';
const RESTORE_POINT = new Date('2026-05-18T10:00:00Z');
const BEFORE = '2026-05-18 09:00:00+00';
const AFTER = (minutes: number): string => `2026-05-18 ${String(10 + Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+00`;
const SECRETS = ['SECRET-MESSAGE-TEXT', '+919999900001', 'Asha Customer', '482913', 'Sender Person', 'asha@example.invalid'];
describe('parseInstant', () => {
  it('accepts an ISO date or a date-time with a zone', () => {
    expect(parseInstant('2026-05-18', '--since').toISOString()).toBe('2026-05-18T00:00:00.000Z');
    expect(parseInstant('2026-05-18T10:00:00Z', '--since').toISOString()).toBe('2026-05-18T10:00:00.000Z');
    expect(parseInstant('2026-05-18T15:30:00+05:30', '--since').toISOString()).toBe('2026-05-18T10:00:00.000Z');
  });
  it.each(['', 'yesterday', '2026-05-18T10:00:00', '18/05/2026', '2026-13-45', '2026-05-18 10:00:00Z'])('refuses %j', (text) => {
    expect(() => parseInstant(text, '--since')).toThrow('--since must be an ISO time');
  });
});
describeDb('sends after a restore point (S9)', () => {
  let source: SourceDatabase;
  let pool: pg.Pool;
  let folder: BackupFolder;
  beforeAll(async () => {
    source = await migratedSource();
    folder = backupFolder();
    pool = createPool(source.url, 2);
    const shop = (await pool.query<{ id: string }>(`insert into shops (name) values ('Fixture shop') returning id`)).rows[0].id;
    const customer = (
      await pool.query<{ id: string }>(
        `insert into customers (shop_id, code, name, phone, customer_group) values ($1, 'CU-1', 'Asha Customer', '+919999900001', 'Regular') returning id`,
        [shop],
      )
    ).rows[0].id;
    const wish = (code: string, at: string) =>
      pool.query(`insert into wishes (shop_id, code, at, customer_id, kind, sender_name) values ($1, $2, $3, $4, 'birthday', 'Sender Person')`, [
        shop,
        code,
        at,
        customer,
      ]);
    await wish('WS-BEFORE', BEFORE);
    await wish('WS-AFTER', AFTER(5));
    const broadcast = async (code: string, at: string) => {
      const id = (
        await pool.query<{ id: string }>(
          `insert into broadcasts (shop_id, code, at, audience, message, sent_by_name) values ($1, $2, $3, 'VIP Bridal', 'SECRET-MESSAGE-TEXT', 'Sender Person') returning id`,
          [shop, code, at],
        )
      ).rows[0].id;
      await pool.query('insert into broadcast_recipients (shop_id, broadcast_id, customer_id) values ($1, $2, $3)', [shop, id, customer]);
    };
    await broadcast('BC-BEFORE', BEFORE);
    await broadcast('BC-AFTER', AFTER(10));
    const outbox = (topic: string, at: string, published: string | null = null) =>
      pool.query(`insert into outbox_events (shop_id, topic, payload, created_at, published_at) values ($1, $2, $3, $4, $5)`, [
        shop,
        topic,
        JSON.stringify({ phone: '+919999900001', token: '482913', email: 'asha@example.invalid', text: 'SECRET-MESSAGE-TEXT' }),
        at,
        published,
      ]);
    await outbox('notify.karigar_job_overdue_reminder', BEFORE);
    await outbox('notify.karigar_job_overdue_reminder', AFTER(15), AFTER(16));
    await outbox('wishes.run_requested', AFTER(20));
    await outbox('lead.sla_passed', AFTER(25));
    await outbox('ops.backup_failed', AFTER(26));
    const audit = (kind: string, entityType: string, entityId: string, at: string) =>
      pool.query(
        `insert into audit_entries (shop_id, at, actor_name, actor_role, kind, summary, entity_type, entity_id, reason)
         values ($1, $2, 'System (test)', 'system', $3, 'SECRET-MESSAGE-TEXT to Asha Customer', $4, $5, 'asha@example.invalid')`,
        [shop, at, kind, entityType, entityId, ],
      );
    await audit('wishes_sent', 'wish', 'WS-BEFORE', BEFORE);
    await audit('wishes_sent', 'wish', 'WS-AFTER', AFTER(5));
    await audit('broadcast_sent', 'broadcast', 'BC-AFTER', AFTER(10));
    await audit('activation_link_sent', 'user', 'USER-1', AFTER(30));
    await audit('lead_created', 'lead', 'LD-1', AFTER(31));
    await audit('lead_created', 'lead', 'LD-2', AFTER(32));
  }, 120000);
  afterAll(async () => {
    await pool.end();
    folder.cleanup();
    await source.drop();
  });
  const window = { since: RESTORE_POINT };
  it('lists the sends in the window and leaves out what came before and other topics', async () => {
    const list = await listSendsSince(pool, window);
    expect(list.window).toEqual({ since: '2026-05-18T10:00:00.000Z', until: null });
    expect(list.outbox.map((o) => [o.topic, o.publishedAt])).toEqual([
      ['notify.karigar_job_overdue_reminder', '2026-05-18T10:16:00.000Z'],
      ['wishes.run_requested', null],
    ]);
    expect(list.wishes).toEqual([{ code: 'WS-AFTER', kind: 'birthday', at: '2026-05-18T10:05:00.000Z' }]);
    expect(list.broadcasts).toEqual([{ code: 'BC-AFTER', audience: 'VIP Bridal', at: '2026-05-18T10:10:00.000Z', recipients: 1 }]);
    expect(list.audit.map((a) => [a.kind, a.entityType, a.entityId])).toEqual([
      ['wishes_sent', 'wish', 'WS-AFTER'],
      ['broadcast_sent', 'broadcast', 'BC-AFTER'],
      ['activation_link_sent', 'user', 'USER-1'],
    ]);
  });
  it('shows codes and ids only: no payload, token, message, name, phone or email', async () => {
    const { sends, lostWork } = await readSendsAndLostWork(source.url, window);
    const text = JSON.stringify({ sends, lostWork });
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(Object.keys(sends.outbox[0]).sort()).toEqual(['createdAt', 'id', 'publishedAt', 'topic']);
    expect(Object.keys(sends.wishes[0]).sort()).toEqual(['at', 'code', 'kind']);
    expect(Object.keys(sends.broadcasts[0]).sort()).toEqual(['at', 'audience', 'code', 'recipients']);
    expect(Object.keys(sends.audit[0]).sort()).toEqual(['at', 'entityId', 'entityType', 'id', 'kind']);
  });
  it('honours the end of the window', async () => {
    const list = await listSendsSince(pool, { since: RESTORE_POINT, until: new Date('2026-05-18T10:12:00Z') });
    expect(list.window.until).toBe('2026-05-18T10:12:00.000Z');
    expect(list.outbox).toEqual([]);
    expect(list.wishes.map((w) => w.code)).toEqual(['WS-AFTER']);
    expect(list.broadcasts.map((b) => b.code)).toEqual(['BC-AFTER']);
    expect(list.audit.map((a) => a.entityId)).toEqual(['WS-AFTER', 'BC-AFTER']);
  });
  it('counts the audit entries by kind in the window as the lost work', async () => {
    expect(await lostWorkSince(pool, window)).toEqual({
      window: { since: '2026-05-18T10:00:00.000Z', until: null },
      total: 5,
      byKind: { activation_link_sent: 1, broadcast_sent: 1, lead_created: 2, wishes_sent: 1 },
    });
    expect(await lostWorkSince(pool, { since: new Date('2026-05-19T00:00:00Z') })).toMatchObject({ total: 0, byKind: {} });
  });
  describe('restore-sends command', () => {
    const cli = (args: string[]) => runOpsCli(['restore-sends', ...args], { databaseUrl: source.url, backupRoot: dirname(folder.dir) });
    it('prints the list and the lost-work counts, exit 0', async () => {
      const r = await cli(['--since', '2026-05-18T10:00:00Z']);
      expect(r).toMatchObject({ code: 0, stderr: '' });
      for (const code of ['WS-AFTER', 'BC-AFTER', 'wishes.run_requested', 'USER-1']) expect(r.stdout).toContain(code);
      for (const code of ['WS-BEFORE', 'BC-BEFORE', 'lead.sla_passed']) expect(r.stdout).not.toContain(code);
      expect(r.stdout).toMatch(/lead_created\s+2/);
      for (const secret of SECRETS) expect(r.stdout).not.toContain(secret);
    }, 60000);
    it('exits 1 for a missing, malformed or reversed window', async () => {
      expect((await cli([])).stderr).toContain('restore-sends needs --since');
      expect((await cli(['--since', 'yesterday'])).stderr).toContain('--since must be an ISO time');
      expect((await cli(['--since', '2026-05-18T10:00:00Z', '--until', '2026-05-18T09:00:00Z'])).stderr).toContain(
        '--until must not be before --since',
      );
      for (const args of [[], ['--since', 'yesterday']]) expect((await cli(args)).code).toBe(1);
    }, 60000);
  });
});
