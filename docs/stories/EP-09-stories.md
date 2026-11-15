# EP-09: File storage · stories

Epic document: [EP-09 File storage](../epics/EP-09-file-storage.md)

Role note: stories about uploading or seeing a file use Staff, Owner or Karigar. "System" means the file service on the server (upload handling, resizing, signed links, access checks and retention) acting on its own. "Developer" means the person loading the dev seed. This epic has no screen of its own; the screens that show files belong to EP-19, EP-20, EP-21, EP-28 and EP-29, so UI references name the mockups those screens will use.

---

## EP-09-S1: System can store a file in object storage with a database record

- **Story ID:** EP-09-S1
- **Title:** System can store a file in object storage with a database record
- **As a:** System
- **I want:** every stored file to be written to a private object storage bucket under a generated storage key, with one StoredFile row in the database that describes it
- **So that:** files live outside the database, can be found by id, and are never reachable by a guessable public URL (BR-09-6, BR-09-1, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given a file is handed to the file service, when it is stored, then one object exists in the bucket and one StoredFile row exists with id, storage key, original name, content type, size in bytes, uploaded by, uploaded at and retention class filled in.
  2. Given the storage key, when it is inspected, then it is a random value that contains neither the original name nor the uploader, for example not `necklace-sharma.jpg`.
  3. Given the bucket, when anyone requests the object URL without a signed link, then the request is refused, because the bucket is private (no public bucket by default).
  4. Given the object write succeeds but the database insert fails, when the operation ends, then no StoredFile row exists and the orphan object is removed, so the two never disagree.
  5. Given two files with the same original name `IMG_0412.jpg` are stored, when both finish, then each has its own id and storage key and neither overwrites the other.
- **Rules enforced on the server:** Only the file service writes to the bucket; the bucket credentials come from environment variables (EP-01-S6) and are never sent to a browser. The uploader is taken from the session, not from a request field (EP-03-S3). The row insert runs in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None. File storage emits no catalogue event (epic section 11).
- **Audit entry written:** No. Storing a file changes no business record; attaching it does (EP-09-S7, S8).
- **Data changes:** Adds the StoredFile table (id, storage key, original name, content type, size in bytes, width, height, thumbnail key, display key, uploaded by, uploaded at, retention class, shop ID) by migration (EP-02-S1). Creates the private bucket per environment.
- **UI reference:** No screen
- **Non-functional checks:** Security: private bucket, random storage keys, credentials in environment only. Personal data: the bucket is placed in an India region (D10, decided). Availability: the bucket is covered by the backup plan in EP-38. D1 is decided (Option C): the bucket is in the cloud provider's S3-compatible object storage, on the same provider as the database, and only the Node API reaches it, over the provider's private network. Open decision D1a: which provider's storage holds the bucket. D7 is decided: StoredFile carries the shop ID, not a branch key.
- **Depends on:** EP-01-S6, EP-02-S1, EP-03-S3, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S2: Staff can upload an image and get a file id

- **Story ID:** EP-09-S2
- **Title:** Staff can upload an image and get a file id
- **As a:** Staff
- **I want:** to upload an image through the API and get back a file id I can then attach to a piece, order copy or lead
- **So that:** the photo I take at tagging or at the counter is kept on the server instead of picked from four bundled pictures (FR-09-1, BR-09-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is signed in as Staff, when he uploads a 3 MB JPEG taken on the shop phone, then the server returns a file id and the StoredFile row shows him as uploaded by and the server time as uploaded at.
  2. Given Sanjay Seth is signed in as Owner, when he uploads a PNG, then he also gets a file id.
  3. Given no session, when anyone calls Create File, then the server answers `unauthenticated` and nothing is stored.
  4. Given Lakshmi Devi is signed in as Karigar, when she calls Create File without naming a job of her own as the target, then the server answers `forbidden` (bench photos are EP-09-S10).
  5. Given the network drops after the server stored the file and Rajesh retries with the same idempotency key, when the retry arrives, then the same file id is returned and only one StoredFile row exists.
- **Rules enforced on the server:** Create File is allowed for Staff and Owner (EP-05-S1, EP-05-S2); Karigar only through the bench-photo path. Size and type are checked before storing (EP-09-S3). Creates are deduplicated by idempotency key (EP-03-S8). The response carries the created id (EP-03-S7).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. An unattached upload changes no business record; the attach step writes the audit entry.
- **Data changes:** Inserts StoredFile rows (EP-09-S1). Adds the Create File operation to the shared contract (EP-03-S1).
- **UI reference:** No screen of its own. Used by "Add more angles" on `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag`, and "Attach a photo (optional)" on `docs/ux/mockups/17-lead-create.svg`, route `lead-create`.
- **Non-functional checks:** Security: permission checked on the server for every upload. Concurrency: a retried upload stores one file. Performance: a 3 MB photo uploads and returns an id within 5 seconds on a shop connection.
- **Depends on:** EP-09-S1, EP-03-S1, EP-03-S7, EP-03-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S3: System can reject files that are too large or of a type not allowed

- **Story ID:** EP-09-S3
- **Title:** System can reject files that are too large or of a type not allowed
- **As a:** System
- **I want:** to refuse any upload above the size limit or whose content, read from the file bytes, is not on the allowed type list, with a sentence that names the limit
- **So that:** storage does not fill with huge or unsafe files, and the person uploading knows what to change (FR-09-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a 50 MB file, when it is uploaded, then the server refuses it with a sentence naming the maximum size, and no object or StoredFile row is created (epic acceptance criterion 5).
  2. Given a `.exe` file renamed to `photo.jpg`, when it is uploaded, then the server reads the file bytes, finds it is not an allowed type, and refuses it with a sentence listing the allowed types (epic acceptance criterion 5).
  3. Given a JPEG, PNG or WebP image under the limit, when it is uploaded, then it is accepted.
  4. Given a PDF purchase order under the limit, when Staff uploads it as a PO attachment, then it is accepted or refused according to the decided type list, and the tests cover the decided case.
  5. Given an upload that is cut off before the declared size, when the server checks it, then it is refused as incomplete and nothing is stored.
- **Rules enforced on the server:** Size is checked while the upload streams, so an oversize file is stopped before it is fully read. Type is decided from the file content, never from the file name or the client's declared type. The refusal uses the EP-03 error format (EP-03-S4, EP-03-S5).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused upload stores nothing.
- **Data changes:** None in the product database. Adds the size limit and allowed type list as server configuration (EP-01-S6).
- **UI reference:** No screen of its own. The refusal sentence shows on the uploading screen, for example `parcel-tag` (`docs/ux/mockups/21-tag-one-item.svg`).
- **Non-functional checks:** Security: content-based type check stops renamed executables. Open question: the maximum size and the allowed types (images only, or PDF and other PO formats) are not decided; tests use a limit below 50 MB and the image types JPEG, PNG and WebP until they are.
- **Depends on:** EP-09-S2, EP-03-S4, EP-03-S5, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S4: System can make thumbnail and display-size copies of an image

- **Story ID:** EP-09-S4
- **Title:** System can make thumbnail and display-size copies of an image
- **As a:** System
- **I want:** every stored image to get a thumbnail copy and a display-size copy, with their keys, width and height on the StoredFile row, and an original that stays usable if resizing fails
- **So that:** list screens load small images fast, the full image loads only on demand, and a bad resize never loses the photo (FR-09-3, FR-09-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma uploads a 4000 x 3000 JPEG, when processing finishes, then the StoredFile row has width 4000, height 3000, a thumbnail key and a display key, and both copies exist in the bucket (epic acceptance criterion 1).
  2. Given a portrait phone photo with an orientation tag, when the copies are made, then both copies are upright.
  3. Given an image the resizer cannot read, when processing fails, then the original stays stored and served, the row is flagged as not resized, and the failure is logged without the image content.
  4. Given a PDF PO attachment, when it is stored, then no image copies are made and the original is served as is.
  5. Given the copies are made, when they are inspected, then location and camera metadata from the original are removed from the thumbnail and display copies.
- **Rules enforced on the server:** Resizing runs on the server only; the client never supplies its own thumbnail. The flag and keys are set by the file service, not by a request field.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Making copies changes no business record.
- **Data changes:** Fills width, height, thumbnail key and display key on StoredFile; adds a "resize failed" flag column by migration (EP-02-S1). Thumbnail and display objects are added to the bucket.
- **UI reference:** No screen of its own. Thumbnails are used by the photo grid on `docs/ux/mockups/21-tag-one-item.svg` (route `parcel-tag`) and "Photo at tagging" on `docs/ux/mockups/07-qc-check.svg`.
- **Non-functional checks:** Performance: thumbnails let list screens load in under 2 seconds on a shop connection; full images load on demand (epic section 13). Personal data: location metadata is removed from served copies. Open question: the exact thumbnail and display pixel sizes are not set in the sources; tests check that both copies are smaller than the original.
- **Depends on:** EP-09-S1, EP-09-S2, EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S5: System can serve a file through a signed, expiring link

- **Story ID:** EP-09-S5
- **Title:** System can serve a file through a signed, expiring link
- **As a:** System
- **I want:** Read File link to return a signed link for one file and one size (thumbnail, display or original) that stops working after a set time
- **So that:** a link copied out of the app or left in browser history cannot be used later to open a customer's PO or a piece photo (FR-09-5, BR-09-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma may read piece TAG-9108, when he asks for the display link of its first photo, then he gets a signed link that loads the image.
  2. Given a signed link issued an hour ago, when it is used after its expiry, then the file is refused (epic acceptance criterion 4).
  3. Given a signed link, when one character of its signature is changed, then the file is refused.
  4. Given a signed link for the thumbnail, when its path is edited to point at the original, then the file is refused.
  5. Given a list screen shows 20 piece photos, when it asks for links, then it gets 20 thumbnail links in one call and no original is fetched.
- **Rules enforced on the server:** A link is issued only after the access check of EP-09-S6 passes. The expiry time is set by the server. Links are signed with a server secret from environment variables (EP-01-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading a file changes nothing; link requests are logged for security review without the link itself.
- **Data changes:** None in the product database. Adds the Read File link operation to the shared contract (EP-03-S1).
- **UI reference:** No screen of its own. Used wherever a photo shows, for example the piece drawer on route `stock` and `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Security: signed, expiring links only; never public URLs (epic section 13). Performance: links for a page of thumbnails are issued in one request. Open question: the link lifetime is not stated in the sources; tests use 15 minutes until decided. D1 is decided (Option C): the link points at the Node API on the shop's own domain and is signed by the API, which checks it and streams the file from storage; the browser never talks to storage directly.
- **Depends on:** EP-09-S1, EP-09-S4, EP-09-S6, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S6: System can check a file request against the owning entity and the caller's role

- **Story ID:** EP-09-S6
- **Title:** System can check a file request against the owning entity and the caller's role
- **As a:** System
- **I want:** every link request to find what the file is attached to (piece, order copy, job or lead) and allow it only if the caller's role may read that entity
- **So that:** file access follows the same rules as the records, and nobody sees a customer's PO image they could not see on the lead (FR-09-6, FR-09-7, BR-09-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a PO image attached to a lead, when Rajesh Verma (Staff) asks for its link, then it is issued, because Staff may read leads.
  2. Given the same PO image, when Lakshmi Devi (Karigar) asks for its link, then the server answers not-found, the same answer as for a file id that does not exist (FR-09-7).
  3. Given a file that is stored but not attached to anything, when anyone other than its uploader asks for its link, then the server answers not-found.
  4. Given a file attached to both a lead and an order copy, when a caller may read one of them, then the link is issued.
  5. Given a deactivated user's old session, when it asks for a link, then the server answers `unauthenticated` (EP-04-S13).
- **Rules enforced on the server:** The check uses the EP-05 permission list (EP-05-S1, EP-05-S2) and the karigar own-jobs read scope (EP-05-S3). Refusals to karigars are not-found so a karigar cannot learn that a file exists. The check runs on every link request, not once per session.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused read changes nothing; refusals are counted in logs for EP-39.
- **Data changes:** Adds the Attachment table (file id, owner entity type, owner entity id, role, position, attached by, attached at) by migration (EP-02-S1), which the check reads.
- **UI reference:** No screen
- **Non-functional checks:** Security: access is checked against the owning entity and role on every link request (epic section 13). Personal data: karigars never reach PO files (BR-09-2, BR-09-3). Performance: the check adds one indexed lookup on Attachment by file id.
- **Depends on:** EP-09-S1, EP-05-S1, EP-05-S2, EP-05-S3, EP-04-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S7: Staff can attach photos to a piece

- **Story ID:** EP-09-S7
- **Title:** Staff can attach photos to a piece
- **As a:** Staff
- **I want:** to attach uploaded photos to a piece in a set order, and remove one I attached by mistake
- **So that:** each tagged piece carries its own photos instead of one of four bundled pictures (FR-09-4, BR-09-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao is tagging TAG-9108 on BATCH-2026-044, when he attaches two uploaded photos, then two Attachment rows exist with owner entity type piece, role photo, positions 1 and 2, attached by Deepak Rao and the server time (epic acceptance criterion 1).
  2. Given TAG-9108 has two photos, when Rajesh Verma reads the piece, then its photos come from the Attachment rows in position order and `Piece.photos` is not used.
  3. Given Deepak detaches photo 2, when the detach commits, then the Attachment row is removed and the audit entry for the piece records the detach.
  4. Given Lakshmi Devi (Karigar), when she calls Create Attachment for a piece, then the server answers `forbidden`.
  5. Given a file id that does not exist, when Deepak attaches it, then the server answers not-found and no Attachment row is created.
- **Rules enforced on the server:** Create and Delete Attachment on a piece are allowed for Staff and Owner only (EP-05-S2). The file must exist. The attach and its audit entry commit in one transaction (EP-03-S6, EP-06-S2).
- **Live events emitted / consumed:** None from this story. A tag save that includes photos emits "Tag saved on a shared parcel" from EP-21.
- **Audit entry written:** Yes: actor, time, entity (piece TAG-9108), action (photo attached or detached), before and after photo file ids.
- **Data changes:** Inserts and deletes Attachment rows for pieces. Migration replaces the `Piece.photos` string array with attachment rows (EP-02-S5 table).
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Photo", "Add more angles"); the screen itself is built in EP-21.
- **Non-functional checks:** Audit: attach and detach are recorded with the piece's audit entry (epic section 13). Concurrency: two staff attaching to the same piece get distinct positions.
- **Depends on:** EP-09-S2, EP-09-S6, EP-02-S5, EP-06-S2, EP-06-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S8: Staff can attach reference images to an order copy

- **Story ID:** EP-09-S8
- **Title:** Staff can attach reference images to an order copy
- **As a:** Staff
- **I want:** to attach chosen images to an order copy as reference images, picking each one explicitly from the lead's files, the catalogue or a new photo
- **So that:** the karigar gets the design to work from, and no PO page with customer details is sent to the karigar by accident (FR-09-4, BR-09-2, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma builds an order copy, when he picks 3 images, then 3 Attachment rows exist with owner entity type order copy and role reference, and the screen can show "3 reference images".
  2. Given a lead with a PO attachment, when an order copy is created from that lead, then no PO attachment is copied onto the order copy unless Rajesh picks it.
  3. Given Rajesh picks an existing file from the lead, when it is attached, then the same StoredFile is reused and no copy of the object is made.
  4. Given the order copy is issued as job MO-2026-118, when the job is read, then its reference images are the order copy's reference attachments, replacing `OrderCopy.refImages` and `KarigarJob.refImage`.
  5. Given Rajesh detaches a reference image, when it commits, then the order copy's audit entry records the detach.
- **Rules enforced on the server:** Attach on an order copy is allowed for Staff and Owner (EP-05-S2). The server never copies lead attachments to an order copy by itself. Attach and audit commit together (EP-06-S2).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (order copy), action (reference image attached or detached), before and after file ids.
- **Data changes:** Inserts and deletes Attachment rows for order copies. Migration replaces `OrderCopy.refImages` and `KarigarJob.refImage` with attachment rows (EP-02-S8 tables).
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("3 reference images", "attached from the lead", "Add a photo"); the builder itself is EP-19.
- **Non-functional checks:** Personal data: reference images are chosen explicitly so customer details in a PO do not reach a karigar (epic section 16). Audit: attach and detach are recorded with the order copy's audit entry.
- **Depends on:** EP-09-S2, EP-09-S6, EP-09-S7, EP-02-S8, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S9: Karigar can see only the reference images of their own jobs

- **Story ID:** EP-09-S9
- **Title:** Karigar can see only the reference images of their own jobs
- **As a:** Karigar
- **I want:** to open the reference images of the jobs issued to me on my phone
- **So that:** I can make the piece to the design, while images from other karigars' jobs and customer files stay hidden from me (FR-09-6, FR-09-7, BR-09-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi has job MO-2026-118 with a reference image, when she opens the job on `k-jobs`, then the image loads through a signed link (epic acceptance criterion 2).
  2. Given another karigar's job with a reference image, when Lakshmi requests that image's link, then the server returns not-found (epic acceptance criterion 3).
  3. Given a piece photo or a PO attachment, when Lakshmi requests its link, then the server returns not-found.
  4. Given MO-2026-118 is reassigned to another karigar, when Lakshmi requests its reference image again, then the server returns not-found.
  5. Given Lakshmi's phone screen, when the image shows, then it uses the display-size copy, not the original.
- **Rules enforced on the server:** The access check of EP-09-S6 applies the karigar own-jobs scope (EP-05-S3), matching the job's assigned karigar to the karigar linked to the user (EP-05-S13). Every refusal to a karigar is not-found.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Viewing an image changes nothing.
- **Data changes:** None in the product database.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("2 pieces · 22K · Antique · MO-2026-118"); the screen is built in EP-20.
- **Non-functional checks:** Security: karigar scope checked on every link request. Performance: the display copy loads within 3 seconds on a phone connection. Personal data: no customer file is reachable from a karigar session.
- **Depends on:** EP-09-S5, EP-09-S6, EP-09-S8, EP-05-S3, EP-05-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S10: Karigar can upload a bench photo to their own job

- **Story ID:** EP-09-S10
- **Title:** Karigar can upload a bench photo to their own job
- **As a:** Karigar
- **I want:** to take a photo of my bench work and attach it to one of my own jobs
- **So that:** the shop can see progress on the job without calling me (FR-09-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi has job MO-2026-118, when she uploads a photo with that job as the target, then a StoredFile row and an Attachment row with owner entity type job and role bench exist, attached by Lakshmi Devi.
  2. Given another karigar's job, when Lakshmi uploads a bench photo for it, then the server returns not-found and nothing is stored.
  3. Given Lakshmi tries to attach a file to a piece, order copy or lead, when the request arrives, then the server answers not-found.
  4. Given the bench photo is attached, when Rajesh Verma (Staff) reads MO-2026-118, then he can open the photo through a signed link.
  5. Given a bench photo over the size limit, when Lakshmi uploads it, then she gets the size-limit sentence from EP-09-S3.
- **Rules enforced on the server:** Karigar may create a file and attachment only with role bench on a job assigned to them (EP-05-S3). Size and type limits apply (EP-09-S3). The uploader comes from the session (EP-03-S3).
- **Live events emitted / consumed:** None from this story. Any job status change that goes with it emits "Karigar job status changed" from EP-20.
- **Audit entry written:** Yes: actor (karigar), time, entity (job MO-2026-118), action (bench photo attached), after file id.
- **Data changes:** Inserts StoredFile and Attachment rows with role bench.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Take a photo of the bench", "Add a photo (optional)"); the screen is built in EP-20.
- **Non-functional checks:** Security: a karigar can write only to their own job. Performance: the phone photo is resized on the server so the staff list shows a thumbnail. Open question G16: bench voice notes as audio files are not covered until decided.
- **Depends on:** EP-09-S2, EP-09-S3, EP-09-S4, EP-09-S6, EP-05-S3, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S11: System can store an inbound PO attachment and link it to its lead

- **Story ID:** EP-09-S11
- **Title:** System can store an inbound PO attachment and link it to its lead
- **As a:** System
- **I want:** an internal Create Inbound file operation that the email and WhatsApp intake can call to store an attachment and link it to the lead it creates, with role PO
- **So that:** a photo PO the system could not read still reaches the lead and staff can read it there (FR-09-9, BR-09-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the WhatsApp intake hands over an image from +91 90037 44120, when it is stored and the lead is created, then the lead has an Attachment row with role PO, attached by the system actor for WhatsApp intake.
  2. Given the parser could not read the image, when Rajesh Verma opens the lead from "A photo we could not read · +91 90037 44120" on `leads`, then he can open the original image.
  3. Given a browser session of any role, when it calls Create Inbound file, then the server refuses it, because the operation is internal.
  4. Given the inbound file is over the size limit or not an allowed type, when intake hands it over, then it is refused with a logged reason and the intake can still create the lead with a note that the attachment was not kept.
  5. Given the same message is delivered twice by the provider, when intake hands over the attachment twice with the same message id as key, then one StoredFile and one Attachment exist.
- **Rules enforced on the server:** Create Inbound file is callable only by the internal system actor (EP-06-S6), never from a user session. Size and type limits apply (EP-09-S3). Deduplication by key (EP-03-S8).
- **Live events emitted / consumed:** None from this story. The lead creation emits "Lead arrived / passed its SLA" from EP-29.
- **Audit entry written:** Yes: actor (system, intake channel), time, entity (lead), action (PO attachment stored), after file id.
- **Data changes:** Inserts StoredFile rows with the PO retention class and Attachment rows with owner entity type lead and role PO (EP-02-S7 lead table).
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg`, route `leads` ("A photo we could not read"), and `docs/ux/mockups/17-lead-create.svg`, route `lead-create`; the screens are built in EP-28 and EP-29.
- **Non-functional checks:** Personal data: PO files carry customer names and phones (BR-09-3) and get the PO retention class. Security: internal-only operation. Audit: system actions are recorded with the system actor (EP-06-S6).
- **Depends on:** EP-09-S1, EP-09-S3, EP-09-S4, EP-02-S7, EP-03-S8, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S12: System can apply the retention rule to stored files

- **Story ID:** EP-09-S12
- **Title:** System can apply the retention rule to stored files
- **As a:** System
- **I want:** an internal Run Retention operation that finds files past the keep period of their retention class and removes the original, thumbnail and display copies together, or keeps them where the rule says so
- **So that:** personal data in PO files is not kept longer than decided, and storage does not grow without limit (FR-09-11, BR-09-3, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given a PO file whose retention class keep period has passed, when Run Retention runs, then its original, thumbnail and display objects are removed from the bucket and its StoredFile and Attachment rows are removed or marked removed as decided.
  2. Given a piece photo whose class says keep, when Run Retention runs, then it is untouched.
  3. Given a file removed by retention, when anyone asks for its link, then the server answers not-found.
  4. Given removal of one of the three objects fails, when the run ends, then the file is retried on the next run and is not reported as removed.
  5. Given a run, when it ends, then the number of files removed per retention class is written to the run log.
- **Rules enforced on the server:** Run Retention is callable only by the scheduler's system actor; no user session may call it. Keep periods come from server configuration per retention class.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (system, retention run), time, entity (owning piece, order copy, job or lead), action (file removed by retention), before file id.
- **Data changes:** Deletes or marks StoredFile and Attachment rows; deletes bucket objects. Adds retention class configuration.
- **UI reference:** No screen
- **Non-functional checks:** Personal data: PO files are kept only as long as the rule says (epic section 13). Audit: removals by the system are recorded (EP-06-S6). Open question: how long piece photos, reference images and PO attachments are kept is not decided; tests use a short test period per class. The schedule that triggers the run is provided by EP-10 (higher-numbered), so this story delivers the callable operation and a manual trigger for tests. Deletion requests under DPDP are EP-39.
- **Depends on:** EP-09-S1, EP-09-S4, EP-09-S6, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-09-S13: Developer can load the four bundled images as dev seed files

- **Story ID:** EP-09-S13
- **Title:** Developer can load the four bundled images as dev seed files
- **As a:** Developer
- **I want:** the dev and staging seed to store the four JPEGs in `src/assets/images/` as StoredFile rows and attach them to the seeded pieces, order copies and jobs that used them
- **So that:** screens work in development with real file ids, and no screen depends on the bundled images outside the seed (FR-09-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty dev database and bucket, when the seed runs, then 4 StoredFile rows exist for the antique kundan choker, Chettinad haram necklace, floral polki bangle and peacock ruby pendant images, each with thumbnail and display copies.
  2. Given the seed, when it attaches images, then each seeded piece, order copy and job that used `imageForKey` or `imageList` in `src/data/images.ts` gets Attachment rows pointing at those files.
  3. Given the seed is run twice, when it finishes, then there are still 4 StoredFile rows.
  4. Given a production build, when CI searches the bundle for imports of `src/assets/images/` and `src/data/images.ts`, then none is found outside the seed (epic acceptance criterion 6).
  5. Given the production environment, when someone tries to run the seed, then it refuses to run.
- **Rules enforced on the server:** The seed runs only in dev and staging (EP-02-S13). The CI bundle check fails the run if a screen imports the bundled images (EP-01-S9).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Seed data is loaded before any user exists.
- **Data changes:** Inserts 4 StoredFile rows and their Attachment rows in dev and staging only; adds 12 objects (originals and copies) to the dev bucket.
- **UI reference:** No screen. Affects `src/data/images.ts` and the photo picker in `src/components/parcels/TagItem.tsx`.
- **Non-functional checks:** Security: seed refuses to run in production. Personal data: the seed images contain no customer details.
- **Depends on:** EP-09-S1, EP-09-S4, EP-09-S7, EP-09-S8, EP-02-S13, EP-01-S9, EP-08-S19
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D1a: which cloud provider's S3-compatible storage holds the files? It is the same provider as the database and the API, in an India region (D10, decided). (EP-09-S1)
- How long are piece photos, reference images and PO attachments kept? (EP-09-S12)
- What is the maximum file size, and which types are allowed (images only, or PDF and other PO formats)? (EP-09-S3, S4, S11)
- G9: may a public catalogue link show piece photos to people who are not signed in? (EP-09-S5, S6)
- G16: are bench voice notes stored as audio files, and who may play them? (EP-09-S10)
