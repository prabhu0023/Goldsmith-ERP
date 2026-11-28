import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CreateBucketCommand, DeleteBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { seedPrototype } from '../../src/db/seed/seed-database.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { S3Storage } from '../../src/files/s3-storage.js';
import { readStorageEnv } from '../../src/files/storage-config.js';
import { listBackups } from '../../src/ops/backup-records.js';
import { backupFiles, type FilesBackupDeps, type FilesManifest, type ListableStorage, objectFileName, openFileStores } from '../../src/ops/files-backup.js';
import { checkFileReferences } from '../../src/ops/files-check.js';
import { loadFilesManifest, restoreFiles } from '../../src/ops/files-restore.js';
import { OpsGuardError } from '../../src/ops/ops-guards.js';
import { RESTORES_FILE } from '../../src/ops/restore-db.js';
import { createTempDatabase, describeDb } from '../db/db-test-helpers.js';
import { storageEnabled, testStorage } from '../files/storage-test-helpers.js';
import { type BackupFolder, backupFolder, opsEnv, recordingNotifier, TEST_KEY } from './ops-test-helpers.js';

class ListableMemory extends MemoryStorage implements ListableStorage {
  async listKeys(): Promise<string[]> {
    return this.keys();
  }
}

const sha256 = (body: Buffer): string => createHash('sha256').update(body).digest('hex');
const folders: BackupFolder[] = [];
afterAll(() => {
  for (const f of folders) f.cleanup();
});

const photo = Buffer.from('JPEG-BYTES-of-a-ring-photo-0001');
const thumb = Buffer.from('JPEG-BYTES-of-a-ring-thumbnail');
const pdf = Buffer.from('%PDF-1.4 purchase order 42');

async function liveBucket(): Promise<ListableMemory> {
  const live = new ListableMemory();
  await live.put('files/aaaa', photo, 'image/jpeg');
  await live.put('files/aaaa-thumb', thumb, 'image/webp');
  await live.put('files/bbbb', pdf, 'application/pdf');
  // The same bytes under a second key: one encrypted object serves both.
  await live.put('files/cccc', photo, 'image/jpeg');
  return live;
}

function setup() {
  const folder = backupFolder();
  folders.push(folder);
  const notifier = recordingNotifier();
  const files = openFileStores(folder.dir);
  const deps = (storage: ListableStorage, over: Partial<FilesBackupDeps> = {}): FilesBackupDeps => ({
    env: opsEnv('postgres://localapp:localapp@localhost:5432/unused', folder.dir),
    store: folder.store,
    files,
    storage,
    bucket: 'goldsmith-files-c',
    notifier,
    getKey: () => TEST_KEY,
    ...over,
  });
  const restoreDeps = (target: ListableStorage, opened: string[] = []) => ({
    env: { appEnv: 'development' as const, lane: 'c' },
    store: folder.store,
    files,
    openStorage: (bucket: string) => {
      opened.push(bucket);
      return target;
    },
    getKey: () => TEST_KEY,
    runBy: 'tester',
  });
  return { folder, notifier, files, deps, restoreDeps };
}

describe('backupFiles', () => {
  it('backs up every key with the sha256 of its bytes, encrypted, and records kind `file storage`', async () => {
    const { folder, files, deps } = setup();
    const live = await liveBucket();
    const result = await backupFiles(deps(live));
    const { manifest, record } = result;
    expect(manifest.objects.map((o) => o.key)).toEqual(live.keys());
    for (const o of manifest.objects) {
      const body = (await live.get(o.key))?.body as Buffer;
      expect(o).toMatchObject({ sha256: sha256(body), size: body.length, contentType: (await live.get(o.key))?.contentType });
      expect(readFileSync(files.objects.locate(objectFileName(o.sha256))).includes(body)).toBe(false);
    }
    // Four keys, three distinct contents.
    expect(result.written).toBe(3);
    expect((await files.objects.list()).length).toBe(3);
    expect(manifest.totalBytes).toBe(photo.length * 2 + thumb.length + pdf.length);
    expect(record).toMatchObject({ kind: 'file storage', status: 'complete', environment: 'development', encrypted: true });
    expect(record.location).toContain(`${folder.dir}/files/`);
    expect(await listBackups(folder.store, { kind: 'file storage', status: 'complete' })).toHaveLength(1);
    expect(JSON.parse(readFileSync(files.manifests.locate(`${record.id}.manifest.json`), 'utf8'))).toEqual(manifest);
  });

  it('writes nothing new on a second run of the same files', async () => {
    const { deps } = setup();
    const live = await liveBucket();
    await backupFiles(deps(live));
    expect((await backupFiles(deps(live))).written).toBe(0);
  });

  it('leaves the live bucket untouched', async () => {
    const { deps } = setup();
    const live = await liveBucket();
    const before = JSON.stringify([...live.objects.entries()]);
    await backupFiles(deps(live));
    expect(JSON.stringify([...live.objects.entries()])).toBe(before);
  });

  it('skips a key that vanished between the listing and the read', async () => {
    const { deps } = setup();
    const live = await liveBucket();
    const original = live.get.bind(live);
    live.get = async (key) => {
      if (key === 'files/bbbb') {
        live.objects.delete(key);
        return null;
      }
      return original(key);
    };
    const result = await backupFiles(deps(live));
    expect(result.vanished).toBe(1);
    expect(result.manifest.objects.map((o) => o.key)).not.toContain('files/bbbb');
  });

  it('on failure writes a failed record and alerts with kind `file storage`, and rethrows', async () => {
    const { folder, notifier, deps } = setup();
    const live = await liveBucket();
    live.failNext('get');
    await expect(backupFiles(deps(live))).rejects.toThrow('memory storage: get failed');
    const [run] = await listBackups(folder.store, { kind: 'file storage' });
    expect(run).toMatchObject({ status: 'failed', environment: 'development' });
    expect(run.error).toContain('get failed');
    expect(notifier.alerts).toHaveLength(1);
    expect(notifier.alerts[0]).toMatchObject({ kind: 'file storage', environment: 'development' });
    expect(notifier.alerts[0].error).toContain('get failed');
  });

  it('a missing key is a failed, alerted run too', async () => {
    const { folder, notifier, deps } = setup();
    await expect(
      backupFiles(
        deps(await liveBucket(), {
          getKey: () => {
            throw new Error('BACKUP_ENCRYPTION_KEY is not set');
          },
        }),
      ),
    ).rejects.toThrow('BACKUP_ENCRYPTION_KEY');
    expect((await listBackups(folder.store, { kind: 'file storage' }))[0].status).toBe('failed');
    expect(notifier.alerts[0].kind).toBe('file storage');
  });
});

describe('restoreFiles', () => {
  it('restores keys, bytes and content types; a file deleted from live after the run comes back from the older run', async () => {
    const { folder, deps, restoreDeps } = setup();
    const live = await liveBucket();
    const first = await backupFiles(deps(live, { now: () => new Date('2026-06-01T10:00:00Z') }));
    await live.delete('files/bbbb');
    const second = await backupFiles(deps(live, { now: () => new Date('2026-06-02T10:00:00Z') }));
    expect(second.manifest.objects.map((o) => o.key)).not.toContain('files/bbbb');

    const restored = new ListableMemory();
    const opened: string[] = [];
    const result = await restoreFiles(restoreDeps(restored, opened), { backup: first.record.id, bucket: 'goldsmith-restore-c' });
    expect(opened).toEqual(['goldsmith-restore-c']);
    expect(result).toMatchObject({ backup: first.record.id, bucket: 'goldsmith-restore-c', objects: 4 });
    expect(restored.keys()).toEqual(['files/aaaa', 'files/aaaa-thumb', 'files/bbbb', 'files/cccc']);
    expect(restored.objects.get('files/bbbb')).toEqual({ body: pdf, contentType: 'application/pdf' });
    expect(restored.objects.get('files/aaaa-thumb')?.contentType).toBe('image/webp');
    const log = JSON.parse((await folder.store.readText(RESTORES_FILE))?.trim() as string);
    expect(log).toMatchObject({ backup: first.record.id, target: 'goldsmith-restore-c', runBy: 'tester', result: 'ok' });

    // `latest` is the newer run, which no longer lists the deleted file.
    const newer = new ListableMemory();
    await restoreFiles(restoreDeps(newer), { backup: 'latest', bucket: 'goldsmith-restore-c-2' });
    expect(newer.keys()).not.toContain('files/bbbb');
  });

  it('refuses every bucket that is not a lane throwaway bucket before opening any storage', async () => {
    const { deps, restoreDeps } = setup();
    const run = await backupFiles(deps(await liveBucket()));
    const opened: string[] = [];
    for (const bucket of ['goldsmith-files-c', 'goldsmith-files', 'goldsmith-files-a', 'goldsmith-restore', 'goldsmith-restore-a', 'goldsmith-restore-c-x_y', 'other']) {
      await expect(restoreFiles(restoreDeps(new ListableMemory(), opened), { backup: run.record.id, bucket })).rejects.toBeInstanceOf(OpsGuardError);
    }
    await expect(
      restoreFiles({ ...restoreDeps(new ListableMemory(), opened), env: { appEnv: 'production', lane: 'c' } }, { backup: run.record.id, bucket: 'goldsmith-restore-c' }),
    ).rejects.toBeInstanceOf(OpsGuardError);
    expect(opened).toEqual([]);
  });

  it('writes nothing for a wrong key or a damaged object and records the failure', async () => {
    const { folder, files, deps, restoreDeps } = setup();
    const run = await backupFiles(deps(await liveBucket()));
    const target = new ListableMemory();
    let ensured = false;
    target.ensureBucket = async () => {
      ensured = true;
    };
    await expect(
      restoreFiles({ ...restoreDeps(target), getKey: () => Buffer.alloc(32, 1) }, { backup: run.record.id, bucket: 'goldsmith-restore-c' }),
    ).rejects.toThrow();
    // Damage one stored object: one flipped byte.
    const entry = run.manifest.objects[0];
    const path = files.objects.locate(objectFileName(entry.sha256));
    const bytes = readFileSync(path);
    bytes[bytes.length - 20] ^= 0xff;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, bytes);
    await expect(restoreFiles(restoreDeps(target), { backup: run.record.id, bucket: 'goldsmith-restore-c' })).rejects.toThrow();
    expect(ensured).toBe(false);
    expect(target.keys()).toEqual([]);
    const lines = (await folder.store.readText(RESTORES_FILE))?.trim().split('\n') ?? [];
    expect(lines.map((l) => JSON.parse(l).result)).toEqual(['failed', 'failed']);
  });

  it('rejects an unknown id, a database backup id and an empty folder', async () => {
    const { files, folder, restoreDeps } = setup();
    await expect(loadFilesManifest(folder.store, files, 'latest')).rejects.toThrow('run backup:files first');
    await expect(loadFilesManifest(folder.store, files, 'db-20260518T101530Z-ab12')).rejects.toThrow('not a file storage backup id');
    await expect(restoreFiles(restoreDeps(new ListableMemory()), { backup: 'files-20260518T101530Z-ab12', bucket: 'goldsmith-restore-c' })).rejects.toThrow('no manifest');
  });
});

describeDb('checkFileReferences', () => {
  let url: string;
  let drop: () => Promise<void>;
  const live = new ListableMemory();
  beforeAll(async () => {
    const db = await createTempDatabase();
    url = db.url;
    drop = db.drop;
    const pool = createPool(url, 1);
    try {
      await migrate(pool, new URL('../../migrations/', import.meta.url));
      await seedPrototype(pool, { appEnv: 'development', storage: live, log: () => {} });
    } finally {
      await pool.end();
    }
  }, 120000);
  afterAll(async () => {
    await drop();
  });

  async function restoredBucket(): Promise<{ bucket: ListableMemory; manifest: FilesManifest }> {
    const { deps, restoreDeps } = setup();
    const run = await backupFiles(deps(live));
    const bucket = new ListableMemory();
    await restoreFiles(restoreDeps(bucket), { backup: run.record.id, bucket: 'goldsmith-restore-c' });
    return { bucket, manifest: run.manifest };
  }

  it('reports zero missing for a complete restore (original, thumbnail and display copies)', async () => {
    expect(live.keys().length).toBeGreaterThan(0);
    const { bucket } = await restoredBucket();
    const result = await checkFileReferences({ targetUrl: url, storage: bucket });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.files).toBeGreaterThan(0);
    expect(result.keys).toBeGreaterThanOrEqual(result.files);
  });

  it('names the code of a file whose object is missing from the restored bucket', async () => {
    const { bucket } = await restoredBucket();
    const pool = createPool(url, 1);
    let code: string;
    let key: string;
    try {
      const row = (await pool.query<{ code: string; storage_key: string }>('select code, storage_key from stored_files where removed_at is null order by code limit 1')).rows[0];
      ({ code, storage_key: key } = row);
    } finally {
      await pool.end();
    }
    await bucket.delete(key);
    const result = await checkFileReferences({ targetUrl: url, storage: bucket });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([{ code, missing: ['storage_key'] }]);
  });

  it('ignores a removed file whose objects are gone', async () => {
    const { bucket } = await restoredBucket();
    const pool = createPool(url, 1);
    try {
      const row = (await pool.query<{ code: string; storage_key: string }>('select code, storage_key from stored_files where removed_at is null order by code limit 1')).rows[0];
      await bucket.delete(row.storage_key);
      await pool.query('update stored_files set removed_at = now() where code = $1', [row.code]);
    } finally {
      await pool.end();
    }
    expect((await checkFileReferences({ targetUrl: url, storage: bucket })).ok).toBe(true);
  });
});

(storageEnabled ? describe : describe.skip)('file backup against a real S3 store', () => {
  const settings = readStorageEnv();
  const prefix = `files/ops-test-${randomBytes(4).toString('hex')}/`;
  const restoreBucket = `goldsmith-restore-c-${randomBytes(4).toString('hex')}`;
  const live = testStorage() as S3Storage;
  const bodies = new Map([
    [`${prefix}one`, { body: randomBytes(2048), contentType: 'image/jpeg' }],
    [`${prefix}two`, { body: randomBytes(4096), contentType: 'image/png' }],
    [`${prefix}pdf`, { body: Buffer.from('%PDF-1.4 real'), contentType: 'application/pdf' }],
  ]);
  // Other test files share the bucket, so the backup sees only this test's keys.
  const scoped: ListableStorage = {
    put: (k, b, c) => live.put(k, b, c),
    get: (k) => live.get(k),
    delete: (k) => live.delete(k),
    ensureBucket: () => live.ensureBucket(),
    listKeys: async () => (await live.listKeys()).filter((k) => k.startsWith(prefix)),
  };
  const restored = new S3Storage({ ...(settings as NonNullable<typeof settings>), bucket: restoreBucket });
  const admin = new S3Client({
    region: settings?.region ?? 'us-east-1',
    endpoint: settings?.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(settings?.accessKeyId && settings.secretAccessKey ? { credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey } } : {}),
  });

  beforeAll(async () => {
    await live.ensureBucket();
    for (const [key, o] of bodies) await live.put(key, o.body, o.contentType);
  });
  afterAll(async () => {
    for (const key of bodies.keys()) await live.delete(key);
    for (const key of await restored.listKeys().catch(() => [])) await restored.delete(key);
    await admin.send(new DeleteBucketCommand({ Bucket: restoreBucket })).catch(() => {});
    restored.close();
    live.close();
    admin.destroy();
  });

  it('backs up the bucket, restores into a guard-valid throwaway bucket, and the bytes match', async () => {
    const { folder, deps, restoreDeps } = setup();
    const run = await backupFiles(deps(scoped));
    expect(run.manifest.objects.map((o) => o.key)).toEqual([...bodies.keys()].sort());
    await live.delete(`${prefix}two`);
    await admin.send(new CreateBucketCommand({ Bucket: restoreBucket })).catch(() => {});
    const result = await restoreFiles(restoreDeps(restored), { backup: run.record.id, bucket: restoreBucket });
    expect(result.objects).toBe(3);
    expect((await restored.listKeys()).sort()).toEqual([...bodies.keys()].sort());
    for (const [key, o] of bodies) {
      const got = await restored.get(key);
      expect(got?.body.equals(o.body)).toBe(true);
      expect(got?.contentType).toBe(o.contentType);
    }
    expect((await listBackups(folder.store, { kind: 'file storage', status: 'complete' }))[0].id).toBe(run.record.id);
  }, 60000);
});
