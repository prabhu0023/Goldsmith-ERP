# File storage (EP-09)

Photos, reference images, bench photos and PO attachments are stored in an S3-compatible object store. The bytes never reach a browser directly: the bucket is private and the api hands out short-lived signed links. Code: `packages/api/src/files/`; contract: `packages/shared/src/contract/files-contract.ts`; schema: migration `20261122T0731_ep09_file_storage.sql` (tables `stored_files`, `attachments`).

## Local object store

SeaweedFS (`chrislusf/seaweedfs:4.48`, S3 gateway on `127.0.0.1:8333`) runs as the `objectstore` service of `docker-compose.yml`. MinIO was not chosen: its community images stopped shipping in October 2025. Storage is reached only through the `ObjectStorage` interface (`object-storage.ts`), with one adapter for any S3 API (`s3-storage.ts`, `@aws-sdk/client-s3`) and one in memory for tests (`memory-storage.ts`).

```sh
npm run storage:up       # docker compose up -d --wait objectstore (starts only that service)
npm run storage:create   # create the lane's bucket, and in development its test bucket; safe to repeat
```

Add to `.env` (local-only values; the credentials are in `docker/seaweedfs/s3.json` and never go to staging or production):

```sh
STORAGE_ENDPOINT=http://localhost:8333
STORAGE_BUCKET=goldsmith-files
STORAGE_ACCESS_KEY_ID=goldsmith-local
STORAGE_SECRET_ACCESS_KEY=goldsmith-local-only
```

With `LANE` set the bucket gets the lane added (`goldsmith-files-b`); tests use `<bucket>-test` (`goldsmith-files-b-test`), which `npm test` empties first. Without `STORAGE_BUCKET` the api starts with file features off: the file operations answer `not_found`, the retention job is not registered, and `db:seed` skips the seed images. With `CI` set and no `STORAGE_ENDPOINT` the tests fail instead of skipping the S3 checks. CI starts the same image with `docker run` in the Test job.

## Routes and operations

| Method and path / operation | Session | Answer |
| --- | --- | --- |
| `POST /api/files?name=…&purpose=image\|po[&ownerType=…&ownerId=…&role=…]` | needed | Raw body (needs `Content-Length`), stored with copies; `{ ok: true, id: 'FILE-2026-00001' }`. With a target it is attached in the same transaction. `Idempotency-Key` header supported (operation `createFile`). |
| `GET /api/files/<FILE-code>/<thumbnail\|display\|original>?exp=…&sig=…` | not needed (the link is the permission) | The object with `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=<seconds left>`. Expired, changed, removed or unknown → 404 `not_found`, never saying why. |
| `readFileLinks` | needed | `{ files: [{ fileId, size }] }` (1–50) → `{ ok, links: [{ fileId, size, url, expiresAt }] }`. The access check runs here. |
| `createAttachment` | needed | `{ fileId, ownerType, ownerId, role }` → `{ ok, id: 'AT-2026-00001' }`. |
| `deleteAttachment` | needed (Staff, Owner) | `{ attachmentId }` → `{ ok }`. The file stays. |
| `listAttachments` | needed | `{ ownerType, ownerId }` → items in role and position order; a job also lists its order copy's reference images. |

Owners and roles: piece → `photo`; order copy → `reference`; job → `bench` or `reference`; lead → `po` or `reference`. Owners are named by their own code (`TAG-…`, `OC-…`, `MO-…`, `LD-…`). `storeInboundFile` (`inbound-file.ts`) is the server-only function the WhatsApp and email intake call to keep a PO attachment on a lead; it is not a route or operation.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `STORAGE_ENDPOINT` | AWS default endpoint | S3 endpoint; set for SeaweedFS or another S3-compatible store. |
| `STORAGE_REGION` | `us-east-1` | S3 region. |
| `STORAGE_BUCKET` | none (file features off) | Bucket name; the lane is added. |
| `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | none | Credentials. |
| `FILE_MAX_BYTES` | 10485760 (10 MB) | Largest upload. |
| `FILE_LINK_TTL_SECONDS` | 900 (15 min) | Signed link lifetime. |
| `FILE_RETENTION_PO_DAYS` | 365 | Days a `po` file is kept. |
| `FILE_RETENTION_STANDARD_DAYS` | unset (kept) | Days a `standard` file (photo, reference, bench) is kept. |

## Limits and copies

- Types come from the bytes, never the name: JPEG, PNG and WebP for every upload; PDF only with `purpose=po`. Anything else → 415 `validation` on `file`.
- Over the limit → 413 with "The file is larger than 10 MB, the largest allowed.", decided on `Content-Length` before the body is read. No `Content-Length` → 411. A body cut off before its declared size → 400. Nothing is stored in any of these cases.
- Images get a thumbnail (longest side 320 px) and a display copy (1600 px), JPEG quality 80, turned upright from the EXIF orientation, with no EXIF, GPS or camera metadata. A file the resizer cannot read keeps only its original (`resize_failed`) and every size serves the original. PDFs get no copies.
- Keys are `files/<32 random hex>` (+ `-thumb.jpg`, `-display.jpg`): never the file name or the uploader. Seed files use `seed/<sha256>`.

## Who may do what

Role checks live in `packages/api/src/files/file-roles.ts` (to swap for EP-05's permission list).

| Who | Upload | Attach / detach | Links and lists |
| --- | --- | --- | --- |
| Staff, Owner | yes, with or without a target | yes | any file attached in the shop; an unattached file only to its uploader |
| Karigar | only a `bench` photo to a job of their own; no target → `forbidden`; another karigar's job, a piece, order copy or lead → `not_found` | attach to a piece, order copy or lead → `forbidden`; another karigar's job → `not_found`; detach → `forbidden` | only files on their own jobs (and the reference images of those jobs' order copies); everything else → `not_found` |

## Retention (S12)

The `file-retention` job (`file-retention.ts`, daily 03:00 Asia/Kolkata, see [jobs.md](jobs.md)) removes files past their class's keep period: it deletes the original, thumbnail and display objects, sets `stored_files.removed_at` (the row stays, so links answer `not_found`), deletes the attachments and writes one `file_removed_by_retention` audit entry per owner by `System (retention run)`. A file whose object delete fails is left as it is and tried again next run. Each run logs `[jobs] file-retention removed po=N standard=N failed=N`. Only the scheduler runs it; tests use the manual trigger `runFileRetention(pool, shop, deps, now)`.

## Dev seed (S13)

`npm run db:reset && npm run db:seed` stores the four JPEGs of `packages/web/src/assets/images/` as `FILE-<year>-00001` to `00004` (uploaded by `Seed`, class `standard`) with their copies (12 objects under `seed/<sha256>` keys, so a re-seed overwrites the same objects), and attaches them where the prototype used them: piece photos, order copy reference images and job reference images. It prints `stored_files 4` and `Bucket goldsmith-files-b holds 12 seed objects.` (lane b). Without storage it prints `File storage is not configured: seed images skipped.` The seed refuses production as before.

`npm run lint` runs `scripts/check-bundled-images.mjs`, which fails when a web file outside its allow-list imports `src/assets/images/` or `src/data/images.ts`. The allow-list is the prototype that still uses them (`data/seed.ts`, `data/images.ts`, `components/parcels/TagItem.tsx`, `components/leads/OrderCopyBuilder.tsx`), until EP-08-S19 removes those imports.

## Acceptance criteria and tests

Tests are in `packages/api/test/files/` unless named otherwise.

| Story | Criteria | Tests |
| --- | --- | --- |
| S1 store a file | AC1, AC2, AC4, AC5 | `store-file.test.ts` "S1 AC1" … "S1 AC5" |
| | AC3 private bucket | `object-storage.contract.test.ts` "S1 AC3: refuses an anonymous read" (S3 adapter) |
| S2 upload | AC1–AC5 | `upload.test.ts` "S2 AC1" … "S2 AC5" |
| S3 size and type | AC1–AC5 | `upload.test.ts` "S3 AC1" … "S3 AC5"; `content-type-sniff.test.ts` "AC2", "AC4" |
| S4 copies | AC1–AC5 | `store-file.test.ts` "S4 AC1" … "S4 AC5" |
| S5 signed links | AC1–AC5 | `file-links.test.ts` "S5 AC1" … "S5 AC5"; end to end over S3 in the same file |
| S6 access check | AC1–AC5 | `file-links.test.ts` "S6 AC1, AC2" … "S6 AC5" |
| S7 piece photos | AC1–AC5 | `attachments.test.ts` "S7 AC1" … "S7 AC5", "S7 concurrency" |
| S8 order copy references | AC1–AC5 | `attachments.test.ts` "S8 AC1" … "S8 AC5" |
| S9 karigar reads own job | AC1–AC5 | `attachments.test.ts` "S9 AC1" … "S9 AC5" |
| S10 bench photos | AC1–AC5 | `attachments.test.ts` "S10 AC1" … "S10 AC5" |
| S11 inbound PO file | AC1–AC5 | `inbound-file.test.ts` "S11 AC1" … "S11 AC5" |
| S12 retention | AC1–AC5 | `retention.test.ts` "AC1, AC2, AC5", "AC3", "AC4", plus the scheduler run and "is not an operation any session can call" |
| S13 dev seed | AC1, AC2, AC3, AC5 | `test/db/seed.test.ts` "EP-09-S13 AC1", "AC2", "AC3", "refuses a second run", "refuses to run in production" |
| | AC4 bundle check | `npm run lint` (`scripts/check-bundled-images.mjs`; self check in its header) |

Schema rules (tenant keys, owner and role pairs, audit kinds): `files-schema.test.ts`.

## Open items

- D1a: the cloud provider, bucket and credentials for staging and production (same provider as the database and api, India region). Only an S3 adapter exists; a provider without an S3 API needs a second adapter.
- Size limit (10 MB), allowed types (JPEG, PNG, WebP; PDF for POs), link lifetime (15 min) and copy sizes (320 / 1600 px) are working values.
- Keep periods per class (PO 365 days, others forever) are not decided.
- G9: whether a public catalogue link may show piece photos to people who are not signed in.
- G16: whether bench voice notes are stored as audio files, and who may play them.
- S13 AC4 is fully met only when EP-08-S19 removes the prototype's image imports and the allow-list is empty.
- The role checks in `file-roles.ts` move to EP-05's permission list.
