# EP-02: Database and data model · stories

Epic document: [EP-02 Database and data model](../epics/EP-02-database-and-data-model.md)

Role note: this is a layer A infrastructure epic with no end user. Stories use "Developer" for the person building and deploying the product, and "System" for the database and the migration runner acting on their own. "Rules enforced on the server" here means rules enforced by the database itself (keys, constraints, column types, version checks) and by the migration runner, because the epic exposes no product endpoints.

---

## EP-02-S1: Developer can apply and track schema migrations in every environment

- **Story ID:** EP-02-S1
- **Status:** Partial: AC5 (deploy applies migrations before the api serves) waits for the staging deploy (EP-01-S12, D1a).
- **Title:** Developer can apply and track schema migrations in every environment
- **As a:** Developer
- **I want:** a migrations tool in the `api` package that applies numbered, forward-only schema migrations to development, staging and production, and records which migrations ran where
- **So that:** every environment has the same schema, built from empty by the same scripts, and a deploy never loses data (FR-02-1, FR-02-10, BR-02-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty development database and the connection string from the environment file (EP-01-S6), when a developer runs the root migrate command, then every migration in the migrations folder runs in number order and the command exits with code 0.
  2. Given a database where migrations 1 to N have run, when the migrate command runs again with no new files, then nothing is applied and the command reports "up to date".
  3. Given any environment, when a developer runs the migration status command, then it lists each migration with its number, name, applied time in UTC and checksum, read from a migration history table.
  4. Given a migration file whose content changed after it was applied on staging, when the migrate command runs on staging, then it stops with an error naming the file and the checksum mismatch, and applies nothing.
  5. Given a green main build deployed to staging by EP-01-S12, when the deploy runs, then pending migrations are applied before the new `api` build starts serving, and a failed migration stops the deploy and leaves the previous build serving.
  6. Given the first migration, when it is inspected, then it records the D7 decision (one shop, no branches, a shop ID on every business table) in a comment (BR-02-7).
- **Rules enforced on the server:** Migrations run inside a transaction where the database supports it, so a failed migration leaves no half-applied schema. Only the deploy pipeline (System) applies migrations to staging and production; developers apply them only to development. The migration history table is written only by the migrations tool.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No product state changes. The migration history table records number, name, checksum and applied time per environment.
- **Data changes:** Creates the migration history table. Adds the migrations folder and the migrate and status commands to the `api` package.
- **UI reference:** No screen
- **Non-functional checks:** Availability: a migration that needs to rewrite a large table is written to run without taking the shop offline, or is flagged for a planned window. Security: production migrations use the production credential held only by the deploy pipeline. Time: applied times are stored in UTC. D2 is decided (PostgreSQL): the migration tool targets the managed PostgreSQL database. Staging and production migrations run from the deploy pipeline inside the cloud provider's private network; the database has no public endpoint. Open decision D1a: how the CI and deploy pipeline reaches that private network (a runner inside the provider, a bastion, or the provider's own deploy service) depends on the cloud provider, so this constraint is confirmed when D1a is decided. D7 is decided: one shop, no branches; the shop ID is in migration 1. D10 is decided (India region): the region is set in configuration, not in migrations, and follows the D1a cloud provider.
- **Depends on:** EP-01-S2, EP-01-S6, EP-01-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S2: Developer can convert grams to integer units of 0.0001 g and back in the shared package

- **Story ID:** EP-02-S2
- **Status:** Done
- **Title:** Developer can convert grams to integer units of 0.0001 g and back in the shared package
- **As a:** Developer
- **I want:** helpers in `shared/weights.ts` that turn a grams string typed or read from a scale into an integer of 0.0001 g units, and turn a stored integer back into a grams string with exactly four decimals
- **So that:** every package stores and compares weights as integers, the match gate compares integers, and no weight is ever rounded through floating point (BR-02-1, FR-02-2, FR-02-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the input string `12.3456`, when it is converted to stored units, then the result is the integer `123456`, and converting `123456` back gives the display string `12.3456` (epic acceptance criterion 2).
  2. Given the inputs `48.65`, `0.0001`, `0`, `146.3632` and `30000`, when each is converted and converted back, then the display strings are `48.6500`, `0.0001`, `0.0000`, `146.3632` and `30000.0000`.
  3. Given an input with more than four decimals such as `12.34567`, or a non-number such as `12,3a`, when it is converted, then the helper returns an error result and never a rounded value.
  4. Given a negative grams value such as `-0.0400` (a pool ledger delta or a gap), when it is converted and back, then the sign is kept (`-400` and `-0.0400`).
  5. Given the prototype helpers `toU`, `fromU`, `netOf` and `parseWeight` in `shared/weights.ts`, when this story is done, then the constant used for stored weights is 10000 units per gram, net weight is computed as gross units minus stone units in integers, and the unit tests cover every case above.
- **Rules enforced on the server:** The `api` package uses only these helpers to turn request strings into stored integers. A request weight with more than four decimals is rejected, not rounded.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A pure helper; it changes no state.
- **Data changes:** None in the product database. Changes `shared/weights.ts` and adds unit tests in `shared`.
- **UI reference:** No screen. The four-decimal readouts on `parcel-match` and `parcel-clear` (mockups `docs/ux/mockups/04-parcel-match.svg`, `docs/ux/mockups/14-match-rule-any-parcel.svg`) later show values produced by these helpers.
- **Non-functional checks:** Precision: conversion parses the decimal string digit by digit and never multiplies a float by 10000; tests include every weight in `src/data/seedRows.ts`. Open decision G10: the half-step ceiling `Σ ½ × readability` needs 0.00005 g, which 0.0001 g integers cannot hold. This story ships 0.0001 g storage units as PRODUCTION-SCOPE §5 says; the ceiling unit is settled before EP-23 and may add a separate finer unit for ceiling arithmetic only.
- **Depends on:** EP-01-S3, EP-01-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S3: System can store the shop, users and sessions

- **Story ID:** EP-02-S3
- **Status:** Done
- **Title:** System can store the shop, users and sessions
- **As a:** System
- **I want:** tables for Shop (id, name, address, GSTIN, logo key, setup completed at), User (id, shop ID, name, phone, email, role, karigarId, status) and Session (id, shop ID, userId, created, expires, ended), and the rule that every business table carries a shop ID
- **So that:** real sign-in (EP-04) and user management (EP-05) have somewhere to store people and their sessions, with exactly three roles, and every record belongs to the one shop from the first migration (FR-02-12, FR-02-13, FR-02-14, BR-02-7, BR-02-8, BR-02-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when the schema is inspected, then the `shops`, `users` and `sessions` tables exist with the columns listed in epic section 9, and no `branches` table exists (D7).
  2. Given a User insert with role `manager`, when it is written, then the database rejects it, and only `owner`, `staff` and `karigar` are accepted.
  3. Given a User insert with status other than `pending_activation`, `active` or `deactivated`, or with no email, when it is written, then the database rejects it.
  4. Given a Session insert whose `userId` does not exist in `users`, when it is written, then the database rejects it with a foreign key error.
  5. Given the `sessions` and `users` tables, when their columns are inspected, then no column holds a plain-text password or session token; secrets are stored only as hashes or references.
  6. Given two users of the same shop with the same phone number, when the second is inserted, then the database rejects it with a unique constraint error; the constraint is on (shop ID, phone).
  7. Given a schema test that lists every business table, when it runs, then each has a not-null shop ID with a foreign key to `shops`, and the test fails if a table lacks one.
  8. Given a shop row is created (by the setup wizard, EP-45, or by the seed), when the `locations` table is read, then exactly one location exists for that shop, named "Main shop"; there is no operation to add a second one in v1 (D7).
- **Rules enforced on the server:** Role is an enumerated column limited to `owner`, `staff`, `karigar`. Phone is unique per shop among users that are not deactivated (a partial unique index on shop ID and phone). Email is required. Every business table created in this epic and later carries `shop ID` (not null, foreign key to `shops`); the data-access layer fills it from the session, never from the request (D7). `sessions.userId` is a foreign key to `users`. `created`, `expires` and `ended` are UTC timestamps. The `karigarId` column is nullable here; its foreign key to the karigar table and the rule "required when role is karigar, empty otherwise" are added in EP-02-S4 once that table exists.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates tables only. Audit of user changes belongs to EP-05 and EP-06.
- **Data changes:** Migration creates `shops`, `users` and `sessions`. The shop row itself is created by the first-run setup wizard (EP-45), not by the migration; development and staging get one from the seed (EP-02-S13). No `branches` table (D7). Migration also creates `locations` (id, shop ID, name); the default row "Main shop" is inserted in the same transaction as the shop row. Later tables that hold or measure gold reference it (EP-02-S4, S5, S6, S9).
- **UI reference:** No screen
- **Non-functional checks:** Security: no plain-text password, link or token column (epic section 13). Personal data: `users.name`, `users.phone` and `users.email` are marked as personal data columns for export and deletion in EP-39. Time: all timestamps in UTC. D4 is decided (phone and password): EP-04 adds the password hash column and the `password_links` and `sign_in_lockouts` tables. D7 is decided: one shop, no branches; the shop ID replaces any branch key.
- **Depends on:** EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S4: System can store master records: scales, karigars, staff and customers

- **Story ID:** EP-02-S4
- **Status:** Done
- **Title:** System can store master records: scales, karigars, staff and customers
- **As a:** System
- **I want:** tables for Scale, Karigar (with a child table for `gapsMg`), StaffMember, Customer and HistoryRow, with integer weight columns and nullable money sockets
- **So that:** pieces, parcels, jobs and leads stored later can point at real scales, karigars, staff and customers (FR-02-1, FR-02-2, FR-02-4, FR-02-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when the `scales` table is inspected, then `readability` and `capacity` are integer columns in units of 0.0001 g, so the Bench balance stores `1` (0.0001 g) and `6000000` (600 g) and the Platform scale stores `100` (0.01 g) and `300000000` (30 kg).
  2. Given the `karigars` table, when it is inspected, then it has id, name, phone, specialty, language (stored only, unused until EP-44), wastage allowance, metal loss, late days, rating, finished jobs and open-since columns, and the gap history is stored as rows in a child table with karigar id, position and gap in integer units of 0.0001 g.
  3. Given the `customers` table, when it is inspected, then `budgetINR` and `spentINR` columns exist, are nullable and have no default, and `group` accepts only `VIP Bridal`, `High net worth`, `Regular` and `Wholesale`.
  4. Given a HistoryRow insert, when it is written, then `pureG` is an integer in units of 0.0001 g and `customerId` must exist in `customers`.
  5. Given a User with role `karigar` and a `karigarId` that does not exist, or a User with role `staff` that has a `karigarId`, when it is written, then the database rejects it.
  6. Given the `scales` table, when it is inspected, then it has a not-null `location_id` referencing `locations`, and a scale inserted without one is rejected.
- **Rules enforced on the server:** Foreign keys from HistoryRow to Customer, from the gap-history child table to Karigar, and from `users.karigarId` to Karigar. StaffMember role limited to `owner` and `staff`. Customer `dob` and `anniversary` are dates, not timestamps. No floating-point column for any weight.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; changes to masters are audited by EP-14, EP-16 and EP-17.
- **Data changes:** Migration creates `scales`, `karigars`, `karigar_gap_history`, `staff_members`, `customers`, `customer_history`, and adds the foreign key from `users.karigarId`. Each table has the shop ID (EP-02-S3); customer phone uniqueness, if any, is per shop. Karigars have a required email on their user account (D4). `scales` carries `location_id` (not null), set by the server to the shop's default location "Main shop" (D7).
- **UI reference:** No screen
- **Non-functional checks:** Precision: weight columns are integers; a test inserts `0.0001 g` readability and reads back `1`. Personal data: Customer name, phone, city, dob, anniversary and `optedIn` consent, and Karigar and StaffMember phone, are tagged as personal data for EP-39 export and deletion (DPDP Act 2023). Open decision G13: `Customer.history` is stored here as seed data; whether it is later derived from stock-outs is not decided, so the table must be removable without changing `customers`. Open decision: whether StaffMember stays a separate table or merges into `users` follows EP-05.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S5: System can store pieces and piece edits with version checks

- **Story ID:** EP-02-S5
- **Status:** Done
- **Title:** System can store pieces and piece edits with version checks
- **As a:** System
- **I want:** a `pieces` table with a child table for photos, and a `piece_edits` table, both with a version column
- **So that:** every tagged piece has one stored record with exact weights and one of six statuses, and edits to it can be proposed and applied without silent overwrites (FR-02-2, FR-02-5, FR-02-6, FR-02-7, BR-02-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given a Piece insert with status `sold`, when it is written, then the database rejects it, and only `draft`, `with_owner`, `stopped`, `in_stock`, `billed` and `scrapped` are accepted for `status` and `prevStatus` (epic acceptance criterion 5).
  2. Given a Piece TAG-8841 with `grossG` 48.65 and `stoneG` 7.06, when it is saved and read back, then the stored values are `486500` and `70600` and no net weight column is trusted from the client (BR-02-6).
  3. Given the `pieces` table, when it is inspected, then it has no `heldForLeadId` column (v1 has no holds), `valueINR` is nullable with no default, and `version` is an integer starting at 1.
  4. Given a PieceEdit insert with status `pending` or a `pieceId` that does not exist, when it is written, then the database rejects it; only `proposed`, `token_sent`, `applied`, `refused` and `void` are accepted, and `field` accepts only `grossG`, `stoneG`, `stoneCount`, `purity`, `huid` and `name`.
  5. Given a PieceEdit on `grossG` from 48.65 to 48.61, when it is stored, then before and after are kept as the integers `486500` and `486100`, and the token column holds a hash or reference, never the plain token value.
  6. Given a piece with three photos, when it is stored, then the photos are three rows in a child table with piece id, position and storage key, read back in the same order.
  7. Given the `pieces` table, when it is inspected, then it has a not-null `location_id` referencing `locations`, set by the server; a request body that names a location is ignored.
- **Rules enforced on the server:** Status and edit enums are checked by the database. `pieces.scaleId` references `scales`; `madeById` references `karigars`; `piece_edits.pieceId` references `pieces`. The tag number is unique per shop (shop ID, tag number), and HUID is unique per shop when present (D7). Foreign keys for `parcelId`, `jobId` and `stockOutId` are added by EP-02-S6, EP-02-S8 and EP-02-S10 when those tables exist. The stale-version check itself is EP-02-S14.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; piece and edit changes are audited by EP-22, EP-25 and EP-06.
- **Data changes:** Migration creates `pieces`, `piece_photos` and `piece_edits` with `version` columns on `pieces` and `piece_edits`. `pieces` carries `location_id` (not null, default location "Main shop", set by the server, D7).
- **UI reference:** No screen
- **Non-functional checks:** Precision: `grossG`, `stoneG` and edit before/after weights are integers of 0.0001 g. Concurrency: `version` on `pieces` and `piece_edits` (epic section 13). Security: token stored as hash or reference. Open question: whether net gold is stored on each piece or always derived; this story stores only gross and stone and derives net in `shared`.
- **Depends on:** EP-02-S2, EP-02-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S6: System can store parcels with weighings, manifest rows and QC ticks as child rows

- **Story ID:** EP-02-S6
- **Status:** Done
- **Title:** System can store parcels with weighings, manifest rows and QC ticks as child rows
- **As a:** System
- **I want:** a `parcels` table with a version column, and child tables for weighings, manifest rows and QC ticks
- **So that:** a parcel from a karigar keeps its readings, expected counts and checks as separate rows, ready for the exact-match gate (FR-02-4, FR-02-6, FR-02-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a parcel BATCH-2026-044 with a weighing of gross 12.3456 g on the Bench balance, when it is saved and read back, then the weighing row stores `123456`, references the parcel and the scale, and reads back as `12.3456` (epic acceptance criterion 2).
  2. Given a parcel with weighings "Tray 1", "Tray 2" and "Tray 3", when it is read back, then the rows come back in the stored position order 1, 2, 3 (risk mitigation for ordered child rows).
  3. Given a Parcel insert with `stage` 4, `status` `closed`, `verdict` `close` or `resolution` `returned`, when it is written, then the database rejects it; `stage` accepts 1 to 3, `status` `open`, `stopped`, `released`, `verdict` `incomplete`, `exact`, `last_digit`, `mismatch`, and `resolution` `sent_back`, `rechecking`, `loss_accepted` or null.
  4. Given the manifest of BATCH-2026-044, when it is stored, then its eight rows (MF-044-1 to MF-044-8) are rows in a manifest table with kind and count, and count must be at least 1.
  5. Given a QC tick for piece TAG-8841 on parcel BATCH-2026-043, when the same tick is inserted twice, then the second insert is rejected by a unique key on parcel id and piece id.
  6. Given the `parcels` table, when it is inspected, then `gapNetG` and `lossG` are nullable integers in units of 0.0001 g, `version` is an integer, and the foreign key from `pieces.parcelId` to `parcels` now exists.
  7. Given the `parcels` and `parcel_weighings` tables, when they are inspected, then each has a not-null `location_id` referencing `locations`, so every parcel and every tray weighing records where it was weighed.
- **Rules enforced on the server:** Enum and range checks on stage, status, verdict and resolution. `parcels.karigarId` references `karigars`; weighing `scaleId` references `scales`; QC tick `pieceId` references `pieces`. The verdict is recomputed by the server and never written from client input (BR-02-6); this story only stores it. The foreign key from `parcels.jobId` to jobs is added in EP-02-S8.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; parcel transitions are audited by EP-21, EP-23 and EP-06.
- **Data changes:** Migration creates `parcels`, `parcel_weighings` (with position), `parcel_manifest_rows` (with position), `parcel_qc_ticks`, and adds the foreign key `pieces.parcelId`. `parcels` and `parcel_weighings` (trays) carry `location_id` (not null, set by the server to "Main shop", D7).
- **UI reference:** No screen. The stored weighings feed the readouts on `parcel-match` (`docs/ux/mockups/04-parcel-match.svg`) and `parcel-clear` (`docs/ux/mockups/14-match-rule-any-parcel.svg`).
- **Non-functional checks:** Precision: weighing gross and stone, `gapNetG` and `lossG` are integers of 0.0001 g. Concurrency: `version` on `parcels`. Time: `arrivedAt`, `releasedAt` and `stoppedAt` in UTC. Open decision G14: one hand-over may carry many jobs (mockup 12); keep `parcels.jobId` nullable and do not block a later parcel-to-jobs link table.
- **Depends on:** EP-02-S4, EP-02-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S7: System can store leads with their items and parsed fields

- **Story ID:** EP-02-S7
- **Status:** Done
- **Title:** System can store leads with their items and parsed fields
- **As a:** System
- **I want:** a `leads` table and child tables for lead items and lead fields, with version columns on leads and lead items
- **So that:** a request from WhatsApp, email or the counter is stored with its original message, the fields read from it, and each requested item with its route to stock or to a karigar (FR-02-4, FR-02-5, FR-02-6, FR-02-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a Lead insert with `source` `phone` or `state` `closed`, when it is written, then the database rejects it; `source` accepts `whatsapp`, `email`, `counter`, `state` accepts `needs_glance`, `opened`, `being_worked`, `converted`, `lost`, and `confidence` accepts `clean`, `unsure`, `unreadable`.
  2. Given a lead item with `approxWeightG` 45.5, when it is stored, then the value is the integer `455000`, and a null approximate weight stays null.
  3. Given a lead item routed to stock, when it is stored, then the route kind is `stock` and the target piece id must exist in `pieces`; a route kind of `stock` with no piece id is rejected.
  4. Given a lead with five parsed fields, when it is read back, then the fields come back in stored position order with key, label, value and flagged.
  5. Given the `leads` and `lead_items` tables, when they are inspected, then each has an integer `version` column, and no column records a hold on a piece.
- **Rules enforced on the server:** Enum checks on source, state, confidence and route kind. A check constraint ties route kind to its target column: `stock` needs a piece id and no job id; `make` needs a job id and no piece id; no route needs neither. `lead_items.leadId` and `lead_fields.leadId` reference `leads`. The foreign key for the `make` target is added in EP-02-S8.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; lead changes are audited by EP-28, EP-30 and EP-06.
- **Data changes:** Migration creates `leads`, `lead_items` (with position) and `lead_fields` (with position), with `version` on `leads` and `lead_items`.
- **UI reference:** No screen
- **Non-functional checks:** Precision: `approxWeightG` is an integer of 0.0001 g. Concurrency: `version` on `leads` and `lead_items`. Personal data: `customerName`, `phone` and the original `message` are personal data for EP-39. Time: `arrivedAt` and `neededBy` in UTC.
- **Depends on:** EP-02-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S8: System can store order copies and karigar jobs

- **Story ID:** EP-02-S8
- **Status:** Done
- **Title:** System can store order copies and karigar jobs
- **As a:** System
- **I want:** an `order_copies` table with a child table for reference images, and a `karigar_jobs` table with a version column
- **So that:** a job sent to a karigar keeps its target weights, tolerance, gold issued and dates exactly, and parcels, pieces and lead items can link to it (FR-02-2, FR-02-5, FR-02-6, FR-02-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a KarigarJob insert with `status` `done`, when it is written, then the database rejects it, and only `sent`, `accepted`, `on_bench`, `ready` and `handed_over` are accepted.
  2. Given a job with `targetGrossG` 84.5, `targetNetG` 78.4, `toleranceG` 0.5 and `goldIssuedG` 80.0, when it is stored and read back, then the stored values are `845000`, `784000`, `5000` and `800000`.
  3. Given an order copy OC-2026-031 linked to job MO-2026-118, when it is stored, then `order_copies.jobId` references `karigar_jobs`, `karigarId` references `karigars`, and `leadId` and `leadItemId` are nullable and reference `leads` and `lead_items` when set.
  4. Given the migration has run, when a parcel with `jobId` MO-2026-999, a piece with `jobId` MO-2026-999, or a lead item routed `make` to MO-2026-999 is inserted and that job does not exist, then the database rejects it.
  5. Given an order copy with two reference images, when it is read back, then the images come back as two child rows in stored order.
- **Rules enforced on the server:** Status enum on jobs. Foreign keys from jobs to karigars, order copies to jobs and karigars, and the new foreign keys `parcels.jobId`, `pieces.jobId` and `lead_items` make target to jobs. `dueDate` and `confirmedDate` are stored in UTC. `version` on `karigar_jobs`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; job changes are audited by EP-19, EP-20 and EP-06.
- **Data changes:** Migration creates `order_copies`, `order_copy_images` (with position) and `karigar_jobs`, and adds the foreign keys listed above.
- **UI reference:** No screen
- **Non-functional checks:** Precision: target, tolerance and gold-issued columns are integers of 0.0001 g. Concurrency: `version` on `karigar_jobs`. Time: `sentAt`, `dueDate`, `confirmedDate`, `settledAt` and `createdAt` in UTC.
- **Depends on:** EP-02-S6, EP-02-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S9: System can store the metal pool balance and its ledger entries

- **Story ID:** EP-02-S9
- **Status:** Done
- **Title:** System can store the metal pool balance and its ledger entries
- **As a:** System
- **I want:** a `metal_pools` table holding the balance with a version column, and a `pool_entries` ledger table with signed integer deltas
- **So that:** gold issued to karigars and gold recovered from parcels is stored exactly and the balance can be checked against its ledger (FR-02-2, FR-02-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a PoolEntry insert with `kind` `adjustment`, when it is written, then the database rejects it, and only `opening`, `issued` and `recovered` are accepted.
  2. Given entries with `deltaG` of +500.0000, -80.0000 and +79.6000, when they are stored, then the deltas are the integers `5000000`, `-800000` and `796000`.
  3. Given the stored ledger, when the sum of all `deltaG` values is compared with `metal_pools.balanceG`, then they are equal for the seeded data.
  4. Given the `metal_pools` table, when it is inspected, then `balanceG` is an integer in units of 0.0001 g and `version` is an integer.
  5. Given the `pool_entries` table, when it is inspected, then each entry has a not-null `location_id` referencing `locations`; v1 keeps one pool per shop, not one per location (per-location pools are deferred, D7).
- **Rules enforced on the server:** Enum check on entry kind. Weight columns are integers. Posting rules (which transitions post which entries, and keeping the balance equal to the ledger on every write) belong to EP-18; this story stores the rows.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; pool postings are audited by EP-18 and EP-06.
- **Data changes:** Migration creates `metal_pools` (one row per shop, D7) and `pool_entries`, both with shop ID. `pool_entries` carries `location_id` (not null, "Main shop" in v1, set by the server).
- **UI reference:** No screen
- **Non-functional checks:** Precision: `balanceG` and `deltaG` are integers of 0.0001 g; the seed balance is computed by summing integers, not floats. Concurrency: `version` on `metal_pools`. Time: `at` stored in UTC. D7 is decided: one pool per shop.
- **Depends on:** EP-02-S2, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S10: System can store problems, scrap requests and stock-out records

- **Story ID:** EP-02-S10
- **Status:** Done
- **Title:** System can store problems, scrap requests and stock-out records
- **As a:** System
- **I want:** tables for Problem, ScrapRequest and StockOutRecord, with a child table for the pieces in each stock-out
- **So that:** stop-the-line problems, scrap requests and pieces leaving stock are stored with who did them and when, and each stocked-out piece is linked to its record (FR-02-4, FR-02-5, FR-02-6, FR-02-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a Problem insert with target kind `lead` or status `resolved`, when it is written, then the database rejects it; target kind accepts `parcel`, `job`, `piece`, status accepts `open`, `cleared`, and `raisedByRole` accepts `owner`, `staff`, `karigar`.
  2. Given a ScrapRequest insert with status `approved` or a `pieceId` that does not exist, when it is written, then the database rejects it; status accepts `pending`, `scrapped`, `declined`.
  3. Given a stock-out of TAG-8841 and TAG-8802 with invoice number `INV-2026-0412`, when it is stored, then the record has two child rows, one per piece, and the same piece cannot appear twice in one stock-out.
  4. Given the `stock_outs` table, when it is inspected, then `amountINR` is nullable with no default, `invoiceNo` is text, and the foreign key from `pieces.stockOutId` to `stock_outs` now exists.
  5. Given a Problem whose target is piece TAG-8841, when it is stored, then the target kind and id are held so that a target id of a piece, parcel or job that does not exist is rejected.
- **Rules enforced on the server:** Enum checks as listed. The problem target uses one nullable foreign key column per kind (piece, parcel, job) with a check that exactly one is set and matches the kind, so the database enforces it. `scrap_requests.pieceId` and stock-out child rows reference `pieces`. Rules about who may raise or clear problems and the one-sale-per-piece rule are enforced by EP-24, EP-26 and EP-27.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; these actions are audited by EP-24, EP-26, EP-27 and EP-06.
- **Data changes:** Migration creates `problems`, `scrap_requests`, `stock_outs` and `stock_out_pieces`, and adds the foreign key `pieces.stockOutId`.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: `stock_out_pieces` has a unique key on piece id across all stock-outs, so the database itself refuses a second stock-out of the same piece (BR-02-4, double-sell prevention). Time: `raisedAt`, `clearedAt`, `requestedAt`, `decidedAt` and `at` in UTC. Open decision G13: a stock-out records no customer today; no customer column is added here.
- **Depends on:** EP-02-S5, EP-02-S6, EP-02-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S11: System can store audit entries

- **Story ID:** EP-02-S11
- **Status:** Done
- **Title:** System can store audit entries
- **As a:** System
- **I want:** an `audit_entries` table with actor, role, kind, summary, detail, reference and time
- **So that:** EP-06 has a table to write every owner decision and sensitive change into (FR-02-1, FR-02-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `audit_entries` is inspected, then it has id, time (UTC), actor id, actor name, actor role, kind, summary, detail and reference columns.
  2. Given an AuditEntry insert with kind `piece_deleted`, when it is written, then the database rejects it, and only `edit_applied`, `edit_refused`, `loss_accepted`, `parcel_sent_back`, `parcel_last_digit`, `problem_cleared`, `scrap_marked`, `scrap_declined`, `stock_out` and `setting_changed` are accepted until EP-06 extends the list by migration.
  3. Given an AuditEntry insert with actor role `admin`, when it is written, then the database rejects it.
  4. Given an AuditEntry whose actor id does not exist in `users`, when it is written, then the database rejects it.
- **Rules enforced on the server:** Enum checks on kind and actor role. Foreign key from actor id to `users`. Making the table append-only (no update, no delete) and writing an entry on every transition belong to EP-06.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates the audit table; it writes no entries.
- **Data changes:** Migration creates `audit_entries` with an index on time and on reference, so EP-06 can list by date and by tag, batch or job.
- **UI reference:** No screen
- **Non-functional checks:** Audit: the table has no column that later code must update; every field is set at insert. Time: `at` stored in UTC. Personal data: `actorName` and free-text `detail` may contain personal data and are listed for EP-39.
- **Depends on:** EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S12: System can store broadcasts, wishes and settings

- **Story ID:** EP-02-S12
- **Status:** Done
- **Title:** System can store broadcasts, wishes and settings
- **As a:** System
- **I want:** a `broadcasts` table with child tables for recipients and shared pieces, a `wishes` table, and a `settings` table
- **So that:** marketing messages, birthday and anniversary wishes, and shop settings are stored with the rest of the data (FR-02-1, FR-02-4, FR-02-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a broadcast to audience `VIP Bridal` with two pieces and three recipients, when it is stored, then it has two piece rows referencing `pieces` and three recipient rows referencing `customers`; audience accepts the four customer groups or `All`.
  2. Given a WishRecord insert with kind `festival` or a `customerId` that does not exist, when it is written, then the database rejects it; kind accepts `birthday` and `anniversary`.
  3. Given the `settings` table after migration, when it is read, then it holds one row with `pricingEnabled` false, `leadSlaHours` 8, `requireEditToken` true, the three notify-channel flags, `lateLeadAudience` and `autoSendWishes`.
  4. Given a second settings row for the same shop, or a `lateLeadAudience` value other than `staff_then_owner` or `owner_only`, when it is written, then the database rejects it.
- **Rules enforced on the server:** Enum checks on audience, wish kind and late-lead audience. One settings row per shop, unique on shop ID (D7). `leadSlaHours` must be greater than 0. Foreign keys from recipients to customers, from broadcast pieces to pieces, and from wishes to customers.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Tables only; settings changes are audited as `setting_changed` by EP-13 and EP-06.
- **Data changes:** Migration creates `broadcasts`, `broadcast_recipients`, `broadcast_pieces`, `wishes` and `settings`, and inserts the default settings row.
- **UI reference:** No screen
- **Non-functional checks:** Personal data: broadcast message text and recipient links are personal data for EP-39. Time: `at` columns in UTC. D7 is decided: one settings row per shop.
- **Depends on:** EP-02-S4, EP-02-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S13: Developer can load the prototype seed into an empty dev or staging database

- **Story ID:** EP-02-S13
- **Status:** Done
- **Title:** Developer can load the prototype seed into an empty dev or staging database
- **As a:** Developer
- **I want:** a seed command that loads the content of `src/data/seed.ts` and `src/data/seedRows.ts` into an empty development or staging database
- **So that:** every developer and the staging environment start with the same realistic shop data the prototype shows (FR-02-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty, fully migrated development database, when the seed command runs, then parcels BATCH-2026-041, 043, 044, 045 and 046, karigars KG-01 Lakshmi Devi, KG-02 Mahesh Soni and KG-04 Vijay Kumar, and staff ST-01 Rajesh Verma, ST-02 Deepak Rao and ST-03 Sanjay Seth are present (epic acceptance criterion 4).
  2. Given the seeded database, when the scales are read, then Bench balance has readability 0.0001 g and capacity 600 g, and Platform scale has readability 0.01 g and capacity 30 kg.
  3. Given every weight in `STOCK_ROWS` (for example TAG-8701 gross 30.5582 g, stone 3.8469 g), when it is seeded and read back, then the four-decimal display equals the seed value exactly, because conversion uses the EP-02-S2 helpers on the decimal text, not float multiplication.
  4. Given the seeded database, when every money socket column (`valueINR`, `budgetINR`, `spentINR`, `amountINR`) is queried, then every value is null, and settings show `pricingEnabled` false, `leadSlaHours` 8, `requireEditToken` true (epic acceptance criterion 6).
  5. Given a database that already holds rows, or the production environment, when the seed command runs, then it refuses with a message and changes nothing.
  6. Given the seed, when it is inspected, then demo times from `demoNow` are converted to UTC timestamps relative to the load time, child rows keep the prototype array order, and `heldForLeadId` values are dropped.
- **Rules enforced on the server:** The seed command checks the environment name and refuses production. It runs in one transaction, so a failed seed leaves the database empty. All rows pass the same constraints as live writes.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Seed data is loaded below the product; no actor exists yet. Seeded `audit_entries` rows from the prototype are loaded as data.
- **Data changes:** Inserts seed rows into every table created in EP-02-S3 to EP-02-S12, plus one User row per seeded staff member and karigar so seeded records have valid actors.
- **UI reference:** No screen. Smoke check: the staff `today` route shows the seeded parcels once EP-03 serves them.
- **Non-functional checks:** Precision: a test compares every seeded weight to its source string. Security: seeded users have no usable password; sign-in for them is set up through the EP-04 activation link. The seed creates one shop row so every seeded record has a shop ID. Personal data: seed customers are fictional; real customer data is never used in dev or staging. Open question: if human ids such as BATCH-2026-044 become display references next to an internal key, the seed keeps them in the reference column.
- **Depends on:** EP-02-S2, EP-02-S3, EP-02-S4, EP-02-S5, EP-02-S6, EP-02-S7, EP-02-S8, EP-02-S9, EP-02-S10, EP-02-S11, EP-02-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-02-S14: System can reject a stale write on a versioned record

- **Story ID:** EP-02-S14
- **Status:** Done
- **Title:** System can reject a stale write on a versioned record
- **As a:** System
- **I want:** every update to Piece, Parcel, Lead, LeadItem, KarigarJob, PieceEdit and MetalPool to succeed only when the version it read is still current, and to increase the version by 1 when it succeeds
- **So that:** two staff changing the same record at once cannot silently overwrite each other, and two staff selling the same piece cannot both succeed (FR-02-7, BR-02-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Piece TAG-8841 at version 3, when two updates both read version 3 and both commit, then the first succeeds and sets version 4, and the second fails with a conflict error that names the entity and id (epic acceptance criterion 3).
  2. Given a failed stale update, when the record is read, then it holds exactly the values written by the first update.
  3. Given each of the seven versioned tables, when the data-access helper updates a row with a stale version, then the same conflict error type is returned, so EP-03 can map it to one conflict response.
  4. Given a write that changes several versioned rows in one transaction (for example a parcel and its pieces), when any one row is stale, then the whole transaction is rolled back.
  5. Given a test that runs 20 concurrent updates on one Piece starting from the same version, when they finish, then exactly one succeeds.
- **Rules enforced on the server:** Updates use a conditional write (`where id = ? and version = ?`) or a row lock inside a transaction; an update that matches no row is a conflict, never a silent no-op. Version is set only by the server.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A rejected write changes no state.
- **Data changes:** None in the product database schema beyond the version columns added in EP-02-S5 to EP-02-S9. Adds the versioned update helper and its conflict error type in the `api` data-access layer.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: a stale write returns a clear conflict, never a silent overwrite (epic section 13); the concurrent test runs in CI. D1 is decided (Option C): the check lives in the Node API's data-access layer and runs inside the API's transaction.
- **Depends on:** EP-02-S5, EP-02-S6, EP-02-S7, EP-02-S8, EP-02-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D7 is decided: one shop, no branches; every business table gets a shop ID now (EP-02-S1, S3, S4, S9, S12).
- D1a: which cloud provider hosts the managed PostgreSQL database? D2 (PostgreSQL) and D10 (India region) are decided; the exact India region follows the provider. It also decides how CI and the deploy pipeline reach the private network. (EP-02-S1)
- G10: should stored weights be integers of 0.0001 g as PRODUCTION-SCOPE §5 says, or a finer unit (the prototype uses 0.00001 g) so the half-step ceiling is exact? (EP-02-S2, S4, S6)
- Is net gold stored on each record, or always derived from gross and stone weights? (EP-02-S5, S6)
- Are human-readable ids such as `BATCH-2026-044`, `LD-2026-…` and `KG-04` kept as the primary key, or kept as a display reference next to an internal key? (EP-02-S3 to S13)
- G13: should `Customer.history` be derived from stock-outs (which today record no customer), or stored separately? (EP-02-S4, S10)
- G14: does one hand-over parcel link to many jobs (mockup 12) instead of the single `Parcel.jobId`? (EP-02-S6, S8)
