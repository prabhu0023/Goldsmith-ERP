# EP-09: File storage

## 1. Summary

This epic stores the photos and attachments the shop works with: photos of each tagged piece, reference images sent
to the karigar with an order copy, and purchase-order images and files that arrive by email or WhatsApp. Today the
prototype offers four bundled pictures to pick from. In production staff take real photos at tagging, karigars need
to see the reference image for their job, and an unreadable photo PO still has to be kept and shown on the lead.
Some of these files are customer personal data, so who can see each file matters. This epic covers upload, resizing,
serving and access control.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. Four JPEGs are bundled in `src/assets/images/` and picked from `src/data/images.ts`; nothing is uploaded or stored.

## 3. Roles involved

- Staff: upload piece photos at tagging, attach reference images to leads and order copies, see PO attachments on leads.
- Owner: everything staff can see; reads PO attachments and piece photos during reviews.
- Karigar: sees only the reference images attached to their own jobs; may upload a bench photo of their own job.
- System: stores inbound PO attachments from email and WhatsApp, makes thumbnails, serves files through signed access, applies retention.

## 4. In scope

- Upload of image files (and PO document files such as PDF) through the API.
- Resizing to thumbnail and display sizes.
- Storage in object storage with a database record per file.
- Serving files through signed, time-limited access, never public URLs by default.
- Access control per file, derived from what it is attached to (piece, order copy, job, lead) and the caller's role.
- Attaching files to a piece (`Piece.photos`), an order copy (`OrderCopy.refImages`), a karigar job (`KarigarJob.refImage`, bench photo), and a lead (PO attachment).
- Storing inbound attachments handed over by the email and WhatsApp intake.
- Size and type limits.
- A retention and deletion rule for files.

## 5. Out of scope

- Taking and attaching photos on the tag screen (EP-21).
- Reference images on the order copy builder and the job (EP-19).
- Bench photos and the karigar phone screens (EP-20).
- Reading PO attachments with the LLM parser and the email inbox connection (EP-29).
- Receiving WhatsApp media through the webhook (EP-12).
- The public catalogue link showing piece photos to customers (EP-34, gap G9; security review EP-39).
- Bench voice notes as audio files (EP-20, gap G16); this epic only stores the file if it is decided.
- Deletion requests under DPDP (EP-39).
- Backups of object storage (EP-38).

## 6. Current state in the prototype

- `src/assets/images/` holds four JPEGs: antique kundan choker, Chettinad haram necklace, floral polki bangle, peacock ruby pendant.
- `src/data/images.ts`: `images`, `imageList` ("Every reference photo available to attach to a lead or an order copy") and `imageForKey` mapping a piece kind to one of the four pictures.
- `src/types/jewellery.ts`: `Piece.photos: string[]`, `OrderCopy.refImages: string[]`, `KarigarJob.refImage: string | null`. All hold bundled `src` strings.
- `src/components/parcels/TagItem.tsx` (route `parcel-tag`): `togglePhoto` adds or removes one of the four pictures; shows "Photos · N added".
- Mockups ask for real files: 21 "Add more angles", 07 "Photo at tagging", 19 "3 reference images attached from the lead and the catalogue", 17 "A photo we could not read" (photo PO), 16 PO attachments, 09 "Take a photo of the bench", 09 "Type or speak" (voice note, G16), 28 catalogue link (G9).
- Reusable: the fields `photos`, `refImages`, `refImage` as the attachment points; the photo grid UI in `TagItem`.
- Must be rebuilt server-side: upload, storage, thumbnails, signed serving, access control, retention. The bundled images remain only as dev seed.

## 7. Functional requirements

- FR-09-1. A signed-in staff member or owner can upload an image file and receive a file id.
- FR-09-2. The server rejects files above the size limit and files whose content type is not on the allowed list.
- FR-09-3. The server produces a thumbnail and a display-size copy of every uploaded image.
- FR-09-4. A file can be attached to a piece, an order copy, a karigar job or a lead, and each attachment records who attached it and when.
- FR-09-5. A file is served only through a signed link that expires after a set time.
- FR-09-6. A karigar can fetch a file only if it is attached to a job assigned to that karigar.
- FR-09-7. A karigar request for any other file returns not-found.
- FR-09-8. A karigar can upload a bench photo attached to their own job only.
- FR-09-9. The intake epics can store an inbound attachment (email or WhatsApp media) and link it to the lead it creates.
- FR-09-10. A stored file that fails to resize stays available as the original and is flagged.
- FR-09-11. The retention rule removes or keeps files as decided, and removal of a file removes all its copies.
- FR-09-12. The dev seed loads the four bundled images as stored files so screens work in development.

## 8. Business rules

- BR-09-1. Scope is upload, resize and serve for piece photos, reference images and PO attachments, with access control on files. [PRODUCTION-SCOPE §6 EP-09 scope]
- BR-09-2. A karigar sees the target weights and the reference photo of jobs issued to him, and nothing about customers, leads or stock. [mockup 11]
- BR-09-3. Customer names and phones are personal data; PO images carry them. [PRODUCTION-SCOPE §5 Personal data]
- BR-09-4. Unreadable POs still create a lead, so the original file must be kept and shown. [SCOPE-ANALYSIS App. H; mockup 17]
- BR-09-5. Every permission is checked on the server. [PRODUCTION-SCOPE §5 Security]
- BR-09-6. Files live in object storage, separate from the database. [PRODUCTION-SCOPE §3 architecture]
- BR-09-7. Pieces are photographed at tagging. [mockup 07; mockup 21]

## 9. Data

- StoredFile: id, storage key, original name, content type, size in bytes, width, height, thumbnail key, display key, uploaded by, uploaded at, retention class, branch key (if D7).
- Attachment: file id, owner entity type (piece, order copy, job, lead), owner entity id, role (photo, reference, PO, bench), position, attached by, attached at.
- Replaces `Piece.photos`, `OrderCopy.refImages` and `KarigarJob.refImage` string arrays with attachment rows.
- No weights or money fields in this epic.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | File | Upload an image or document | Staff, Owner; Karigar for a bench photo on own job |
| Create | Attachment | Attach a file to a piece, order copy, job or lead | Staff, Owner; Karigar for own job only |
| Delete | Attachment | Detach a file | Staff, Owner |
| Read | File link | Get a signed, expiring link to a file | Anyone allowed to read the owning entity |
| Create | Inbound file | Store an email or WhatsApp attachment (internal) | System (EP-12, EP-29) |
| Run | Retention | Remove files past their retention (internal) | System (EP-10) |

## 11. Live events

None. File uploads do not emit catalogue events. A tag save that includes photos emits "Tag saved on a shared parcel"
from EP-21, not from this epic.

## 12. Screens and UX references

No screen of its own. Screens that depend on it: `parcel-tag` (piece photos), `stock` (piece drawer photos),
`order-copy` (reference images), `lead-create` and `lead-review` (PO attachments), `k-jobs` (reference image and bench
photo), `catalogue` (shared pieces). Mockups: `21-tag-one-item.svg`, `07-qc-check.svg`, `19-order-copy-builder.svg`,
`16-lead-inbox.svg`, `17-lead-create.svg`, `09-karigar-phone.svg`, `28-catalogue-share.svg`.

## 13. Non-functional requirements

- Security: files served only by signed, expiring links; access checked against the owning entity and role on every link request; no public bucket by default.
- Personal data: PO images and files are personal data; they are kept only as long as the retention rule says and are covered by deletion requests (EP-39).
- Performance: thumbnails let list screens load under 2 seconds on a shop connection; full images load on demand.
- Availability and recovery: object storage is included in the backup plan (EP-38).
- Audit: attaching and detaching files on pieces and order copies is recorded with the owning entity's audit entry (EP-06).

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03
- Downstream: EP-21, EP-29, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a staff member tagging a piece, when they upload a photo, then a thumbnail and display copy exist and the piece shows the photo.
2. Given a karigar with job MO-2026-… that has a reference image, when they open the job, then the image loads through a signed link.
3. Given that karigar, when they request a reference image of another karigar's job, then the server returns not-found.
4. Given a signed link issued an hour ago, when it is used after its expiry, then the file is refused.
5. Given a 50 MB file or a file of a type not on the list, when it is uploaded, then the server rejects it with a sentence naming the limit.
6. Done when no screen depends on the four bundled images outside the dev seed.

## 16. Risks

- Risk: files become reachable by guessable public URLs. Mitigation: private storage and signed links only.
- Risk: karigars see customer details inside a reference image taken from a PO. Mitigation: reference images are chosen explicitly when building the order copy (EP-19), never copied automatically from PO attachments.
- Risk: phone photos are large and slow on shop connections. Mitigation: resize on upload and serve thumbnails in lists.
- Risk: storage grows without limit. Mitigation: decide retention per file class before launch.
- Risk: storage region breaks the personal-data rule. Mitigation: place storage in the D10 region.

## 17. Open decisions and questions

- D1: is file storage the managed platform's storage or a separate object store?
- D10: which region holds the files?
- How long are piece photos, reference images and PO attachments kept?
- What is the maximum file size, and which types are allowed (images only, or PDF and other PO formats)?
- G9: may a public catalogue link show piece photos to people who are not signed in?
- G16: are bench voice notes stored as audio files, and who may play them?

## 18. Candidate stories

1. EP-09-S1: System can store a file in object storage with a database record
2. EP-09-S2: Staff can upload an image and get a file id
3. EP-09-S3: System can reject files that are too large or of a type not allowed
4. EP-09-S4: System can make thumbnail and display-size copies of an image
5. EP-09-S5: System can serve a file through a signed, expiring link
6. EP-09-S6: System can check a file request against the owning entity and the caller's role
7. EP-09-S7: Staff can attach photos to a piece
8. EP-09-S8: Staff can attach reference images to an order copy
9. EP-09-S9: Karigar can see only the reference images of their own jobs
10. EP-09-S10: Karigar can upload a bench photo to their own job
11. EP-09-S11: System can store an inbound PO attachment and link it to its lead
12. EP-09-S12: System can apply the retention rule to stored files
13. EP-09-S13: Developer can load the four bundled images as dev seed files
