# EP-02: Database and data model

## 1. Summary

This epic turns the prototype's typed in-memory model into a real database. Today every lead, parcel, tag, edit and
stock-out lives in browser memory and is lost on reload. The business needs these records to survive reloads, crashes
and redeploys, and it needs gold weights stored exactly, because the parcel match gate compares weights to four
decimals. This epic creates the schema for every entity in `src/types/jewellery.ts`, adds the shop, users and
sessions, sets integer weight units, and provides migrations and a development seed. D7 is decided: one shop, no
branches. Every business table still carries a shop ID from the first migration, so multi-shop later does not need a
migration of every table.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Partial. The full typed model exists in `src/types/jewellery.ts` with an in-memory `AppState` and seed data, but there is no database, no migrations, and weights are float grams.

## 3. Roles involved

- System: runs migrations on deploy, loads seed data into development and staging, enforces keys and constraints.
- Developer (not a product role): writes migrations and seed scripts.
- Owner, Staff, Karigar: not involved directly. Every record they create later is stored in this schema.

## 4. In scope

- A PostgreSQL schema (D2, decided) on the managed PostgreSQL database for every entity in `src/types/jewellery.ts`: Scale, Piece, PieceEdit, ParcelWeighing, ManifestRow, Parcel, Lead, LeadItem, LeadField, OrderCopy, KarigarJob, Karigar, StaffMember, Customer, HistoryRow, Problem, ScrapRequest, AuditEntry, StockOutRecord, PoolEntry, MetalPool, Broadcast, WishRecord, Settings.
- New entities: shops, users, sessions. No branches table (D7).
- Child tables for arrays now embedded in records: `Parcel.qcDone`, `Parcel.weighings`, `Parcel.manifest`, `Lead.items`, `Lead.fields`, `Broadcast.recipientIds`, `StockOutRecord.pieceIds`, `Karigar.gapsMg`, `Piece.photos`, `OrderCopy.refImages`.
- Integer weight columns in units of 0.0001 g, with conversion helpers in the shared package.
- Nullable money sockets from day one (`Piece.valueINR`, `Customer.budgetINR`, `Customer.spentINR`, `StockOutRecord.amountINR`), unused until EP-42.
- A version column (or row-lock pattern) on records that two people can change at once: Piece, Parcel, Lead, LeadItem, KarigarJob, PieceEdit, MetalPool.
- A migrations tool and the first migration set.
- A dev and staging seed built from `src/data/seed.ts` and `src/data/seedRows.ts`.
- Id generation that keeps human-readable references (decision recorded as open, see section 17).
- A shop ID column (not null, foreign key to `shops`) on every business table from the first migration (D7 forward-compatibility rule).
- Uniqueness scoped to the shop: tag number, HUID and phone are unique per shop ID, not across the database.
- A `locations` table (id, shop ID, name) with one default row "Main shop" created with the shop, and a location ID (not null, foreign key to `locations`) on every record that holds or measures gold: pieces, parcels, parcel weighings (trays), pool entries and scales. The server sets it; the client never sends it (D7).
- The user's email column (required, D4) and the password and link tables used by EP-04.

## 5. Out of scope

- The API that reads and writes this schema (EP-03).
- Session issue and expiry logic (EP-04); this epic only stores sessions.
- The append-only enforcement of the audit table and the write-on-every-transition rule (EP-06).
- Reference data values such as categories, purities and tag formats (EP-15).
- Scale readability values and the ceiling formula (EP-14).
- Metal pool posting rules (EP-18).
- Backups and point-in-time restore (EP-38).
- Loading real karigars, customers and stock for launch (EP-41).
- Any price logic for the money sockets (EP-42).

## 6. Current state in the prototype

- `src/types/jewellery.ts` defines the full model and `AppState` (lists of scales, pieces, edits, parcels, leads, orderCopies, jobs, karigars, staff, customers, problems, scrapRequests, audit, stockOuts, pool, broadcasts, wishes, settings, and a `seq` counter).
- `PieceStatus` has six states: `draft`, `with_owner`, `stopped`, `in_stock`, `billed`, `scrapped`. `Piece` also holds `prevStatus`, `heldForLeadId`, `valueINR`, `stockOutId`. Production v1 has no holds, so `heldForLeadId` is not carried into the schema.
- `Parcel` holds `stage` (1, 2 or 3), `status` (`open`, `stopped`, `released`), `resolution` (`sent_back`, `rechecking`, `loss_accepted`), `qcDone[]`, `verdict` (`incomplete`, `exact`, `last_digit`, `mismatch`), `gapNetG`, `lossG`, `lossReason`.
- `LeadItem.route` is `{kind:'stock', pieceId}` or `{kind:'make', jobId}`. `LeadState` is `needs_glance`, `opened`, `being_worked`, `converted`, `lost`. `JobStatus` is `sent`, `accepted`, `on_bench`, `ready`, `handed_over`.
- Weight fields are float grams: `grossG`, `stoneG`, `targetGrossG`, `targetNetG`, `toleranceG`, `goldIssuedG`, `approxWeightG`, `readabilityG`, `capacityG`, `deltaG`, `balanceG`, `gapNetG`, `lossG`, `pureG`. Net weight is derived by `netOf` and not stored.
- `src/domain/weights.ts` uses `UNITS_PER_G = 100000` (0.00001 g) internally, because the scale ceiling adds half-steps of readability (gap G10).
- Ids come from `nextId` in `src/store/transitions.ts` with prefixes `LD-2026`, `LI`, `MO-2026`, `OC-2026`, `PL`, `BATCH-2026`, `MF`, `WG`, `PR`, `ED`, `SO`, `SR`, `CU`, `ST`, `SC`, `BC`, `WS`, `AU`, and karigars use `KG-NN`. Tag numbers such as `TAG-9101` are typed by staff.
- Times are epoch milliseconds on a demo clock (`src/domain/clock.ts`, `demoNow`).
- Seed: scales Bench balance (0.0001 g, 600 g) and Platform scale (0.01 g, 30 kg); karigars KG-01 Lakshmi Devi, KG-02 Mahesh Soni, KG-04 Vijay Kumar; staff ST-01 Rajesh Verma, ST-02 Deepak Rao, ST-03 Sanjay Seth (owner); parcels BATCH-2026-041, 043, 044, 045, 046; settings `pricingEnabled false`, `leadSlaHours 8`, `requireEditToken true`.
- Reusable: the type definitions as the basis of the schema and API contract; the seed as dev and staging data; `netOf` and weight helpers moved to `shared`.
- Must be rebuilt server-side: storage, constraints, transactions, version checks, id generation, and integer weight storage. `Customer.history` is stored seed data today, not derived (gap G13).

## 7. Functional requirements

- FR-02-1. The schema has a table (or equivalent) for every entity listed in section 4, and a migration creates it from empty.
- FR-02-2. Every weight column stores an integer in units of 0.0001 g; no weight column has a floating-point type.
- FR-02-3. The shared package converts between grams shown to people (four decimals) and stored integers without loss for any value with up to four decimals.
- FR-02-4. Every array field embedded in a prototype record is stored as rows in a child table with a foreign key to its parent.
- FR-02-5. Every foreign key named in `src/types/jewellery.ts` (for example `KarigarJob.karigarId`, `Piece.parcelId`, `LeadItem.route.pieceId`) is enforced by the database.
- FR-02-6. Enumerated fields (`PieceStatus`, `ParcelStatus`, `Verdict`, `LeadState`, `JobStatus`, `EditStatus`, `RoleId`) reject values outside their lists.
- FR-02-7. Records that two people can change at once carry a version number, and an update with a stale version fails.
- FR-02-8. Money socket columns exist, are nullable, and hold null in every seeded record.
- FR-02-9. All timestamps are stored in UTC.
- FR-02-10. A migration can be applied forward on staging and production without data loss, and the migration history is recorded.
- FR-02-11. A seed command loads the `src/data/seed.ts` content into an empty development or staging database.
- FR-02-12. The users table links each user to one role (`owner`, `staff`, `karigar`) and, for karigars, to one Karigar record.
- FR-02-13. Every business table has a shop ID column, not null, with a foreign key to `shops`; the data-access layer sets it from the signed-in user's session, never from the client (D7).
- FR-02-14. Unique constraints on tag number, HUID and phone include the shop ID.
- FR-02-15. Pieces, parcels, parcel weighings (trays), pool entries and scales each carry a not-null location ID; in v1 it is always the shop's default location "Main shop", set by the server.

## 8. Business rules

- BR-02-1. Store all weights as integers in units of 0.0001 g; never store grams as floating point; the match gate compares integers. [PRODUCTION-SCOPE §5 Precision]
- BR-02-2. The scale-derived ceiling is `Σ ½ × readability` over the weighings, which produces half-steps finer than 0.0001 g; the unit size for the ceiling is an open conflict. [SCOPE-ANALYSIS App. E; gap G10]
- BR-02-3. Money fields exist as nullable sockets from day one and are not used until pricing is turned on. [SCOPE-ANALYSIS App. G rule 1]
- BR-02-4. Two staff selling the same piece must not both succeed; use transactions with row locks or version checks. [PRODUCTION-SCOPE §5 Concurrency]
- BR-02-5. Store UTC; display Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]
- BR-02-6. Derived values such as net weight and the match verdict are recomputed by the server, not trusted from the client. [PRODUCTION-SCOPE §1 Authoritative]
- BR-02-7. One shop, no branches in v1; every business table carries a shop ID from the first migration so multi-shop later does not mean migrating every table. [PRODUCTION-SCOPE §4 D7; decisions/tenancy-and-branches.md]
- BR-02-8. There are three roles only: owner, staff, karigar. [SCOPE-ANALYSIS App. A; src/types/jewellery.ts RoleId]
- BR-02-9. The schema covers every entity in `src/types/jewellery.ts` plus shops, users and sessions. [PRODUCTION-SCOPE §6 EP-02 scope]
- BR-02-10. Tag number, HUID and phone are unique within a shop. [D7]
- BR-02-11. Every record that holds or measures gold carries a location ID; v1 has one location, "Main shop"; transfers and per-location pools are deferred. [D7; decisions/tenancy-and-branches.md]

## 9. Data

- Every business table below also has a shop ID (not null, foreign key to Shop). It is not repeated on each line.
- Location: id, shop ID, name (one row in v1, "Main shop", created with the shop).
- Location ID (not null, set by the server) is carried by: Piece, Parcel, ParcelWeighing (tray), PoolEntry, Scale.
- Scale: id, location ID, name, `readabilityG` and `capacityG` (integer, units of 0.0001 g).
- Piece: id, tag number (unique per shop), name, category, purity, `grossG` and `stoneG` (integer, units of 0.0001 g), stone count, HUID (unique per shop when present), status (six values), prevStatus, parcelId, stockOutId, `valueINR` (nullable value socket, unused until EP-42), version.
- PieceEdit: id, pieceId, field, before, after, reason, status (`proposed`, `token_sent`, `applied`, `refused`, `void`), token reference, tokenIssuedAt, proposedBy, version. Weight before/after values are integer, units of 0.0001 g.
- Parcel: id (for example `BATCH-2026-044`), jobId, stage, status, resolution, verdict, `gapNetG` and `lossG` (integer, units of 0.0001 g), lossReason, version. Children: ParcelWeighing (scaleId, `grossG`, `stoneG`, integer, units of 0.0001 g), ManifestRow, QC ticks.
- Lead, LeadItem (`approxWeightG`, integer, units of 0.0001 g; route kind and target id), LeadField (name, value, confidence).
- OrderCopy and KarigarJob: `targetGrossG`, `targetNetG`, `toleranceG`, `goldIssuedG` (integer, units of 0.0001 g), dueDate, confirmedDate, status, version.
- Karigar (wastage allowance, language (stored only, unused until EP-44), specialty, gap history in milligrams converted to integer, units of 0.0001 g), StaffMember, Customer (`budgetINR`, `spentINR`: nullable value sockets, unused until EP-42), HistoryRow (`pureG`, integer, units of 0.0001 g).
- Problem, ScrapRequest, StockOutRecord (`amountINR`: nullable value socket, unused until EP-42; child rows for pieceIds), AuditEntry.
- MetalPool (`balanceG`, integer, units of 0.0001 g, version) and PoolEntry (`deltaG`, integer, units of 0.0001 g).
- Broadcast (child rows for recipients), WishRecord, Settings.
- New: Shop (id, name, address, GSTIN, logo key, setup completed at; one row in v1, created by the setup wizard EP-45), User (id, shop ID, name, phone unique per shop, email required, role, karigarId nullable, status `pending_activation`/`active`/`deactivated`), Session (id, shop ID, userId, created, expires, ended). No Branch entity (D7).

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API. This epic
exposes no product operations of its own; the operations below are administrative.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Apply | Migration | Move the schema forward one version | System (deploy pipeline) |
| Read | Migration history | See which migrations ran where | Developer |
| Load | Seed data | Fill an empty dev or staging database from `src/data/seed.ts` | Developer, System (staging reset) |
| Convert | Weight value | Grams to integer units of 0.0001 g and back (shared helper) | Any package |

## 11. Live events

None. The schema stores state; events are published by the epics that change state (EP-07 carries them).

## 12. Screens and UX references

No screen of its own. Every screen in `src/nav.ts` reads data stored here; the weight readouts in
`parcel-match` and `parcel-clear` (mockups `04-parcel-match.svg`, `14-match-rule-any-parcel.svg`) depend most
directly on the integer weight units.

## 13. Non-functional requirements

- Precision: every weight column is an integer in units of 0.0001 g; tests cover the round trip of 4-decimal grams; the ceiling unit conflict (G10) is settled before EP-23.
- Concurrency: version columns on Piece, Parcel, Lead, LeadItem, KarigarJob, PieceEdit and MetalPool; a stale write returns a clear conflict, never a silent overwrite.
- Personal data: Customer name, phone, birthday, anniversary and consent fields are personal data under the DPDP Act 2023; columns are identifiable for later deletion and export (EP-39).
- Security: users and sessions tables hold no plain-text passwords, links or token values; those columns hold hashes or references.
- Tenancy: every business table has a not-null shop ID; a test lists every table and fails if one lacks it (D7).
- Availability and recovery: the schema works with the backup method EP-38 picks (point-in-time restore, recovery point under 1 hour).
- Time: every timestamp column stores UTC.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-01
- Downstream: EP-03, EP-14, EP-15, EP-18, EP-38, EP-41.

## 15. Epic acceptance criteria

1. Given an empty database, when the migrations run, then every entity in section 9 exists with its keys and constraints.
2. Given a parcel weighing of 12.3456 g gross, when it is saved and read back, then the stored value is the integer 123456 and the displayed value is 12.3456 g.
3. Given two updates to the same Piece with the same starting version, when both commit, then the second fails with a conflict.
4. Given the seed command, when it runs on an empty development database, then the parcels BATCH-2026-041 to 046, the three karigars and the three staff from `src/data/seed.ts` are present.
5. Given a Piece insert with status `sold`, when it is written, then the database rejects it.
6. Done when no weight column uses a floating-point type and every money socket column is nullable and empty.

## 16. Risks

- Risk: the ceiling needs half-steps of 0.00005 g, which 0.0001 g integers cannot hold, so the match gate disagrees with mockup 14. Mitigation: settle G10 before EP-23, for example a finer stored unit or a doubled half-step unit, and record the choice here.
- Risk: a later table is added without a shop ID, or a unique constraint without it, so multi-shop later needs a migration. Mitigation: the schema test fails any business table without a not-null shop ID (D7).
- Risk: embedded arrays become child tables and seed conversion loses order (for example `Parcel.weighings`). Mitigation: store an explicit position column on ordered child rows.
- Risk: human ids built from a per-store counter (`seq`) collide when many servers write at once. Mitigation: generate ids in the database with a sequence per prefix.
- Risk: float grams in the seed convert with rounding error. Mitigation: convert from the decimal strings, not from floats, and test every seeded weight.

## 17. Open decisions and questions

- D7 is decided: one shop, no branches; every business table gets a shop ID now ([decision record](../decisions/tenancy-and-branches.md)).
- D1a: which cloud provider hosts the managed PostgreSQL database? D2 (PostgreSQL) and D10 (India region) are decided; the exact India region follows the provider.
- G10: should stored weights be integers of 0.0001 g as PRODUCTION-SCOPE §5 says, or a finer unit (the prototype uses 0.00001 g) so the half-step ceiling is exact?
- Is net gold stored on each record, or always derived from gross and stone weights?
- Are human-readable ids such as `BATCH-2026-044`, `LD-2026-…` and `KG-04` kept as the primary key, or kept as a display reference next to an internal key?
- G13: should `Customer.history` be derived from stock-outs (which today record no customer), or stored separately?
- G14: does one hand-over parcel link to many jobs (mockup 12) instead of the single `Parcel.jobId`?

## 18. Candidate stories

1. EP-02-S1: Developer can apply and track schema migrations in every environment
2. EP-02-S2: Developer can convert grams to integer units of 0.0001 g and back in the shared package
3. EP-02-S3: System can store the shop, users and sessions
4. EP-02-S4: System can store master records: scales, karigars, staff and customers
5. EP-02-S5: System can store pieces and piece edits with version checks
6. EP-02-S6: System can store parcels with weighings, manifest rows and QC ticks as child rows
7. EP-02-S7: System can store leads with their items and parsed fields
8. EP-02-S8: System can store order copies and karigar jobs
9. EP-02-S9: System can store the metal pool balance and its ledger entries
10. EP-02-S10: System can store problems, scrap requests and stock-out records
11. EP-02-S11: System can store audit entries
12. EP-02-S12: System can store broadcasts, wishes and settings
13. EP-02-S13: Developer can load the prototype seed into an empty dev or staging database
14. EP-02-S14: System can reject a stale write on a versioned record
