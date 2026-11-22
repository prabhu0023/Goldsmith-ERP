/**
 * ObjectStorage kept in a Map, for tests. `failNext(op)` makes the next call of that operation
 * throw, and keys added to `failKeys` make every put or delete of them throw, so tests can show
 * what happens when the store fails part-way.
 */
import type { ObjectStorage, StoredObject } from './object-storage.js';
export type StorageOp = 'put' | 'get' | 'delete' | 'ensureBucket';
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  /** put or delete of any of these keys throws. */
  readonly failKeys = new Set<string>();
  private readonly failing = new Set<StorageOp>();
  /** The next call of `op` throws (once). */
  failNext(op: StorageOp): void {
    this.failing.add(op);
  }
  private check(op: StorageOp, key?: string): void {
    if (this.failing.delete(op)) throw new Error(`memory storage: ${op} failed (failNext)`);
    if (key !== undefined && (op === 'put' || op === 'delete') && this.failKeys.has(key)) {
      throw new Error(`memory storage: ${op} failed (failKeys)`);
    }
  }
  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.check('put', key);
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }
  async get(key: string): Promise<StoredObject | null> {
    this.check('get', key);
    const o = this.objects.get(key);
    return o ? { body: Buffer.from(o.body), contentType: o.contentType } : null;
  }
  async delete(key: string): Promise<void> {
    this.check('delete', key);
    this.objects.delete(key);
  }
  async ensureBucket(): Promise<void> {
    this.check('ensureBucket');
  }
  /** Stored keys, sorted. */
  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
