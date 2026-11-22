/**
 * Storing a file: objects plus one StoredFile row that never disagree (EP-09-S1), and the
 * thumbnail and display copies (EP-09-S4). In-memory storage, test database.
 */
import sharp from 'sharp';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FileContentType } from '@goldsmith/shared';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { makeCopies } from '../../src/files/image-copies.js';
import {
  type FileRowInput,
  insertFileRow,
  type PreparedFile,
  type StoredFileRef,
  storeFile,
} from '../../src/files/store-file.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { describeDb, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newUser } from '../support/api-harness.js';
import { brokenJpeg, jpeg, pdf, sidewaysPhoto } from './test-images.js';

interface Row {
  id: string;
  code: string;
  storage_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  thumbnail_key: string | null;
  display_key: string | null;
  resize_failed: boolean;
  uploaded_by: string | null;
  uploaded_by_name: string;
  uploaded_at: Date;
  retention_class: string;
}

describe('image copies (EP-09-S4)', () => {
  it('AC3: answers failed with a reason for bytes the resizer cannot read', async () => {
    const copies = await makeCopies(brokenJpeg());
    expect(copies.failed).toBe(true);
  });

  it('answers failed, without decoding, for an image over the pixel limit', async () => {
    const photo = await jpeg(400, 300);
    expect((await makeCopies(photo, 400 * 300)).failed).toBe(false);
    const copies = await makeCopies(photo, 400 * 300 - 1);
    expect(copies).toMatchObject({ failed: true });
    expect(copies.failed && copies.reason).toMatch(/pixel limit/i);
  });
});

describeDb('storeFile (EP-09-S1, S4)', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  let userId: string;
  let storage: MemoryStorage;
  let lines: string[];
  const at = new Date('2026-11-22T09:30:00.000Z');
  const errorLog = () => {};

  beforeAll(async () => {
    pool = testPool(4);
    shop = await newShop(pool, 'Store file shop');
    userId = await newUser(pool, shop, { name: 'Rajesh Verma' });
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(() => {
    storage = new MemoryStorage();
    lines = [];
  });

  const rowInput = (name: string, overrides: Partial<FileRowInput> = {}): FileRowInput => ({
    originalName: name,
    retentionClass: 'standard',
    uploadedBy: { id: userId, name: 'Rajesh Verma' },
    at,
    ...overrides,
  });

  /** storeFile with the row inserted in one transaction; `after` runs inside it after the insert. */
  const store = (
    bytes: Buffer,
    type: FileContentType,
    name: string,
    after?: () => Promise<void>,
  ): Promise<StoredFileRef & { prepared: PreparedFile }> =>
    storeFile({ storage, log: (l) => lines.push(l) }, bytes, type, (prepared) =>
      runInTransaction(
        pool,
        async (tx) => {
          const ref = await insertFileRow(tx, shop, prepared, rowInput(name), (l) => lines.push(l));
          await after?.();
          return { ...ref, prepared };
        },
        errorLog,
      ),
    );

  const row = async (code: string): Promise<Row | undefined> =>
    (await pool.query<Row>('select * from stored_files where shop_id = $1 and code = $2', [shop.shopId, code])).rows[0];

  it('S1 AC1: writes the object and one row with every field filled in', async () => {
    const bytes = pdf();
    const ref = await store(bytes, 'application/pdf', 'po-sharma.pdf');
    expect(ref.code).toMatch(/^FILE-2026-\d{5}$/);
    const r = await row(ref.code);
    expect(r).toMatchObject({
      id: ref.id,
      original_name: 'po-sharma.pdf',
      content_type: 'application/pdf',
      size_bytes: bytes.length,
      uploaded_by: userId,
      uploaded_by_name: 'Rajesh Verma',
      retention_class: 'standard',
      resize_failed: false,
    });
    expect(r?.uploaded_at.toISOString()).toBe(at.toISOString());
    expect(storage.keys()).toEqual([r?.storage_key]);
    expect((await storage.get(r?.storage_key ?? ''))?.body.equals(bytes)).toBe(true);
  });

  it('S1 AC2: the storage key is random and holds neither the name nor the uploader', async () => {
    const ref = await store(await jpeg(), 'image/jpeg', 'necklace-sharma.jpg');
    const key = (await row(ref.code))?.storage_key ?? '';
    expect(key).toMatch(/^files\/[0-9a-f]{32}$/);
    expect(key).not.toContain('necklace');
    expect(key).not.toContain('sharma');
    expect(key).not.toContain(userId);
  });

  it('S1 AC4: when the insert transaction fails, no row and no object remain', async () => {
    const before = (await pool.query('select count(*)::int as n from stored_files where shop_id = $1', [shop.shopId]))
      .rows[0].n;
    await expect(
      store(await jpeg(), 'image/jpeg', 'lost.jpg', async () => {
        throw new Error('insert step failed');
      }),
    ).rejects.toThrow('insert step failed');
    const after = (await pool.query('select count(*)::int as n from stored_files where shop_id = $1', [shop.shopId]))
      .rows[0].n;
    expect(after).toBe(before);
    expect(storage.keys()).toEqual([]);
  });

  it('S1 AC4: a failed object write leaves no object behind', async () => {
    storage.failNext('put');
    await expect(store(await jpeg(), 'image/jpeg', 'x.jpg')).rejects.toThrow('put failed');
    expect(storage.keys()).toEqual([]);
  });

  it('S1 AC5: two files named IMG_0412.jpg get their own ids and keys', async () => {
    const a = await store(await jpeg(), 'image/jpeg', 'IMG_0412.jpg');
    const b = await store(await jpeg(), 'image/jpeg', 'IMG_0412.jpg');
    expect(a.code).not.toBe(b.code);
    expect(a.prepared.storageKey).not.toBe(b.prepared.storageKey);
    expect(storage.keys()).toHaveLength(6);
  });

  it('S4 AC1: a 4000 x 3000 JPEG gets its size, a 320 px thumbnail and a 1600 px display copy', async () => {
    const ref = await store(await jpeg(4000, 3000), 'image/jpeg', 'big.jpg');
    const r = await row(ref.code);
    expect(r).toMatchObject({ width: 4000, height: 3000, resize_failed: false });
    expect(r?.thumbnail_key).toBe(`${r?.storage_key}-thumb.jpg`);
    expect(r?.display_key).toBe(`${r?.storage_key}-display.jpg`);
    const thumb = await storage.get(r?.thumbnail_key ?? '');
    const display = await storage.get(r?.display_key ?? '');
    expect(thumb?.contentType).toBe('image/jpeg');
    expect(await sharp(thumb?.body).metadata()).toMatchObject({ width: 320, height: 240, format: 'jpeg' });
    expect(await sharp(display?.body).metadata()).toMatchObject({ width: 1600, height: 1200, format: 'jpeg' });
  });

  it('S4: a small image is not enlarged', async () => {
    const ref = await store(await jpeg(200, 100), 'image/jpeg', 'small.jpg');
    const r = await row(ref.code);
    const display = await storage.get(r?.display_key ?? '');
    expect(await sharp(display?.body).metadata()).toMatchObject({ width: 200, height: 100 });
  });

  it('S4 AC2: a sideways phone photo with orientation 6 gets upright copies and an upright size', async () => {
    const photo = await sidewaysPhoto();
    expect(await sharp(photo).metadata()).toMatchObject({ width: 400, height: 200, orientation: 6 });
    const ref = await store(photo, 'image/jpeg', 'portrait.jpg');
    const r = await row(ref.code);
    expect(r).toMatchObject({ width: 200, height: 400 });
    const thumb = await sharp((await storage.get(r?.thumbnail_key ?? ''))?.body).metadata();
    const display = await sharp((await storage.get(r?.display_key ?? ''))?.body).metadata();
    expect(thumb).toMatchObject({ width: 160, height: 320 });
    expect(display).toMatchObject({ width: 200, height: 400 });
    expect(thumb.orientation).toBeUndefined();
    expect(display.orientation).toBeUndefined();
  });

  it('S4 AC5: copies carry no EXIF, GPS or camera metadata', async () => {
    const photo = await sidewaysPhoto();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const ref = await store(photo, 'image/jpeg', 'gps.jpg');
    const r = await row(ref.code);
    for (const key of [r?.thumbnail_key, r?.display_key]) {
      const meta = await sharp((await storage.get(key ?? ''))?.body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
    }
  });

  it('S4 AC3: an unreadable image keeps the original, is flagged and the log has no content', async () => {
    const bytes = brokenJpeg();
    const ref = await store(bytes, 'image/jpeg', 'broken.jpg');
    const r = await row(ref.code);
    expect(r).toMatchObject({ resize_failed: true, thumbnail_key: null, display_key: null, width: null, height: null });
    expect(storage.keys()).toEqual([r?.storage_key]);
    expect((await storage.get(r?.storage_key ?? ''))?.body.equals(bytes)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^\\[files\\] resize failed ${ref.code} \\(.+\\)$`));
    expect(lines[0].length).toBeLessThan(300);
    expect(lines[0]).not.toContain(bytes.subarray(4, 20).toString('base64'));
  });

  it('S4 AC4: a PDF gets no copies and is kept as is', async () => {
    const ref = await store(pdf(), 'application/pdf', 'po.pdf');
    const r = await row(ref.code);
    expect(r).toMatchObject({ resize_failed: false, thumbnail_key: null, display_key: null, width: null });
    expect(storage.keys()).toEqual([r?.storage_key]);
  });
});
