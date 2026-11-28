/**
 * Backup encryption (EP-38-S4): AES-256-GCM with Node's own crypto, streaming.
 * File = magic `GSBK1` + 12-byte IV + ciphertext + 16-byte tag. The key is the 32 bytes of
 * BACKUP_ENCRYPTION_KEY. A restore verifies the whole file's tag first (verifyEncryptedFile,
 * output discarded) and only then streams plaintext (createDecryptStream), so unauthenticated
 * plaintext never reaches a database.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export const MAGIC = Buffer.from('GSBK1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;
/** The file is not a backup of this tool, is damaged, or the key is wrong. */
export class BackupKeyError extends Error {
  constructor(message = 'The backup cannot be decrypted: wrong BACKUP_ENCRYPTION_KEY or the file is damaged') {
    super(message);
    this.name = 'BackupKeyError';
  }
}
function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('The backup key must be 32 bytes');
}
/** Transform: plaintext in, `GSBK1 + iv + ciphertext + tag` out. */
export function createEncryptStream(key: Buffer): Transform {
  assertKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let started = false;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      if (!started) {
        started = true;
        this.push(Buffer.concat([MAGIC, iv]));
      }
      this.push(cipher.update(chunk));
      done();
    },
    flush(done) {
      if (!started) this.push(Buffer.concat([MAGIC, iv]));
      this.push(cipher.final());
      this.push(cipher.getAuthTag());
      done();
    },
  });
}
interface Parts {
  iv: Buffer;
  tag: Buffer;
  /** Byte range of the ciphertext in the file (inclusive start and end). */
  start: number;
  end: number;
}
async function readParts(path: string): Promise<Parts> {
  const size = (await stat(path)).size;
  if (size < HEADER_LENGTH + TAG_LENGTH) throw new BackupKeyError('The file is not an encrypted backup of this tool');
  const handle = await open(path, 'r');
  try {
    const header = Buffer.alloc(HEADER_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new BackupKeyError('The file is not an encrypted backup of this tool');
    }
    const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
    return { iv: header.subarray(MAGIC.length), tag, start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 };
  } finally {
    await handle.close();
  }
}
function decipherFor(key: Buffer, parts: Parts) {
  assertKey(key);
  const decipher = createDecipheriv('aes-256-gcm', key, parts.iv);
  decipher.setAuthTag(parts.tag);
  return decipher;
}
function ciphertextOf(path: string, parts: Parts): Readable {
  // An empty ciphertext (end < start) must not be read as "to the end of the file".
  if (parts.end < parts.start) return Readable.from([]);
  return createReadStream(path, { start: parts.start, end: parts.end });
}
/** Pass 1: check the tag over the whole file, discarding the plaintext. Throws BackupKeyError. */
export async function verifyEncryptedFile(path: string, key: Buffer): Promise<void> {
  const parts = await readParts(path);
  const decipher = decipherFor(key, parts);
  const sink = new Writable({ write: (_c, _e, done) => done() });
  try {
    await pipeline(ciphertextOf(path, parts), decipher, sink);
  } catch (e) {
    if (e instanceof BackupKeyError) throw e;
    throw new BackupKeyError();
  }
}
/** Pass 2: plaintext stream of a file that verifyEncryptedFile accepted. */
export async function createDecryptStream(path: string, key: Buffer): Promise<Readable> {
  const parts = await readParts(path);
  const decipher = decipherFor(key, parts);
  const source = ciphertextOf(path, parts);
  source.on('error', (e) => decipher.destroy(e));
  source.pipe(decipher);
  return decipher;
}
/** sha256 (hex) of a stream's bytes. */
export async function sha256Of(source: Readable): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(
    source,
    new Writable({
      write(chunk, _enc, done) {
        hash.update(chunk);
        done();
      },
    }),
  );
  return hash.digest('hex');
}
