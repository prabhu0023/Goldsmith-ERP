/**
 * ObjectStorage over any S3-compatible store with @aws-sdk/client-s3. With an endpoint (local
 * SeaweedFS at http://localhost:8333, or a provider's own URL) requests use path-style addressing
 * (`<endpoint>/<bucket>/<key>`); without one the SDK's AWS default applies. Credentials come from
 * STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY, else the SDK's default chain.
 */
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ObjectStorage, StoredObject } from './object-storage.js';
export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}
interface S3ErrorShape {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}
const isMissing = (e: unknown): boolean => {
  const err = e as S3ErrorShape;
  return err?.name === 'NoSuchKey' || err?.name === 'NotFound' || err?.name === 'NoSuchBucket' || err?.$metadata?.httpStatusCode === 404;
};
export class S3Storage implements ObjectStorage {
  readonly bucket: string;
  readonly endpoint?: string;
  private readonly client: S3Client;
  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.endpoint = options.endpoint;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint
        ? {
            endpoint: options.endpoint,
            forcePathStyle: true,
            // S3-compatible stores do not all accept the SDK's newer default checksum headers.
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
          }
        : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    });
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }
  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      const bytes = await res.Body.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if (isMissing(e)) return null;
      throw e;
    }
  }
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
  }
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (e) {
      if (!isMissing(e)) throw e;
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      // Another process created it in the meantime.
      const name = (e as S3ErrorShape).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw e;
    }
  }
  /** Every key in the bucket (tests and tooling only; a production bucket is never listed). */
  async listKeys(): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }
  /** Stop the client's open connections (CLI and tests). */
  close(): void {
    this.client.destroy();
  }
}
