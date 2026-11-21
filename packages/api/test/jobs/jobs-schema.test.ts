import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';

/** The EP-10 migration: scheduler tables, job-owned columns, outbox and the System actor. */
describeDb('EP-10 background jobs schema', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  const now = new Date('2026-11-01T10:00:00Z');
  beforeAll(async () => {
    pool = testPool(2);
    shop = await newShop(pool, 'Jobs schema shop');
  });
  afterAll(async () => {
    await pool.end();
  });

  const addPending = (values: { jobName?: string; runKey?: string; status?: string } = {}) =>
    pool.query(
      `insert into pending_jobs (shop_id, job_name, run_key, due_at, status, max_attempts, created_at)
       values ($1, $2, $3, $4, $5, 3, $4)`,
      [shop.shopId, values.jobName ?? 'test-job', values.runKey ?? randomUUID(), now, values.status ?? 'pending'],
    );
  const addAudit = (values: { actorKind: string; actorId: string | null; actorRole: string | null; kind?: string }) =>
    pool.query(
      `insert into audit_entries (shop_id, actor_kind, actor_id, actor_name, actor_role, kind, summary, reference, at)
       values ($1, $2, $3, 'System (SLA breach job)', $4, $5, 'Lead marked late', 'LD-2026-001', $6)`,
      [shop.shopId, values.actorKind, values.actorId, values.actorRole, values.kind ?? 'lead_marked_late', now],
    );
  const addOwner = () => newUser(pool, shop, { name: 'Sanjay Seth', role: 'owner' });

  it('has the new tables and columns, every time a timestamptz', async () => {
    const tz = { type: 'timestamp with time zone' };
    expect(await columnsOf(pool, 'job_runs')).toMatchObject({
      scheduled_at: { ...tz, nullable: false },
      started_at: { ...tz, nullable: false },
      finished_at: { ...tz, nullable: true },
      attempts: { type: 'integer' },
      result: { type: 'text', nullable: true },
      error_text: { type: 'text' },
    });
    expect(await columnsOf(pool, 'pending_jobs')).toMatchObject({
      due_at: tz,
      next_attempt_at: tz,
      locked_until: tz,
      payload: { type: 'jsonb' },
      idempotency_key: { type: 'text' },
    });
    expect(await columnsOf(pool, 'job_definitions')).toMatchObject({ updated_at: tz, schedule: { type: 'text' } });
    expect(await columnsOf(pool, 'job_keys')).toMatchObject({ claimed_at: tz });
    expect(await columnsOf(pool, 'outbox_events')).toMatchObject({ created_at: tz, published_at: tz });
    expect(await columnsOf(pool, 'leads')).toMatchObject({
      sla_breached_at: tz,
      sla_breach_notified: { type: 'boolean', nullable: false },
    });
    expect(await columnsOf(pool, 'karigar_jobs')).toMatchObject({ overdue_since: tz, last_reminder_at: tz });
    expect(await columnsOf(pool, 'piece_edits')).toMatchObject({ expired_at: tz });
    expect(await columnsOf(pool, 'settings')).toMatchObject({ lead_sla_counting: { type: 'text', nullable: false } });
    expect(await columnsOf(pool, 'audit_entries')).toMatchObject({
      actor_kind: { type: 'text', nullable: false },
      actor_id: { nullable: true },
      actor_role: { nullable: true },
      before_value: { type: 'jsonb' },
      after_value: { type: 'jsonb' },
    });
  });

  it('refuses an unknown pending job status', async () => {
    await expectPgError(addPending({ status: 'paused' }), '23514');
  });

  it('keeps one row per (shop, job, run key)', async () => {
    await addPending({ jobName: 'dup-job', runKey: '2026-11-01' });
    await expectPgError(addPending({ jobName: 'dup-job', runKey: '2026-11-01' }), '23505');
  });

  it('claims an idempotency key once per shop', async () => {
    const claim = () =>
      pool.query(`insert into job_keys (shop_id, idempotency_key, job_name, claimed_at) values ($1, $2, 'test-job', $3)`, [
        shop.shopId,
        'LD-2026-001:sla-breach',
        now,
      ]);
    await claim();
    await expectPgError(claim(), '23505');
  });

  it('refuses a system audit entry with a user, and a user entry without one', async () => {
    const owner = await addOwner();
    await expectPgError(addAudit({ actorKind: 'system', actorId: owner, actorRole: null }), '23514');
    await expectPgError(addAudit({ actorKind: 'system', actorId: null, actorRole: 'owner' }), '23514');
    await expectPgError(addAudit({ actorKind: 'user', actorId: null, actorRole: null }), '23514');
    await expectPgError(addAudit({ actorKind: 'robot', actorId: null, actorRole: null }), '23514');
  });

  it('accepts a System entry with no actor id or role, and the new job kinds', async () => {
    for (const kind of ['lead_marked_late', 'job_marked_overdue', 'job_reminder_sent', 'edit_token_expired']) {
      await addAudit({ actorKind: 'system', actorId: null, actorRole: null, kind });
    }
    const owner = await addOwner();
    await addAudit({ actorKind: 'user', actorId: owner, actorRole: 'owner', kind: 'job_run_retried' });
    const rows = (
      await pool.query<{ actor_kind: string; actor_id: string | null; actor_role: string | null }>(
        `select actor_kind, actor_id, actor_role from audit_entries where shop_id = $1 and kind = 'lead_marked_late'`,
        [shop.shopId],
      )
    ).rows;
    expect(rows).toEqual([{ actor_kind: 'system', actor_id: null, actor_role: null }]);
    await expectPgError(addAudit({ actorKind: 'system', actorId: null, actorRole: null, kind: 'job_deleted' }), '23514');
  });

  it('counts the lead SLA in clock hours only until A2 is decided', async () => {
    const settings = await pool.query<{ lead_sla_counting: string }>(
      'select lead_sla_counting from settings where shop_id = $1',
      [shop.shopId],
    );
    expect(settings.rows).toEqual([{ lead_sla_counting: 'clock_hours' }]);
    await expectPgError(
      pool.query(`update settings set lead_sla_counting = 'shop_hours' where shop_id = $1`, [shop.shopId]),
      '23514',
    );
  });
});
