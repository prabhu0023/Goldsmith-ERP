/**
 * One contract for every ObjectStorage adapter: the in-memory one always, the S3 one against the
 * real store (local SeaweedFS, CI's container) whenever STORAGE_ENDPOINT is set.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import type { ObjectStorage } from '../../src/files/object-storage.js';
import { S3Storage } from '../../src/files/s3-storage.js';
import { storageEnabled, testStorage } from './storage-test-helpers.js';
const adapters: { name: string; enabled: boolean; make: () => ObjectStorage }[] = [
  { name: 'memory', enabled: true, make: () => new MemoryStorage() },
  { name: 's3', enabled: storageEnabled, make: () => testStorage() as S3Storage },
];
for (const { name, enabled, make } of adapters) {
  (enabled ? describe : describe.skip)(`ObjectStorage contract: ${name}`, () => {
    const storage = enabled ? make() : (undefined as unknown as ObjectStorage);
    const prefix = `contract/${randomBytes(8).toString('hex')}`;
    afterAll(() => {
      if (storage instanceof S3Storage) storage.close();
    });
    it('ensureBucket can run twice', async () => {
      await storage.ensureBucket();
      await storage.ensureBucket();
    });
    it('reads back the bytes and content type it stored', async () => {
      const body = randomBytes(2048);
      await storage.put(`${prefix}/round-trip`, body, 'image/jpeg');
      const got = await storage.get(`${prefix}/round-trip`);
      expect(got?.contentType).toBe('image/jpeg');
      expect(got?.body.equals(body)).toBe(true);
    });
    it('answers null for a key it does not hold', async () => {
      expect(await storage.get(`${prefix}/missing`)).toBeNull();
    });
    it('deletes an object, and deleting a missing key succeeds', async () => {
      await storage.put(`${prefix}/gone`, Buffer.from('x'), 'application/pdf');
      await storage.delete(`${prefix}/gone`);
      expect(await storage.get(`${prefix}/gone`)).toBeNull();
      await storage.delete(`${prefix}/gone`);
      await storage.delete(`${prefix}/never-there`);
    });
    it('keeps two objects under different keys apart', async () => {
      await storage.put(`${prefix}/one`, Buffer.from('first'), 'image/png');
      await storage.put(`${prefix}/two`, Buffer.from('second'), 'image/webp');
      expect((await storage.get(`${prefix}/one`))?.body.toString()).toBe('first');
      expect((await storage.get(`${prefix}/two`))?.body.toString()).toBe('second');
    });
    if (name === 's3') {
      it('S1 AC3: refuses an anonymous read of a stored object (private bucket)', async () => {
        const s3 = storage as S3Storage;
        await s3.put(`${prefix}/private`, Buffer.from('secret bytes'), 'image/jpeg');
        const res = await fetch(`${s3.endpoint}/${s3.bucket}/${prefix}/private`);
        expect(res.status).toBe(403);
        expect(await res.text()).not.toContain('secret bytes');
      });
    }
  });
}
describe('MemoryStorage failure injection', () => {
  it('failNext makes the next call of that operation throw once', async () => {
    const m = new MemoryStorage();
    m.failNext('put');
    await expect(m.put('k', Buffer.from('a'), 'image/png')).rejects.toThrow('put failed');
    await m.put('k', Buffer.from('a'), 'image/png');
    expect(m.keys()).toEqual(['k']);
  });
  it('failKeys makes put and delete of those keys throw', async () => {
    const m = new MemoryStorage();
    await m.put('k', Buffer.from('a'), 'image/png');
    m.failKeys.add('k');
    await expect(m.delete('k')).rejects.toThrow('delete failed');
    await expect(m.put('k', Buffer.from('b'), 'image/png')).rejects.toThrow('put failed');
    expect((await m.get('k'))?.body.toString()).toBe('a');
  });
});
