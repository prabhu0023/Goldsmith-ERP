import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  addKarigar,
  addPiece,
  addStoredFile,
  columnsOf,
  describeDb,
  expectPgError,
  newShop,
  type TestShop,
  testPool,
} from '../db/db-test-helpers.js';
/** The EP-09 migration: stored files, attachments, file audit kinds, the old string lists gone. */
describeDb('EP-09 file storage schema', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  let other: TestShop;
  const now = new Date('2026-11-22T10:00:00Z');
  beforeAll(async () => {
    pool = testPool(2);
    shop = await newShop(pool, 'Files schema shop');
    other = await newShop(pool, 'Other files shop');
  });
  afterAll(async () => {
    await pool.end();
  });
  const attach = (
    s: TestShop,
    values: { code: string; fileId: string; ownerType: string; role: string } & Partial<
      Record<'pieceId' | 'orderCopyId' | 'jobId' | 'leadId', string>
    >,
  ) =>
    pool.query(
      `insert into attachments (shop_id, code, file_id, owner_type, piece_id, order_copy_id, job_id, lead_id, role,
         position, attached_by_name, attached_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, 'Test', $10)`,
      [
        s.shopId,
        values.code,
        values.fileId,
        values.ownerType,
        values.pieceId ?? null,
        values.orderCopyId ?? null,
        values.jobId ?? null,
        values.leadId ?? null,
        values.role,
        now,
      ],
    );
  const addLead = async (s: TestShop, code: string) =>
    (await pool.query<{ id: string }>(`insert into leads (shop_id, code, source) values ($1, $2, 'counter') returning id`, [s.shopId, code]))
      .rows[0].id;
  const addJob = async (s: TestShop, code: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into karigar_jobs (shop_id, code, karigar_id, status, target_gross_units, target_net_units,
           tolerance_units, gold_issued_units)
         values ($1, $2, $3, 'sent', 845000, 784000, 5000, 800000) returning id`,
        [s.shopId, code, await addKarigar(pool, s, `KG-${code}`)],
      )
    ).rows[0].id;
  it('has the new tables, every time a timestamptz', async () => {
    const tz = { type: 'timestamp with time zone' };
    expect(await columnsOf(pool, 'stored_files')).toMatchObject({
      shop_id: { type: 'uuid', nullable: false },
      code: { type: 'text', nullable: false },
      storage_key: { type: 'text', nullable: false },
      size_bytes: { type: 'bigint', nullable: false },
      uploaded_by: { type: 'uuid', nullable: true },
      uploaded_at: { ...tz, nullable: false },
      removed_at: { ...tz, nullable: true },
      resize_failed: { type: 'boolean', nullable: false },
      inbound_key: { type: 'text', nullable: true },
    });
    expect(await columnsOf(pool, 'attachments')).toMatchObject({
      shop_id: { type: 'uuid', nullable: false },
      file_id: { type: 'uuid', nullable: false },
      position: { type: 'integer', nullable: false },
      attached_by: { type: 'uuid', nullable: true },
      attached_at: { ...tz, nullable: false },
    });
  });
  it('drops piece_photos, order_copy_images and karigar_jobs.ref_image_key', async () => {
    const tables = await pool.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name in ('piece_photos', 'order_copy_images')`,
    );
    expect(tables.rows).toEqual([]);
    expect(await columnsOf(pool, 'karigar_jobs')).not.toHaveProperty('ref_image_key');
  });
  it('accepts each file audit kind and still accepts the kinds of earlier epics', async () => {
    for (const kind of [
      'file_attached',
      'file_detached',
      'po_attachment_stored',
      'file_removed_by_retention',
      'edit_applied',
      'signed_in',
      'job_run_retried',
    ]) {
      await pool.query(
        `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, summary, reference, at)
         values ($1, null, 'System (retention run)', 'system', $2, 'File test', 'TAG-1', $3)`,
        [shop.shopId, kind, now],
      );
    }
    await expectPgError(
      pool.query(
        `insert into audit_entries (shop_id, actor_id, actor_name, actor_role, kind, at)
         values ($1, null, 'System (test)', 'system', 'file_teleported', $2)`,
        [shop.shopId, now],
      ),
      '23514',
    );
  });
  it('refuses a file of one shop on a piece of another shop', async () => {
    const fileId = await addStoredFile(pool, shop, 'FILE-2026-00101');
    const pieceId = await addPiece(pool, other, 'TAG-X1');
    await expectPgError(attach(other, { code: 'AT-2026-00101', fileId, ownerType: 'piece', role: 'photo', pieceId }), '23503');
    await expectPgError(attach(shop, { code: 'AT-2026-00102', fileId, ownerType: 'piece', role: 'photo', pieceId }), '23503');
  });
  it('allows only the owner and role pairs of the stories', async () => {
    const pieceId = await addPiece(pool, shop, 'TAG-R1');
    const leadId = await addLead(shop, 'LD-R1');
    const jobId = await addJob(shop, 'MO-R1');
    const file = (n: number) => addStoredFile(pool, shop, `FILE-2026-0020${n}`);
    await attach(shop, { code: 'AT-2026-00201', fileId: await file(1), ownerType: 'piece', role: 'photo', pieceId });
    await attach(shop, { code: 'AT-2026-00202', fileId: await file(2), ownerType: 'lead', role: 'po', leadId });
    await attach(shop, { code: 'AT-2026-00203', fileId: await file(3), ownerType: 'job', role: 'bench', jobId });
    await attach(shop, { code: 'AT-2026-00204', fileId: await file(4), ownerType: 'job', role: 'reference', jobId });
    await expectPgError(
      attach(shop, { code: 'AT-2026-00205', fileId: await file(5), ownerType: 'piece', role: 'po', pieceId }),
      '23514',
    );
    await expectPgError(
      attach(shop, { code: 'AT-2026-00206', fileId: await file(6), ownerType: 'lead', role: 'bench', leadId }),
      '23514',
    );
  });
  it('needs exactly the owner column that matches owner_type', async () => {
    const pieceId = await addPiece(pool, shop, 'TAG-O1');
    const leadId = await addLead(shop, 'LD-O1');
    const fileId = await addStoredFile(pool, shop, 'FILE-2026-00301');
    await expectPgError(attach(shop, { code: 'AT-2026-00301', fileId, ownerType: 'piece', role: 'photo' }), '23514');
    await expectPgError(
      attach(shop, { code: 'AT-2026-00302', fileId, ownerType: 'piece', role: 'photo', pieceId, leadId }),
      '23514',
    );
    await expectPgError(attach(shop, { code: 'AT-2026-00303', fileId, ownerType: 'piece', role: 'photo', leadId }), '23514');
  });
  it('refuses an unknown content type or retention class, and a duplicate storage key', async () => {
    await expectPgError(addStoredFile(pool, shop, 'FILE-2026-00401', { contentType: 'application/x-msdownload' }), '23514');
    await expectPgError(addStoredFile(pool, shop, 'FILE-2026-00402', { retentionClass: 'forever' }), '23514');
    await pool.query(
      `insert into stored_files (shop_id, code, storage_key, original_name, content_type, size_bytes, uploaded_by_name,
         uploaded_at, retention_class)
       values ($1, 'FILE-2026-00403', 'files/same', 'a.jpg', 'image/jpeg', 1, 'Test', $2, 'standard')`,
      [shop.shopId, now],
    );
    await expectPgError(
      pool.query(
        `insert into stored_files (shop_id, code, storage_key, original_name, content_type, size_bytes, uploaded_by_name,
           uploaded_at, retention_class)
         values ($1, 'FILE-2026-00404', 'files/same', 'b.jpg', 'image/jpeg', 1, 'Test', $2, 'standard')`,
        [other.shopId, now],
      ),
      '23505',
    );
  });
});
