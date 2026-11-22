/**
 * Thumbnail and display copies of an uploaded image (EP-09-S4), made with sharp on the server.
 * `.rotate()` applies the EXIF orientation, so copies are upright; sharp writes no EXIF, GPS or
 * camera metadata unless asked (`withMetadata`, never used here), so copies carry none.
 */
import sharp from 'sharp';
import { COPY_QUALITY, DISPLAY_PX, THUMB_PX } from './file-limits.js';

export type ImageCopies =
  | {
      failed: false;
      /** Upright size of the original. */
      width: number;
      height: number;
      thumbnail: Buffer;
      display: Buffer;
    }
  | { failed: true; reason: string };

/** EXIF orientations 5 to 8 turn the image a quarter, so width and height swap. */
const turnsQuarter = (orientation: number | undefined): boolean => orientation !== undefined && orientation >= 5;

/** sharp repeats libvips warnings over many lines; one short line is enough for the log. */
const firstLine = (message: string): string => (message.split('\n')[0] ?? '').slice(0, 200);

async function copy(original: Buffer, maxSide: number): Promise<Buffer> {
  return sharp(original)
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: COPY_QUALITY })
    .toBuffer();
}

/** Both JPEG copies, or `failed` with sharp's message (never the image bytes). */
export async function makeCopies(original: Buffer): Promise<ImageCopies> {
  try {
    const meta = await sharp(original).metadata();
    if (!meta.width || !meta.height) return { failed: true, reason: 'image size unreadable' };
    const [thumbnail, display] = await Promise.all([copy(original, THUMB_PX), copy(original, DISPLAY_PX)]);
    const quarter = turnsQuarter(meta.orientation);
    return {
      failed: false,
      width: quarter ? meta.height : meta.width,
      height: quarter ? meta.width : meta.height,
      thumbnail,
      display,
    };
  } catch (err) {
    return { failed: true, reason: firstLine(err instanceof Error ? err.message : String(err)) };
  }
}
