import { describe, expect, it } from 'vitest';
import {
  contract,
  FILE_OWNER_TYPES,
  FILE_ROLES,
  FILE_SIZES,
  filesContract,
  IMAGE_TYPES,
  PO_TYPES,
  uploadQuery,
} from '../src/index.js';
describe('files contract (EP-09)', () => {
  it('is part of the operation contract, each operation named by its key', () => {
    for (const [key, op] of Object.entries(filesContract)) {
      expect(op.name).toBe(key);
      expect(contract[key as keyof typeof filesContract]).toBe(op);
    }
    expect(Object.keys(filesContract).sort()).toEqual([
      'createAttachment',
      'deleteAttachment',
      'listAttachments',
      'readFileLinks',
    ]);
    expect(filesContract.createAttachment.kind).toBe('create');
    expect(filesContract.deleteAttachment.kind).toBe('command');
    expect(filesContract.readFileLinks.kind).toBe('read');
    expect(filesContract.listAttachments.kind).toBe('read');
  });
  it('lists the sizes, owners, roles and types', () => {
    expect([...FILE_SIZES]).toEqual(['thumbnail', 'display', 'original']);
    expect([...FILE_OWNER_TYPES]).toEqual(['piece', 'order_copy', 'job', 'lead']);
    expect([...FILE_ROLES]).toEqual(['photo', 'reference', 'po', 'bench']);
    expect([...IMAGE_TYPES]).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect([...PO_TYPES]).toEqual([...IMAGE_TYPES, 'application/pdf']);
  });
  it('defaults the upload purpose to image and trims the name', () => {
    expect(uploadQuery.parse({ name: ' IMG_0412.jpg ' })).toEqual({ name: 'IMG_0412.jpg', purpose: 'image' });
    expect(uploadQuery.parse({ name: 'po.pdf', purpose: 'po' }).purpose).toBe('po');
  });
  it('refuses an empty or over-long name and an unknown purpose', () => {
    expect(uploadQuery.safeParse({ name: '  ' }).success).toBe(false);
    expect(uploadQuery.safeParse({ name: 'a'.repeat(201) }).success).toBe(false);
    expect(uploadQuery.safeParse({ name: 'a'.repeat(200) }).success).toBe(true);
    expect(uploadQuery.safeParse({ name: 'a.jpg', purpose: 'avatar' }).success).toBe(false);
  });
  it('takes a target as ownerType, ownerId and role together, or none of them', () => {
    expect(
      uploadQuery.parse({ name: 'bench.jpg', ownerType: 'job', ownerId: 'MO-2026-118', role: 'bench' }),
    ).toMatchObject({ ownerType: 'job', ownerId: 'MO-2026-118', role: 'bench' });
    const partial = uploadQuery.safeParse({ name: 'bench.jpg', ownerType: 'job' });
    expect(partial.success).toBe(false);
    expect(partial.error?.issues.map((i) => i.path[0]).sort()).toEqual(['ownerId', 'role']);
    expect(uploadQuery.safeParse({ name: 'a.jpg', ownerType: 'shop', ownerId: 'X', role: 'photo' }).success).toBe(false);
  });
  it('asks readFileLinks for 1 to 50 files of a known size', () => {
    const input = filesContract.readFileLinks.input;
    const files = (n: number) => Array.from({ length: n }, (_, i) => ({ fileId: `FILE-2026-${i}`, size: 'thumbnail' }));
    expect(input.safeParse({ files: files(0) }).success).toBe(false);
    expect(input.safeParse({ files: files(1) }).success).toBe(true);
    expect(input.safeParse({ files: files(50) }).success).toBe(true);
    expect(input.safeParse({ files: files(51) }).success).toBe(false);
    expect(input.safeParse({ files: [{ fileId: 'FILE-2026-00001', size: 'huge' }] }).success).toBe(false);
  });
  it('validates createAttachment, deleteAttachment and listAttachments inputs', () => {
    expect(
      filesContract.createAttachment.input.parse({
        fileId: ' FILE-2026-00001 ',
        ownerType: 'piece',
        ownerId: 'TAG-1042',
        role: 'photo',
      }),
    ).toEqual({ fileId: 'FILE-2026-00001', ownerType: 'piece', ownerId: 'TAG-1042', role: 'photo' });
    expect(filesContract.createAttachment.input.safeParse({ fileId: 'F', ownerType: 'piece', ownerId: 'T' }).success).toBe(
      false,
    );
    expect(filesContract.deleteAttachment.input.safeParse({ attachmentId: '' }).success).toBe(false);
    expect(filesContract.listAttachments.input.parse({ ownerType: 'lead', ownerId: 'LD-2026-214' })).toEqual({
      ownerType: 'lead',
      ownerId: 'LD-2026-214',
    });
  });
});
