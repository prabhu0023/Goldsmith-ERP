import { describe, expect, it } from 'vitest';
import { sniffType } from '../../src/files/content-type-sniff.js';
import { checkType, tooLargeMessage } from '../../src/files/file-limits.js';
import { executable, jpeg, pdf, png, webp } from './test-images.js';

describe('content type from the bytes (EP-09-S3)', () => {
  it('recognises JPEG, PNG, WebP and PDF by their first bytes', async () => {
    expect(sniffType(await jpeg())).toBe('image/jpeg');
    expect(sniffType(await png())).toBe('image/png');
    expect(sniffType(await webp())).toBe('image/webp');
    expect(sniffType(pdf())).toBe('application/pdf');
  });

  it('answers null for anything else, including an empty or short file', () => {
    expect(sniffType(executable())).toBeNull();
    expect(sniffType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffType(Buffer.alloc(0))).toBeNull();
    expect(sniffType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffType(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
  });

  it('AC2: refuses an MZ executable named photo.jpg with a sentence listing the allowed types', () => {
    expect(() => checkType(executable(), 'image')).toThrow('Only JPEG, PNG and WebP images can be uploaded.');
  });

  it('AC4: a PDF is accepted for a purchase order and refused as an image', () => {
    expect(checkType(pdf(), 'po')).toBe('application/pdf');
    expect(() => checkType(pdf(), 'image')).toThrow('Only JPEG, PNG and WebP images can be uploaded.');
    expect(() => checkType(executable(), 'po')).toThrow(
      'Only JPEG, PNG and WebP images can be uploaded, or PDF for a purchase order.',
    );
  });

  it('names the configured size limit in MB', () => {
    expect(tooLargeMessage(10 * 1024 * 1024)).toBe('The file is larger than 10 MB, the largest allowed.');
    expect(tooLargeMessage(2.5 * 1024 * 1024)).toBe('The file is larger than 2.5 MB, the largest allowed.');
  });
});
