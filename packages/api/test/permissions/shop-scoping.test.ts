/**
 * Shop scoping over the production contract (EP-40-S5 AC8, D7): a signed-in user of shop A who
 * calls every list and read operation, with or without a forged `shopId` in the body, never sees
 * a record of shop B, and shop B's rows are unchanged afterwards. The shop comes from the session
 * only; a `shopId` in the body is ignored or refused.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addKarigar, addPiece, addStoredFile, describeDb, newShop, type TestShop } from '../db/db-test-helpers.js';
import { addKarigarJob, addLead } from '../jobs/job-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';
const B_USER = 'Bhavna Quillfeather';
const B_PHONE = '+91 98765 43210';
const B_FILE = 'FILE-2026-0B001';
const B_ATTACHMENT = 'AT-2026-0B001';
const B_JOB = 'MO-2026-0B01';
const B_LEAD = 'LD-2026-0B01';
const B_RUN = 'JR-2026-0B001';
const B_AUDIT_SUMMARY = 'Shop B private change';
const B_TABLES = ['users', 'pieces', 'stored_files', 'attachments', 'karigar_jobs', 'leads', 'job_runs', 'audit_entries'];
/** Every string value in a request body, however deep. */
const stringsIn = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(stringsIn) : [];
describeDb('shop scoping over the production contract (EP-40-S5 AC8, D7)', () => {
  let h: Harness;
  let shopB: TestShop;
  let owner: string;
  let karigar: string;
  let bAuditId: string;
  let markers: string[];
  async function snapshotB(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const table of B_TABLES) {
      const { rows } = await h.pool.query(
        `select count(*)::int as n, coalesce(md5(string_agg(row_to_json(t)::text, '|' order by row_to_json(t)::text)), '') as digest
           from ${table} t where shop_id = $1`,
        [shopB.shopId],
      );
      out[table] = `${rows[0].n}:${rows[0].digest}`;
    }
    return out;
  }
  beforeAll(async () => {
    h = await startHarness({ production: true });
    owner = await newSession(h.pool, h.shop, await newUser(h.pool, h.shop, { name: 'Sanjay Seth', role: 'owner' }));
    const kg = await addKarigar(h.pool, h.shop, 'KG-A1');
    karigar = await newSession(
      h.pool,
      h.shop,
      await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar', karigarId: kg }),
    );
    await addKarigarJob(h.pool, h.shop, { code: 'MO-2026-0A01', dueDate: '2026-11-28T00:00:00Z', karigarCode: 'KG-A1X' });
    await h.pool.query(`update karigar_jobs set karigar_id = $2 where shop_id = $1`, [h.shop.shopId, kg]);
    await addPiece(h.pool, h.shop, 'TAG-8841');
    // Shop B: a user, a piece with an attached photo, a lead, a job, a job run and an audit entry.
    shopB = await newShop(h.pool, 'Shop B');
    const userB = await newUser(h.pool, shopB, { name: B_USER, role: 'owner', phone: B_PHONE });
    const pieceB = await addPiece(h.pool, shopB, 'TAG-8841');
    const fileB = await addStoredFile(h.pool, shopB, B_FILE);
    await h.pool.query(
      `insert into attachments (shop_id, code, file_id, owner_type, piece_id, role, position, attached_by_name, attached_at)
       values ($1, $2, $3, 'piece', $4, 'photo', 1, 'Test', now())`,
      [shopB.shopId, B_ATTACHMENT, fileB, pieceB],
    );
    await addLead(h.pool, shopB, { code: B_LEAD, arrivedAt: '2026-11-21T09:00:00Z' });
    await addKarigarJob(h.pool, shopB, { code: B_JOB, dueDate: '2026-11-28T00:00:00Z' });
    await h.pool.query(
      `insert into job_runs (shop_id, code, job_name, scheduled_at, started_at, attempts, result, error_text)
       values ($1, $2, 'lead_sla_breach', now(), now(), 1, 'failed', 'Shop B run failure')`,
      [shopB.shopId, B_RUN],
    );
    bAuditId = (
      await h.pool.query<{ id: string }>(
        `insert into audit_entries (shop_id, at, actor_id, actor_name, actor_role, kind, entity_type, entity_id, summary)
         values ($1, now(), $3, 'Bhavna', 'owner', 'setting_changed', 'setting', 'REC-B', $2) returning id`,
        [shopB.shopId, B_AUDIT_SUMMARY, userB],
      )
    ).rows[0].id;
    markers = [
      shopB.shopId,
      B_USER,
      B_PHONE,
      B_FILE,
      B_ATTACHMENT,
      B_JOB,
      B_LEAD,
      B_RUN,
      B_AUDIT_SUMMARY,
      bAuditId,
      'Shop B run failure',
    ];
  }, 30_000);
  afterAll(async () => {
    await h?.close();
  });
  type Call = [op: string, input: () => Record<string, unknown>, session: () => string];
  const CALLS: Call[] = [
    ['listUsers', () => ({}), () => owner],
    ['listAuditEntries', () => ({}), () => owner],
    ['readAuditEntry', () => ({ id: bAuditId }), () => owner],
    ['listJobRuns', () => ({}), () => owner],
    ['listAttachments', () => ({ ownerType: 'piece', ownerId: 'TAG-8841' }), () => owner],
    ['readFileLinks', () => ({ files: [{ fileId: B_FILE, size: 'display' }] }), () => owner],
    ['readRailBadges', () => ({}), () => owner],
    ['listMyJobs', () => ({}), () => karigar],
    ['readMyJob', () => ({ jobId: B_JOB }), () => karigar],
  ];
  it.each(CALLS)('%s shows nothing of shop B, with and without a forged shopId', async (op, input, session) => {
    for (const forged of [undefined, 'shopId', 'shop_id']) {
      const body = forged ? { ...input(), [forged]: shopB.shopId } : input();
      const res = await h.call(op, body, { session: session() });
      expect([200, 400, 404], `${op} ${forged ?? 'plain'}: ${JSON.stringify(res.body)}`).toContain(res.status);
      // A not_found sentence repeats the id the caller asked for; that is the caller's own input.
      const asked = stringsIn(input());
      const shown = asked.reduce((t, v) => t.split(v).join(''), JSON.stringify(res.body));
      for (const marker of markers) expect(shown.includes(marker), `${op} ${forged ?? 'plain'} shows ${marker}`).toBe(false);
    }
  });
  it('answers a plain call for shop B records with not_found', async () => {
    expect((await h.call('readAuditEntry', { id: bAuditId }, { session: owner })).status).toBe(404);
    expect((await h.call('readFileLinks', { files: [{ fileId: B_FILE, size: 'display' }] }, { session: owner })).status).toBe(
      404,
    );
    expect((await h.call('readMyJob', { jobId: B_JOB }, { session: karigar })).status).toBe(404);
  });
  it('lists only shop A rows: the owner and karigar users, TAG-8841 with no attachment, no job runs', async () => {
    const users = await h.call('listUsers', {}, { session: owner });
    const names = (users.body.items as Array<{ name: string }>).map((u) => u.name);
    expect(names).not.toContain(B_USER);
    expect(names).toEqual(expect.arrayContaining(['Sanjay Seth', 'Lakshmi Devi']));
    expect((await h.call('listAttachments', { ownerType: 'piece', ownerId: 'TAG-8841' }, { session: owner })).body.items).toEqual(
      [],
    );
    expect((await h.call('listJobRuns', {}, { session: owner })).body.items).toEqual([]);
    const mine = await h.call('listMyJobs', {}, { session: karigar });
    expect((mine.body.items as Array<{ code: string }>).map((j) => j.code)).toEqual(['MO-2026-0A01']);
  });
  it('leaves shop B rows unchanged after every call above', async () => {
    const before = await snapshotB();
    for (const [op, input, session] of CALLS) {
      await h.call(op, { ...input(), shopId: shopB.shopId }, { session: session() });
      await h.call(op, input(), { session: session() });
    }
    expect(await snapshotB()).toEqual(before);
  });
});
