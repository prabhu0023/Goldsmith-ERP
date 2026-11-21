# Database (EP-02)

PostgreSQL schema, migration runner, seed and data-access helpers for the api. Local commands are in the [README](../../README.md#database-local). Stories: [EP-02 stories](../stories/EP-02-stories.md). Tenancy: [D7](../decisions/tenancy-and-branches.md).

Code: `packages/api/migrations/` (SQL), `packages/api/src/db/` (connection, migrator, CLI, data-access layer, seed), `packages/api/test/db/` (one test file per story). Weight helpers: `packages/shared/src/domain/weights.ts`.

## Tool choices

| Choice | Decision | Reason |
| --- | --- | --- |
| Driver and data access | `pg` ^8 (node-postgres) with plain parameterised SQL and a small typed helper layer in `packages/api/src/db/` | Transactions and row locks stay explicit, which S14 needs. BIGINT weights come back as plain integers through one type parser. Kysely is still 0.x and would need hand-written types for about 35 tables; an ORM would hide the transactions. |
| Migration tool | Own forward-only runner (`src/db/migrator.ts`) | Numbered `NNNN_name.sql` files; a `schema_migrations` table with version, name, sha256 checksum and `applied_at timestamptz`; each file and its history row commit in one transaction; `pg_advisory_lock` stops parallel runs. This matches S1 exactly (atomic history row, a checksum error that names the file and applies nothing, "up to date", status in UTC). Postgrator 8 writes the history row in a separate query after the script and names the version, not the file, in its checksum error. No extra dependency. |
| PostgreSQL major | 17 (`postgres:17`, locally and as the CI service) | Current major; nothing needs 18. `gen_random_uuid()` is built in. |
| Where the code lives | `packages/api` | S1 and S14 name the api package, and D1 makes the api the only database client. `packages/shared` gets only the weight helpers (S2) and stays free of database code. |
| Seed source | Bundle `packages/web/src/data/seed.ts` with esbuild at seed time; a small plugin turns `.jpg` imports into their file names | The prototype seed imports image files, so Node cannot load it directly. Bundling reuses it unchanged: no edits to web and no copy that drifts. |
| Local credentials | `postgres` / `postgres`, databases `goldsmith_dev` and `goldsmith_test`, bound to `127.0.0.1:5432` | Image defaults, obviously local. The custom gitleaks rule needs entropy ≥ 3.0; `postgres` scores 2.75. |

New dependencies, all in `packages/api`: `pg` ^8.23.1 (runtime), `@types/pg` ^8.23.1 and `esbuild` ^0.27.0 (development; esbuild was already the root version).

## Schema overview

Migrations `0001` to `0010`, one per story S3 to S12, then fixes from the EP-02 review:

| Migration | Tables |
| --- | --- |
| `0001_shops_users_sessions` | `shops`, `locations` (one per shop, "Main shop", created by a trigger), `users`, `sessions`, `password_links`; function `bump_version()` |
| `0002_master_records` | `scales`, `karigars`, `karigar_gap_history`, `staff_members`, `customers`, `customer_history`; `users.karigar_id` foreign key |
| `0003_pieces_and_edits` | `pieces`, `piece_photos`, `piece_edits` |
| `0004_parcels` | `parcels`, `parcel_weighings`, `parcel_manifest_rows`, `parcel_qc_ticks` |
| `0005_leads` | `leads`, `lead_items`, `lead_fields` |
| `0006_order_copies_and_jobs` | `karigar_jobs`, `order_copies`, `order_copy_images`; job foreign keys on parcels, pieces and lead items |
| `0007_metal_pool` | `metal_pools` (one per shop), `pool_entries` |
| `0008_problems_scrap_stock_outs` | `problems`, `scrap_requests`, `stock_outs`, `stock_out_pieces` |
| `0009_audit_entries` | `audit_entries` (append-only: UPDATE, DELETE and TRUNCATE raise an error) |
| `0010_broadcasts_wishes_settings` | `broadcasts`, `broadcast_recipients`, `broadcast_pieces`, `wishes`, `settings` (one per shop, created with the shop) |
| `0011_shop_matched_references` | `unique (shop_id, id)` on every referenced table; every foreign key between shop-scoped tables becomes `(shop_id, x_id)` |
| `0012_opted_in_personal_data` | `personal data (DPDP)` comment on `customers.opted_in` |
| `0013_code_counters` | `code_counters (shop_id, prefix, last_value)`: per-shop counters behind `nextCode()` (EP-03-S7) |
| `0014_idempotency_records` | `idempotency_records (key, operation, user_id, result_id, created_at, expires_at)`, unique `(key, operation, user_id)`: the created id of each create sent with an `Idempotency-Key` (EP-03-S8); expires after `IDEMPOTENCY_RETENTION_HOURS` (default 24) |
| `0015_idempotency_input_hash` | `idempotency_records.input_hash`: SHA-256 of the validated input; a repeat with the same key and a different hash is refused as `conflict` (EP-03-S8, PR #3 review) |

Conventions every table follows:

- **Keys.** `id uuid` primary key. The prototype id (`TAG-8841`, `BATCH-2026-044`, `KG-04`, `LD-2026-208`) goes in `code` (pieces: `tag_no`), unique per shop. Child rows keep the prototype id, if any, in a nullable `code`.
- **Shop and location (D7).** Every table except `shops` and `schema_migrations` has `shop_id not null` referencing `shops`. Gold records (`scales`, `pieces`, `parcels`, `parcel_weighings`, `pool_entries`) also have `location_id not null` with no default. `insertScoped` sets both from the server's `ShopContext` and ignores any value in the input.
- **Weights.** `<name>_units bigint` in units of 0.0001 g (`48.65 g` = `486500`). Converted only with `gramsToUnits(text)` and `unitsToGrams(units)` from `@goldsmith/shared`, digit by digit, never through float multiplication. The pool reads BIGINT as a JavaScript number and throws if one leaves the safe integer range. No float column exists anywhere.
- **Money sockets.** `value_inr`, `budget_inr`, `spent_inr`, `amount_inr`: `numeric(14,2)`, nullable, no default.
- **Times.** `timestamptz` only, every connection runs with `TimeZone=UTC`. Calendar dates (`dob`, `anniversary`, `open_since`) are `date`.
- **Enums.** `text` with a `check (... in (...))` constraint.
- **Foreign keys.** A reference between two shop-scoped tables is composite, `(shop_id, x_id) references parent (shop_id, id)`, so a row cannot point at another shop's parent, scale or location (`0011`, `cross-shop.test.ts`). All are `deferrable initially immediate`: errors are immediate, and the seed defers them to load cyclic links (job ↔ order copy, job ↔ parcel).
- **Versions.** `pieces`, `piece_edits`, `parcels`, `leads`, `lead_items`, `karigar_jobs`, `metal_pools` have `version integer not null default 1`; the `bump_version` trigger raises it on every update, so only the database sets it.
- **Ordered child rows.** `position integer not null`, unique per parent.
- **People's names** from the prototype (`taggedBy`, `proposedBy`, `raisedBy`) stay `*_by_name text`, not foreign keys. Audit entries have a real `actor_id` foreign key to `users`.
- **Secrets.** No plain-text secret: `users.password_hash`, `password_links.token_hash`, `piece_edits.token_ref`.

## Data-access layer (`packages/api/src/db/index.ts`)

- `createPool(url, max)`: a `pg.Pool` in UTC with the BIGINT parser.
- `withTransaction(pool, fn)`: begin, commit when `fn` resolves, roll back when it throws. A client whose connection broke is released with the error, so the pool discards it.
- `loadShopContext(client, shopId)` → `{ shopId, locationId }`; `insertScoped(client, ctx, table, values)`: parameterised insert that sets `shop_id` (and `location_id` on the gold tables) from the context.
- `updateVersioned(client, ctx, { table, id, expectedVersion, set })`: `update … where id = $1 and shop_id = $2 and version = $3`. No row matched: if the id does not exist in the caller's shop (missing, or another shop's row) → `RowNotFoundError` (`code 'ROW_NOT_FOUND'`, `entity`, `id`), mapped by EP-03 to `not_found`; otherwise → `StaleWriteError` (`code 'STALE_WRITE'`, `entity`, `id`, `expectedVersion`), the same type for all seven versioned tables, mapped to `conflict`.
- `nextCode(client, ctx, { table, prefix, pad = 3 })` → `<prefix>-<number>` (e.g. `LD-2026-214`): one atomic upsert on `code_counters` (`0013`), so parallel creates get distinct codes; a prefix used for the first time continues after the highest existing code in `table`. Primary keys stay internal uuids; the code is the record's id in the API.

## Seed

`npm run db:seed` loads the prototype's `initialState()` into one shop, "Jai Gulab Dev Jewellers", in one transaction, and prints the row count per table (92 pieces, 5 parcels, 3 karigars, 3 staff, 6 users, 8 customers, 11 leads, 9 jobs, 2 order copies, 8 stock-outs with 23 pieces, 10 pool entries, 3 audit entries, 4 wishes). It refuses `APP_ENV=production` and any database that already has a shop, and then changes nothing. Demo times are moved so the prototype's "now" (1 November 2026, 11:06) is the moment of seeding. Users are created for each staff member and karigar with status `pending_activation`, no password and an `@example.com` email. Not carried over: `heldForLeadId`, edit tokens, the id counter and the last-used scale.

## Acceptance criteria map (EP-02-S1 to S14)

Test files are in `packages/api/test/db/` unless noted. "Staging" items wait on decision D1a (cloud provider) and EP-01-S12 (deploy job); every story's "deployed to staging" definition-of-done item waits on the same.

| Story | Criterion | How it is met | Proof |
| --- | --- | --- | --- |
| S1 | AC1 migrate an empty database in number order, exit 0 | `npm run db:migrate` → `src/db/migrator.ts`, files sorted by number | `migrator.test.ts`; CI step "Migrate an empty database" |
| S1 | AC2 re-run reports "up to date" | Pending list empty → `Database is up to date (N migrations applied).` | `migrator.test.ts` (CLI run); CI runs migrate twice |
| S1 | AC3 status lists number, name, UTC time, checksum | `npm run db:status` from `schema_migrations` | `migrator.test.ts` |
| S1 | AC4 changed applied file stops with an error naming it, applies nothing | `MigrationChecksumError` checked before any file runs | `migrator.test.ts` |
| S1 | (review) applied file deleted from disk: `db:status` shows it as `missing`, `db:migrate` stops naming it and applies nothing | `MigrationMissingError` checked before any file runs | `migrator.test.ts` |
| S1 | AC5 staging deploy applies migrations before the new build; failure stops the deploy | **Remains.** Needs the deploy job (EP-01-S12) and the private-network route (D1a). The CLI exits 1 on a failed migration, which the deploy step can gate on. | — |
| S1 | AC6 first migration records D7 | Header comment of `0001_shops_users_sessions.sql` | `schema.test.ts` |
| S1 | Rule: no half-applied migration | Each file and its history row in one transaction | `migrator.test.ts` (failing `0002` leaves no table, no row) |
| S2 | AC1 `12.3456` ↔ `123456` | `gramsToUnits`, `unitsToGrams` | `packages/shared/test/weights.test.ts` |
| S2 | AC2 `48.65`, `0.0001`, `0`, `146.3632`, `30000` round trip | Same | `weights.test.ts` |
| S2 | AC3 `12.34567`, `12,3a` rejected, never rounded | `{ ok: false, error }` | `weights.test.ts` |
| S2 | AC4 `-0.0400` keeps its sign | Same | `weights.test.ts` |
| S2 | AC5 10000 units per gram; net = gross − stone in integers | `STORED_UNITS_PER_G`, `netUnits`. `UNITS_PER_G` (100000) stays for the match ceiling until G10 is settled. | `weights.test.ts` (`netUnits(486500, 70600) === 415900`) |
| S3 | AC1 `shops`, `users`, `sessions` exist; no `branches` | `0001` | `shop-users.test.ts` |
| S3 | AC2 role `manager` rejected | Check constraint | `shop-users.test.ts` |
| S3 | AC3 bad status or missing email rejected | Check, not null | `shop-users.test.ts` |
| S3 | AC4 session with unknown user rejected | Foreign key | `shop-users.test.ts` |
| S3 | AC5 no plain-text password or token | Secret columns end `_hash` / `_ref` | `schema.test.ts` |
| S3 | AC6 phone unique per shop | Partial unique index `(shop_id, phone) where status <> 'deactivated'` | `shop-users.test.ts` |
| S3 | AC7 every business table has a not-null `shop_id` FK | `0001`–`0010` | `schema.test.ts` |
| S3 | AC8 a new shop has exactly one "Main shop" location | AFTER INSERT trigger, `unique (shop_id)` | `shop-users.test.ts` |
| S4 | AC1 Bench `1` / `6000000`, Platform `100` / `300000000` | `readability_units`, `capacity_units bigint` | `master-records.test.ts`, `seed.test.ts` |
| S4 | AC2 karigar columns and gap child table | `karigars`, `karigar_gap_history` | `master-records.test.ts`, `seed.test.ts` (gap order) |
| S4 | AC3 budget/spent nullable, no default; four groups only | `numeric(14,2)`, check | `master-records.test.ts` |
| S4 | AC4 history pure weight in units, customer must exist | `pure_units bigint`, FK | `master-records.test.ts` |
| S4 | AC5 karigar user with unknown karigar, or staff with a karigar id, rejected | FK + check `(role = 'karigar') = (karigar_id is not null)` | `master-records.test.ts` |
| S4 | AC6 scales need `location_id` | Not null, no default | `master-records.test.ts` |
| S5 | AC1 status `sold` rejected | Check on `status` and `prev_status` | `pieces.test.ts` |
| S5 | AC2 TAG-8841 stores `486500` / `70600`, no net column | `gross_units`, `stone_units` | `pieces.test.ts` |
| S5 | AC3 no `held_for_lead_id`; `value_inr` nullable; version from 1 | `0003`, `bump_version` | `pieces.test.ts` |
| S5 | AC4 edit status `pending`, unknown piece rejected; six fields only | Checks, FK | `pieces.test.ts` |
| S5 | AC5 grossG edit kept as `486500` / `486100`; token as reference | `before_units` / `after_units`, `token_ref` | `pieces.test.ts`, `schema.test.ts` |
| S5 | AC6 three photos in order | `piece_photos.position` | `pieces.test.ts` |
| S5 | AC7 `location_id` set by the server, body value ignored | `insertScoped` | `shop-context.test.ts` |
| S6 | AC1 weighing 12.3456 → `123456` → `12.3456` | `parcel_weighings.gross_units` | `parcels.test.ts` |
| S6 | AC2 trays in position order | `position` | `parcels.test.ts`, `seed.test.ts` |
| S6 | AC3 stage 4, status `closed`, verdict `close`, resolution `returned` rejected | Checks | `parcels.test.ts` |
| S6 | AC4 manifest rows with count ≥ 1 (MF-044-1 to 8) | `parcel_manifest_rows` | `parcels.test.ts`, `seed.test.ts` (eight rows of 044 in order) |
| S6 | AC5 duplicate QC tick rejected | `unique (parcel_id, piece_id)` | `parcels.test.ts` |
| S6 | AC6 gap and loss nullable units; `pieces.parcel_id` FK | `0004` | `parcels.test.ts` |
| S6 | AC7 `location_id` on parcels and weighings | Not null | `parcels.test.ts` |
| S7 | AC1 source `phone`, state `closed` rejected | Checks | `lead-tables.test.ts` |
| S7 | AC2 45.5 → `455000`, null stays null | `approx_weight_units` | `lead-tables.test.ts` |
| S7 | AC3 stock route needs an existing piece | Check + FK | `lead-tables.test.ts` |
| S7 | AC4 five fields in order | `lead_fields.position` | `lead-tables.test.ts` |
| S7 | AC5 version on both tables, no hold column | `0005` | `lead-tables.test.ts` |
| S8 | AC1 job status `done` rejected | Check | `jobs.test.ts` |
| S8 | AC2 84.5 / 78.4 / 0.5 / 80.0 → `845000` / `784000` / `5000` / `800000` | `*_units bigint` | `jobs.test.ts` |
| S8 | AC3 order copy links job, karigar, optional lead and item | FKs | `jobs.test.ts` |
| S8 | AC4 parcel, piece, make-route to an unknown job rejected | FKs added in `0006` | `jobs.test.ts` |
| S8 | AC5 two images in order | `order_copy_images.position` | `jobs.test.ts` |
| S9 | AC1 kind `adjustment` rejected | Check | `metal-pool.test.ts` |
| S9 | AC2 +500 / −80 / +79.6 → `5000000` / `-800000` / `796000` | `delta_units bigint` | `metal-pool.test.ts` |
| S9 | AC3 ledger sum = balance on seeded data | Seed sets the balance to the integer sum of the entries | `seed.test.ts` (812.5800 g) |
| S9 | AC4 balance in units, version column | `metal_pools` | `metal-pool.test.ts`, `versioned.test.ts` |
| S9 | AC5 `location_id` on entries; one pool per shop | Not null; `unique (shop_id)` | `metal-pool.test.ts` |
| S10 | AC1 target kind `lead`, status `resolved` rejected | Checks | `problems-stock-outs.test.ts` |
| S10 | AC2 scrap status `approved`, unknown piece rejected | Check, FK | `problems-stock-outs.test.ts` |
| S10 | AC3 stock-out of TAG-8841 + TAG-8802 has two rows; no piece twice | `stock_out_pieces`, `unique (piece_id)` across all stock-outs | `problems-stock-outs.test.ts` |
| S10 | AC4 `amount_inr` nullable, `invoice_no` text, `pieces.stock_out_id` FK | `0008` | `problems-stock-outs.test.ts` |
| S10 | AC5 problem target must exist and match its kind | One FK column per kind + exactly-one check | `problems-stock-outs.test.ts` |
| S11 | AC1 columns | `0009` | `audit.test.ts` |
| S11 | AC2 kind `piece_deleted` rejected | Check (ten kinds) | `audit.test.ts` |
| S11 | AC3 role `admin` rejected | Check | `audit.test.ts` |
| S11 | AC4 unknown actor rejected | FK to `users` | `audit.test.ts` |
| S11 | Added: append-only | Triggers reject UPDATE, DELETE, TRUNCATE (the story leaves this to EP-06; this task requires it now) | `audit.test.ts` |
| S12 | AC1 broadcast with two pieces and three recipients; audience values | `broadcast_pieces`, `broadcast_recipients`, check | `broadcasts-settings.test.ts` |
| S12 | AC2 wish kind `festival`, unknown customer rejected | Check, FK | `broadcasts-settings.test.ts` |
| S12 | AC3 one settings row with the prototype defaults | **Changed:** the row is created with the shop (`create_shop_defaults()` trigger) and backfilled for existing shops, because `settings.shop_id` is not null and no shop exists when migrations run | `broadcasts-settings.test.ts`, `seed.test.ts` |
| S12 | AC4 second row, `late_lead_audience` `everyone` rejected | `unique (shop_id)`, check | `broadcasts-settings.test.ts` |
| S13 | AC1 parcels 041–046, karigars KG-01/02/04, staff ST-01/02/03 | `npm run db:seed` | `seed.test.ts`; CI step "Seed it" |
| S13 | AC2 scale readability and capacity | Same | `seed.test.ts` |
| S13 | AC3 every piece weight reads back as its four-decimal source value | `gramsToUnits(String(g))` | `seed.test.ts` (all 92 pieces, TAG-8701 `30.5582` / `3.8469`) |
| S13 | AC4 money sockets null; settings false / 8 / true | Same | `seed.test.ts` |
| S13 | AC5 non-empty database or production refused, nothing changed | `SeedRefusedError` before any write | `seed.test.ts` |
| S13 | AC6 times relative to load time in UTC; child order kept; `heldForLeadId` dropped | Times shifted by `now − DEMO_BASE`; `position` from the array index; no hold column | `seed.test.ts` (order); time shift in `seed-database.ts`, seen on the dev database (WS-101 at seed time − 90 min) |
| S14 | AC1 two writers from version 3: first sets 4, second gets a conflict naming entity and id | `updateVersioned`, `StaleWriteError` | `versioned.test.ts` (second update blocked on the row lock until the first commits) |
| S14 | AC2 row keeps the first writer's values | Same | `versioned.test.ts` |
| S14 | AC3 same error type for all seven tables | `VERSIONED_ENTITIES` | `versioned.test.ts` |
| S14 | AC4 one stale row rolls back the whole transaction | `withTransaction` | `versioned.test.ts` (parcel + two pieces) |
| S14 | AC5 20 concurrent updates → exactly one succeeds | Same | `versioned.test.ts`, runs in CI |

Left open (not decided in EP-02):

- **Human-id sequences.** Codes are stored as given; generating the next `TAG-`, `BATCH-`, `LD-` number per prefix and shop belongs to the stories that create those records.
- **G10** (ceiling unit): storage is 0.0001 g; `UNITS_PER_G` (0.00001 g) stays in `shared` for the half-step ceiling until EP-23.
- **G13** (customer history derived or stored): stored in `customer_history`, removable without changing `customers`.
- **G14** (one parcel, many jobs): `parcels.job_id` stays nullable; a link table can be added later.
- **Staging and production** (S1 AC5, every "deployed to staging"): D1a and EP-01-S12.
