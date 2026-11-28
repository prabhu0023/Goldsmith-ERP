/**
 * Where backups are kept (EP-38-S4). `BackupStore` is the provider-neutral interface; today's
 * implementation is a host folder (mode 0700, files 0600) outside the Docker volumes that hold
 * the live database and bucket. On AWS the same interface is a KMS-encrypted S3 bucket in a
 * separate account. A name is a single file name (letters, digits, `.`, `_`, `-`): it can never
 * point outside the folder.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export interface BackupStore {
  /** Human-readable location of the folder or bucket. */
  readonly location: string;
  /** Write a stream under `name`; the name appears only when the whole stream arrived. Returns its size. */
  writeStream(name: string, source: Readable): Promise<number>;
  writeText(name: string, text: string): Promise<void>;
  /** Append one line (a JSON record) to `name`, creating it when missing. */
  appendLine(name: string, line: string): Promise<void>;
  /** The whole text of `name`, or undefined when it does not exist. */
  readText(name: string): Promise<string | undefined>;
  readStream(name: string): Readable;
  /** Absolute location of `name` (shown in listings and used to open the file). */
  locate(name: string): string;
  exists(name: string): Promise<boolean>;
  list(): Promise<string[]>;
  /** Delete `name`; false when it was not there. */
  remove(name: string): Promise<boolean>;
}
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function assertName(name: string): void {
  if (!NAME.test(name) || name.includes('..')) throw new Error(`Invalid backup file name ${JSON.stringify(name)}`);
}
const isMissing = (e: unknown): boolean => (e as { code?: string }).code === 'ENOENT';
export class LocalFolderStore implements BackupStore {
  constructor(readonly dir: string) {}
  get location(): string {
    return this.dir;
  }
  locate(name: string): string {
    assertName(name);
    return join(this.dir, name);
  }
  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await chmod(this.dir, 0o700);
  }
  async writeStream(name: string, source: Readable): Promise<number> {
    const target = this.locate(name);
    const partial = `${target}.partial`;
    await this.ensureDir();
    try {
      await pipeline(source, createWriteStream(partial, { mode: 0o600 }));
      await chmod(partial, 0o600);
      await rename(partial, target);
    } catch (e) {
      await rm(partial, { force: true });
      throw e;
    }
    return (await stat(target)).size;
  }
  async writeText(name: string, text: string): Promise<void> {
    const target = this.locate(name);
    await this.ensureDir();
    await writeFile(`${target}.partial`, text, { mode: 0o600 });
    await rename(`${target}.partial`, target);
    await chmod(target, 0o600);
  }
  async appendLine(name: string, line: string): Promise<void> {
    const target = this.locate(name);
    await this.ensureDir();
    await appendFile(target, `${line}\n`, { mode: 0o600 });
    await chmod(target, 0o600);
  }
  async readText(name: string): Promise<string | undefined> {
    try {
      return await readFile(this.locate(name), 'utf8');
    } catch (e) {
      if (isMissing(e)) return undefined;
      throw e;
    }
  }
  readStream(name: string): Readable {
    return createReadStream(this.locate(name));
  }
  async exists(name: string): Promise<boolean> {
    try {
      await stat(this.locate(name));
      return true;
    } catch (e) {
      if (isMissing(e)) return false;
      throw e;
    }
  }
  async list(): Promise<string[]> {
    try {
      return (await readdir(this.dir)).sort();
    } catch (e) {
      if (isMissing(e)) return [];
      throw e;
    }
  }
  async remove(name: string): Promise<boolean> {
    const target = this.locate(name);
    if (!(await this.exists(name))) return false;
    await rm(target, { force: true });
    return true;
  }
}
