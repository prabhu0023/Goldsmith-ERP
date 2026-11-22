/**
 * Object storage for tests. The S3 tests run when STORAGE_ENDPOINT (and STORAGE_BUCKET) are set,
 * against the lane's test bucket, which the global setup empties once per run; otherwise they are
 * skipped locally (CI always sets them).
 */
import { S3Storage } from '../../src/files/s3-storage.js';
import { readStorageEnv, testBucket } from '../../src/files/storage-config.js';
const settings = readStorageEnv();
export const storageEnabled = settings?.endpoint !== undefined;
/** An S3Storage on the test bucket (e.g. goldsmith-files-b-test), or undefined when not enabled. */
export function testStorage(): S3Storage | undefined {
  if (!settings || settings.endpoint === undefined) return undefined;
  return new S3Storage({ ...settings, bucket: testBucket(settings.bucket, settings.lane) });
}
