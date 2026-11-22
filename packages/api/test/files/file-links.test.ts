/**
 * Read File links (EP-09-S5) and the access check behind them (EP-09-S6), over HTTP against the
 * real app: memory storage, plus one end-to-end run over the S3 adapter when it is configured.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { addPiece, addStoredFile, describeDb, newShop } from '../db/db-test-helpers.js';
import { type FilesHarness, otherKarigar, startFilesHarness } from './files-harness.js';
import { storageEnabled } from './storage-test-helpers.js';
import { jpeg, pdf } from './test-images.js';

const notFound = (code: string) => ({ status: 404, body: { code: 'not_found', message: `File ${code} was not found.` } });

describeDb('Read File links (EP-09-S5, S6)', () => {
  let h: FilesHarness;
  let photo: string;
  let pieceId: string;

  beforeAll(async () => {
    h = await startFilesHarness();
    pieceId = await addPiece(h.pool, h.shop, 'TAG-9108');
    photo = (await h.upload(await jpeg(2400, 1800), { name: 'tag-9108.jpg' }, { session: h.staff.session })).body
      .id as string;
    await h.attach(photo, 'piece', pieceId, 'photo');
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });

  const upload = async (bytes: Buffer, name: string, query: Record<string, string> = {}) => {
    const res = await h.upload(bytes, { name, ...query }, { session: h.staff.session });
    expect(res.status).toBe(200);
    return res.body.id as string;
  };
  const storedKey = async (code: string, column: 'storage_key' | 'thumbnail_key' | 'display_key') =>
    (
      await h.pool.query<Record<string, string>>(`select ${column} from stored_files where shop_id = $1 and code = $2`, [
        h.shop.shopId,
        code,
      ])
    ).rows[0][column];

  it('S5 AC1: Rajesh gets a display link for the first photo of TAG-9108 and it loads the image', async () => {
    const [link] = await h.links(h.staff.session, [{ fileId: photo, size: 'display' }]);
    expect(link.url).toMatch(new RegExp(`^/api/files/${photo}/display\\?exp=\\d+&sig=[A-Za-z0-9_-]{43}$`));
    expect(link.expiresAt).toBe(new Date(h.clock.now().getTime() + 900_000).toISOString());
    const res = await h.get(link.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('private, max-age=900');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals((await h.storage.get(await storedKey(photo, 'display_key')))?.body ?? Buffer.alloc(0))).toBe(true);
    expect(await sharp(body).metadata()).toMatchObject({ width: 1600, height: 1200 });
  });

  it('each size serves its own object; a file without copies serves the original for every size', async () => {
    const po = await upload(pdf(), 'po.pdf', { purpose: 'po' });
    await h.attach(po, 'lead', await h.addLead('LD-2026-901'), 'po');
    const links = await h.links(h.staff.session, [
      { fileId: photo, size: 'thumbnail' },
      { fileId: photo, size: 'original' },
      { fileId: po, size: 'thumbnail' },
    ]);
    const [thumb, original, poThumb] = await Promise.all(links.map(async (l) => h.get(l.url)));
    expect(await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).toMatchObject({ width: 320, height: 240 });
    expect(await sharp(Buffer.from(await original.arrayBuffer())).metadata()).toMatchObject({ width: 2400 });
    expect(poThumb.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await poThumb.arrayBuffer()).equals(pdf())).toBe(true);
  });

  it('S5 AC2: a link used after its expiry is refused', async () => {
    const [link] = await h.links(h.staff.session, [{ fileId: photo, size: 'display' }]);
    expect((await h.get(link.url)).status).toBe(200);
    h.clock.advance(900_000);
    try {
      const res = await h.get(link.url);
      expect({ status: res.status, body: await res.json() }).toEqual(notFound(photo));
    } finally {
      h.clock.advance(-900_000);
    }
  });

  it('S5 AC3: a link with one character of its signature changed is refused', async () => {
    const [link] = await h.links(h.staff.session, [{ fileId: photo, size: 'display' }]);
    for (const at of [link.url.length - 1, link.url.indexOf('sig=') + 4]) {
      const c = link.url[at];
      const tampered = `${link.url.slice(0, at)}${c === 'A' ? 'B' : 'A'}${link.url.slice(at + 1)}`;
      const res = await h.get(tampered);
      expect({ status: res.status, body: await res.json() }).toEqual(notFound(photo));
    }
  });

  it('S5 AC4: a thumbnail link edited to point at the original is refused', async () => {
    const [link] = await h.links(h.staff.session, [{ fileId: photo, size: 'thumbnail' }]);
    expect((await h.get(link.url)).status).toBe(200);
    const res = await h.get(link.url.replace('/thumbnail?', '/original?'));
    expect({ status: res.status, body: await res.json() }).toEqual(notFound(photo));
    const later = await h.get(link.url.replace(/exp=(\d+)/, (_m, e) => `exp=${Number(e) + 3600}`));
    expect(later.status).toBe(404);
  });

  it('S5 AC5: 20 thumbnail links come back from one call and no object is fetched for it', async () => {
    const codes: string[] = [];
    for (let i = 0; i < 20; i++) {
      const code = await upload(await jpeg(40 + i, 30), `p${i}.jpg`);
      await h.attach(code, 'piece', pieceId, 'photo');
      codes.push(code);
    }
    const get = vi.spyOn(h.storage, 'get');
    try {
      const links = await h.links(
        h.staff.session,
        codes.map((fileId) => ({ fileId, size: 'thumbnail' })),
      );
      expect(links).toHaveLength(20);
      expect(links.every((l, i) => l.url.startsWith(`/api/files/${codes[i]}/thumbnail?`))).toBe(true);
      expect(get).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
    }
  });

  it('logs each issued link without the link itself', () => {
    const issued = h.lines.filter((l) => l.startsWith('[files] link issued'));
    expect(issued.length).toBeGreaterThan(0);
    expect(issued[0]).toBe(`[files] link issued ${photo} display by ${h.staff.id}`);
    expect(h.lines.some((l) => l.includes('sig=') || l.includes('exp='))).toBe(false);
  });

  it('S6 AC1, AC2: a PO on a lead is issued to Rajesh (Staff) and not_found for Lakshmi (Karigar)', async () => {
    const po = await upload(pdf(), 'PO-Sharma.pdf', { purpose: 'po' });
    await h.attach(po, 'lead', await h.addLead('LD-2026-902'), 'po');
    expect(await h.links(h.staff.session, [{ fileId: po, size: 'original' }])).toHaveLength(1);
    expect(await h.call('readFileLinks', { files: [{ fileId: po, size: 'original' }] }, h.karigar.session)).toEqual(
      notFound(po),
    );
    // The same answer as for a file that does not exist.
    expect(
      await h.call('readFileLinks', { files: [{ fileId: 'FILE-2026-99999', size: 'original' }] }, h.karigar.session),
    ).toEqual(notFound('FILE-2026-99999'));
    expect(h.lines).toContain(`[files] link refused for user ${h.karigar.id}`);
  });

  it('S6 AC3: an unattached file is issued only to its uploader', async () => {
    const loose = await upload(await jpeg(), 'loose.jpg');
    expect(await h.links(h.staff.session, [{ fileId: loose, size: 'thumbnail' }])).toHaveLength(1);
    expect(await h.call('readFileLinks', { files: [{ fileId: loose, size: 'thumbnail' }] }, h.owner.session)).toEqual(
      notFound(loose),
    );
    expect(await h.call('readFileLinks', { files: [{ fileId: loose, size: 'thumbnail' }] }, h.karigar.session)).toEqual(
      notFound(loose),
    );
  });

  it('S6 AC4: a file on both a lead and an order copy is issued to whoever may read one of them', async () => {
    const ref = await upload(await jpeg(), 'reference.jpg');
    await h.attach(ref, 'lead', await h.addLead('LD-2026-903'), 'reference');
    // Lakshmi may not read the lead; she reads the order copy of her own job.
    expect(await h.call('readFileLinks', { files: [{ fileId: ref, size: 'display' }] }, h.karigar.session)).toEqual(
      notFound(ref),
    );
    const job = await h.addJob('MO-2026-903');
    await h.attach(ref, 'order_copy', await h.addOrderCopy('OC-2026-903', job), 'reference');
    expect(await h.links(h.karigar.session, [{ fileId: ref, size: 'display' }])).toHaveLength(1);
    expect(await h.links(h.owner.session, [{ fileId: ref, size: 'display' }])).toHaveLength(1);
  });

  it("karigar: a file on an own job is issued; on another karigar's job it is not_found", async () => {
    const own = await upload(await jpeg(), 'own.jpg');
    await h.attach(own, 'job', await h.addJob('MO-2026-904'), 'reference');
    expect(await h.links(h.karigar.session, [{ fileId: own, size: 'thumbnail' }])).toHaveLength(1);
    const theirs = await upload(await jpeg(), 'theirs.jpg');
    await h.attach(theirs, 'job', await h.addJob('MO-2026-905', await otherKarigar(h, 'KG-905')), 'reference');
    expect(await h.call('readFileLinks', { files: [{ fileId: theirs, size: 'thumbnail' }] }, h.karigar.session)).toEqual(
      notFound(theirs),
    );
    // One refused file refuses the whole call.
    expect(
      await h.call(
        'readFileLinks',
        { files: [{ fileId: own, size: 'thumbnail' }, { fileId: theirs, size: 'thumbnail' }] },
        h.karigar.session,
      ),
    ).toEqual(notFound(theirs));
  });

  it('S6 AC5: a deactivated user’s old session is unauthenticated', async () => {
    const before = await h.links(h.owner.session, [{ fileId: photo, size: 'thumbnail' }]);
    expect(before).toHaveLength(1);
    await h.pool.query(`update users set status = 'deactivated' where id = $1`, [h.owner.id]);
    try {
      expect(await h.call('readFileLinks', { files: [{ fileId: photo, size: 'thumbnail' }] }, h.owner.session)).toEqual({
        status: 401,
        body: { code: 'unauthenticated', message: 'Sign in to continue.' },
      });
    } finally {
      await h.pool.query(`update users set status = 'active' where id = $1`, [h.owner.id]);
    }
  });

  it("a file of another shop is not_found, even with the same code", async () => {
    const other = await newShop(h.pool, 'Other files shop');
    await addStoredFile(h.pool, other, 'FILE-2026-77777');
    expect(
      await h.call('readFileLinks', { files: [{ fileId: 'FILE-2026-77777', size: 'original' }] }, h.staff.session),
    ).toEqual(notFound('FILE-2026-77777'));
  });

  it('a removed file is not_found for links and downloads', async () => {
    const gone = await upload(await jpeg(), 'gone.jpg');
    await h.attach(gone, 'piece', pieceId, 'photo');
    const [link] = await h.links(h.staff.session, [{ fileId: gone, size: 'thumbnail' }]);
    await h.pool.query('update stored_files set removed_at = now() where shop_id = $1 and code = $2', [
      h.shop.shopId,
      gone,
    ]);
    expect((await h.get(link.url)).status).toBe(404);
    expect(await h.call('readFileLinks', { files: [{ fileId: gone, size: 'thumbnail' }] }, h.staff.session)).toEqual(
      notFound(gone),
    );
  });

  it('a link request without a session is unauthenticated', async () => {
    expect((await h.call('readFileLinks', { files: [{ fileId: photo, size: 'thumbnail' }] })).status).toBe(401);
  });

  it('logged no unexpected error', () => {
    expect(h.logged).toEqual([]);
  });
});

(storageEnabled ? describeDb : describe.skip)('Read File links end to end over S3 (EP-09-S1, S5)', () => {
  let h: FilesHarness;

  beforeAll(async () => {
    h = await startFilesHarness({ storage: 's3' });
  }, 60_000);
  afterAll(async () => {
    await h?.close();
  });

  it('uploads, stores the original and copies in the bucket, serves the thumbnail and refuses it after expiry', async () => {
    const res = await h.upload(await jpeg(4000, 3000), { name: 'IMG_0412.jpg' }, { session: h.staff.session });
    expect(res.status).toBe(200);
    const code = res.body.id as string;
    const row = (
      await h.pool.query<{ storage_key: string; thumbnail_key: string; display_key: string }>(
        'select storage_key, thumbnail_key, display_key from stored_files where shop_id = $1 and code = $2',
        [h.shop.shopId, code],
      )
    ).rows[0];
    expect(await h.keys()).toEqual(expect.arrayContaining([row.storage_key, row.thumbnail_key, row.display_key]));
    await h.attach(code, 'piece', await addPiece(h.pool, h.shop, 'TAG-S3-1'), 'photo');
    const [link] = await h.links(h.staff.session, [{ fileId: code, size: 'thumbnail' }]);
    const got = await h.get(link.url);
    expect(got.status).toBe(200);
    expect(await sharp(Buffer.from(await got.arrayBuffer())).metadata()).toMatchObject({ width: 320, height: 240 });
    h.clock.advance(900_000);
    expect((await h.get(link.url)).status).toBe(404);
  });
});
