/**
 * Which object store and bucket to use. The api builds its storage from the loaded Config
 * (`storageFromConfig`); the `storage:create` command and the tests read only the STORAGE_*
 * variables and LANE (`readStorageEnv`), so they work without the api's other settings.
 *
 * With LANE set the bucket gets the lane added, like the databases (src/lane.ts):
 * goldsmith-files → goldsmith-files-b, and the tests use <bucket>-test → goldsmith-files-b-test.
 */
import { type Config, DEFAULT_STORAGE_REGION } from '../config.js';
import { readLane } from '../lane.js';
import { S3Storage, type S3StorageOptions } from './s3-storage.js';
type Env = Record<string, string | undefined>;
/** goldsmith-files → goldsmith-files-<lane>; a name that already carries the lane is kept. */
export function laneBucket(bucket: string, lane: string | undefined): string {
  if (lane === undefined || bucket.endsWith(`-${lane}`)) return bucket;
  return `${bucket}-${lane}`;
}
/** The bucket the tests may empty: the lane's bucket with `-test` added. */
export function testBucket(bucket: string, lane: string | undefined): string {
  const name = laneBucket(bucket, lane);
  return name.endsWith('-test') ? name : `${name}-test`;
}
export interface StorageSettings extends S3StorageOptions {
  lane: string | undefined;
}
/** The STORAGE_* settings (lane applied to the bucket), or undefined when STORAGE_BUCKET is unset. */
export function readStorageEnv(env: Env = process.env): StorageSettings | undefined {
  const read = (name: string): string | undefined => env[name]?.trim() || undefined;
  const bucket = read('STORAGE_BUCKET');
  if (bucket === undefined) {
    if (read('STORAGE_ENDPOINT') !== undefined) throw new Error('STORAGE_BUCKET is required when STORAGE_ENDPOINT is set');
    return undefined;
  }
  const lane = readLane(env);
  return {
    lane,
    bucket: laneBucket(bucket, lane),
    region: read('STORAGE_REGION') ?? DEFAULT_STORAGE_REGION,
    endpoint: read('STORAGE_ENDPOINT'),
    accessKeyId: read('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: read('STORAGE_SECRET_ACCESS_KEY'),
  };
}
/** The api's object storage, or undefined when STORAGE_BUCKET is unset (file features are off). */
export function storageFromConfig(config: Config): S3Storage | undefined {
  if (config.storageBucket === undefined) return undefined;
  return new S3Storage({
    bucket: laneBucket(config.storageBucket, config.lane),
    region: config.storageRegion,
    endpoint: config.storageEndpoint,
    accessKeyId: config.storageAccessKeyId,
    secretAccessKey: config.storageSecretAccessKey,
  });
}
