/**
 * Upload limits and their sentences (EP-09-S3), and the image copy sizes (EP-09-S4). The size
 * limit and link lifetime come from config (FILE_MAX_BYTES, FILE_LINK_TTL_SECONDS); the copy
 * sizes are fixed here (open item in docs/setup/files.md).
 */
import { type FileContentType, IMAGE_TYPES, PO_TYPES } from '@goldsmith/shared';
import { ValidationError } from '../pipeline/api-errors.js';
import { sniffType } from './content-type-sniff.js';

export interface FileLimits {
  /** Largest upload in bytes. */
  maxBytes: number;
}

/** Longest side of the thumbnail copy, in pixels. */
export const THUMB_PX = 320;
/** Longest side of the display copy, in pixels. */
export const DISPLAY_PX = 1600;
/**
 * Largest image, in pixels, that copies are made from. A larger one (a small, highly compressed
 * PNG can declare a huge size) is not decoded; it keeps only its original, as when resizing fails.
 */
export const MAX_IMAGE_PIXELS = 100_000_000;
/** JPEG quality of both copies. */
export const COPY_QUALITY = 80;

export type UploadPurpose = 'image' | 'po';

const MB = 1024 * 1024;

/** "10", or "2.5" for a limit that is not a whole number of MB. */
const megabytes = (bytes: number): string => {
  const mb = bytes / MB;
  return Number.isInteger(mb) ? String(mb) : String(Math.round(mb * 10) / 10);
};

export const tooLargeMessage = (maxBytes: number): string =>
  `The file is larger than ${megabytes(maxBytes)} MB, the largest allowed.`;

export const typeRefusedMessage = (purpose: UploadPurpose): string =>
  purpose === 'po'
    ? 'Only JPEG, PNG and WebP images can be uploaded, or PDF for a purchase order.'
    : 'Only JPEG, PNG and WebP images can be uploaded.';

export const CUT_OFF_MESSAGE = 'The upload was cut off before it finished. Try again.';

/** The field every upload refusal names. */
export const FILE_FIELD = 'file';

export class FileTooLargeError extends ValidationError {
  constructor(maxBytes: number) {
    super(FILE_FIELD, tooLargeMessage(maxBytes), 413);
  }
}

export class FileCutOffError extends ValidationError {
  constructor() {
    super(FILE_FIELD, CUT_OFF_MESSAGE, 400);
  }
}

export const allowedTypes = (purpose: UploadPurpose): readonly FileContentType[] =>
  purpose === 'po' ? PO_TYPES : IMAGE_TYPES;

/** The file's type from its bytes, or a 415 validation refusal listing the allowed types. */
export function checkType(head: Buffer, purpose: UploadPurpose): FileContentType {
  const type = sniffType(head);
  if (type === null || !allowedTypes(purpose).includes(type)) {
    throw new ValidationError(FILE_FIELD, typeRefusedMessage(purpose), 415);
  }
  return type;
}

/** A refusal before any byte is read when the declared size is over the limit. */
export function checkDeclaredSize(declared: number, limits: FileLimits): void {
  if (declared > limits.maxBytes) throw new FileTooLargeError(limits.maxBytes);
}
