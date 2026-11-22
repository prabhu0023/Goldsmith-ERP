/**
 * The type of an uploaded file, read from its first bytes (EP-09-S3). The file name and the
 * client's declared type are never used, so an executable renamed to `photo.jpg` is refused.
 */
import type { FileContentType } from '@goldsmith/shared';

/** How many leading bytes `sniffType` needs. */
export const SNIFF_BYTES = 12;

const startsWith = (head: Buffer, bytes: readonly number[], offset = 0): boolean =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');
const PDF = ascii('%PDF-');

/** The allowed type the bytes start like, or null for anything else. */
export function sniffType(head: Buffer): FileContentType | null {
  if (startsWith(head, JPEG)) return 'image/jpeg';
  if (startsWith(head, PNG)) return 'image/png';
  if (startsWith(head, RIFF) && startsWith(head, WEBP, 8)) return 'image/webp';
  if (startsWith(head, PDF)) return 'application/pdf';
  return null;
}
