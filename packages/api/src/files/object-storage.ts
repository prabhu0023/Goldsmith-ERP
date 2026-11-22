/**
 * Where file bytes live (EP-09). Every part of the api talks to storage through this interface,
 * so the provider picked in D1a only needs one adapter: s3-storage.ts for any S3-compatible store
 * (local SeaweedFS, AWS S3, …), memory-storage.ts for tests.
 *
 * Keys are opaque (`files/<random hex>`), never a file name or a person. The bucket is private:
 * bytes reach a browser only through the api's signed links.
 */
export interface StoredObject {
  body: Buffer;
  contentType: string;
}
export interface ObjectStorage {
  /** Write `body` under `key`, replacing any object already there. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The object under `key`, or null when there is none. */
  get(key: string): Promise<StoredObject | null>;
  /** Remove the object under `key`. Succeeds when there is none. */
  delete(key: string): Promise<void>;
  /** Create the bucket when it does not exist yet. */
  ensureBucket(): Promise<void>;
}
