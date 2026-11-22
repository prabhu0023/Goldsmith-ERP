/**
 * Password hashing (EP-04-S2) with Node's built-in scrypt. N = 2^15, r = 8, p = 3, a 16-byte
 * random salt and a 32-byte key: one of the OWASP Password Storage Cheat Sheet's scrypt options,
 * about 32 MiB per hash. The stored text carries its parameters, so they can be raised later:
 *   $scrypt$ln=15,r=8,p=3$<salt base64>$<hash base64>
 * Only the hash is ever stored; a password is never logged or written anywhere else.
 */
import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from 'node:crypto';
import { passwordProblem } from '@goldsmith/shared';
import { ValidationError } from '../pipeline/api-errors.js';
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_MAXMEM = 64 * 1024 * 1024;
/** Fixed text hashed once per hasher, so an unknown user costs the same time as a known one. */
const DUMMY_PASSWORD = 'dummy-password-for-timing';
export interface PasswordHasherOptions {
  /** log2 of the scrypt cost N. */
  ln?: number;
  r?: number;
  p?: number;
}
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** 'wrong' also for a null or malformed stored value. */
  verify(password: string, stored: string | null | undefined): Promise<'ok' | 'wrong'>;
  /** A hash of a fixed text with this hasher's parameters, computed once on first use. */
  dummyHash(): Promise<string>;
}
function scryptKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
const memoryFor = (ln: number, r: number) => Math.max(MIN_MAXMEM, 2 * 128 * 2 ** ln * r);
const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');
const STORED = /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
export function createPasswordHasher({ ln = 15, r = 8, p = 3 }: PasswordHasherOptions = {}): PasswordHasher {
  let dummy: Promise<string> | undefined;
  const hasher: PasswordHasher = {
    async hash(password) {
      const salt = randomBytes(SALT_BYTES);
      const key = await scryptKey(password, salt, KEY_BYTES, { N: 2 ** ln, r, p, maxmem: memoryFor(ln, r) });
      return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(key)}`;
    },
    async verify(password, stored) {
      const m = stored ? STORED.exec(stored) : null;
      if (!m) return 'wrong';
      const [sln, sr, sp] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (sln < 1 || sln > 20 || sr < 1 || sp < 1) return 'wrong';
      const salt = Buffer.from(m[4], 'base64');
      const expected = Buffer.from(m[5], 'base64');
      if (expected.length === 0) return 'wrong';
      try {
        const key = await scryptKey(password, salt, expected.length, { N: 2 ** sln, r: sr, p: sp, maxmem: memoryFor(sln, sr) });
        return timingSafeEqual(key, expected) ? 'ok' : 'wrong';
      } catch {
        return 'wrong';
      }
    },
    dummyHash() {
      dummy ??= hasher.hash(DUMMY_PASSWORD);
      return dummy;
    },
  };
  return hasher;
}
/** The production hasher (ln = 15, r = 8, p = 3). */
export const passwordHasher = createPasswordHasher();
/** Refuse a password that breaks the policy (EP-04-S2) with code `validation` on field `password`. */
export function assertPasswordPolicy(password: string): void {
  const problem = passwordProblem(password);
  if (problem !== null) throw new ValidationError('password', problem);
}
