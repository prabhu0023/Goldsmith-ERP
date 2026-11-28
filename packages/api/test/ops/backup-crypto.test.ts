import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BackupKeyError,
  createDecryptStream,
  createEncryptStream,
  MAGIC,
  verifyEncryptedFile,
} from '../../src/ops/backup-crypto.js';
import { LocalFolderStore } from '../../src/ops/backup-store.js';
const dir = mkdtempSync(join(tmpdir(), 'gs-crypto-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);
const dumpLike = Buffer.concat([Buffer.from('PGDMP'), Buffer.alloc(300_000, 'weights 486500 ')]);
async function encryptTo(name: string, plain: Buffer): Promise<string> {
  const store = new LocalFolderStore(dir);
  const enc = createEncryptStream(key);
  await Promise.all([store.writeStream(name, enc), pipeline(Readable.from([plain]), enc)]);
  return store.locate(name);
}
async function read(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
describe('backup encryption', () => {
  it('round trips through verify and decrypt', async () => {
    const file = await encryptTo('a.dump.enc', dumpLike);
    await verifyEncryptedFile(file, key);
    expect((await read(await createDecryptStream(file, key))).equals(dumpLike)).toBe(true);
  });
  it('round trips an empty plaintext', async () => {
    const file = await encryptTo('empty.dump.enc', Buffer.alloc(0));
    await verifyEncryptedFile(file, key);
    expect(await read(await createDecryptStream(file, key))).toHaveLength(0);
  });
  it('has the tool magic and no PGDMP magic in the file', async () => {
    const bytes = readFileSync(await encryptTo('b.dump.enc', dumpLike));
    expect(bytes.subarray(0, MAGIC.length).toString()).toBe('GSBK1');
    expect(bytes.includes(Buffer.from('PGDMP'))).toBe(false);
    expect(bytes.includes(Buffer.from('weights 486500'))).toBe(false);
  });
  it('refuses the wrong key', async () => {
    const file = await encryptTo('c.dump.enc', dumpLike);
    await expect(verifyEncryptedFile(file, otherKey)).rejects.toBeInstanceOf(BackupKeyError);
  });
  it('refuses one flipped byte', async () => {
    const file = await encryptTo('d.dump.enc', dumpLike);
    const bytes = readFileSync(file);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    writeFileSync(file, bytes);
    await expect(verifyEncryptedFile(file, key)).rejects.toBeInstanceOf(BackupKeyError);
  });
  it('refuses a truncated file and a file that is not a backup', async () => {
    const file = await encryptTo('e.dump.enc', dumpLike);
    writeFileSync(file, readFileSync(file).subarray(0, 40));
    await expect(verifyEncryptedFile(file, key)).rejects.toBeInstanceOf(BackupKeyError);
    writeFileSync(join(dir, 'plain.dump'), dumpLike);
    await expect(verifyEncryptedFile(join(dir, 'plain.dump'), key)).rejects.toBeInstanceOf(BackupKeyError);
  });
  it('uses a new IV for every file', async () => {
    const a = readFileSync(await encryptTo('f1.dump.enc', dumpLike));
    const b = readFileSync(await encryptTo('f2.dump.enc', dumpLike));
    expect(a.subarray(5, 17).equals(b.subarray(5, 17))).toBe(false);
  });
});
