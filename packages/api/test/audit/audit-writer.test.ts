/**
 * The one audit writer (EP-06-S3 to S6): what it stores, what it strips and what it refuses
 * before inserting anything.
 */
import type { AuditAction } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AuditWrite,
  appendAudit,
  changedFields,
  closeAuditScope,
  openAuditScope,
  SYSTEM_ACTORS,
} from '../../src/audit/audit-writer.js';
import { withTransaction } from '../../src/db/transaction.js';
import { writeJobAudit } from '../../src/jobs/job-audit.js';
import { describeDb, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';

interface Row {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  reference: string | null;
  token_reference: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}

describeDb('audit writer (EP-06-S3 to S6)', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  let owner: { kind: 'user'; id: string; name: string; role: 'owner' };

  beforeAll(async () => {
    pool = testPool();
    shop = await newShop(pool);
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (shop_id, name, phone, email, role) values ($1, 'Sanjay Seth', '+91 90000 00009', 'owner@example.com', 'owner')
       returning id`,
      [shop.shopId],
    );
    owner = { kind: 'user', id: rows[0].id, name: 'Sanjay Seth', role: 'owner' };
  });

  afterAll(async () => {
    await pool.end();
  });

  const entry = (values: Partial<AuditWrite> = {}): AuditWrite => ({
    shopId: shop.shopId,
    at: new Date('2026-11-22T09:02:00.000Z'),
    actor: owner,
    kind: 'user_added',
    entityId: 'ST-07',
    summary: 'Deepak Rao added as staff',
    ...values,
  });

  /** Append in a transaction and read the stored row back. */
  const write = async (values: Partial<AuditWrite> = {}): Promise<Row> => {
    const { id } = await withTransaction(pool, (client) => appendAudit(client, entry(values)));
    return (await pool.query<Row>('select * from audit_entries where id = $1', [id])).rows[0];
  };

  const count = async (): Promise<number> =>
    Number((await pool.query('select count(*) from audit_entries where shop_id = $1', [shop.shopId])).rows[0].count);

  /** The write is refused with `message` and nothing is inserted. */
  const expectRefused = async (values: Partial<AuditWrite>, message: string | RegExp): Promise<void> => {
    const before = await count();
    await expect(withTransaction(pool, (client) => appendAudit(client, entry(values)))).rejects.toThrow(message);
    expect(await count()).toBe(before);
  };

  it('EP-06-S3 AC2: a create stores no before and the after with the phone masked', async () => {
    const { before, after } = changedFields(null, { name: 'Deepak Rao', phone: '+91 98410 71145', role: 'staff' });
    const row = await write({ before, after });
    expect(row.before_value).toBeNull();
    expect(row.after_value).toEqual({ name: 'Deepak Rao', phone: '+91 ••••• 71145', role: 'staff' });
  });

  it('EP-06-S3 AC4: code, token, password, link, secret and tokenHash keys never reach the entry', async () => {
    const row = await write({
      before: { name: 'Old', tokenHash: 'abc123', nested: { resetLink: 'https://x.test/r/abc' } },
      after: { name: 'New', code: '482913', token: 'tok', password: 'counter-2026', link: 'https://x', secret: 's' },
    });
    expect(row.before_value).toEqual({ name: 'Old', nested: {} });
    expect(row.after_value).toEqual({ name: 'New' });
  });

  it('EP-06-S3 AC5: money keys never reach the entry', async () => {
    const row = await write({
      kind: 'tag_saved',
      entityId: 'TAG-8841',
      after: { grossG: 486500, rateINR: 7200, priceINR: 350000, makingAmount: 1200, price: 10 },
    });
    expect(row.after_value).toEqual({ grossG: 486500 });
  });

  it('EP-06-S4 AC3: takes the token reference, and refuses a 6-digit token', async () => {
    const row = await write({ kind: 'edit_token_expired', entityId: 'ED-2026-014', tokenReference: 'tok-ED-2026-014' });
    expect(row.token_reference).toBe('tok-ED-2026-014');
    await expectRefused(
      { kind: 'edit_token_expired', entityId: 'ED-2026-014', tokenReference: '482913' },
      'An audit entry takes the token reference, never the token',
    );
  });

  it('EP-06-S4 AC4: an entry with no token has no token reference', async () => {
    expect((await write()).token_reference).toBeNull();
  });

  it('EP-06-S5 AC1, AC3: weights are stored as integer units of 0.0001 g', async () => {
    const row = await write({
      kind: 'loss_accepted',
      entityId: 'BT-2026-031',
      before: { grossG: 486500 },
      after: { grossG: 486100, lossG: 350 },
    });
    expect(row.entity_type).toBe('parcel');
    expect(row.before_value).toEqual({ grossG: 486500 });
    expect(row.after_value).toEqual({ grossG: 486100, lossG: 350 });
    expect(Number.isSafeInteger(row.after_value?.lossG)).toBe(true);
  });

  it('EP-06-S5 AC4: a weight in decimal grams is refused and nothing is inserted', async () => {
    await expectRefused(
      { kind: 'tag_saved', entityId: 'TAG-8841', before: { grossG: 486500 }, after: { grossG: 48.61 } },
      'Weight grossG must be integer units of 0.0001 g',
    );
  });

  it('EP-06-S6 AC1: a job entry names the System actor with no user', async () => {
    await withTransaction(pool, (client) =>
      writeJobAudit(client, shop, 'SLA breach job', {
        kind: 'lead_marked_late',
        at: new Date('2026-11-22T09:02:00.000Z'),
        summary: 'Lead LD-2026-213 marked late',
        reference: 'LD-2026-213',
        before: { slaBreachedAt: null },
        after: { slaBreachedAt: '2026-11-22T09:00:00.000Z' },
      }),
    );
    const { rows } = await pool.query<Row>(
      `select * from audit_entries where shop_id = $1 and kind = 'lead_marked_late'`,
      [shop.shopId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_id: null,
      actor_role: 'system',
      actor_name: 'System (SLA breach job)',
      entity_type: 'lead',
      entity_id: 'LD-2026-213',
      reference: 'LD-2026-213',
    });
  });

  it('EP-06-S6 AC2: an integration acts as a named System actor', async () => {
    const row = await write({
      actor: { kind: 'system', name: SYSTEM_ACTORS.whatsappIntake },
      kind: 'lead_created',
      entityId: 'LD-2026-214',
    });
    expect(row).toMatchObject({ actor_id: null, actor_name: 'WhatsApp intake', actor_role: 'system', entity_type: 'lead' });
    expect(SYSTEM_ACTORS.scheduler).toBe('Scheduler');
  });

  it('refuses an unknown kind or a missing entity before the insert', async () => {
    await expectRefused({ kind: 'piece_deleted' as AuditAction }, 'Unknown audit kind: "piece_deleted"');
    await expectRefused({ entityId: ' ' }, 'An audit entry of kind user_added must name its entity');
  });

  it('stores the reason with contacts masked, and a correction refers to the earlier entry', async () => {
    const first = await write({ kind: 'lead_lost', entityId: 'LD-2026-213', ref: 'LD-2026-213', reason: 'Call 98410 44444' });
    expect(first).toMatchObject({ entity_type: 'lead', reference: 'LD-2026-213', reason: 'Call +91 ••••• 44444' });
    const correction = await write({ kind: 'lead_lost', entityId: 'LD-2026-213', ref: 'LD-2026-213', corrects: first.id });
    expect(correction.reference).toBe(first.id);
  });

  it('records the entries a client wrote while its audit scope is open', async () => {
    const written = await withTransaction(pool, async (client) => {
      await appendAudit(client, entry());
      openAuditScope(client);
      await appendAudit(client, entry({ kind: 'lead_lost', entityId: 'LD-2026-215' }));
      return closeAuditScope(client);
    });
    expect(written.map((w) => [w.kind, w.entityType, w.entityId])).toEqual([['lead_lost', 'lead', 'LD-2026-215']]);
  });
});

describe('changedFields (EP-06-S3 AC1, AC3)', () => {
  it('keeps only the fields that changed', () => {
    expect(
      changedFields({ state: 'opened', note: null, customer: 'Ravi' }, { state: 'lost', note: 'Gone', customer: 'Ravi' }),
    ).toEqual({ before: { state: 'opened', note: null }, after: { state: 'lost', note: 'Gone' } });
  });

  it('a create has no before and keeps every field', () => {
    expect(changedFields(null, { name: 'Deepak Rao' })).toEqual({ before: null, after: { name: 'Deepak Rao' } });
  });

  it('EP-06-S3 AC3: a list or object field is compared deeply and kept whole', () => {
    const was = { notifyChannels: { whatsapp: true, app: true, email: false }, leadSlaHours: 4 };
    const now = { notifyChannels: { whatsapp: true, app: true, email: true }, leadSlaHours: 4 };
    expect(changedFields(was, now)).toEqual({
      before: { notifyChannels: { whatsapp: true, app: true, email: false } },
      after: { notifyChannels: { whatsapp: true, app: true, email: true } },
    });
    expect(changedFields(was, structuredClone(was))).toEqual({ before: {}, after: {} });
    expect(changedFields({ tags: ['a', 'b'] }, { tags: ['a', 'c'] })).toEqual({
      before: { tags: ['a', 'b'] },
      after: { tags: ['a', 'c'] },
    });
  });

  it('a field missing on one side is null there', () => {
    expect(changedFields({ note: 'x' }, {})).toEqual({ before: { note: 'x' }, after: { note: null } });
  });
});
