/**
 * Signed, expiring file links (EP-09-S5, plan decision 6):
 *
 *   /api/files/<FILE-code>/<size>?exp=<unix seconds>&sig=<base64url HMAC-SHA256>
 *
 * signed over `<code>|<size>|<exp>` with a key derived from SESSION_SECRET. The link is the
 * capability (an <img src> sends no session); the access check runs when it is issued. A changed
 * code, size, expiry or signature, or a link past its expiry, does not verify.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { FILE_SIZES, type FileSize } from '@goldsmith/shared';

/** The link-signing key: HMAC(SESSION_SECRET, "goldsmith-file-links"), never the secret itself. */
export function linkKey(sessionSecret: string): Buffer {
  return createHmac('sha256', sessionSecret).update('goldsmith-file-links').digest();
}

const signature = (key: Buffer, fileCode: string, size: string, exp: string): Buffer =>
  createHmac('sha256', key).update(`${fileCode}|${size}|${exp}`).digest();

export interface SignedLink {
  url: string;
  expiresAt: Date;
}

/** A link for `size` of `fileCode` valid for `ttlSeconds` after `now`. */
export function signLink(key: Buffer, fileCode: string, size: FileSize, now: Date, ttlSeconds: number): SignedLink {
  const exp = String(Math.floor(now.getTime() / 1000) + ttlSeconds);
  const sig = signature(key, fileCode, size, exp).toString('base64url');
  return {
    url: `/api/files/${encodeURIComponent(fileCode)}/${size}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(Number(exp) * 1000),
  };
}

const EXP = /^[0-9]{1,12}$/;
const SIG = /^[A-Za-z0-9_-]{43}$/;

export const isFileSize = (size: string): size is FileSize => (FILE_SIZES as readonly string[]).includes(size);

/** Seconds the link has left when it verifies at `now`, else null. */
export function verifyLink(
  key: Buffer,
  fileCode: string,
  size: string,
  exp: unknown,
  sig: unknown,
  now: Date,
): number | null {
  if (!isFileSize(size) || typeof exp !== 'string' || typeof sig !== 'string') return null;
  if (!EXP.test(exp) || !SIG.test(sig)) return null;
  // Compare the text, not decoded bytes: base64url ignores the low bits of the last character,
  // so two different signatures could decode to the same bytes.
  const given = Buffer.from(sig, 'ascii');
  const expected = Buffer.from(signature(key, fileCode, size, exp).toString('base64url'), 'ascii');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const left = Number(exp) - Math.floor(now.getTime() / 1000);
  return left > 0 ? left : null;
}
