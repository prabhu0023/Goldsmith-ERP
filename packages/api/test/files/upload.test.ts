/**
 * Create File: POST /api/files (EP-09-S2 upload, S3 size and type refusals), over HTTP against
 * the real app with in-memory storage.
 */
import { connect } from 'node:net';
import { Readable } from 'node:stream';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CUT_OFF_MESSAGE, FileCutOffError } from '../../src/files/file-limits.js';
import { readBody } from '../../src/files/files-router.js';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { leaksIn, SERVER_NOW } from '../support/api-harness.js';
import { type FilesHarness, otherKarigar, startFilesHarness } from './files-harness.js';
import { executable, jpeg, noisyJpeg, pdf, png, webp } from './test-images.js';

const MB = 1024 * 1024;

describeDb('Create File upload (EP-09-S2, S3)', () => {
  let h: FilesHarness;

  beforeAll(async () => {
    h = await startFilesHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });

  /** Files and objects stored so far, to show a refusal stored nothing. */
  const snapshot = async () => ({ files: await h.fileCount(), keys: await h.keys() });

  it('S2 AC1: Rajesh (Staff) uploads a 3 MB JPEG and gets a file id; the row names him and the server time', async () => {
    const photo = await noisyJpeg(3 * MB);
    expect(photo.length).toBeGreaterThan(2.5 * MB);
    const started = Date.now();
    const res = await h.upload(photo, { name: 'IMG_0412.jpg' }, { session: h.staff.session });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: expect.stringMatching(/^FILE-2026-\d{5}$/) });
    const row = (
      await h.pool.query(
        `select uploaded_by, uploaded_by_name, uploaded_at, original_name, content_type, size_bytes, retention_class
           from stored_files where shop_id = $1 and code = $2`,
        [h.shop.shopId, res.body.id],
      )
    ).rows[0];
    expect(row).toEqual({
      uploaded_by: h.staff.id,
      uploaded_by_name: 'Rajesh Verma',
      uploaded_at: SERVER_NOW,
      original_name: 'IMG_0412.jpg',
      content_type: 'image/jpeg',
      size_bytes: photo.length,
      retention_class: 'standard',
    });
  });

  it('S2 AC2: Sanjay (Owner) uploads a PNG and gets a file id', async () => {
    const res = await h.upload(await png(), { name: 'ring.png' }, { session: h.owner.session });
    expect(res).toEqual({ status: 200, body: { ok: true, id: expect.stringMatching(/^FILE-2026-\d{5}$/) } });
  });

  it('S2 AC3: without a session the upload is unauthenticated and nothing is stored', async () => {
    const before = await snapshot();
    const res = await h.upload(await jpeg(), { name: 'x.jpg' });
    expect(res).toEqual({ status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('S2 AC4: Lakshmi (Karigar) without a target of her own is forbidden', async () => {
    const before = await snapshot();
    const res = await h.upload(await jpeg(), { name: 'bench.jpg' }, { session: h.karigar.session });
    expect(res).toEqual({ status: 403, body: { code: 'forbidden', message: 'You are not allowed to do this.' } });
    expect(await snapshot()).toEqual(before);
  });

  it("decision 8: a karigar's upload to another karigar's job or to a piece is not_found", async () => {
    const before = await snapshot();
    await h.addJob('MO-2026-801', await otherKarigar(h));
    await addPiece(h.pool, h.shop, 'TAG-8801');
    const otherJob = await h.upload(
      await jpeg(),
      { name: 'bench.jpg', ownerType: 'job', ownerId: 'MO-2026-801', role: 'bench' },
      { session: h.karigar.session },
    );
    expect(otherJob).toEqual({ status: 404, body: { code: 'not_found', message: 'Job MO-2026-801 was not found.' } });
    const piece = await h.upload(
      await jpeg(),
      { name: 'p.jpg', ownerType: 'piece', ownerId: 'TAG-8801', role: 'photo' },
      { session: h.karigar.session },
    );
    expect(piece).toEqual({ status: 404, body: { code: 'not_found', message: 'Piece TAG-8801 was not found.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('S2 AC5: a retry with the same Idempotency-Key answers the same id and stores one file', async () => {
    const photo = await jpeg(800, 600);
    const first = await h.upload(photo, { name: 'retry.jpg' }, { session: h.staff.session, idempotencyKey: 'up-1' });
    expect(first.status).toBe(200);
    const after = await snapshot();
    const retry = await h.upload(photo, { name: 'retry.jpg' }, { session: h.staff.session, idempotencyKey: 'up-1' });
    expect(retry).toEqual(first);
    expect(await snapshot()).toEqual(after);
    const rows = await h.pool.query('select 1 from stored_files where shop_id = $1 and original_name = $2', [
      h.shop.shopId,
      'retry.jpg',
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('the same Idempotency-Key with other bytes is a conflict and stores nothing', async () => {
    await h.upload(await jpeg(), { name: 'k.jpg' }, { session: h.staff.session, idempotencyKey: 'up-2' });
    const before = await snapshot();
    const res = await h.upload(await png(), { name: 'k.jpg' }, { session: h.staff.session, idempotencyKey: 'up-2' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('conflict');
    expect(await snapshot()).toEqual(before);
  });

  it('S3 AC1: a 50 MB file is refused with the maximum size before it is read, and nothing is stored', async () => {
    const before = await snapshot();
    const res = await h.upload(Buffer.alloc(50 * MB, 0xff), { name: 'huge.jpg' }, { session: h.staff.session });
    expect(res).toEqual({
      status: 413,
      body: { code: 'validation', field: 'file', message: 'The file is larger than 10 MB, the largest allowed.' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('S3 AC2: an executable renamed photo.jpg is refused by its bytes with the allowed types', async () => {
    const before = await snapshot();
    const res = await h.upload(executable(), { name: 'photo.jpg' }, { session: h.staff.session });
    expect(res).toEqual({
      status: 415,
      body: { code: 'validation', field: 'file', message: 'Only JPEG, PNG and WebP images can be uploaded.' },
    });
    expect(leaksIn(res.body)).toEqual([]);
    expect(await snapshot()).toEqual(before);
  });

  it('S3 AC3: JPEG, PNG and WebP images under the limit are accepted, whatever their name', async () => {
    for (const [bytes, type] of [
      [await jpeg(), 'image/jpeg'],
      [await png(), 'image/png'],
      [await webp(), 'image/webp'],
    ] as const) {
      const res = await h.upload(bytes, { name: 'upload.bin' }, { session: h.staff.session });
      expect(res.status).toBe(200);
      const row = (
        await h.pool.query('select content_type from stored_files where shop_id = $1 and code = $2', [
          h.shop.shopId,
          res.body.id,
        ])
      ).rows[0];
      expect(row.content_type).toBe(type);
    }
  });

  it('S3 AC4: Staff uploads a PDF purchase order: accepted as purpose po, refused as an image', async () => {
    const asPo = await h.upload(pdf(), { name: 'PO-Sharma.pdf', purpose: 'po' }, { session: h.staff.session });
    expect(asPo.status).toBe(200);
    const row = (
      await h.pool.query(
        'select content_type, retention_class, thumbnail_key from stored_files where shop_id = $1 and code = $2',
        [h.shop.shopId, asPo.body.id],
      )
    ).rows[0];
    expect(row).toEqual({ content_type: 'application/pdf', retention_class: 'po', thumbnail_key: null });
    const before = await snapshot();
    const asImage = await h.upload(pdf(), { name: 'PO-Sharma.pdf' }, { session: h.staff.session });
    expect(asImage).toEqual({
      status: 415,
      body: { code: 'validation', field: 'file', message: 'Only JPEG, PNG and WebP images can be uploaded.' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('S3 AC5: an upload cut off before its declared size is refused and nothing is stored', async () => {
    const before = await snapshot();
    const photo = await jpeg(400, 300);
    const { port } = new URL(h.base);
    const answer = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), '127.0.0.1');
      let received = '';
      socket.on('data', (d) => {
        received += d.toString('latin1');
      });
      socket.on('error', reject);
      socket.on('close', () => resolve(received));
      socket.write(
        [
          'POST /api/files?name=cut.jpg HTTP/1.1',
          'Host: 127.0.0.1',
          `Cookie: gs_session=${h.staff.session}`,
          'Content-Type: application/octet-stream',
          `Content-Length: ${photo.length}`,
          '',
          '',
        ].join('\r\n'),
      );
      socket.write(photo.subarray(0, Math.floor(photo.length / 2)));
      socket.end();
    });
    // The body ended early: Node's HTTP parser answers 400 itself and the route refuses the
    // aborted body as cut off (its sentence cannot reach a closed connection).
    expect(answer).toMatch(/^HTTP\/1\.1 400 /);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await snapshot()).toEqual(before);
  });

  it('an upload without Content-Length is refused', async () => {
    const before = await snapshot();
    const photo = await jpeg();
    const res = await fetch(`${h.base}/api/files?name=chunked.jpg`, {
      method: 'POST',
      headers: { cookie: `gs_session=${h.staff.session}` },
      body: new ReadableStream({
        start(c) {
          c.enqueue(photo);
          c.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect(res.status).toBe(411);
    expect(await res.json()).toMatchObject({ code: 'validation', field: 'Content-Length' });
    expect(await snapshot()).toEqual(before);
  });

  it('a missing name is a validation error on field name', async () => {
    const res = await h.upload(await jpeg(), {}, { session: h.staff.session });
    expect(res).toMatchObject({ status: 400, body: { code: 'validation', field: 'name' } });
  });

  it('logged no unexpected error', () => {
    expect(h.logged).toEqual([]);
  });
});

/** A request body stream that sends `sent` bytes of a declared `declared`, then ends or aborts. */
function partialRequest(declared: number, sent: number, ends: 'abort' | 'end'): Request {
  const body = new Readable({ read() {} });
  body.push(Buffer.alloc(sent, 0xff));
  setImmediate(() => (ends === 'abort' ? body.destroy(new Error('aborted')) : body.push(null)));
  return Object.assign(body, {
    complete: false,
    get: (name: string) => (name.toLowerCase() === 'content-length' ? String(declared) : undefined),
  }) as unknown as Request;
}

describe('readBody (EP-09-S3 AC5, the route side of a cut-off upload)', () => {
  it('refuses a body whose stream aborts before the declared size as cut off', async () => {
    const read = readBody(partialRequest(1000, 400, 'abort'), { maxBytes: 10 * MB });
    await expect(read).rejects.toBeInstanceOf(FileCutOffError);
    await expect(read).rejects.toMatchObject({ code: 'validation', field: 'file', message: CUT_OFF_MESSAGE });
  });

  it('refuses a body that ends short of the declared size as cut off', async () => {
    await expect(readBody(partialRequest(1000, 400, 'end'), { maxBytes: 10 * MB })).rejects.toBeInstanceOf(FileCutOffError);
  });
});
