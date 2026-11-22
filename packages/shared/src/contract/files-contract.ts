/**
 * Files (EP-09). Bytes are uploaded with `POST /api/files?<uploadQuery>` (raw body, not JSON) and
 * read through signed links from `readFileLinks`; the operations below are served by the generic
 * operation router. Ids are human codes: files `FILE-2026-00001`, attachments `AT-2026-00001`,
 * owners by their own code (piece tag, order copy, job `MO-…`, lead `LD-…`).
 */
import { z } from 'zod';
import { createdResult, okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';
/** The copies a link can ask for; `original` is the uploaded bytes. */
export const FILE_SIZES = ['thumbnail', 'display', 'original'] as const;
export type FileSize = (typeof FILE_SIZES)[number];
/** What a file can be attached to. */
export const FILE_OWNER_TYPES = ['piece', 'order_copy', 'job', 'lead'] as const;
export type FileOwnerType = (typeof FILE_OWNER_TYPES)[number];
/** Why it is attached (allowed per owner: piece photo, order copy reference, job bench or reference, lead po or reference). */
export const FILE_ROLES = ['photo', 'reference', 'po', 'bench'] as const;
export type FileRole = (typeof FILE_ROLES)[number];
/** Types every upload may have, found from the bytes, never from the name. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Types a purchase-order upload (purpose `po`) may have: the images, or a PDF. */
export const PO_TYPES = [...IMAGE_TYPES, 'application/pdf'] as const;
export type FileContentType = (typeof PO_TYPES)[number];
/** What an upload is for: `po` also accepts a PDF and is kept for the purchase-order period. */
export const UPLOAD_PURPOSES = ['image', 'po'] as const;
const code = z.string().trim().min(1).max(64);
/**
 * Query string of `POST /api/files`. `ownerType`, `ownerId` and `role` attach the new file in the
 * same request; they come all three together or not at all.
 */
export const uploadQuery = z
  .object({
    name: z.string().trim().min(1).max(200),
    purpose: z.enum(UPLOAD_PURPOSES).default('image'),
    ownerType: z.enum(FILE_OWNER_TYPES).optional(),
    ownerId: code.optional(),
    role: z.enum(FILE_ROLES).optional(),
  })
  .superRefine((q, ctx) => {
    const given = [q.ownerType, q.ownerId, q.role].filter((v) => v !== undefined).length;
    if (given === 0 || given === 3) return;
    for (const field of ['ownerType', 'ownerId', 'role'] as const) {
      if (q[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: 'Give ownerType, ownerId and role together, or none of them.' });
      }
    }
  });
export type UploadQuery = z.output<typeof uploadQuery>;
/** Answer of `POST /api/files`: the new file's id. */
export const createFileResult = createdResult;
export const filesContract = {
  readFileLinks: defineOperation({
    name: 'readFileLinks',
    kind: 'read',
    input: z.object({
      files: z
        .array(z.object({ fileId: code, size: z.enum(FILE_SIZES) }))
        .min(1)
        .max(50),
    }),
    result: z.object({
      ok: z.literal(true),
      links: z.array(
        z.object({ fileId: z.string(), size: z.enum(FILE_SIZES), url: z.string(), expiresAt: z.string() }),
      ),
    }),
    errors: ERROR_CODES,
  }),
  createAttachment: defineOperation({
    name: 'createAttachment',
    kind: 'create',
    input: z.object({
      fileId: code,
      ownerType: z.enum(FILE_OWNER_TYPES),
      ownerId: code,
      role: z.enum(FILE_ROLES),
    }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  deleteAttachment: defineOperation({
    name: 'deleteAttachment',
    kind: 'command',
    input: z.object({ attachmentId: code }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  listAttachments: defineOperation({
    name: 'listAttachments',
    kind: 'read',
    input: z.object({ ownerType: z.enum(FILE_OWNER_TYPES), ownerId: code }),
    result: z.object({
      ok: z.literal(true),
      items: z.array(
        z.object({
          attachmentId: z.string(),
          fileId: z.string(),
          ownerType: z.enum(FILE_OWNER_TYPES),
          ownerId: z.string(),
          role: z.enum(FILE_ROLES),
          position: z.number().int(),
          contentType: z.enum(PO_TYPES),
          width: z.number().int().nullable(),
          height: z.number().int().nullable(),
          resizeFailed: z.boolean(),
          attachedByName: z.string(),
          attachedAt: z.string(),
        }),
      ),
    }),
    errors: ERROR_CODES,
  }),
} as const;
