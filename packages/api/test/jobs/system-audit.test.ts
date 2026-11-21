import { MIN } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import { editTokenExpiryJob } from '../../src/jobs/handlers/edit-token-expiry.js';
import { karigarOverdueJob } from '../../src/jobs/handlers/karigar-overdue.js';
import { leadSlaBreachJob, leadSlaTimersJob } from '../../src/jobs/handlers/lead-sla.js';
import { writeJobAudit, writeUserAudit } from '../../src/jobs/job-audit.js';
import { scheduleJob } from '../../src/jobs/job-store.js';
import { describeDb, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';
import {
  addKarigarJob,
  addLead,
  addPieceEdit,
  makeScheduler,
  manualClock,
  newJobsShop,
  runsOf,
  testJob,
} from './job-test-helpers.js';

interface AuditRow {
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  kind: string;
  summary: string;
  detail: string | null;
  reference: string | null;
  before_value: unknown;
  after_value: unknown;
}

/** EP-10-S12: job-made changes are audited with a System actor, in the job's transaction. */
describeDb('System actor audit (EP-10-S12)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool(4);
  });
  afterAll(async () => {
    await pool.end();
  });

  const auditOf = async (shop: TestShop, where = 'true'): Promise<AuditRow[]> =>
    (
      await pool.query<AuditRow>(
        `select actor_id, actor_name, actor_role, kind, summary, detail, reference, before_value, after_value
           from audit_entries where shop_id = $1 and ${where} order by at, id`,
        [shop.shopId],
      )
    ).rows;

  it('S12 AC1: marking a lead late is audited as System (SLA breach job) with before and after', async () => {
    const shop = await newJobsShop(pool);
    await addLead(pool, shop, { code: 'LD-2026-931', arrivedAt: '2026-11-01T09:00:00Z' });
    const clock = manualClock('2026-11-01T09:00:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [leadSlaTimersJob, leadSlaBreachJob]);
    await scheduler.tick();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    expect(await auditOf(shop)).toEqual([
      expect.objectContaining({
        actor_id: null,
        actor_role: 'system',
        actor_name: 'System (SLA breach job)',
        kind: 'lead_marked_late',
        reference: 'LD-2026-931',
        before_value: { slaBreachedAt: null },
        after_value: { slaBreachedAt: '2026-11-01T17:00:00.000Z' },
      }),
    ]);
  });

  it('S12 AC2: marking MO-2026-118 overdue is audited as System (overdue job)', async () => {
    const shop = await newJobsShop(pool);
    await addKarigarJob(pool, shop, { code: 'MO-2026-118', dueDate: '2026-11-01T12:00:00+05:30' });
    await makeScheduler(pool, manualClock('2026-11-01T18:35:00Z'), shop, [karigarOverdueJob]).tick();
    expect(await auditOf(shop)).toEqual([
      expect.objectContaining({
        actor_role: 'system',
        actor_id: null,
        actor_name: 'System (overdue job)',
        kind: 'job_marked_overdue',
        reference: 'MO-2026-118',
        before_value: { overdueSince: null, lastReminderAt: null },
        after_value: { overdueSince: '2026-11-01T18:30:00.000Z', lastReminderAt: '2026-11-01T18:35:00.000Z' },
      }),
    ]);
  });

  it('S12 AC3: an expired token is audited with its reference, never its value', async () => {
    const shop = await newJobsShop(pool);
    const now = Date.parse('2026-11-01T10:00:00Z');
    await addPieceEdit(pool, shop, { code: 'ED-101', tokenRef: 'tokref-7f3a', tokenIssuedAt: new Date(now - 11 * MIN) });
    await makeScheduler(pool, manualClock(new Date(now)), shop, [editTokenExpiryJob]).tick();
    const rows = await auditOf(shop);
    expect(rows).toEqual([
      expect.objectContaining({
        actor_role: 'system',
        actor_name: 'System (token sweep)',
        kind: 'edit_token_expired',
        reference: 'ED-101',
        detail: 'token ref tokref-7f3a',
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/\b\d{3} ?\d{3}\b/);
  });

  it("S12 AC4: a job's rolled-back attempt leaves no audit entry", async () => {
    const shop = await newJobsShop(pool);
    const clock = manualClock('2026-11-01T10:00:00Z');
    const job = testJob(
      'audit-then-fail',
      async (tx, ctx) => {
        await writeJobAudit(tx.client, ctx.shop, 'audit-then-fail job', {
          kind: 'lead_marked_late',
          at: ctx.now,
          summary: 'Lead LD-2026-932 marked late',
          reference: 'LD-2026-932',
        });
        throw new Error('failed after writing the audit entry');
      },
      { maxAttempts: 1 },
    );
    await scheduleJob(pool, shop, { jobName: job.name, runKey: 'r-1', dueAt: clock.now(), maxAttempts: 1, now: clock.now() });
    await makeScheduler(pool, clock, shop, [job]).tick();
    expect(await runsOf(pool, shop)).toEqual([expect.objectContaining({ result: 'failed' })]);
    expect(await auditOf(shop)).toEqual([]);
  });

  it('S12 AC5: filtering by the System actor shows only job-made entries', async () => {
    const shop = await newJobsShop(pool);
    const ownerId = await newUser(pool, shop, { name: 'Sanjay Seth', role: 'owner' });
    await withTransaction(pool, (client) =>
      writeUserAudit(
        client,
        shop,
        { id: ownerId, name: 'Sanjay Seth', role: 'owner' },
        { kind: 'job_run_retried', at: new Date('2026-11-01T08:00:00Z'), summary: 'Retried run RUN-2026-00001' },
      ),
    );
    await addLead(pool, shop, { code: 'LD-2026-933', arrivedAt: '2026-11-01T09:00:00Z' });
    await addKarigarJob(pool, shop, { code: 'MO-2026-118', dueDate: '2026-11-01T12:00:00+05:30' });
    const clock = manualClock('2026-11-01T09:00:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [leadSlaTimersJob, leadSlaBreachJob, karigarOverdueJob]);
    await scheduler.tick();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    clock.set('2026-11-01T18:35:00Z');
    await scheduler.tick();
    expect(await auditOf(shop)).toHaveLength(3);
    const system = await auditOf(shop, `actor_role = 'system'`);
    expect(system.map((r) => [r.actor_name, r.kind])).toEqual([
      ['System (SLA breach job)', 'lead_marked_late'],
      ['System (overdue job)', 'job_marked_overdue'],
    ]);
  });
});
