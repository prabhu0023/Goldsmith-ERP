/**
 * Storage commands (run via `npm run storage:<command>`): `create` makes the lane's bucket and,
 * in development, its test bucket (goldsmith-files-b and goldsmith-files-b-test in lane b) when
 * they do not exist. Reads STORAGE_*, LANE and APP_ENV. Exit code 0 on success, 1 with a one-line
 * error otherwise; values are never printed, only bucket names.
 */
import { S3Storage } from './s3-storage.js';
import { readStorageEnv, testBucket } from './storage-config.js';
async function main(command: string | undefined): Promise<void> {
  if (command !== 'create') throw new Error(`Unknown command ${command ?? '(none)'}; use create`);
  const settings = readStorageEnv();
  if (!settings) throw new Error('STORAGE_BUCKET is required but missing or empty');
  const buckets = [settings.bucket];
  if (process.env.APP_ENV?.trim() === 'development') buckets.push(testBucket(settings.bucket, settings.lane));
  for (const bucket of buckets) {
    const storage = new S3Storage({ ...settings, bucket });
    try {
      await storage.ensureBucket();
      console.log(`Bucket ready  ${bucket}${settings.lane ? ` (lane ${settings.lane})` : ''}`);
    } finally {
      storage.close();
    }
  }
}
main(process.argv[2]).then(
  () => process.exit(0),
  (e: unknown) => {
    console.error(`Error: ${e instanceof Error ? e.message || e.name : String(e)}`.split('\n')[0]);
    process.exit(1);
  },
);
