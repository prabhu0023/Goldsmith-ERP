/** Test inputs for the file tests, generated with sharp (no fixture files). */
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 160, b: 60 } } });

/** A JPEG of the given size. */
export const jpeg = (width = 64, height = 48): Promise<Buffer> => solid(width, height).jpeg().toBuffer();

export const png = (width = 64, height = 48): Promise<Buffer> => solid(width, height).png().toBuffer();

export const webp = (width = 64, height = 48): Promise<Buffer> => solid(width, height).webp().toBuffer();

/** A noisy JPEG of roughly `bytes` (a phone photo does not compress like a flat colour). */
export async function noisyJpeg(bytes: number): Promise<Buffer> {
  const side = Math.ceil(Math.sqrt(bytes / 1.2));
  return sharp(randomBytes(side * side * 3), { raw: { width: side, height: side, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * A 400 x 200 JPEG stored sideways with EXIF orientation 6 (a portrait phone photo), carrying a
 * camera make and a GPS position. Only the test input gets metadata; the service never writes it.
 */
export const sidewaysPhoto = (): Promise<Buffer> =>
  solid(400, 200)
    .withExif({
      IFD0: { Make: 'TestCam', Model: 'Bench 1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '13/1 4/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '80/1 16/1 0/1' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

/** Starts like a JPEG, then garbage: sniffed as JPEG, unreadable by the resizer. */
export const brokenJpeg = (): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(4096)]);

/** A minimal PDF. */
export const pdf = (): Buffer =>
  Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');

/** A Windows executable header (MZ), whatever it is named. */
export const executable = (): Buffer => Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'), randomBytes(512)]);
