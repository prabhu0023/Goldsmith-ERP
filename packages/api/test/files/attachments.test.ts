/**
 * Attachments (EP-09-S7 piece photos, S8 order copy references, S9 karigar reference images,
 * S10 karigar bench photos), over HTTP against the real app with in-memory storage.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW } from '../support/api-harness.js';
import { type FilesHarness, type HarnessUser, otherKarigar, startFilesHarness } from './files-harness.js';
import { jpeg, pdf } from './test-images.js';
const MB = 1024 * 1024;
const fileNotFound = (code: string) => ({ status: 404, body: { code: 'not_found', message: `File ${code} was not found.` } });
const forbidden = { status: 403, body: { code: 'forbidden', message: 'You are not allowed to do this.' } };
describeDb('Attachments (EP-09-S7 to S10)', () => {
  let h: FilesHarness;
  let deepak: HarnessUser;
  beforeAll(async () => {
    h = await startFilesHarness();
    const id = await newUser(h.pool, h.shop, { name: 'Deepak Rao', role: 'staff' });
    deepak = { id, name: 'Deepak Rao', session: await newSession(h.pool, h.shop, id) };
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });
  const upload = async (session: string, name = 'photo.jpg', query: Record<string, string> = {}, bytes?: Buffer) => {
    const res = await h.upload(bytes ?? (await jpeg(800, 600)), { name, ...query }, { session });
    expect(res.status).toBe(200);
    return res.body.id as string;
  };
  const attach = (session: string, fileId: string, ownerType: string, ownerId: string, role: string) =>
    h.call('createAttachment', { fileId, ownerType, ownerId, role }, session);
  const attached = async (session: string, fileId: string, ownerType: string, ownerId: string, role: string) => {
    const res = await attach(session, fileId, ownerType, ownerId, role);
    expect(res).toEqual({ status: 200, body: { ok: true, id: expect.stringMatching(/^AT-2026-\d{5}$/) } });
    return res.body.id as string;
  };
  const list = (session: string, ownerType: string, ownerId: string) =>
    h.call('listAttachments', { ownerType, ownerId }, session);
  const listed = async (session: string, ownerType: string, ownerId: string) => {
    const res = await list(session, ownerType, ownerId);
    expect(res.status).toBe(200);
    return res.body.items as Array<Record<string, unknown>>;
  };
  const audits = async (reference: string) =>
    (
      await h.pool.query(
        `select kind, actor_id, actor_name, actor_role, at, summary, before_value, after_value
           from audit_entries where shop_id = $1 and reference = $2 order by at, summary`,
        [h.shop.shopId, reference],
      )
    ).rows;
  const attachmentCount = async () =>
    (await h.pool.query<{ n: number }>('select count(*)::int as n from attachments where shop_id = $1', [h.shop.shopId]))
      .rows[0].n;
  const linkStatus = async (session: string, fileId: string, size = 'display') =>
    (await h.call('readFileLinks', { files: [{ fileId, size }] }, session)).status;
  // EP-09-S7
  let photo1: string;
  let photo2: string;
  let photoAttachment2: string;
  it('S7 AC1: Deepak attaches two photos to TAG-9108: positions 1 and 2, attached by him at the server time, audited', async () => {
    await addPiece(h.pool, h.shop, 'TAG-9108');
    photo1 = await upload(deepak.session, 'tag-1.jpg');
    photo2 = await upload(deepak.session, 'tag-2.jpg');
    await attached(deepak.session, photo1, 'piece', 'TAG-9108', 'photo');
    photoAttachment2 = await attached(deepak.session, photo2, 'piece', 'TAG-9108', 'photo');
    const rows = (
      await h.pool.query(
        `select f.code, a.owner_type, a.role, a.position, a.attached_by, a.attached_by_name, a.attached_at
           from attachments a join stored_files f on f.id = a.file_id
           join pieces p on p.id = a.piece_id
          where a.shop_id = $1 and p.tag_no = 'TAG-9108' order by a.position`,
        [h.shop.shopId],
      )
    ).rows;
    const row = { owner_type: 'piece', role: 'photo', attached_by: deepak.id, attached_by_name: 'Deepak Rao', attached_at: SERVER_NOW };
    expect(rows).toEqual([
      { code: photo1, position: 1, ...row },
      { code: photo2, position: 2, ...row },
    ]);
    expect(await audits('TAG-9108')).toEqual([
      {
        kind: 'file_attached',
        actor_id: deepak.id,
        actor_name: 'Deepak Rao',
        actor_role: 'staff',
        at: SERVER_NOW,
        summary: `Photo ${photo1} attached to piece TAG-9108`,
        before_value: [],
        after_value: [photo1],
      },
      {
        kind: 'file_attached',
        actor_id: deepak.id,
        actor_name: 'Deepak Rao',
        actor_role: 'staff',
        at: SERVER_NOW,
        summary: `Photo ${photo2} attached to piece TAG-9108`,
        before_value: [photo1],
        after_value: [photo1, photo2],
      },
    ]);
  });
  it('S7 AC2: Rajesh reads the piece photos from the Attachment rows in position order', async () => {
    const items = await listed(h.staff.session, 'piece', 'TAG-9108');
    expect(items).toEqual([
      expect.objectContaining({ fileId: photo1, ownerType: 'piece', ownerId: 'TAG-9108', role: 'photo', position: 1 }),
      expect.objectContaining({ fileId: photo2, ownerType: 'piece', ownerId: 'TAG-9108', role: 'photo', position: 2 }),
    ]);
    expect(items[0]).toEqual({
      attachmentId: expect.stringMatching(/^AT-2026-\d{5}$/),
      fileId: photo1,
      ownerType: 'piece',
      ownerId: 'TAG-9108',
      role: 'photo',
      position: 1,
      contentType: 'image/jpeg',
      width: 800,
      height: 600,
      resizeFailed: false,
      attachedByName: 'Deepak Rao',
      attachedAt: SERVER_NOW.toISOString(),
    });
  });
  it('S7 AC3: Deepak detaches photo 2; the row is gone and the piece audit records the detach', async () => {
    const res = await h.call('deleteAttachment', { attachmentId: photoAttachment2 }, deepak.session);
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect((await listed(h.staff.session, 'piece', 'TAG-9108')).map((i) => i.fileId)).toEqual([photo1]);
    const detach = (await audits('TAG-9108')).filter((a) => a.kind === 'file_detached');
    expect(detach).toEqual([
      expect.objectContaining({
        actor_name: 'Deepak Rao',
        summary: `Photo ${photo2} detached from piece TAG-9108`,
        before_value: [photo1, photo2],
        after_value: [photo1],
      }),
    ]);
    // The file itself stays; a detach of a gone attachment is not found.
    expect(await h.fileCount()).toBeGreaterThanOrEqual(2);
    expect(await h.call('deleteAttachment', { attachmentId: photoAttachment2 }, deepak.session)).toEqual({
      status: 404,
      body: { code: 'not_found', message: `Attachment ${photoAttachment2} was not found.` },
    });
  });
  it('S7 AC4: Lakshmi (Karigar) is forbidden to attach to a piece, or to detach', async () => {
    const before = await attachmentCount();
    expect(await attach(h.karigar.session, photo2, 'piece', 'TAG-9108', 'photo')).toEqual(forbidden);
    const [first] = await listed(h.staff.session, 'piece', 'TAG-9108');
    expect(await h.call('deleteAttachment', { attachmentId: first.attachmentId }, h.karigar.session)).toEqual(forbidden);
    expect(await attachmentCount()).toBe(before);
  });
  it('S7 AC5: a file id that does not exist is not found and no Attachment row is created', async () => {
    const before = await attachmentCount();
    expect(await attach(deepak.session, 'FILE-2026-99999', 'piece', 'TAG-9108', 'photo')).toEqual(
      fileNotFound('FILE-2026-99999'),
    );
    expect(await attachmentCount()).toBe(before);
  });
  it('S7 concurrency: two staff attaching to the same piece at once get distinct positions', async () => {
    await addPiece(h.pool, h.shop, 'TAG-9109');
    const a = await upload(deepak.session, 'a.jpg');
    const b = await upload(h.staff.session, 'b.jpg');
    const answers = await Promise.all([
      attach(deepak.session, a, 'piece', 'TAG-9109', 'photo'),
      attach(h.staff.session, b, 'piece', 'TAG-9109', 'photo'),
    ]);
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    const positions = (await listed(h.staff.session, 'piece', 'TAG-9109')).map((i) => i.position);
    expect(positions).toEqual([1, 2]);
  });
  it('refuses a role the owner does not take, a missing owner, and the same file twice', async () => {
    expect(await attach(deepak.session, photo1, 'piece', 'TAG-9108', 'po')).toEqual({
      status: 400,
      body: { code: 'validation', field: 'role', message: 'A piece takes only photo attachments.' },
    });
    expect(await attach(deepak.session, photo1, 'piece', 'TAG-0000', 'photo')).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Piece TAG-0000 was not found.' },
    });
    expect(await attach(deepak.session, photo1, 'piece', 'TAG-9108', 'photo')).toEqual({
      status: 409,
      body: { code: 'conflict', message: `File ${photo1} is already attached to piece TAG-9108.` },
    });
  });
  it('staff upload with a target attaches in the same request', async () => {
    await addPiece(h.pool, h.shop, 'TAG-9110');
    const id = await upload(h.staff.session, 'tag.jpg', { ownerType: 'piece', ownerId: 'TAG-9110', role: 'photo' });
    expect(await listed(h.staff.session, 'piece', 'TAG-9110')).toEqual([
      expect.objectContaining({ fileId: id, position: 1, attachedByName: 'Rajesh Verma' }),
    ]);
    const before = { files: await h.fileCount(), keys: await h.keys() };
    const missing = await h.upload(
      await jpeg(),
      { name: 'x.jpg', ownerType: 'piece', ownerId: 'TAG-0001', role: 'photo' },
      { session: h.staff.session },
    );
    expect(missing).toEqual({ status: 404, body: { code: 'not_found', message: 'Piece TAG-0001 was not found.' } });
    expect({ files: await h.fileCount(), keys: await h.keys() }).toEqual(before);
  });
  // EP-09-S8
  let job118: string;
  let refs: string[];
  let poFile: string;
  it('S8 AC1: Rajesh picks 3 reference images for an order copy: 3 Attachment rows with role reference', async () => {
    job118 = await h.addJob('MO-2026-118');
    await h.addOrderCopy('OC-2026-118', job118);
    refs = [await upload(h.staff.session, 'r1.jpg'), await upload(h.staff.session, 'r2.jpg'), await upload(h.staff.session, 'r3.jpg')];
    for (const ref of refs) await attached(h.staff.session, ref, 'order_copy', 'OC-2026-118', 'reference');
    const items = await listed(h.staff.session, 'order_copy', 'OC-2026-118');
    expect(items).toHaveLength(3);
    expect(items.map((i) => [i.fileId, i.ownerType, i.role, i.position])).toEqual([
      [refs[0], 'order_copy', 'reference', 1],
      [refs[1], 'order_copy', 'reference', 2],
      [refs[2], 'order_copy', 'reference', 3],
    ]);
  });
  it('S8 AC2: an order copy created from a lead with a PO attachment gets no attachment by itself', async () => {
    const leadId = await h.addLead('LD-2026-118');
    poFile = await upload(h.staff.session, 'PO-Sharma.pdf', { purpose: 'po', ownerType: 'lead', ownerId: 'LD-2026-118', role: 'po' }, pdf());
    const job = await h.addJob('MO-2026-119');
    await h.addOrderCopy('OC-2026-119', job);
    await h.pool.query('update order_copies set lead_id = $2 where shop_id = $1 and code = $3', [h.shop.shopId, leadId, 'OC-2026-119']);
    expect(await listed(h.staff.session, 'lead', 'LD-2026-118')).toEqual([
      expect.objectContaining({ fileId: poFile, role: 'po', contentType: 'application/pdf' }),
    ]);
    expect(await listed(h.staff.session, 'order_copy', 'OC-2026-119')).toEqual([]);
  });
  it('S8 AC3: picking an existing file from the lead reuses the StoredFile; no object is copied', async () => {
    const leadPhoto = await upload(h.staff.session, 'design.jpg', { ownerType: 'lead', ownerId: 'LD-2026-118', role: 'reference' });
    const before = { files: await h.fileCount(), keys: await h.keys() };
    await attached(h.staff.session, leadPhoto, 'order_copy', 'OC-2026-119', 'reference');
    expect({ files: await h.fileCount(), keys: await h.keys() }).toEqual(before);
    const { rows } = await h.pool.query(
      `select count(distinct a.file_id)::int as files, count(*)::int as rows
         from attachments a join stored_files f on f.id = a.file_id where f.shop_id = $1 and f.code = $2`,
      [h.shop.shopId, leadPhoto],
    );
    expect(rows[0]).toEqual({ files: 1, rows: 2 });
  });
  it("S8 AC4: job MO-2026-118 lists its order copy's reference attachments as its reference images", async () => {
    const items = await listed(h.staff.session, 'job', 'MO-2026-118');
    expect(items.map((i) => [i.fileId, i.ownerType, i.ownerId, i.role, i.position])).toEqual([
      [refs[0], 'order_copy', 'OC-2026-118', 'reference', 1],
      [refs[1], 'order_copy', 'OC-2026-118', 'reference', 2],
      [refs[2], 'order_copy', 'OC-2026-118', 'reference', 3],
    ]);
  });
  it("S8 AC5: Rajesh detaches a reference image; the order copy's audit records the detach", async () => {
    const [, second] = await listed(h.staff.session, 'order_copy', 'OC-2026-118');
    expect((await h.call('deleteAttachment', { attachmentId: second.attachmentId }, h.staff.session)).status).toBe(200);
    expect((await audits('OC-2026-118')).filter((a) => a.kind === 'file_detached')).toEqual([
      expect.objectContaining({
        actor_id: h.staff.id,
        actor_name: 'Rajesh Verma',
        summary: `Reference image ${refs[1]} detached from order copy OC-2026-118`,
        before_value: refs,
        after_value: [refs[0], refs[2]],
      }),
    ]);
    expect((await listed(h.staff.session, 'job', 'MO-2026-118')).map((i) => i.fileId)).toEqual([refs[0], refs[2]]);
  });
  // EP-09-S9
  it('S9 AC1: Lakshmi lists her job MO-2026-118 and its reference image loads through a signed link', async () => {
    const items = await listed(h.karigar.session, 'job', 'MO-2026-118');
    expect(items.map((i) => i.fileId)).toEqual([refs[0], refs[2]]);
    const [link] = await h.links(h.karigar.session, [{ fileId: refs[0], size: 'display' }]);
    const res = await h.get(link.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });
  it("S9 AC2: another karigar's job: its reference image link and its list are not found", async () => {
    const job = await h.addJob('MO-2026-120', await otherKarigar(h, 'KG-120'));
    await h.addOrderCopy('OC-2026-120', job);
    const theirs = await upload(h.staff.session, 'theirs.jpg');
    await attached(h.staff.session, theirs, 'order_copy', 'OC-2026-120', 'reference');
    expect(await h.call('readFileLinks', { files: [{ fileId: theirs, size: 'display' }] }, h.karigar.session)).toEqual(
      fileNotFound(theirs),
    );
    expect(await list(h.karigar.session, 'job', 'MO-2026-120')).toEqual({
      status: 404,
      body: { code: 'not_found', message: 'Job MO-2026-120 was not found.' },
    });
  });
  it('S9 AC3: a piece photo or a PO attachment is not found for Lakshmi, and so are their lists', async () => {
    expect(await linkStatus(h.karigar.session, photo1)).toBe(404);
    expect(await linkStatus(h.karigar.session, poFile, 'original')).toBe(404);
    expect((await list(h.karigar.session, 'piece', 'TAG-9108')).status).toBe(404);
    expect((await list(h.karigar.session, 'lead', 'LD-2026-118')).status).toBe(404);
    expect((await list(h.karigar.session, 'order_copy', 'OC-2026-118')).status).toBe(404);
  });
  it('S9 AC4: MO-2026-118 reassigned to another karigar: its reference image is not found for Lakshmi', async () => {
    const job = await h.addJob('MO-2026-121');
    await h.addOrderCopy('OC-2026-121', job);
    const ref = await upload(h.staff.session, 'ref.jpg');
    await attached(h.staff.session, ref, 'order_copy', 'OC-2026-121', 'reference');
    expect(await linkStatus(h.karigar.session, ref)).toBe(200);
    await h.pool.query('update karigar_jobs set karigar_id = $2 where id = $1', [job, await otherKarigar(h, 'KG-121')]);
    expect(await linkStatus(h.karigar.session, ref)).toBe(404);
    expect((await list(h.karigar.session, 'job', 'MO-2026-121')).status).toBe(404);
  });
  it("S9 AC5: the phone gets the display copy, not the original", async () => {
    const big = await upload(h.staff.session, 'big.jpg', {}, await jpeg(3200, 2400));
    await attached(h.staff.session, big, 'order_copy', 'OC-2026-118', 'reference');
    const [link] = await h.links(h.karigar.session, [{ fileId: big, size: 'display' }]);
    const served = Buffer.from(await (await h.get(link.url)).arrayBuffer());
    const keys = (
      await h.pool.query('select storage_key, display_key from stored_files where shop_id = $1 and code = $2', [
        h.shop.shopId,
        big,
      ])
    ).rows[0];
    const display = await h.storage.get(keys.display_key);
    const original = await h.storage.get(keys.storage_key);
    expect(served.equals(display?.body as Buffer)).toBe(true);
    expect(served.equals(original?.body as Buffer)).toBe(false);
  });
  // EP-09-S10
  let bench: string;
  it('S10 AC1: Lakshmi uploads a bench photo to MO-2026-118: StoredFile and Attachment (job, bench) by her, audited', async () => {
    bench = await upload(h.karigar.session, 'bench.jpg', { ownerType: 'job', ownerId: 'MO-2026-118', role: 'bench' });
    const row = (
      await h.pool.query(
        `select f.uploaded_by, a.owner_type, a.role, a.position, a.attached_by, a.attached_by_name
           from attachments a join stored_files f on f.id = a.file_id where f.shop_id = $1 and f.code = $2`,
        [h.shop.shopId, bench],
      )
    ).rows;
    expect(row).toEqual([
      {
        uploaded_by: h.karigar.id,
        owner_type: 'job',
        role: 'bench',
        position: 1,
        attached_by: h.karigar.id,
        attached_by_name: 'Lakshmi Devi',
      },
    ]);
    expect((await audits('MO-2026-118')).filter((a) => a.kind === 'file_attached')).toEqual([
      expect.objectContaining({
        actor_id: h.karigar.id,
        actor_role: 'karigar',
        summary: `Bench photo ${bench} attached to job MO-2026-118`,
        before_value: [],
        after_value: [bench],
      }),
    ]);
    expect(await listed(h.karigar.session, 'job', 'MO-2026-118')).toContainEqual(
      expect.objectContaining({ fileId: bench, ownerType: 'job', ownerId: 'MO-2026-118', role: 'bench' }),
    );
  });
  it("S10 AC2: a bench photo for another karigar's job is not found and nothing is stored", async () => {
    const before = { files: await h.fileCount(), keys: await h.keys() };
    const res = await h.upload(
      await jpeg(),
      { name: 'bench.jpg', ownerType: 'job', ownerId: 'MO-2026-120', role: 'bench' },
      { session: h.karigar.session },
    );
    expect(res).toEqual({ status: 404, body: { code: 'not_found', message: 'Job MO-2026-120 was not found.' } });
    expect({ files: await h.fileCount(), keys: await h.keys() }).toEqual(before);
    // Attaching an own file to that job is not found too.
    expect((await attach(h.karigar.session, bench, 'job', 'MO-2026-120', 'bench')).status).toBe(404);
  });
  it('S10 AC3: an upload by Lakshmi targeting a piece, order copy or lead is not found', async () => {
    const before = { files: await h.fileCount(), keys: await h.keys() };
    for (const [ownerType, ownerId, role, noun] of [
      ['piece', 'TAG-9108', 'photo', 'Piece'],
      ['order_copy', 'OC-2026-118', 'reference', 'Order copy'],
      ['lead', 'LD-2026-118', 'po', 'Lead'],
    ]) {
      const res = await h.upload(await jpeg(), { name: 'x.jpg', ownerType, ownerId, role }, { session: h.karigar.session });
      expect(res).toEqual({ status: 404, body: { code: 'not_found', message: `${noun} ${ownerId} was not found.` } });
    }
    expect({ files: await h.fileCount(), keys: await h.keys() }).toEqual(before);
  });
  it('S10 AC4: Rajesh opens the bench photo of MO-2026-118 through a signed link', async () => {
    expect(await listed(h.staff.session, 'job', 'MO-2026-118')).toContainEqual(
      expect.objectContaining({ fileId: bench, role: 'bench', attachedByName: 'Lakshmi Devi' }),
    );
    const [link] = await h.links(h.staff.session, [{ fileId: bench, size: 'thumbnail' }]);
    expect((await h.get(link.url)).status).toBe(200);
  });
  it('S10 AC5: a bench photo over the size limit gets the size-limit sentence', async () => {
    const before = { files: await h.fileCount(), keys: await h.keys() };
    const res = await h.upload(
      Buffer.alloc(11 * MB, 0xff),
      { name: 'bench.jpg', ownerType: 'job', ownerId: 'MO-2026-118', role: 'bench' },
      { session: h.karigar.session },
    );
    expect(res).toEqual({
      status: 413,
      body: { code: 'validation', field: 'file', message: 'The file is larger than 10 MB, the largest allowed.' },
    });
    expect({ files: await h.fileCount(), keys: await h.keys() }).toEqual(before);
  });
  it('logged no unexpected error', () => {
    expect(h.logged).toEqual([]);
  });
});
