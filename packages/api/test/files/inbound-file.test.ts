/**
 * Create Inbound file (EP-09-S11): the server-only function the email and WhatsApp intake call to
 * store a PO attachment on its lead. Runs against the files harness (memory storage, test DB).
 */
import { contract } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { inboundNotKeptNote, type InboundFileDeps, storeInboundFile } from '../../src/files/inbound-file.js';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { type FilesHarness, startFilesHarness } from './files-harness.js';
import { executable, jpeg, pdf } from './test-images.js';
const MB = 1024 * 1024;
describeDb('Create Inbound file (EP-09-S11)', () => {
  let h: FilesHarness;
  let deps: InboundFileDeps;
  beforeAll(async () => {
    h = await startFilesHarness();
    deps = { pool: h.pool, storage: h.storage, clock: h.clock, limits: { maxBytes: 10 * MB }, log: (l) => h.lines.push(l) };
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });
  const snapshot = async () => ({
    files: await h.fileCount(),
    keys: await h.keys(),
    attachments: (
      await h.pool.query<{ n: number }>('select count(*)::int as n from attachments where shop_id = $1', [h.shop.shopId])
    ).rows[0].n,
  });
  let photoPo: Buffer;
  let photoFile: string;
  it('S11 AC1: an image from WhatsApp intake is stored and attached to its lead as po by the system actor', async () => {
    await h.addLead('LD-2026-301');
    photoPo = await jpeg(1200, 1600);
    const result = await storeInboundFile(deps, h.shop, {
      channel: 'whatsapp',
      messageKey: 'wamid.local-test-1',
      leadCode: 'LD-2026-301',
      bytes: photoPo,
      originalName: 'IMG-20261121-WA0001.jpg',
    });
    expect(result).toEqual({ kept: true, fileId: expect.stringMatching(/^FILE-2026-\d{5}$/), repeated: false });
    if (!result.kept) return;
    photoFile = result.fileId;
    const { rows } = await h.pool.query(
      `select f.retention_class, f.uploaded_by, f.uploaded_by_name, f.uploaded_at, f.inbound_key, f.content_type,
              a.owner_type, a.role, a.position, a.attached_by, a.attached_by_name, l.code as lead
         from stored_files f join attachments a on a.file_id = f.id join leads l on l.id = a.lead_id
        where f.shop_id = $1 and f.code = $2`,
      [h.shop.shopId, photoFile],
    );
    expect(rows).toEqual([
      {
        retention_class: 'po',
        uploaded_by: null,
        uploaded_by_name: 'System (WhatsApp intake)',
        uploaded_at: SERVER_NOW,
        inbound_key: 'whatsapp:wamid.local-test-1',
        content_type: 'image/jpeg',
        owner_type: 'lead',
        role: 'po',
        position: 1,
        attached_by: null,
        attached_by_name: 'System (WhatsApp intake)',
        lead: 'LD-2026-301',
      },
    ]);
    const audit = await h.pool.query(
      `select kind, actor_id, actor_name, actor_role, summary, before_value, after_value
         from audit_entries where shop_id = $1 and reference = 'LD-2026-301'`,
      [h.shop.shopId],
    );
    expect(audit.rows).toEqual([
      {
        kind: 'po_attachment_stored',
        actor_id: null,
        actor_name: 'System (WhatsApp intake)',
        actor_role: 'system',
        summary: `PO attachment ${photoFile} attached to lead LD-2026-301`,
        before_value: [],
        after_value: [photoFile],
      },
    ]);
  });
  it('S11 AC2: Rajesh opens the lead and can open the original image', async () => {
    const items = (await h.call('listAttachments', { ownerType: 'lead', ownerId: 'LD-2026-301' }, h.staff.session)).body
      .items as Array<Record<string, unknown>>;
    expect(items).toEqual([expect.objectContaining({ fileId: photoFile, role: 'po', attachedByName: 'System (WhatsApp intake)' })]);
    const [link] = await h.links(h.staff.session, [{ fileId: photoFile, size: 'original' }]);
    const res = await h.get(link.url);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(photoPo)).toBe(true);
  });
  it('S11 AC3: a browser session of any role calling Create Inbound file is refused as not found', async () => {
    expect(Object.keys(contract)).not.toContain('createInboundFile');
    const body = { channel: 'whatsapp', messageKey: 'm-1', leadCode: 'LD-2026-301', originalName: 'x.jpg' };
    for (const session of [h.staff.session, h.owner.session, h.karigar.session, undefined]) {
      expect(await h.call('createInboundFile', body, session)).toEqual({
        status: 404,
        body: { code: 'not_found', message: 'There is no operation named createInboundFile.' },
      });
    }
  });
  it('S11 AC4: an oversize or not-allowed file is refused with a logged reason and stores nothing', async () => {
    await h.addLead('LD-2026-302');
    const before = await snapshot();
    const big = await storeInboundFile(deps, h.shop, {
      channel: 'email',
      messageKey: '<big@mail.example>',
      leadCode: 'LD-2026-302',
      bytes: Buffer.alloc(11 * MB, 0xff),
      originalName: 'scan.jpg',
    });
    const sizeSentence = 'The file is larger than 10 MB, the largest allowed.';
    expect(big).toEqual({ kept: false, reason: sizeSentence });
    const exe = await storeInboundFile(deps, h.shop, {
      channel: 'whatsapp',
      messageKey: 'wamid.exe',
      leadCode: 'LD-2026-302',
      bytes: executable(),
      originalName: 'po.jpg',
    });
    const typeSentence = 'Only JPEG, PNG and WebP images can be uploaded, or PDF for a purchase order.';
    expect(exe).toEqual({ kept: false, reason: typeSentence });
    expect(await snapshot()).toEqual(before);
    expect(h.lines).toContain(`[files] inbound email file for LD-2026-302 not kept: ${sizeSentence}`);
    expect(h.lines).toContain(`[files] inbound whatsapp file for LD-2026-302 not kept: ${typeSentence}`);
    expect(inboundNotKeptNote(sizeSentence)).toBe(`The attachment was not kept: ${sizeSentence}`);
  });
  it('S11 AC5: the same message delivered twice, one after the other or at once, gives one StoredFile and one Attachment', async () => {
    await h.addLead('LD-2026-303');
    const input = {
      channel: 'email' as const,
      messageKey: '<po-303@mail.example>',
      leadCode: 'LD-2026-303',
      bytes: pdf(),
      originalName: 'PO-Sharma.pdf',
    };
    const first = await storeInboundFile(deps, h.shop, input);
    expect(first).toMatchObject({ kept: true, repeated: false });
    const after = await snapshot();
    const again = await storeInboundFile(deps, h.shop, input);
    expect(again).toEqual({ ...first, repeated: true });
    expect(await snapshot()).toEqual(after);
    await h.addLead('LD-2026-304');
    const both = await Promise.all([
      storeInboundFile(deps, h.shop, { ...input, messageKey: '<po-304@mail.example>', leadCode: 'LD-2026-304' }),
      storeInboundFile(deps, h.shop, { ...input, messageKey: '<po-304@mail.example>', leadCode: 'LD-2026-304' }),
    ]);
    expect(both[0]).toMatchObject({ kept: true });
    expect(both[1]).toMatchObject({ kept: true, fileId: (both[0] as { fileId: string }).fileId });
    const { rows } = await h.pool.query(
      `select count(distinct f.id)::int as files, count(a.id)::int as attachments, min(f.uploaded_by_name) as by
         from stored_files f left join attachments a on a.file_id = f.id
        where f.shop_id = $1 and f.inbound_key = 'email:<po-304@mail.example>'`,
      [h.shop.shopId],
    );
    expect(rows[0]).toEqual({ files: 1, attachments: 1, by: 'System (email intake)' });
    expect(await h.keys()).toHaveLength(after.keys.length + 1);
  });
  it('logged no unexpected error', () => {
    expect(h.logged).toEqual([]);
  });
});
