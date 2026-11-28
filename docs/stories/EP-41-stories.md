# EP-41: Launch and data migration · stories

Epic document: [EP-41 Launch and data migration](../epics/EP-41-launch-and-data-migration.md)

Role note: this is a layer E launch epic. Most stories are the Owner's, because the Owner provides the real lists, approves each import and signs go-live. Stories use "System" for the import runner and the figure calculations acting on their own, and "Developer" for the operator who rehearses imports on staging and runs the technical checklist items (the "Operator" in the epic's API table). No import, comparison or checklist page is designed yet, so screen labels in criteria are proposed. Real names, phones and weights are not known yet; criteria use the seed names Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff), and Lakshmi Devi, Mahesh Soni and Vijay Kumar (Karigar) as stand-ins. All weights are integers in units of 0.0001 g and shown to 4 decimals. No price, budget or invoice amount is imported (EP-42).

---

## EP-41-S1: System can record import runs with loaded and refused rows

- **Story ID:** EP-41-S1
- **Status:** Not started
- **Title:** System can record import runs with loaded and refused rows
- **As a:** System
- **I want:** an `import_runs` table and an `import_row_errors` table, and a shared import runner that reads an uploaded list for one kind, checks every row with that kind's own create rules, loads the good rows, and records each refused row with its row number, field and reason
- **So that:** every launch import leaves a record of who ran it, on which file, how many rows loaded and how many were refused and why (FR-41-9, BR-41-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when `import_runs` is inspected, then it has `id`, `kind` (one of `karigars`, `customers`, `stock`, `scales`, `users`, `opening_pool`, `karigar_holdings`), `file_id`, `run_by`, `environment`, `started_at`, `finished_at`, `rows_loaded`, `rows_refused` and `status` (`validating`, `loaded`, `failed`), and `import_row_errors` has `import_run_id`, `row_number`, `field` and `reason`.
  2. Given Sanjay Seth uploads a 20-row karigar list in which row 7 has an allowance of 1.5%, when the run finishes, then it has status `loaded`, `rows_loaded` 19, `rows_refused` 1, and one row error with row number 7, field `wastage allowance` and reason "The wastage allowance is between 0.6% and 1.2%." (epic acceptance criterion 1).
  3. Given a run is in progress, when one good row fails at the database (for example a unique index clash), then that row is recorded as refused with the mapped sentence and the other rows still load, each row in its own transaction.
  4. Given a finished run, when Sanjay reads it with Read Import run, then he gets the counts, the file name, his name, the server start and end times in Asia/Kolkata, and the list of refused rows with reasons.
  5. Given Rajesh Verma (Staff) or Lakshmi Devi (Karigar) calls Create Import run or Read Import run, when the server checks the permission, then it is refused and no run is written.
  6. Given a loaded row, when its audit entry is read, then the reason names the import run id.
- **Rules enforced on the server:** Create and Read Import run are owner only (EP-05-S1, EP-05-S2). Each row goes through the same service function the kind's create screen uses; the importer never writes a table directly. One transaction per row with its audit entry (EP-03-S6, EP-06-S2). `run_by` comes from the session and times from the server clock (EP-03-S3). The uploaded file is stored with restricted access and deleted when the run finishes (EP-09-S1, EP-09-S6). A run is deduplicated by idempotency key so a resubmitted upload does not load twice (EP-03-S8).
- **Live events emitted / consumed:** None. Imports run before go-live, when no screens are in use; events from the services a row passes through are emitted by those services.
- **Audit entry written:** Yes: one entry per loaded row from the kind's service, with actor, time, entity, action, after, and reason "import run <id>"; plus one entry for the run with actor, time, entity (import run), action (`import_run_finished`), after (counts and status).
- **Data changes:** New tables `import_runs` and `import_row_errors` with a migration. Adds Create Import run and Read Import run to the shared contract.
- **UI reference:** Not yet designed. An owner import page is needed (epic section 12).
- **Non-functional checks:** Audit: every imported row is audited with the import run as the reason (epic section 13). Security: owner only; import files kept with restricted access and removed after use. Personal data: the file is deleted after the run, and row errors hold the field name and reason, not the full row. Time: times shown in Asia/Kolkata (EP-10-S10). Open question: which file format the lists come in (not settled in the epic).
- **Depends on:** EP-02-S1, EP-03-S1, EP-03-S2, EP-03-S3, EP-03-S6, EP-03-S8, EP-05-S1, EP-05-S2, EP-06-S2, EP-09-S1, EP-09-S3, EP-09-S6, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S2: Owner can import karigars from a list

- **Story ID:** EP-41-S2
- **Status:** Not started
- **Title:** Owner can import karigars from a list
- **As a:** Owner
- **I want:** to upload the shop's karigar list with name, phone, email, workshop location, specialties, language and wastage allowance, and have each row created through the same rules as Add a karigar
- **So that:** every karigar I issue gold to exists in the app before the first real job, with the allowance their work is judged against (FR-41-1, BR-41-1, BR-41-7, BR-41-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a list with Lakshmi Devi (Temple, Tamil, 0.7%), Mahesh Soni (Hindi, 0.8%) and a third row at 1.5%, when Sanjay Seth imports it, then two karigars are created with the next `KG-NN` codes and `wastage_bp` 70 and 80, and the report names row 3 with "The wastage allowance is between 0.6% and 1.2%." (epic acceptance criterion 1).
  2. Given a row with an empty name, when it is imported, then it is refused with "Add the karigar name."; given a row with no specialty, then it is refused with "Pick at least one thing they are best at."
  3. Given a row whose specialty is not an active entry in the specialties list, when it is imported, then it is refused with the reference-list sentence and the other rows load (EP-15-S4).
  4. Given a row with language "Tamil", when it loads, then the language is stored on the karigar and changes nothing on screen, because the app is English only in v1.
  5. Given a row whose phone is already used by another karigar, or a row with no email (every karigar has one, D4), when it is imported, then it is refused with the same sentence the add screen shows, and no second karigar is created.
- **Rules enforced on the server:** Each row goes through the Create Karigar service from EP-16-S3, so the owner-only check, the 0.6% to 1.2% allowance check in whole basis points, the name and specialty checks and code assignment all apply unchanged. Specialties must be active list entries (EP-15-S4). The importer adds no rule of its own beyond mapping columns.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: per karigar created, from EP-16-S13: actor (Sanjay), time, entity (karigar), action (`karigar_created`), after (code, name, specialties, allowance), reason (import run id).
- **Data changes:** Inserts rows into `karigars` through the existing service; one `import_runs` row of kind `karigars` with its row errors. No migration.
- **UI reference:** Not yet designed (owner import page). Fields follow `docs/ux/mockups/24-onboard-karigar.svg`, route `karigar-new`.
- **Non-functional checks:** Security: owner only. Personal data: karigar phones are personal data; the file is deleted after the run. Open question: in which spoken language each karigar is trained (affects training, not the stored field).
- **Depends on:** EP-41-S1, EP-16-S1, EP-16-S2, EP-16-S3, EP-16-S13, EP-15-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S3: Owner can import customers with their consent status

- **Story ID:** EP-41-S3
- **Status:** Not started
- **Title:** Owner can import customers with their consent status
- **As a:** Owner
- **I want:** to upload the customer list with name, phone, birthday, anniversary and group, and for each row either a record of WhatsApp consent with the date it was given, or nothing
- **So that:** staff find real customers at the counter on day one, and the shop only messages customers whose consent it can show (FR-41-2, BR-41-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a row for "Meera Iyer" with consent marked yes and consent date 12 March 2024, when it is imported, then the customer is created and one `opt_in` consent event with source `import`, the original date 12 March 2024 and recorded by Sanjay Seth is stored, and the customer shows as opted in.
  2. Given a row with no consent column value, or a consent marked yes without a date or record, when it is imported, then the customer is created with no consent event and shows as not opted in (epic section 13).
  3. Given a row whose phone matches an existing customer after normalising, when it is imported, then it is refused with the duplicate-phone reason and no second customer is created (EP-17-S4).
  4. Given a row with a budget or past spend column, when it is imported, then those values are ignored, the value sockets stay null, and the report says the column was skipped.
  5. Given an imported customer with no consent, when the 9 am wishes run reaches their birthday, then no WhatsApp message is sent to them (EP-39-S6).
- **Rules enforced on the server:** Each row goes through the Create Customer service from EP-17-S3 (phone normalised, required fields), and consent through the consent service from EP-17-S2 with source `import`; the original consent date is stored alongside the server time of import. Consent without a date or record is not imported. Budget and spend are never written from an import (EP-17-S11). Owner only.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: per customer, from EP-17-S14: actor, time, entity (customer), action (`customer_created`), after (fields without the full phone in clear text where EP-17-S14 masks it), reason (import run id); and per consent event: action (`consent_recorded`), after (kind, source `import`, original date).
- **Data changes:** Inserts rows into `customers` and `consent_events` through existing services; one `import_runs` row of kind `customers`. A nullable `given_at` (original consent date) on `consent_events` if EP-17-S2 does not already hold it; migration only if missing.
- **UI reference:** Not yet designed (owner import page). Fields follow `docs/ux/mockups/23-onboard-customer.svg`, route `customer-new`.
- **Non-functional checks:** Personal data: the customer list is personal data; the file is deleted after the run, and refused rows are reported by row number and field, not by copying names into the report. Audit: consent events keep their source and original date. Open question: which customer records have proof of WhatsApp consent. Open question G13: whether past purchase history is imported and from where; this story imports no history.
- **Depends on:** EP-41-S1, EP-17-S1, EP-17-S2, EP-17-S3, EP-17-S4, EP-17-S11, EP-17-S14, EP-39-S1, EP-39-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S4: Owner can import existing stock as in-stock pieces with integer weights

- **Story ID:** EP-41-S4
- **Status:** Not started
- **Title:** Owner can import existing stock as in-stock pieces with integer weights
- **As a:** Owner
- **I want:** to upload the showroom stock list with tag number, HUID, name, kind, purity, gross weight and stone weight, and have each row created as a piece with source "import"
- **So that:** the stock list, the stock-out flow and gold on the floor match the showroom from the first day (FR-41-3, FR-41-4, BR-41-2, BR-41-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a row with tag TAG-8841, gross "48.6500" and stones "7.0600", when it is imported, then a piece is stored with gross `486500`, stone `70600`, source `import`, `imported_at` set and the value socket null, and it reads 41.5900 g pure gold.
  2. Given the register's stock totals 1,847.0000 g pure gold, when the stock import finishes, then gold on the floor shows 1,847.0000 g to four decimals, and the sum of imported net units equals 18,470,000 exactly (epic acceptance criterion 2).
  3. Given a row whose tag number is already used on another piece, when it is imported, then it is refused with "TAG-8841 is already used on another piece." and the other rows load (FR-41-4).
  4. Given a row with stones heavier than gross, when it is imported, then it is refused with "Stones cannot weigh more than the piece."; given a weight with 5 decimals such as "12.34567", then it is refused as a validation error and never rounded.
  5. Given a row with a HUID of the wrong format, when it is imported, then it is refused with the HUID format sentence from EP-15-S8.
  6. Given a loaded piece, when Rajesh Verma opens `stock`, then it appears in the in-stock list and can be stocked out like any other piece.
- **Rules enforced on the server:** Weights are parsed from text into integer units with the shared helper (EP-02-S2), with no float step. Gross greater than 0, stones from 0 up to gross. Tag number unique across all pieces (EP-15-S7) and HUID checked (EP-15-S8). Purity and kind must be active list entries (EP-15-S4). The entry state follows the open decision: by default the piece enters `in_stock` through a dedicated import transition recorded in `piece_state_transitions` with from empty and reason "import"; if the owner decides imported stock passes an owner check first, it enters `with_owner` instead. No price or value column is read. Owner only.
- **Live events emitted / consumed:** None. Imports run before go-live.
- **Audit entry written:** Yes: per piece, from EP-22-S11: actor (Sanjay), time, entity (piece), action (`piece_imported`), after (tag, HUID, gross and stone in integer units, state), reason (import run id).
- **Data changes:** Adds `source` (`tagged` or `import`, default `tagged`) and nullable `imported_at` to `pieces` with a migration; allows the import transition in the state table. Inserts pieces and `piece_state_transitions` rows; one `import_runs` row of kind `stock`.
- **UI reference:** Not yet designed (owner import page). Imported pieces show on `stock` and in "Gold on the floor" on `docs/ux/mockups/08-owner-home.svg`, route `decisions`.
- **Non-functional checks:** Precision: totals after import equal the source totals exactly (epic section 13). Performance: a list of 5,000 pieces imports without timing out, run as a background job (EP-10-S1) if needed. Open question: whether existing stock enters as in-stock directly or passes the match gate or an owner check first. Open question: whether existing stock is re-weighed at import or register weights are trusted; register weights with fewer decimals are imported as recorded (for example "12.35" stored as `123500`).
- **Depends on:** EP-41-S1, EP-02-S2, EP-22-S1, EP-22-S2, EP-22-S11, EP-15-S4, EP-15-S7, EP-15-S8, EP-22-S10, EP-10-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S5: Owner can register the real scales with true readabilities

- **Story ID:** EP-41-S5
- **Status:** Not started
- **Title:** Owner can register the real scales with true readabilities
- **As a:** Owner
- **I want:** to register each real scale in the shop with its name, true readability and capacity from its documentation, and retire the seed scales that do not exist, before the first real parcel is weighed
- **So that:** the match ceiling for every real parcel is computed from the scale that actually weighed it (FR-41-5, BR-41-3, BR-41-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the real bench balance reads to 0.001 g up to 220 g, when Sanjay Seth registers it, then the scale is stored with readability `10` and capacity `2200000`, and the ceiling for a parcel with one parcel weighing and 12 tag weighings on it is 13 half-steps of 0.001 g, which is 0.0065 g (epic acceptance criterion 3).
  2. Given the seed "Bench balance" (0.0001 g, 600 g) does not exist in the shop, when Sanjay retires it, then it no longer appears in the picker on `parcel-arrival`.
  3. Given a production go-live checklist, when the scale item is checked, then every active scale has a readability taken from its documentation, recorded in the scale's note, and none still carries a seed value unchecked.
  4. Given Rajesh Verma (Staff) tries to register or edit a scale, when the server checks the permission, then it is refused (EP-14-S4).
  5. Given a scale list file with the scales, when it is imported as kind `scales`, then each row goes through the Create Scale rules, and a readability with more than 4 decimals is refused as a validation error.
- **Rules enforced on the server:** Scales are created through the Create Scale service from EP-14-S3 and retired through EP-14-S7, owner only. Readability and capacity are integers in units of 0.0001 g. The ceiling is computed on the server from the registry (EP-14-S10).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: per scale, from EP-14-S12: actor, time, entity (scale), action (`scale_created` or `scale_retired`), before, after (readability and capacity in units), reason (import run id or the owner's note).
- **Data changes:** Inserts and retires rows in `scales` through existing services; one `import_runs` row of kind `scales` if a file is used. No migration.
- **UI reference:** `docs/ux/mockups/14-match-rule-any-parcel.svg`, route `scales`.
- **Non-functional checks:** Precision: readability stored as integer units; a 0.001 g step is `10`. Open question: the real readabilities and capacities of the shop's scales (App. E). Open question G10 (from EP-40): the ceiling's half-step unit when readability is 0.0001 g.
- **Depends on:** EP-41-S1, EP-14-S1, EP-14-S3, EP-14-S4, EP-14-S7, EP-14-S10, EP-14-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S6: Owner can record the opening pool balance

- **Story ID:** EP-41-S6
- **Status:** Not started
- **Title:** Owner can record the opening pool balance
- **As a:** Owner
- **I want:** to record the pool's opening balance at launch, once, using the Create Opening entry from EP-18-S2 with the agreed figure and a reason that names the launch
- **So that:** the ledger starts from the gold the shop actually holds at go-live, and the parallel run compares like for like (FR-41-6, BR-41-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given production has no pool entries, when Sanjay Seth records 812.5800 g with the reason "Opening balance at launch, from register page 214", then the ledger shows one `opening` entry with delta `8125800`, Sanjay as actor, the server time and the reason (epic acceptance criterion 4).
  2. Given an opening entry exists, when a second one is tried, then it is refused with code `opening_exists` and nothing changes.
  3. Given the shop's books have no pool figure, when the owner decides the pool starts at zero, then no opening entry is posted and the checklist item records that decision instead.
  4. Given Rajesh Verma (Staff) tries to record the opening balance, when the server checks, then it is refused.
- **Rules enforced on the server:** All rules from EP-18-S2: owner only, allowed only while the pool has no entries, amount greater than 0 with at most 4 decimals, deduplicated by idempotency key, entry and audit in one transaction.
- **Live events emitted / consumed:** emitted: "Metal pool changed" (through EP-18-S12), if any screen is open.
- **Audit entry written:** Yes: actor, time, entity (metal pool), action (`pool_opening_recorded`), before (balance 0), after (balance and delta in integer units), reason.
- **Data changes:** One row in `pool_entries` and the balance on `metal_pools`, through EP-18-S2. No migration.
- **UI reference:** Not yet designed. The pool ledger page is undrawn; the action is the one built in EP-18-S2.
- **Non-functional checks:** Precision: the typed figure is parsed with the EP-02-S2 helper. Audit: the entry holds the integer delta. Open question (App. B sub-question 1): whether the pool already exists in the shop's books and what its opening balance is.
- **Depends on:** EP-18-S2, EP-18-S12, EP-41-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S7: Owner can record the gold each karigar holds at launch

- **Story ID:** EP-41-S7
- **Status:** Not started
- **Title:** Owner can record the gold each karigar holds at launch
- **As a:** Owner
- **I want:** to record, for each karigar, the grams of gold they hold at launch, either as an open job carried over from the register or as an opening holding with no job, through Create Karigar holding
- **So that:** "Gold with karigars" on Decisions and "Gold with me" on the karigar's phone match the paper register on day one (FR-41-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the register shows Vijay Kumar holding 152.4000 g on one temple necklace job and 34.0000 g with no job, when Sanjay Seth records both, then one open job with 152.4000 g issued and one opening holding of 34.0000 g exist for KG-04, and gold with Vijay reads 186.4000 g.
  2. Given the holdings are recorded, when Vijay signs in on `k-jobs`, then "Gold with me" shows 186.4000 g, and the open job appears in his job list.
  3. Given holdings are recorded for all karigars, when Sanjay reads the custody summary, then "with karigars" equals the register's total exactly, compared in integer units.
  4. Given a holding is recorded, when the pool balance is read, then it is unchanged, because this gold already left the pool before launch.
  5. Given a holding of 0 g, a negative amount, or a karigar that does not exist or is inactive, when it is recorded, then it is refused with a validation error and nothing is stored.
  6. Given Rajesh Verma (Staff) calls Create Karigar holding, when the server checks, then it is refused.
- **Rules enforced on the server:** Owner only. Grams greater than 0 with at most 4 decimals, stored as integer units. Karigar must be active (EP-16-S7). A carried-over job is created in an open state through the EP-19 job service with a flag that posts no `issued` pool entry; an opening holding with no job is stored as a holding row. Both count in gold with karigar (EP-18-S11). Allowed only before go-live is signed (EP-41-S13).
- **Live events emitted / consumed:** None of its own. Imports run before go-live.
- **Audit entry written:** Yes: per holding: actor, time, entity (karigar holding or job), action (`karigar_holding_recorded`), after (karigar code, grams in integer units, linked job id), reason (import run id or the owner's note).
- **Data changes:** New table `karigar_holdings` (karigar id, grams held as integer, linked job id nullable, recorded by, recorded at) with a migration; a `carried_over` flag on jobs so no pool entry is posted. The custody read from EP-18-S11 adds opening holdings to gold with karigar. Adds Create Karigar holding to the shared contract.
- **UI reference:** Not yet designed (owner import page). Totals show on `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Gold with karigars"), and `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("GOLD WITH ME").
- **Non-functional checks:** Precision: holdings summed in integer units. Open question: the epic allows "open jobs or opening ledger entries"; this story records them without moving the pool balance, and how an opening holding is later closed (returned gold or settled job) follows EP-18-S7.
- **Depends on:** EP-41-S1, EP-16-S7, EP-18-S7, EP-18-S11, EP-19-S1, EP-19-S2, EP-20-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S8: Owner can create accounts for every staff member and karigar

- **Story ID:** EP-41-S8
- **Status:** Not started
- **Title:** Owner can create accounts for every staff member and karigar
- **As a:** Owner
- **I want:** the first-run setup wizard (EP-45) run once on production to create the shop and my owner account, then an account for every staff member and karigar, each with an email for the activation link, each karigar user linked to their karigar record, either one by one on `staff-new` or from a users list
- **So that:** every person signs in with their own phone before go-live and lands on their role's home (FR-41-8, BR-41-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty production system, when Sanjay Seth completes the setup wizard (EP-45), which calls Create First owner (EP-04-S1), then one owner exists and sets his password from the activation email, and a second Create First owner is refused with "The first owner has already been created."
  2. Given a users list with name, phone, email and role for Rajesh Verma (Staff), Deepak Rao (Staff) and Lakshmi Devi (Karigar), when Sanjay imports it, then three users are created with those roles and status `pending_activation`, each gets an activation email, and Lakshmi's user is linked to KG-01.
  3. Given a row with a role other than Staff or Karigar, an empty email, or a phone already used by an active user, when it is imported, then it is refused with the reason and the other rows load.
  4. Given a karigar row whose karigar code does not exist, when it is imported, then it is refused with "No karigar KG-09 to link this account to." (proposed wording).
  5. Given every account is created, when each person sets a password from the activation email and signs in with phone and password during training, then Staff land on `today` and Karigars on `k-jobs`, and the checklist item "everyone has signed in once" lists anyone who has not.
- **Rules enforced on the server:** The first owner is created once, only through the setup wizard (EP-04-S1, EP-45). Users are created through the Add user service from EP-05-S4, owner only, with role Staff or Karigar, a required email and a phone unique within the shop. Karigar links go through EP-05-S13 and EP-16-S6. A users list never creates a second owner (one shop, one owner; EP-05-S9).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: per user, from EP-05-S14: actor, time, entity (user), action (`user_created`, `karigar_linked`), after (name, role, masked phone), reason (import run id).
- **Data changes:** Inserts users and karigar links through existing services; one `import_runs` row of kind `users`. No migration.
- **UI reference:** `docs/ux/mockups/25-onboard-staff.svg`, route `staff-new`; directory on route `staff-directory`.
- **Non-functional checks:** Security: no shared or demo accounts; every person has their own phone (no role switcher). Personal data: phones masked in audit and logs (EP-37-S2). D4 is decided: each person sets a password from the activation email and signs in with phone and password; no password is emailed. D7 is decided: accounts are created for the one shop. The setup wizard is EP-45 (built in M2, before launch); it is not listed in Depends on because it has a higher number.
- **Depends on:** EP-41-S1, EP-04-S1, EP-04-S3, EP-04-S5, EP-04-S6, EP-04-S10, EP-05-S4, EP-05-S9, EP-05-S13, EP-05-S14, EP-16-S6, EP-41-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S9: Owner can rehearse every import on staging

- **Story ID:** EP-41-S9
- **Status:** Not started
- **Title:** Owner can rehearse every import on staging
- **As a:** Owner
- **I want:** to run every import (scales, karigars, users, customers, stock, opening pool, karigar holdings) on staging first, in launch order, read the refused rows, fix the lists, and run again, without touching production
- **So that:** the production imports on launch day load cleanly the first time (FR-41-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given staging, when Sanjay Seth runs the stock import, then the import run is stored with environment `staging`, and the production database has no new row.
  2. Given a rehearsal run with 3 refused rows, when the list is fixed and staging is reset to its pre-import state, then the second run loads every row with 0 refused.
  3. Given all rehearsal runs finished with 0 refused, when the totals are read on staging, then gold on the floor, gold with karigars and the pool balance equal the register's figures exactly.
  4. Given the production configuration, when a run is started, then its environment is `production`, and the run record cannot be changed to another environment.
  5. Given a rehearsal finished, when the operator checks staging, then the uploaded files are deleted, and the rehearsal data is removed from staging by the agreed date.
- **Rules enforced on the server:** The environment on each run comes from server configuration (EP-01-S6), never from the request. Staging and production use separate databases and file stores. Resetting staging is done with the restore from EP-38-S6. All row rules are the same as in production.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes, on staging only: the same entries as each import story, with environment `staging` on the run record. Nothing is written to production audit.
- **Data changes:** None in the production database. Staging receives the imported rows and is reset between rehearsals.
- **UI reference:** Not yet designed (owner import page on the staging build).
- **Non-functional checks:** Personal data: real customer lists on staging are personal data; staging access is limited to the owner and the operator, files are deleted after each run, and the data is removed after launch. Security: staging keeps the same owner-only checks. D1 is decided (Option C): staging is reset by restoring its managed PostgreSQL database and its S3-compatible file store to the pre-import point (EP-38-S6). Open decision D1a: the exact restore steps follow the cloud provider.
- **Depends on:** EP-41-S1, EP-41-S2, EP-41-S3, EP-41-S4, EP-41-S5, EP-41-S6, EP-41-S7, EP-41-S8, EP-01-S6, EP-01-S12, EP-38-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S10: Staff can follow role-based training for their screens

- **Story ID:** EP-41-S10
- **Status:** Not started
- **Title:** Staff can follow role-based training for their screens
- **As a:** Staff
- **I want:** short training material and a practice session on staging for the screens Staff use: sign-in, `today`, parcel arrival, tagging and the match, `stock`, `stock-out`, customers, leads and order copies; and the same for the owner on `decisions`, clearing a mismatch, edit tokens, scrap and settings
- **So that:** each person can do their daily work in the app before the parallel run starts (FR-41-12, BR-41-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the Staff training material, when it is read, then it covers each Staff route with one worked example using the seed data, such as stocking out TAG-8841 (41.5900 g) and saving a tag on BATCH-2026-046.
  2. Given the Owner training material, when it is read, then it covers clearing a mismatch on BATCH-2026-044 (gap −0.1380 g), applying an edit with a 6-digit token, marking a scrap, and the settings page.
  3. Given Rajesh Verma attends training on staging, when he completes the practice list, then the trainer ticks each task for him, and the checklist shows his training as done.
  4. Given a Staff member tries an owner action during practice, such as releasing a mismatch, when the server refuses, then the material explains the refusal sentence they see.
  5. Given training is planned, when the go-live checklist is read, then it lists each staff member and the owner with a training date and a tick.
- **Rules enforced on the server:** Practice runs on staging only, with the same permission checks as production; no practice data enters production.
- **Live events emitted / consumed:** None of its own. Practice on staging shows the normal catalogue events, such as "Piece billed by one staff member" when two trainees practise on one piece.
- **Audit entry written:** No. Training is recorded as checklist ticks in EP-41-S13, not as product audit; practice actions are audited on staging only.
- **Data changes:** None in the product database. Adds training documents for Staff and Owner under the project docs.
- **UI reference:** Uses the existing screens; for example `docs/ux/mockups/06-stock-out.svg`, route `stock-out`, and `docs/ux/mockups/08-owner-home.svg`, route `decisions`.
- **Non-functional checks:** Personal data: practice uses seed customers, not real ones. Open question: how long the parallel run is, which sets when training must finish.
- **Depends on:** EP-41-S8, EP-01-S12, EP-02-S13, EP-31-S3, EP-32-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S11: Karigar can sign in and follow training on the phone portal

- **Story ID:** EP-41-S11
- **Status:** Not started
- **Title:** Karigar can sign in and follow training on the phone portal
- **As a:** Karigar
- **I want:** to be signed in on my own phone during training, open the portal in the phone browser, and practise accepting a job, marking it ready, handing it over and reading "Gold with me"
- **So that:** I can use the portal on day one without a staff member doing it for me (FR-41-8, FR-41-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi's account is linked to KG-01, when she opens the activation email on her own phone during training, sets her password and signs in with her phone and password, then she lands on `k-jobs` and sees her own jobs only.
  2. Given she practises on staging, when she accepts a job, marks it ready and hands it over, then each step succeeds and the trainer ticks the task.
  3. Given her opening holdings are recorded in production, when she opens "Gold with me" after go-live, then it equals the figure she confirms against the register, and her confirmation is ticked on the checklist.
  4. Given the portal is in English only, when she is trained, then the trainer explains the screens in her spoken language, which is recorded on the checklist (Tamil for Lakshmi).
  5. Given a karigar who cannot sign in during training, when the checklist is read, then that karigar is listed as not signed in and go-live waits for it or for the owner's waiver.
- **Rules enforced on the server:** Karigar reads are limited to their own jobs (EP-20-S1). Sign-in follows EP-20-S2. Practice runs on staging only.
- **Live events emitted / consumed:** None of its own. During practice the portal consumes "Karigar job status changed" as usual.
- **Audit entry written:** No. Training is recorded as checklist ticks; sign-in is audited by EP-04-S14.
- **Data changes:** None in the product database. Adds karigar training material under the project docs.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Security: each karigar signs in on their own phone; no shared account. D4 is decided: phone and password, set from the activation email. Open question: in which spoken language each karigar is trained; the app stays English only in v1 (EP-44). D5 is decided: the portal is a React web app opened in the phone browser, so there is no install step in v1; the dependency on EP-20-S12a is kept and is deferred (D6).
- **Depends on:** EP-41-S7, EP-41-S8, EP-20-S1, EP-20-S2, EP-20-S3, EP-20-S4, EP-20-S5, EP-20-S6, EP-20-S9, EP-20-S12a
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S12: Owner can compare daily app figures with the paper register

- **Story ID:** EP-41-S12
- **Status:** Not started
- **Title:** Owner can compare daily app figures with the paper register
- **As a:** Owner
- **I want:** for each day of the parallel run, the app's figures (pieces in stock, pure gold on the floor, gold with karigars, pool balance, pieces out) next to the register figures I enter, with the difference and a note
- **So that:** I can see any day where the app and the register disagree, and decide when the paper register can stop (FR-41-11, BR-41-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the day 14 June 2027 in Asia/Kolkata, when Sanjay Seth opens Read Parallel run figures, then he sees the app's pieces in stock, pure gold on the floor, gold with karigars, pool balance and pieces out at the end of that day, computed on the server.
  2. Given he enters register figures of 42 pieces and 1,847.0000 g on the floor for that day, when the app shows 41 pieces and 1,805.4100 g, then the difference reads −1 piece and −41.5900 g, and he can add the note "TAG-8841 sold, not written in register".
  3. Given the parallel run has ended, when Sanjay compares the last week, then each day's app figures, register figures and differences are listed (epic acceptance criterion 5).
  4. Given a register figure with more than 4 decimals, when it is entered, then it is refused as a validation error.
  5. Given Rajesh Verma (Staff) calls Read Parallel run figures or Create Parallel run day, when the server checks, then it is refused.
- **Rules enforced on the server:** Owner only. Day boundaries in Asia/Kolkata (EP-10-S10). App figures are computed from stored integers at the end of the day, the same way as `decisions` and the custody summary (EP-18-S11, EP-22-S10). One parallel run day per date; a second entry for the same date updates it with a version check (EP-02-S14).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (parallel run day), action (`parallel_run_day_recorded`), before, after (register figures in integer units, note).
- **Data changes:** New table `parallel_run_days` (date, app figures, register figures as integers, difference, note, version) with a migration. Adds Read Parallel run figures and Create Parallel run day to the shared contract.
- **UI reference:** Not yet designed (parallel-run comparison page, epic section 12).
- **Non-functional checks:** Precision: differences computed in integer units and shown to 4 decimals. Time: days compared in Asia/Kolkata (epic section 13). Open question: how long the parallel run is and who decides it has passed. Open question G24: whether EP-35 Reports is needed before launch; this page does not depend on it.
- **Depends on:** EP-41-S4, EP-41-S6, EP-41-S7, EP-10-S10, EP-18-S11, EP-22-S10, EP-02-S14, EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S13: Owner can tick and sign the go-live checklist

- **Story ID:** EP-41-S13
- **Status:** Not started
- **Title:** Owner can tick and sign the go-live checklist
- **As a:** Owner
- **I want:** a go-live checklist where each item has a responsible person and a tick, the operator ticks the technical items, and I sign the whole list before the shop starts using the app for real
- **So that:** go-live happens only when backups, monitoring, tests, security work, imports and training are all done (FR-41-13, BR-41-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the checklist, when it is listed, then it holds at least: real scales registered, karigars, customers, stock and users imported with 0 unresolved refused rows, opening pool recorded or waived, karigar holdings confirmed, everyone signed in once, training done, full backup taken after imports, restore drill done, monitoring alerts working, all tests green, security review and penetration findings closed, rollback plan agreed.
  2. Given the operator ticks "full backup taken after imports", when the tick is saved, then it records who ticked it and when, and links the backup run from EP-38-S1.
  3. Given one item is not ticked, when Sanjay Seth tries to sign go-live, then it is refused with "Go-live waits for every item to be ticked." (proposed wording) and names the open item.
  4. Given every item is ticked and signed, when Sanjay signs go-live, then go-live is recorded with his name and time, and launch-only operations such as Create Karigar holding and Create Opening entry by import are closed (epic acceptance criterion 6).
  5. Given Rajesh Verma (Staff) tries to tick or sign an item, when the server checks, then it is refused.
- **Rules enforced on the server:** List and Update checklist item are allowed for the owner and the operator; signing go-live is owner only. A ticked item records the actor and server time. Go-live signing needs every item ticked. Once signed, the checklist is read only.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: per tick and for the sign-off: actor, time, entity (checklist item or go-live), action (`checklist_item_ticked`, `go_live_signed`), before, after.
- **Data changes:** New table `go_live_checklist_items` (item, responsible person, done at, ticked by, signed by) and a go-live marker in settings, with a migration and seeded items. Adds List and Update Go-live checklist item to the shared contract.
- **UI reference:** Not yet designed (go-live checklist page, epic section 12).
- **Non-functional checks:** Availability: the backup item is ticked only after a full backup is taken after imports (EP-38). Security: owner signs; operator access comes from a Developer account with the owner's agreement. Open question G24: whether EP-35 Reports is a checklist item. D7 is decided: one checklist for the one shop.
- **Depends on:** EP-41-S9, EP-41-S10, EP-41-S11, EP-41-S12, EP-38-S1, EP-38-S8, EP-37-S4, EP-37-S6, EP-40-S13, EP-39-S15, EP-13-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-41-S14: Owner can follow a rollback plan to the paper register

- **Story ID:** EP-41-S14
- **Status:** Not started
- **Title:** Owner can follow a rollback plan to the paper register
- **As a:** Owner
- **I want:** a written rollback plan that says when go-live counts as failed, who decides, how the shop returns to the paper register, and how work done in the app in the meantime is copied back
- **So that:** the shop can keep trading if the app fails in the first weeks, without losing track of any gold (FR-41-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given the plan, when it is read, then it names the trigger (for example the app unusable for more than half a shop day), the decider (Sanjay Seth), and the first step (announce return to paper to all staff and karigars).
  2. Given a rollback is decided, when the plan is followed, then the owner reads the app's figures for the day (pieces in stock, gold on the floor, gold with karigars, pool balance, pieces out) and writes them into the register, so the register is complete.
  3. Given the app is unreachable during rollback, when the plan is followed, then the latest backup is restored to staging (EP-38-S6) to read the figures from it.
  4. Given the plan, when it is rehearsed once before go-live on staging, then the time taken is recorded and the checklist item "rollback plan agreed" is ticked.
  5. Given the shop returns to the app later, when the plan is followed, then the register entries made during rollback are entered into the app through the normal screens, not by a bulk import.
- **Rules enforced on the server:** None new. The plan uses existing reads, the restore from EP-38-S6, and owner-only checks on every action.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. The plan is a document; actions taken while following it are audited by the services they use.
- **Data changes:** None in the product database. Adds the rollback plan document under the project docs.
- **UI reference:** No screen.
- **Non-functional checks:** Availability: rollback relies on the daily backup and point-in-time restore (EP-38-S1, EP-38-S2). Audit: entries made after a restore point are listed for follow-up (EP-38-S9). Open question: how long the parallel run is, since a long parallel run lowers the need for rollback.
- **Depends on:** EP-41-S12, EP-38-S1, EP-38-S2, EP-38-S6, EP-38-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- App. B sub-question 1: does the metal pool already exist in the shop's books, and what is its opening balance? (EP-41-S6, S12)
- What are the real readabilities and capacities of the shop's scales (App. E)? (EP-41-S5)
- Does existing stock enter as in-stock directly, or does it pass the match gate or an owner check first? (EP-41-S4)
- Is existing stock re-weighed at import, or are register weights trusted? (EP-41-S4)
- How long is the parallel run, and who decides it has passed? (EP-41-S10, S12, S14)
- Which customer records have proof of WhatsApp consent? (EP-41-S3)
- G13: is past purchase history imported for customers, and from where? (EP-41-S3)
- G24: is EP-35 Reports required before launch, or after as M8 says? (EP-41-S12, S13)
- D7 is decided: launch is for one shop, no branches (EP-41-S8, S13).
- In which spoken language is each karigar trained? The app itself is English only in v1 (G2 resolved; other languages in EP-44). (EP-41-S2, S11)
