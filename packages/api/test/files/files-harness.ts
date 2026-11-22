/**
 * The real app with file storage on port 0 (modeled on test/services/mark-lead-lost.test.ts):
 * shared contract, production handlers plus the file handlers, the cookie session resolver, a
 * movable server clock and in-memory storage (or the S3 test bucket with `storage: 's3'`).
 * Each harness has its own shop with Rajesh Verma (Staff), Sanjay Seth (Owner) and Lakshmi Devi
 * (Karigar); the shop is the installation shop that serves links.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { contract, type FileOwnerType, type FileRole } from '@goldsmith/shared';
import type pg from 'pg';
import { createApp } from '../../src/app.js';
import { createSessionResolver } from '../../src/auth/session-store.js';
import { loadConfig } from '../../src/config.js';
import { createFileHandlers } from '../../src/files/file-handlers.js';
import type { FilesDeps } from '../../src/files/files-router.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import type { ObjectStorage } from '../../src/files/object-storage.js';
import type { S3Storage } from '../../src/files/s3-storage.js';
import { handlers } from '../../src/services/index.js';
import { addKarigar, newShop, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW, sessionCookie } from '../support/api-harness.js';
import { type MutableClock, mutableClock } from '../support/test-clock.js';
import { testStorage } from './storage-test-helpers.js';

export const SECRET = 'test-only-session-secret-0123456789abcdef';

export interface HarnessUser {
  id: string;
  name: string;
  session: string;
}

export interface FilesHarnessOptions {
  /** Defaults to memory. */
  storage?: 'memory' | 's3';
  /** Defaults to the config default (10 MB). */
  maxBytes?: number;
  /** Defaults to the config default (900 s). */
  ttlSeconds?: number;
}

export interface Response {
  status: number;
  body: Record<string, unknown>;
}

export interface UploadOptions {
  session?: string;
  idempotencyKey?: string;
}

export interface FilesHarness {
  pool: pg.Pool;
  shop: TestShop;
  base: string;
  storage: ObjectStorage;
  clock: MutableClock;
  /** Info lines of the file service. */
  lines: string[];
  /** Unexpected errors the app logged. */
  logged: Array<{ message: string; err: unknown }>;
  staff: HarnessUser;
  owner: HarnessUser;
  karigar: HarnessUser & { karigarId: string };
  /** POST /api/files?<query> with `bytes` as the raw body. */
  upload(bytes: Buffer, query: Record<string, string>, opts?: UploadOptions): Promise<Response>;
  /** POST /api/ops/<op> as `session`. */
  call(op: string, body: unknown, session?: string): Promise<Response>;
  /** Signed links for files, as `session`; fails the test unless the call succeeds. */
  links(session: string, files: Array<{ fileId: string; size: string }>): Promise<Array<{ url: string; expiresAt: string }>>;
  /** GET a link path. */
  get(path: string): Promise<globalThis.Response>;
  /** Every key in the store (sorted). */
  keys(): Promise<string[]>;
  /** Stored file rows of the harness shop. */
  fileCount(): Promise<number>;
  /** Insert a karigar job for `karigarId` (default: Lakshmi's); returns its id. */
  addJob(code: string, karigarId?: string): Promise<string>;
  /** Insert an order copy for job `jobId`; returns its id. */
  addOrderCopy(code: string, jobId: string): Promise<string>;
  /** Insert a lead; returns its id. */
  addLead(code: string): Promise<string>;
  /** Attach a file (by code) directly in the database, without the createAttachment role checks or audit. */
  attach(fileCode: string, ownerType: FileOwnerType, ownerId: string, role: FileRole): Promise<void>;
  close(): Promise<void>;
}

const OWNER_COLUMN: Record<FileOwnerType, string> = {
  piece: 'piece_id',
  order_copy: 'order_copy_id',
  job: 'job_id',
  lead: 'lead_id',
};

export async function startFilesHarness(options: FilesHarnessOptions = {}): Promise<FilesHarness> {
  const pool = testPool(10);
  const shop = await newShop(pool, 'Files shop');
  const user = async (name: string, role: 'staff' | 'owner' | 'karigar'): Promise<HarnessUser> => {
    const id = await newUser(pool, shop, { name, role });
    return { id, name, session: await newSession(pool, shop, id) };
  };
  const staff = await user('Rajesh Verma', 'staff');
  const owner = await user('Sanjay Seth', 'owner');
  const lakshmi = await user('Lakshmi Devi', 'karigar');
  const karigarId = (await pool.query<{ karigar_id: string }>('select karigar_id from users where id = $1', [lakshmi.id]))
    .rows[0].karigar_id;

  const storage: ObjectStorage = options.storage === 's3' ? (testStorage() as S3Storage) : new MemoryStorage();
  if (options.storage === 's3' && !storage) throw new Error('STORAGE_ENDPOINT is not set');
  const clock = mutableClock(SERVER_NOW);
  const lines: string[] = [];
  const logged: FilesHarness['logged'] = [];
  const config = loadConfig({
    APP_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: SECRET,
    API_PORT: '0',
    ...(options.maxBytes === undefined ? {} : { FILE_MAX_BYTES: String(options.maxBytes) }),
    ...(options.ttlSeconds === undefined ? {} : { FILE_LINK_TTL_SECONDS: String(options.ttlSeconds) }),
  });
  const files: FilesDeps = {
    storage,
    limits: { maxBytes: config.fileMaxBytes },
    linkSecret: config.sessionSecret,
    ttlSeconds: config.fileLinkTtlSeconds,
    log: (line) => lines.push(line),
  };
  const app = createApp(config, {
    pool,
    sessions: createSessionResolver({ pool, clock, idleMinutes: config.sessionIdleMinutes }),
    clock,
    contract,
    handlers: { ...handlers, ...createFileHandlers(files) },
    files,
    log: (message, err) => logged.push({ message, err }),
    auth: { installationShop: async () => shop.shopId },
  });
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const call: FilesHarness['call'] = async (op, body, session) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (session !== undefined) headers.cookie = sessionCookie(session);
    const res = await fetch(`${base}/api/ops/${op}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  return {
    pool,
    shop,
    base,
    storage,
    clock,
    lines,
    logged,
    staff,
    owner,
    karigar: { ...lakshmi, karigarId },
    async upload(bytes, query, opts = {}) {
      const headers: Record<string, string> = { 'content-type': 'application/octet-stream' };
      if (opts.session !== undefined) headers.cookie = sessionCookie(opts.session);
      if (opts.idempotencyKey !== undefined) headers['idempotency-key'] = opts.idempotencyKey;
      const res = await fetch(`${base}/api/files?${new URLSearchParams(query)}`, { method: 'POST', headers, body: bytes });
      return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    },
    call,
    async links(session, list) {
      const res = await call('readFileLinks', { files: list }, session);
      if (res.status !== 200) throw new Error(`readFileLinks answered ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.links as Array<{ url: string; expiresAt: string }>;
    },
    get: (path) => fetch(`${base}${path}`),
    async keys() {
      return storage instanceof MemoryStorage ? storage.keys() : (await (storage as S3Storage).listKeys()).sort();
    },
    async fileCount() {
      return (
        await pool.query<{ n: number }>('select count(*)::int as n from stored_files where shop_id = $1', [shop.shopId])
      ).rows[0].n;
    },
    async addJob(code, karigar = karigarId) {
      const { rows } = await pool.query<{ id: string }>(
        `insert into karigar_jobs (shop_id, code, karigar_id, status, target_gross_units, target_net_units,
                                   tolerance_units, gold_issued_units)
         values ($1, $2, $3, 'on_bench', 100000, 90000, 1000, 95000) returning id`,
        [shop.shopId, code, karigar],
      );
      return rows[0].id;
    },
    async addOrderCopy(code, jobId) {
      const { rows } = await pool.query<{ id: string }>(
        `insert into order_copies (shop_id, code, job_id, karigar_id, target_gross_units, target_net_units,
                                   tolerance_units, gold_issued_units)
         select $1, $2, j.id, j.karigar_id, 100000, 90000, 1000, 95000 from karigar_jobs j where j.id = $3
         returning id`,
        [shop.shopId, code, jobId],
      );
      return rows[0].id;
    },
    async addLead(code) {
      const { rows } = await pool.query<{ id: string }>(
        `insert into leads (shop_id, code, source, state) values ($1, $2, 'counter', 'opened') returning id`,
        [shop.shopId, code],
      );
      return rows[0].id;
    },
    async attach(fileCode, ownerType, ownerId, role) {
      const column = OWNER_COLUMN[ownerType];
      await pool.query(
        `insert into attachments (shop_id, code, file_id, owner_type, ${column}, role, position, attached_by_name, attached_at)
         select f.shop_id, 'AT-T-' || gen_random_uuid(), f.id, $3, $4, $5,
                coalesce((select max(position) from attachments where ${column} = $4 and role = $5), 0) + 1,
                'Test', now()
           from stored_files f where f.shop_id = $1 and f.code = $2`,
        [shop.shopId, fileCode, ownerType, ownerId, role],
      );
    },
    async close() {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
      if (options.storage === 's3') (storage as S3Storage).close();
      await pool.end();
    },
  };
}

/** A karigar of the harness shop other than Lakshmi (for "another karigar's job"). */
export const otherKarigar = (h: FilesHarness, code = 'KG-OTHER'): Promise<string> => addKarigar(h.pool, h.shop, code);
