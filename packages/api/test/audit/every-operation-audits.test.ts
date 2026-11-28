/**
 * The CI guard (EP-06-S2 AC4, S7 AC6): every state-changing operation in OPERATION_AUDIT_KINDS
 * and AUTH_OPERATION_AUDIT_KINDS has a case here that runs it through the production app and
 * checks it wrote at least one audit entry, all of declared kinds. A new state-changing operation
 * fails typecheck (AUDIT_CASES is typed over both maps) and "<op> has no audit case" below.
 * Every production job (and the file-retention job the api adds when storage is on, EP-09) is
 * audited or exempt with a reason.
 */
import { AUTH_OPERATION_AUDIT_KINDS, MIN, OPERATION_AUDIT_KINDS, type StateChangingOperation } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { fileRetentionJob } from '../../src/files/file-retention.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { editTokenExpiryJob } from '../../src/jobs/handlers/edit-token-expiry.js';
import { karigarOverdueJob } from '../../src/jobs/handlers/karigar-overdue.js';
import { leadSlaBreachJob, leadSlaTimersJob } from '../../src/jobs/handlers/lead-sla.js';
import { productionJobs } from '../../src/jobs/production-jobs.js';
import { addCustomer } from '../customers/customer-test-helpers.js';
import { addKarigar, addPiece, addStoredFile, describeDb, newShop, testPool } from '../db/db-test-helpers.js';
import {
  addKarigarJob,
  addLead,
  addPieceEdit,
  makeScheduler,
  manualClock,
  newJobsShop,
} from '../jobs/job-test-helpers.js';
import { newSession, newUser, newUserWithPassword } from '../support/api-harness.js';
import { activationToken, PASSWORD, startUsersHarness, type UsersHarness, userRow } from '../users/user-test-helpers.js';

type Kinds = Readonly<Record<string, readonly string[] | null>>;

interface Ctx extends UsersHarness {
  /** Extra shops whose entries the case's call writes (createFirstOwner). */
  shops: string[];
  /** The installation shop sign-in operations act on; the harness shop unless a case moves it. */
  installation: { shopId: string };
}

type Answer = { status: number; body: Record<string, unknown> };
/** Prepare what the call needs, then return the call itself (only the call is measured). */
type AuditCase = (h: Ctx) => Promise<() => Promise<Answer>>;

let phoneSeq = 0;
/** A distinct mobile number per call. */
const phone = () => `+91 97${String(31_000_000 + ++phoneSeq).padStart(8, '0')}`;

const userWith = async (h: Ctx, options: Parameters<typeof newUser>[2]) => {
  const id = await newUser(h.pool, h.shop, options);
  return { id, version: (await userRow(h, id)).version };
};

/** A stored file the owner uploaded (so the owner may read it before it is attached). */
const ownersFile = async (h: Ctx, code: string) => {
  const id = await addStoredFile(h.pool, h.shop, code);
  await h.pool.query('update stored_files set uploaded_by = $2 where id = $1', [id, h.ownerId]);
};

const AUDIT_CASES: Record<StateChangingOperation, AuditCase> = {
  async markLeadLost(h) {
    await addLead(h.pool, h.shop, { code: 'LD-2026-601', state: 'opened', arrivedAt: '2026-11-21T09:00:00Z' });
    return () => h.call('markLeadLost', { leadId: 'LD-2026-601', reason: 'Went elsewhere.' }, { session: h.session });
  },
  async retryJobRun(h) {
    await h.pool.query(
      `insert into job_runs (shop_id, code, job_name, scheduled_at, started_at, finished_at, attempts, result, error_text)
       values ($1, 'RUN-2026-00601', 'lead-sla-timers', $2, $2, $2, 3, 'failed', 'Boom')`,
      [h.shop.shopId, new Date('2026-11-21T09:00:00Z')],
    );
    return () => h.asOwner('retryJobRun', { runId: 'RUN-2026-00601' });
  },
  async createUser(h) {
    return () => h.asOwner('createUser', { name: 'Kavya Nair', phone: phone(), email: 'kavya@example.com', role: 'staff' });
  },
  async resendActivation(h) {
    const { id } = await userWith(h, { name: 'Arjun Rao', status: 'pending_activation' });
    return () => h.asOwner('resendActivation', { userId: id });
  },
  async updateUserProfile(h) {
    const { id, version } = await userWith(h, { name: 'Ravi Kumar' });
    return () =>
      h.asOwner('updateUserProfile', { userId: id, version, name: 'Ravi K', phone: phone(), email: 'ravi.k@example.com' });
  },
  async updateUserRole(h) {
    const { id, version } = await userWith(h, { name: 'Suresh Pillai' });
    await addKarigar(h.pool, h.shop, 'KG-61');
    return () => h.asOwner('updateUserRole', { userId: id, version, role: 'karigar', karigarId: 'KG-61' });
  },
  async deactivateUser(h) {
    const { id, version } = await userWith(h, { name: 'Deepa Menon' });
    return () => h.asOwner('deactivateUser', { userId: id, version, reason: 'Left the shop' });
  },
  async reactivateUser(h) {
    const { id, version } = await userWith(h, { name: 'Anil Shah', status: 'deactivated' });
    return () => h.asOwner('reactivateUser', { userId: id, version });
  },
  async unlockUser(h) {
    const { id } = await userWith(h, { name: 'Neha Gupta' });
    return () => h.asOwner('unlockUser', { userId: id });
  },
  async linkKarigar(h) {
    const { id, version } = await userWith(h, { name: 'Gopal Das', role: 'karigar' });
    await addKarigar(h.pool, h.shop, 'KG-62');
    return () => h.asOwner('linkKarigar', { userId: id, version, karigarId: 'KG-62' });
  },
  async createCustomer(h) {
    return () => h.call('createCustomer', { name: 'Meera Iyer', phone: phone(), group: 'VIP Bridal' }, { session: h.session });
  },
  async updateCustomer(h) {
    const { code } = await addCustomer(h, { name: 'Priya Malhotra', phone: '+919800000701', city: 'Chennai' });
    return () =>
      h.call(
        'updateCustomer',
        { customerId: code, version: 1, name: 'Priya Malhotra', phone: '98000 00701', city: 'Pune', group: 'Regular' },
        { session: h.session },
      );
  },
  async recordConsent(h) {
    const { code } = await addCustomer(h, { name: 'Ravi Shankar', phone: '+919800000702' });
    return () => h.call('recordConsent', { customerId: code, kind: 'opt_in', source: 'counter' }, { session: h.session });
  },
  async eraseCustomer(h) {
    const { code } = await addCustomer(h, { name: 'Anita Rao', phone: '+919800000703' });
    return () =>
      h.asOwner('eraseCustomer', { customerId: code, version: 1, deletionRequestRef: 'DPDP-2026-0801', reason: 'Asked in writing' });
  },
  async setSetting(h) {
    return () => h.asOwner('setSetting', { key: 'autoSendWishes', value: true });
  },
  async createAttachment(h) {
    const jobId = await addKarigarJob(h.pool, h.shop, { code: 'MO-2026-601', dueDate: '2026-11-30T12:00:00+05:30' });
    await h.pool.query(
      `insert into order_copies (shop_id, code, job_id, karigar_id, target_gross_units, target_net_units,
                                 tolerance_units, gold_issued_units)
       select shop_id, 'OC-2026-601', id, karigar_id, 100000, 90000, 1000, 95000 from karigar_jobs where id = $1`,
      [jobId],
    );
    await ownersFile(h, 'FILE-2026-00601');
    return () =>
      h.asOwner('createAttachment', { fileId: 'FILE-2026-00601', ownerType: 'order_copy', ownerId: 'OC-2026-601', role: 'reference' });
  },
  async deleteAttachment(h) {
    await addPiece(h.pool, h.shop, 'TAG-9602');
    await ownersFile(h, 'FILE-2026-00602');
    const attached = await h.asOwner('createAttachment', {
      fileId: 'FILE-2026-00602',
      ownerType: 'piece',
      ownerId: 'TAG-9602',
      role: 'photo',
    });
    expect(attached.status, JSON.stringify(attached.body)).toBe(200);
    return () => h.asOwner('deleteAttachment', { attachmentId: attached.body.id });
  },
  async signIn(h) {
    const number = phone();
    await newUserWithPassword(h.pool, h.shop, { name: 'Farah Khan', phone: number, password: PASSWORD });
    return () => h.auth('signIn', { phone: number, password: PASSWORD });
  },
  async signOut(h) {
    const token = await newSession(h.pool, h.shop, await newUser(h.pool, h.shop, { name: 'Imran Ali' }));
    return () => h.auth('signOut', {}, { token });
  },
  async requestPasswordReset(h) {
    const number = phone();
    await newUserWithPassword(h.pool, h.shop, { name: 'Lata Joshi', phone: number, password: PASSWORD });
    return () => h.auth('requestPasswordReset', { phone: number });
  },
  async activateAccount(h) {
    const email = 'vikram.activate@example.com';
    const { id } = await userWith(h, { name: 'Vikram Singh', email, status: 'pending_activation' });
    expect((await h.asOwner('resendActivation', { userId: id })).status).toBe(200);
    const token = activationToken(h, email);
    return () => h.auth('activateAccount', { token, password: 'counter-2026' });
  },
  async resetPassword(h) {
    const number = phone();
    const email = 'pooja.reset@example.com';
    await newUserWithPassword(h.pool, h.shop, { name: 'Pooja Reddy', phone: number, email, password: PASSWORD });
    expect((await h.auth('requestPasswordReset', { phone: number })).status).toBe(200);
    const token = activationToken(h, email);
    return () => h.auth('resetPassword', { token, password: 'Pooja-resets-2027' });
  },
  async createFirstOwner(h) {
    const shop = await newShop(h.pool, 'First owner shop');
    h.shops.push(shop.shopId);
    h.installation.shopId = shop.shopId;
    return async () => {
      try {
        return await h.auth('createFirstOwner', { name: 'Mohan Lal', phone: phone(), email: 'mohan@example.com' });
      } finally {
        h.installation.shopId = h.shop.shopId;
      }
    };
  },
};

const declared: Kinds = { ...OPERATION_AUDIT_KINDS, ...AUTH_OPERATION_AUDIT_KINDS };
const STATE_CHANGING = Object.entries(declared)
  .filter(([, kinds]) => kinds !== null)
  .map(([name]) => name);

it('every state-changing operation has an audit case', () => {
  const cases: Record<string, unknown> = AUDIT_CASES;
  const missing = STATE_CHANGING.filter((op) => !Object.hasOwn(cases, op)).map((op) => `${op} has no audit case`);
  expect(missing).toEqual([]);
  expect(Object.keys(cases).filter((op) => !STATE_CHANGING.includes(op))).toEqual([]);
});

describeDb('every state-changing operation audits (EP-06-S7 AC6)', () => {
  let h: Ctx;

  beforeAll(async () => {
    const installation = { shopId: '' };
    const users = await startUsersHarness({ auth: { installationShop: async () => installation.shopId } });
    installation.shopId = users.shop.shopId;
    h = Object.assign(users, { shops: [users.shop.shopId], installation });
  });

  afterAll(async () => {
    await h?.close();
  });

  const entries = async () =>
    (
      await h.pool.query<{ id: string; kind: string }>('select id, kind from audit_entries where shop_id = any($1)', [
        h.shops,
      ])
    ).rows;

  it.each(STATE_CHANGING)('%s writes an entry of a declared kind', async (op) => {
    const run = AUDIT_CASES[op as keyof typeof AUDIT_CASES];
    expect(run, `${op} has no audit case`).toBeDefined();
    const call = await run(h);
    const before = new Set((await entries()).map((e) => e.id));
    const res = await call();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const written = (await entries()).filter((e) => !before.has(e.id)).map((e) => e.kind);
    expect(written.length, `${op} wrote no audit entry`).toBeGreaterThan(0);
    for (const kind of written) expect(declared[op], `${op} wrote ${kind}`).toContain(kind);
  });

  it("file entries name the file's owner as their entity (EP-09 under EP-06-S2)", async () => {
    const { rows } = await h.pool.query(
      `select kind, entity_type, entity_id, reference from audit_entries
        where shop_id = $1 and kind in ('file_attached', 'file_detached') order by kind, entity_id`,
      [h.shop.shopId],
    );
    expect(rows).toEqual([
      { kind: 'file_attached', entity_type: 'order_copy', entity_id: 'OC-2026-601', reference: 'OC-2026-601' },
      { kind: 'file_attached', entity_type: 'piece', entity_id: 'TAG-9602', reference: 'TAG-9602' },
      { kind: 'file_detached', entity_type: 'piece', entity_id: 'TAG-9602', reference: 'TAG-9602' },
    ]);
  });
});

/** Each production job: the kinds it writes, or why it changes no audited record. */
const JOB_AUDIT: Record<string, { kinds: readonly string[] } | { exempt: string }> = {
  'lead-sla-timers': { exempt: 'reschedules its own timer rows only; no business record changes' },
  'lead-sla-breach': { kinds: ['lead_marked_late'] },
  'karigar-overdue': { kinds: ['job_marked_overdue', 'job_reminder_sent'] },
  'edit-token-expiry': { kinds: ['edit_token_expired'] },
  'wishes-9am': { exempt: 'emits an outbox event only; no record changes' },
  'file-retention': { kinds: ['file_removed_by_retention'] },
};

/** The retention job as src/index.ts adds it when object storage is configured. */
const retentionJob = () => fileRetentionJob({ storage: new MemoryStorage(), retention: { poDays: 30 }, log: () => {} });

it('every production job is audited or exempt with a reason', () => {
  const jobs = [...productionJobs, retentionJob()];
  expect(jobs.map((j) => j.name).sort()).toEqual(Object.keys(JOB_AUDIT).sort());
});

describeDb('production jobs audit their changes (EP-06-S6, EP-10-S12)', () => {
  const pool = testPool(4);

  afterAll(async () => {
    await pool.end();
  });

  const kindsIn = async (shopId: string) =>
    (await pool.query<{ kind: string }>('select kind from audit_entries where shop_id = $1', [shopId])).rows.map(
      (r) => r.kind,
    );
  const declaredKinds = (job: string) => {
    const entry = JOB_AUDIT[job];
    return 'kinds' in entry ? entry.kinds : [];
  };

  it('lead-sla-breach', async () => {
    const shop = await newJobsShop(pool);
    await addLead(pool, shop, { code: 'LD-2026-602', arrivedAt: '2026-11-01T09:00:00Z' });
    const clock = manualClock('2026-11-01T09:00:00Z');
    const scheduler = makeScheduler(pool, clock, shop, [leadSlaTimersJob, leadSlaBreachJob]);
    await scheduler.tick();
    clock.set('2026-11-01T17:00:00Z');
    await scheduler.tick();
    const kinds = await kindsIn(shop.shopId);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(declaredKinds('lead-sla-breach')).toContain(kind);
  });

  it('karigar-overdue', async () => {
    const shop = await newJobsShop(pool);
    await addKarigarJob(pool, shop, { code: 'MO-2026-602', dueDate: '2026-11-01T12:00:00+05:30' });
    await makeScheduler(pool, manualClock('2026-11-01T18:35:00Z'), shop, [karigarOverdueJob]).tick();
    const kinds = await kindsIn(shop.shopId);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(declaredKinds('karigar-overdue')).toContain(kind);
  });

  it('edit-token-expiry', async () => {
    const shop = await newJobsShop(pool);
    const now = Date.parse('2026-11-01T10:00:00Z');
    await addPieceEdit(pool, shop, { code: 'ED-602', tokenRef: 'tokref-602', tokenIssuedAt: new Date(now - 11 * MIN) });
    await makeScheduler(pool, manualClock(new Date(now)), shop, [editTokenExpiryJob]).tick();
    const kinds = await kindsIn(shop.shopId);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(declaredKinds('edit-token-expiry')).toContain(kind);
  });

  it('file-retention', async () => {
    const shop = await newJobsShop(pool);
    const leadId = await addLead(pool, shop, { code: 'LD-2026-603', arrivedAt: '2026-11-01T09:00:00Z' });
    const fileId = await addStoredFile(pool, shop, 'FILE-2026-00603', { retentionClass: 'po' });
    await pool.query(
      `insert into attachments (shop_id, code, file_id, owner_type, lead_id, role, position, attached_by_name, attached_at)
       values ($1, 'AT-2026-00603', $2, 'lead', $3, 'po', 1, 'Test', now())`,
      [shop.shopId, fileId, leadId],
    );
    // A year after the file was stored, past the 30-day PO period; 10:00 UTC is after the 03:00 IST run.
    const later = new Date(Date.now() + 365 * 24 * 60 * MIN);
    later.setUTCHours(10, 0, 0, 0);
    await makeScheduler(pool, manualClock(later), shop, [retentionJob()]).tick();
    const { rows } = await pool.query<{ kind: string; entity_type: string; entity_id: string }>(
      'select kind, entity_type, entity_id from audit_entries where shop_id = $1',
      [shop.shopId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(declaredKinds('file-retention')).toContain(row.kind);
    expect(rows).toEqual([{ kind: 'file_removed_by_retention', entity_type: 'lead', entity_id: 'LD-2026-603' }]);
  });
});
