/**
 * File bytes over HTTP (EP-09). Not contract operations: an upload is a raw body, and a link is
 * fetched by an <img src> with no session.
 *
 * `POST /api/files?name=…&purpose=image|po[&ownerType&ownerId&role]` (Create File, EP-09-S2, S3),
 * in the operation router's order:
 *   (b) resolve the session, (c) rate limit as `createFile`, (d) none -> unauthenticated,
 *   (e) validate the query and the Idempotency-Key header, role check (file-roles.ts),
 *   Content-Length required and over the limit -> refused before any byte is read (413),
 *   read the body counting bytes (stopped at the limit; a body that ends short -> cut off),
 *   type from the first bytes (415), write the objects (store-file.ts), then
 *   (f) one transaction: session confirm, idempotency claim (a replay answers the stored id and
 *   the objects just written are deleted, S2 AC5), insert the StoredFile row and, with a target
 *   (`ownerType`, `ownerId`, `role`, e.g. a karigar's bench photo on an own job, S10), attach it
 *   in the same transaction (attachments.ts).
 *   A failed transaction deletes the objects again (S1 AC4). Answers `{ ok: true, id }`.
 *
 * `GET /api/files/:fileId/:size?exp&sig` (EP-09-S5): a signed link (file-links.ts). Any refusal
 * (bad or expired signature, another size, removed file) is the same 404 not_found.
 */
import { type Actor, uploadQuery } from '@goldsmith/shared';
import express, { type Request, type Router } from 'express';
import type pg from 'pg';
import type { InstallationShop } from '../auth/installation-shop.js';
import { loadShopContext } from '../db/shop-context.js';
import {
  type ErrorLog,
  NotFoundError,
  RateLimitedError,
  UnauthenticatedError,
  ValidationError,
} from '../pipeline/api-errors.js';
import type { RateLimiter } from '../pipeline/hooks.js';
import { claimKey, completeKey } from '../pipeline/idempotency.js';
import { clientAddressOf, IDEMPOTENCY_HEADER, IDEMPOTENCY_KEY } from '../pipeline/operation-router.js';
import { runInTransaction } from '../pipeline/operation-transaction.js';
import type { Clock } from '../pipeline/server-clock.js';
import type { SessionResolver } from '../pipeline/session-resolver.js';
import { parseInput } from '../pipeline/validate-input.js';
import { attach, checkOwnerRole } from './attachments.js';
import { SNIFF_BYTES } from './content-type-sniff.js';
import { fileByCode, type FileRow } from './file-access.js';
import {
  checkDeclaredSize,
  checkType,
  FileCutOffError,
  type FileLimits,
  FileTooLargeError,
} from './file-limits.js';
import { linkKey, verifyLink } from './file-links.js';
import { checkUpload, type FileTarget } from './file-roles.js';
import type { ObjectStorage } from './object-storage.js';
import { discardObjects, type FileLog, insertFileRow, storeFile } from './store-file.js';

/** What the app needs to serve files; set only when object storage is configured. */
export interface FilesDeps {
  storage: ObjectStorage;
  limits: FileLimits;
  /** SESSION_SECRET; links are signed with a key derived from it. */
  linkSecret: string;
  /** Seconds an issued link stays valid. */
  ttlSeconds: number;
  log: FileLog;
}

export interface FilesRouterDeps {
  pool?: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  rateLimiter: RateLimiter;
  /** Unexpected errors (the app's error log). */
  errorLog: ErrorLog;
  files: FilesDeps;
  idempotencyRetentionHours: number;
  /** The shop a link is served from (links carry no session). */
  installationShop: InstallationShop;
}

/** The operation name the rate limiter and idempotency records see for an upload. */
export const CREATE_FILE = 'createFile';


function idempotencyKeyOf(req: Request): string | undefined {
  const key = req.get(IDEMPOTENCY_HEADER);
  if (key === undefined) return undefined;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw new ValidationError('Idempotency-Key', 'Idempotency-Key must be 1 to 200 printable characters.');
  }
  return key;
}

/**
 * The whole body, or a refusal: no Content-Length (411), declared over the limit (413, before any
 * byte is read), more bytes than the limit (413, reading stops), or a body that ends before the
 * declared size (cut off).
 */
export async function readBody(req: Request, limits: FileLimits): Promise<Buffer> {
  const header = req.get('content-length');
  if (header === undefined || !/^[0-9]+$/.test(header)) {
    throw new ValidationError('Content-Length', 'Send the file size in the Content-Length header.', 411);
  }
  const declared = Number(header);
  checkDeclaredSize(declared, limits);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > limits.maxBytes) throw new FileTooLargeError(limits.maxBytes);
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof FileTooLargeError) throw err;
    throw new FileCutOffError();
  }
  if (!req.complete || total !== declared) throw new FileCutOffError();
  return Buffer.concat(chunks, total);
}

/** The key of `size` for a file: the original when no copy was made (PDF, resize failed). */
function objectKeyOf(file: FileRow, size: string): { key: string; contentType: string } {
  if (size === 'thumbnail' && file.thumbnail_key) return { key: file.thumbnail_key, contentType: 'image/jpeg' };
  if (size === 'display' && file.display_key) return { key: file.display_key, contentType: 'image/jpeg' };
  return { key: file.storage_key, contentType: file.content_type };
}

export function createFilesRouter(deps: FilesRouterDeps): Router {
  const { pool, sessions, clock, rateLimiter, errorLog, files, idempotencyRetentionHours, installationShop } = deps;
  const key = linkKey(files.linkSecret);
  const router = express.Router();

  router.post('/api/files', async (req, res, next) => {
    let bodyRead = false;
    try {
      const session = await sessions.resolve(req);
      const limit = await rateLimiter({
        operation: CREATE_FILE,
        userId: session?.userId ?? null,
        clientAddress: clientAddressOf(req),
      });
      if (!limit.allowed) throw new RateLimitedError();
      if (!session) throw new UnauthenticatedError();
      const query = parseInput(uploadQuery, req.query);
      const idempotencyKey = idempotencyKeyOf(req);
      if (!pool) throw new Error('No database is configured (DATABASE_URL is not set)');
      const actor: Actor = { id: session.userId, name: session.name, role: session.role };
      const target: FileTarget | undefined =
        query.ownerType && query.ownerId && query.role
          ? { ownerType: query.ownerType, ownerId: query.ownerId, role: query.role }
          : undefined;
      const shop = await loadShopContext(pool, session.shopId);
      await checkUpload(pool, shop, actor, target);
      if (target) checkOwnerRole(target.ownerType, target.role);

      const bytes = await readBody(req, files.limits);
      bodyRead = true;
      const contentType = checkType(bytes.subarray(0, SNIFF_BYTES), query.purpose);

      const id = await storeFile(files, bytes, contentType, async (prepared) => {
        const out = await runInTransaction(
          pool,
          async (tx) => {
            const at = clock.now();
            if (sessions.confirm && !(await sessions.confirm(tx.client, session, at))) {
              throw new UnauthenticatedError();
            }
            let claimId: string | undefined;
            if (idempotencyKey !== undefined) {
              const claim = await claimKey(tx, {
                key: idempotencyKey,
                operation: CREATE_FILE,
                userId: actor.id,
                shopId: shop.shopId,
                input: { sha256: prepared.sha256, ...query },
                now: at,
                retentionHours: idempotencyRetentionHours,
              });
              if ('replay' in claim) return { id: claim.replay, replayed: true };
              claimId = claim.claimId;
            }
            const file = await insertFileRow(
              tx,
              shop,
              prepared,
              {
                originalName: query.name,
                // A file uploaded as a PO, or straight onto a lead as one, is a PO file (BR-09-3).
                retentionClass: query.purpose === 'po' || target?.role === 'po' ? 'po' : 'standard',
                uploadedBy: { id: actor.id, name: actor.name },
                at,
              },
              files.log,
            );
            if (target) await attach(tx, shop, actor, at, { file, ...target });
            if (claimId !== undefined) await completeKey(tx, claimId, file.code);
            return { id: file.code, replayed: false };
          },
          errorLog,
        );
        if (out.replayed) await discardObjects(files, prepared);
        return out.id;
      });
      res.json({ ok: true, id });
    } catch (err) {
      // A refusal before the body was read: close the connection instead of reading the rest.
      if (!bodyRead) res.set('Connection', 'close');
      next(err);
    }
  });

  router.get('/api/files/:fileId/:size', async (req, res, next) => {
    try {
      const limit = await rateLimiter({ operation: 'readFile', userId: null, clientAddress: clientAddressOf(req) });
      if (!limit.allowed) throw new RateLimitedError();
      const { fileId, size } = req.params;
      const refused = new NotFoundError('File', fileId);
      const secondsLeft = verifyLink(key, fileId, size, req.query.exp, req.query.sig, clock.now());
      if (secondsLeft === null) throw refused;
      if (!pool) throw new Error('No database is configured (DATABASE_URL is not set)');
      const shopId = await installationShop(pool);
      if (shopId === null) throw refused;
      const file = await fileByCode(pool, shopId, fileId);
      if (!file || file.removed_at !== null) throw refused;
      const object = objectKeyOf(file, size);
      const stored = await files.storage.get(object.key);
      if (!stored) {
        files.log(`[files] object missing for ${file.code} ${size}`);
        throw refused;
      }
      res.set({
        'Content-Type': object.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': `private, max-age=${secondsLeft}`,
      });
      res.send(stored.body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

