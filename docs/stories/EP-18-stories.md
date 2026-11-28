# EP-18: Metal pool ledger · stories

Epic document: [EP-18 Metal pool ledger](../epics/EP-18-metal-pool-ledger.md)

Role note: stories where the server posts, refuses, locks or pushes on its own use "System". Issue and recovery entries are posted by the system inside the job creation of EP-19 and the scrap decision of EP-27; this epic ships the posting function and tests it with a test caller until those epics exist. The owner records the opening balance, returns and adjustments; staff only read the balance.

---

## EP-18-S1: System can store pool entries and a balance as integer weights

- **Story ID:** EP-18-S1
- **Status:** Done
- **Title:** System can store pool entries and a balance as integer weights
- **As a:** System
- **I want:** the `metal_pools` and `pool_entries` tables from EP-02-S9 extended so each entry has a kind from `opening`, `issued`, `returned`, `recovered` and `adjustment`, a signed integer delta in units of 0.0001 g, a note, a reference type and id, an actor and a server time, with one shared posting function that inserts an entry and moves the balance in the caller's transaction
- **So that:** every movement of gold is one row with a reference, and the balance always equals the sum of the rows (FR-18-9, FR-18-10, FR-18-12, BR-18-6, BR-18-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `pool_entries` is inspected, then `kind` accepts exactly `opening`, `issued`, `returned`, `recovered` and `adjustment`, `deltaG` is a signed integer in units of 0.0001 g, and each row has `note`, `ref_type` (`job`, `piece` or none), `ref_id`, `actor` and `at` in UTC.
  2. Given the seed, when it is loaded, then `metal_pools.balanceG` is `8125800` (812.5800 g) and equals the sum of all seeded `deltaG` values; after the seeded scrap of TAG-7701 Temple Haram (net 784,000 units) the balance is `8909800` (890.9800 g).
  3. Given the posting function is called with kind `issued`, delta `-1624000` and job MO-2026-118, when the caller's transaction commits, then one entry is stored and the balance has dropped by exactly 1,624,000 units; when the caller's transaction rolls back, neither the entry nor the balance has changed.
  4. Given an attempt to update or delete a row in `pool_entries`, when it reaches the database, then it is refused, because a mistake is corrected by a new entry (FR-18-10).
  5. Given any state of the ledger, when the consistency check sums `deltaG` over all entries and compares it with `metal_pools.balanceG`, then they are equal, and a mismatch fails the check with both numbers (epic acceptance criterion 5).
  6. Given any posting to the pool, when the entry is stored, then it carries `location_id` set by the server to the shop's default location "Main shop"; the balance is still one per shop, and no transfer between locations exists (D7).
- **Rules enforced on the server:** The balance is changed only by the shared posting function, never by a direct update, and the function writes the entry and the new balance in the same transaction (EP-03-S6). The function requires an open transaction from its caller and refuses to run outside one. `actor` comes from the session or is System (EP-03-S3, EP-06-S6); `at` comes from the server clock. Weights are converted only through the EP-02-S2 helpers; a delta with more than 4 decimals is refused, not rounded. Database checks: `balanceG` may not be below 0 (BR-18-1), `kind` enum, `ref_type` and `ref_id` both set or both empty. Updates and deletes on `pool_entries` are blocked by a database rule or trigger.
- **Live events emitted / consumed:** None. The posting function hands each committed entry to EP-18-S12, which emits "Metal pool changed".
- **Audit entry written:** No. This story creates storage and the posting function; each posting story states its own audit entry.
- **Data changes:** Migration on `pool_entries` (EP-02-S9) widens the `kind` enum with `returned` and `adjustment`, renames `ref` to `ref_type` and `ref_id`, and adds `actor` if missing. Migration adds a check that `metal_pools.balanceG >= 0` and a rule that blocks update and delete on `pool_entries`. Adds the posting function and the consistency check to the `api` service layer. One pool row per shop (D7). Each `pool_entries` row carries `location_id` (EP-02-S9), set by the posting function, never from the request.
- **UI reference:** No screen
- **Non-functional checks:** Precision: all deltas and the balance are integers of 0.0001 g; the seed balance is summed from integers, not floats. Concurrency: `metal_pools.version` exists for EP-18-S5. Time: `at` stored in UTC, shown in Asia/Kolkata. Open decision G10: the prototype uses 0.00001 g units (`UNITS_PER_G = 100000`); this story stores 0.0001 g units as PRODUCTION-SCOPE §5 says, and must be settled before launch. D7 is decided: one pool per shop. Open question: one pool or one per purity (22K and 18K); if per purity, a `purity` column is added to both tables before EP-19.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S9, EP-02-S13, EP-03-S1, EP-03-S3, EP-03-S6, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S2: Owner can record the opening balance

- **Story ID:** EP-18-S2
- **Status:** Done
- **Title:** Owner can record the opening balance
- **As a:** Owner
- **I want:** to record the pool's opening balance once, in grams to 4 decimals with a note, through Create Opening entry
- **So that:** the ledger starts from the gold the shop already holds, and every later movement is measured from that figure (FR-18-1, FR-18-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty pool with no entries, when Sanjay Seth records an opening balance of 812.5800 g with the note "Gold in the safe, 1 Nov 2026", then one `opening` entry with delta `8125800`, actor Sanjay and server time is stored, and the balance reads 812.5800 g.
  2. Given an opening entry already exists, when Sanjay records a second opening balance, then the server refuses with code `opening_exists` and a sentence telling him to use an adjustment instead, and nothing changes (FR-18-1).
  3. Given Rajesh Verma, a staff user, or a karigar user sends Create Opening entry, when the server checks the permission, then it is refused and nothing changes (FR-18-8).
  4. Given an opening amount of -10.0000 g, 0.0000 g or 812.58001 g, when Sanjay saves, then the server refuses it as a validation error and nothing is stored.
  5. Given the same Create Opening entry request is sent twice with one idempotency key after a network drop, when the server processes it, then only one opening entry exists.
- **Rules enforced on the server:** Caller must hold the post-pool-entry permission, which only the owner role has (EP-05-S1, EP-05-S2). Allowed only while the pool has no entries at all, checked under the EP-18-S5 lock so two openings at once cannot both pass. Amount must be more than 0 and have at most 4 decimals (EP-02-S2). Posted through the EP-18-S1 function with no reference. Deduplicated by idempotency key (EP-03-S8). Entry and audit in one transaction (EP-03-S6, EP-06-S2).
- **Live events emitted / consumed:** Emitted: "Metal pool changed" (through EP-18-S12).
- **Audit entry written:** Yes: actor, time, entity (metal pool), action (`pool_opening_recorded`), before (balance 0), after (balance and delta in integer units), reason (the note).
- **Data changes:** Inserts one row into `pool_entries` and updates `metal_pools.balanceG` and `version`. Adds Create Opening entry to the shared contract.
- **UI reference:** Not yet designed. The pool balance and ledger page is undrawn (MOCKUP-COVERAGE §3); the opening action belongs on it.
- **Non-functional checks:** Precision: the typed grams string is converted with the EP-02-S2 helper and shown back as "812.5800 g". Audit: the entry stores weights as integer units (EP-06-S5). Security: owner only, checked on the server. Open question (App. B sub-question 1): does the pool already exist in the owner's books and what is the figure; the launch migration in EP-41 may post the opening entry instead of the owner. Open question: who may post an opening entry besides the owner.
- **Depends on:** EP-18-S1, EP-02-S2, EP-03-S2, EP-03-S4, EP-03-S7, EP-03-S8, EP-05-S1, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S3: System can post an issue entry inside job creation

- **Story ID:** EP-18-S3
- **Status:** Partial: AC1 and AC2 need the job creation of EP-19; Post Issue is built and tested with a test caller (FU-028).
- **Title:** System can post an issue entry inside job creation
- **As a:** System
- **I want:** a Post Issue function that the job-creation operation of EP-19 calls inside its own transaction, which posts an `issued` entry with a negative delta equal to the gold handed over and the job id as its reference
- **So that:** a job never exists without its gold leaving the pool, and gold never leaves the pool without a job (FR-18-2, BR-18-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a balance of 812.5800 g, when a job for Lakshmi Devi · KG-01 is created with "Pure gold issued to Lakshmi" 162.4000 g, then an `issued` entry with delta `-1624000` and reference job id is stored in the same transaction, and the balance is 650.1800 g (epic acceptance criterion 1).
  2. Given the job creation fails after Post Issue has run, such as a refused karigar, when the transaction rolls back, then no `issued` entry exists and the balance is still 812.5800 g.
  3. Given Post Issue is called with no job id, when it runs, then it refuses and posts nothing, because every issue must reference its job.
  4. Given Post Issue is called outside a caller's transaction, when it runs, then it refuses and posts nothing.
  5. Given a client request that tries to call Post Issue directly, when it reaches the API, then it is refused, because the operation is not in the public contract.
- **Rules enforced on the server:** Post Issue is internal: it is not exposed as an endpoint and is callable only from the job-creation service (System, EP-19). It requires the caller's open transaction and a job reference. The amount must pass EP-18-S4 (positive, at most 4 decimals, not above the balance) and is posted under the EP-18-S5 lock. The actor is the user creating the job. Uses the EP-18-S1 posting function.
- **Live events emitted / consumed:** Emitted: "Metal pool changed" after the job's transaction commits (through EP-18-S12).
- **Audit entry written:** No separate entry. The ledger row is the append-only record of the movement (actor, time, kind, delta, job reference); the job creation's own audit entry from EP-19 covers the job and names the gold issued.
- **Data changes:** Inserts into `pool_entries`; updates `metal_pools.balanceG` and `version`. Adds Post Issue to the internal service layer. Until EP-19 exists it is exercised by a test caller.
- **UI reference:** No screen. The gold figure comes from `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("Pure gold issued to Lakshmi", "160 g target + her 0.7% wastage, from the metal pool"), which EP-19 builds; v1 shows it as "162.4000 g".
- **Non-functional checks:** Precision: delta is the negative of the issued integer, with no rounding. Concurrency: posted under the EP-18-S5 lock. Open question Q5b / G23: how the issue is settled against the karigar's allowance at reconciliation belongs to EP-19; this story only records the issue. Open question: one pool or one per purity; the mockup issues 22K (916) gold.
- **Depends on:** EP-18-S1, EP-02-S8, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S4: System can refuse an issue above the balance

- **Story ID:** EP-18-S4
- **Status:** Partial: AC1 and AC5 need the order-copy send of EP-19; the refusal and the balance warning are built (FU-028).
- **Title:** System can refuse an issue above the balance
- **As a:** System
- **I want:** Post Issue to refuse an amount larger than the current balance with "The metal pool does not have that much gold to issue.", and to refuse a negative or zero amount, so that the job creation that called it fails and changes nothing
- **So that:** the pool is never negative and staff are told plainly why the order copy did not go (FR-18-3, FR-18-4, BR-18-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a balance of 150.0000 g, when Rajesh Verma sends an order copy issuing 162.4000 g, then the server refuses with code `pool_insufficient` and the sentence "The metal pool does not have that much gold to issue.", no job and no entry are stored, and the balance is still 150.0000 g.
  2. Given a balance of 162.4000 g, when an issue of exactly 162.4000 g is posted, then it succeeds and the balance is 0.0000 g.
  3. Given an issue of -5.0000 g or 0.0000 g, when it reaches Post Issue, then it is refused as a validation error on the gold field and nothing changes (FR-18-4).
  4. Given an issue of 162.40001 g, when it reaches the server, then it is refused as a validation error and never rounded (EP-02-S2).
  5. Given the refusal reaches the `order-copy` screen, when it is shown, then the sentence appears through the EP-08-S5 refusal display next to "Send the order copy".
- **Rules enforced on the server:** The balance is compared with the amount as integers of 0.0001 g, after the EP-18-S5 lock is taken, so the comparison uses the committed balance. Amount must be more than 0. A refusal is returned in the EP-03-S4 format with the sentence above, and the caller's whole transaction is rolled back (EP-03-S6). The database check `balanceG >= 0` from EP-18-S1 is a second guard.
- **Live events emitted / consumed:** None. A refused issue commits nothing, so no event is sent.
- **Audit entry written:** No. A refused request changes nothing.
- **Data changes:** None in the product database. Adds the `pool_insufficient` code and its sentence to the shared error list.
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("Pure gold issued to Lakshmi", "Send the order copy"). The refusal state is not drawn; it uses the EP-08-S5 pattern.
- **Non-functional checks:** Precision: integer comparison only. Concurrency: the check runs after the lock in EP-18-S5. Security: the client may warn early from the EP-18-S10 balance, but the server check is the authority.
- **Depends on:** EP-18-S3, EP-02-S2, EP-03-S4, EP-03-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S5: System can stop two issues overdrawing the pool

- **Story ID:** EP-18-S5
- **Status:** Done
- **Title:** System can stop two issues overdrawing the pool
- **As a:** System
- **I want:** every posting that lowers the balance to take a row lock on the pool row, or to update it with a version check, before reading the balance, so that two postings at the same moment are applied one after the other
- **So that:** two staff sending order copies at once cannot together issue more gold than the pool holds (FR-18-11, BR-18-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a balance of 100.0000 g, when two issues of 60.0000 g arrive at the same moment, then one succeeds, the balance is 40.0000 g, and the other is refused with "The metal pool does not have that much gold to issue." and leaves no job and no entry (epic acceptance criterion 2).
  2. Given a balance of 100.0000 g, when two issues of 40.0000 g arrive at the same moment, then both succeed one after the other and the balance is 20.0000 g.
  3. Given an issue and a negative adjustment that together exceed the balance arrive at the same moment, when both are processed, then only one commits and the other is refused.
  4. Given 20 concurrent issues of 10.0000 g against a balance of 150.0000 g in a test, when they all finish, then exactly 15 succeed, 5 are refused, and the ledger sum equals the balance of 0.0000 g.
  5. Given a version-check conflict is lost by a request, when the server handles it, then it retries the read and check once inside the request, or returns the conflict error in the EP-03-S5 format; it never posts on a stale balance.
- **Rules enforced on the server:** Every call of the EP-18-S1 posting function takes the PostgreSQL row lock (`SELECT … FOR UPDATE`) or performs a conditional update on `metal_pools.version` before computing the new balance. The lock is held only for the caller's transaction. Lock order is fixed (pool row before job or piece rows) so job creation and scrap cannot deadlock each other.
- **Live events emitted / consumed:** None of its own. The committed posting emits "Metal pool changed" through EP-18-S12.
- **Audit entry written:** No. The postings it protects write their own records.
- **Data changes:** None in the product database. Changes the EP-18-S1 posting function to lock or version-check; adds a concurrency test to the `api` test suite.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: the second of two overdrawing issues fails with the sentence above (epic section 13). Performance: the lock is held for one transaction only; a proposed target, to confirm, is no issue waits more than 1 second for the lock with 10 staff working. D1 is decided (Option C): the Node API owns this transaction and takes the row lock or version check on the managed PostgreSQL database; either way it must pass criteria 1 to 4.
- **Depends on:** EP-18-S1, EP-18-S4, EP-02-S14, EP-03-S5, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S6: System can post a recovery entry inside a scrap decision

- **Story ID:** EP-18-S6
- **Status:** Partial: AC1 and AC2 need the scrap decision of EP-27; Post Recovery is built and tested with a test caller (FU-029).
- **Title:** System can post a recovery entry inside a scrap decision
- **As a:** System
- **I want:** a Post Recovery function that the scrap decision of EP-27 calls inside its own transaction, which posts a `recovered` entry equal to the piece's net gold with the piece id as its reference
- **So that:** scrapping closes the piece but not the gold, which goes back into the pool to be issued again (FR-18-5, BR-18-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7701 Temple Haram with net 78.4000 g and a balance of 812.5800 g, when the owner scraps it, then a `recovered` entry with delta `784000` and reference piece TAG-7701 is stored in the same transaction, and the balance is 890.9800 g (epic acceptance criterion 3).
  2. Given the scrap decision fails after Post Recovery has run, when the transaction rolls back, then no `recovered` entry exists and the balance is unchanged.
  3. Given a piece already has a `recovered` entry, when Post Recovery is called for it again, then it refuses and posts nothing, so one piece is recovered once.
  4. Given Post Recovery is called with no piece id or with a net of 0 or less, when it runs, then it refuses and posts nothing.
  5. Given a client request that tries to call Post Recovery directly, when it reaches the API, then it is refused, because the operation is not in the public contract.
- **Rules enforced on the server:** Post Recovery is internal and callable only from the scrap service (System, EP-27). It requires the caller's open transaction and a piece reference. The amount is the piece's stored net (gross units minus stone units), read on the server, not sent by the client. One `recovered` entry per piece, enforced by a unique index on (`kind`, `ref_id`) for `recovered`. Posted under the EP-18-S5 lock through the EP-18-S1 function. The actor is the owner making the scrap decision.
- **Live events emitted / consumed:** Emitted: "Metal pool changed" after the scrap transaction commits (through EP-18-S12).
- **Audit entry written:** No separate entry. The ledger row is the append-only record (actor, time, kind, delta, piece reference); the scrap decision's own audit entry from EP-27 covers the piece.
- **Data changes:** Inserts into `pool_entries`; updates `metal_pools.balanceG` and `version`. Migration adds a unique partial index on `pool_entries` (`ref_id`) where `kind = 'recovered'`. Adds Post Recovery to the internal service layer. Until EP-27 exists it is exercised by a test caller.
- **UI reference:** No screen. The rule is drawn on `docs/ux/mockups/12-state-lifecycles.svg` ("The owner marks the piece as scrap, the piece closes, and its gold goes back into the metal pool to be issued again.").
- **Non-functional checks:** Precision: the net is computed in integers through EP-02-S2. Concurrency: the unique index stops two scrap decisions on one piece both crediting the pool. Open question (App. B sub-question 2): is stone weight recovered from scrap and tracked, or written off; this story credits net gold only.
- **Depends on:** EP-18-S1, EP-18-S5, EP-02-S2, EP-02-S5, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S7: Owner can record gold returned by a karigar

- **Story ID:** EP-18-S7
- **Status:** Done
- **Title:** Owner can record gold returned by a karigar
- **As a:** Owner
- **I want:** to record unused gold a karigar hands back, in grams to 4 decimals, linked to the job it was issued for, through Create Return entry
- **So that:** gold that comes back without becoming a piece is in the pool again and no longer counted as with the karigar (FR-18-6, FR-18-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given job MO-2026-118 for Vijay Kumar · KG-04 was issued 34.0000 g, when Sanjay Seth records 2.5000 g returned on it with the note "Left over after casting", then a `returned` entry with delta `25000`, reference job MO-2026-118 and actor Sanjay is stored, and the balance rises by 2.5000 g.
  2. Given that return, when gold with Vijay Kumar is read (EP-18-S11), then MO-2026-118 counts 31.5000 g, not 34.0000 g.
  3. Given the job was issued 34.0000 g and 2.5000 g was already returned, when Sanjay records a further 32.0000 g, then the server refuses because the returns would exceed the gold issued on that job, and nothing changes.
  4. Given an unknown job id, or a return of 0.0000 g or less, when Sanjay saves, then the server refuses with `not_found` or a validation error and nothing changes.
  5. Given Rajesh Verma or a karigar user sends Create Return entry, when the server checks the permission, then it is refused and nothing changes (FR-18-8).
- **Rules enforced on the server:** Caller must hold the post-pool-entry permission (owner only, EP-05-S2). A job reference is required and must exist. The amount must be more than 0, at most 4 decimals, and not more than the job's issued gold less its earlier returns, compared as integers. Posted through the EP-18-S1 function under the EP-18-S5 lock. Deduplicated by idempotency key (EP-03-S8). Entry and audit in one transaction.
- **Live events emitted / consumed:** Emitted: "Metal pool changed" (through EP-18-S12).
- **Audit entry written:** Yes: actor, time, entity (metal pool and job id), action (`pool_return_recorded`), before and after balance, delta in integer units, reason (the note).
- **Data changes:** Inserts into `pool_entries`; updates `metal_pools.balanceG` and `version`. Adds Create Return entry to the shared contract.
- **UI reference:** Not yet designed. No mockup draws recording a return; it belongs on the pool ledger page or the job record.
- **Non-functional checks:** Precision: integer arithmetic for the cap. Concurrency: two returns on one job at once cannot together exceed the cap, because both run under the pool lock. Security: owner only. Open question: does unused gold returned by a karigar go back to the pool, and is it weighed in; if it is weighed on a registered scale, the scale id is added to the entry. Open question Q5b / G23: whether a return changes the job's settlement against the allowance (EP-19).
- **Depends on:** EP-18-S1, EP-18-S5, EP-02-S8, EP-03-S2, EP-03-S5, EP-03-S8, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S8: Owner can post an adjustment with a reason

- **Story ID:** EP-18-S8
- **Status:** Done
- **Title:** Owner can post an adjustment with a reason
- **As a:** Owner
- **I want:** to post a signed adjustment in grams to 4 decimals with a reason of at least 3 characters, through Create Adjustment entry
- **So that:** a counting mistake or a wrong entry is corrected by a new row, and the ledger is never edited (FR-18-7, FR-18-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a balance of 650.1800 g, when Sanjay Seth posts an adjustment of -0.4000 g with the reason "Safe recount 2 Nov", then an `adjustment` entry with delta `-4000` and actor Sanjay is stored and the balance is 649.7800 g.
  2. Given a reason of "ok" (2 characters) or only spaces, when Sanjay saves, then the server refuses it as a validation error on the reason and nothing changes.
  3. Given a balance of 10.0000 g, when Sanjay posts an adjustment of -12.0000 g, then the server refuses with "The metal pool does not have that much gold to issue." and nothing changes (BR-18-1).
  4. Given Rajesh Verma, a staff user, posts an adjustment, when the server checks the permission, then it is refused and nothing changes (epic acceptance criterion 4).
  5. Given an adjustment of 0.0000 g, when Sanjay saves, then the server refuses it as a validation error.
- **Rules enforced on the server:** Caller must hold the post-pool-entry permission (owner only, EP-05-S2). Reason trimmed and at least 3 characters. Amount not zero, at most 4 decimals. A negative adjustment passes the same balance check as an issue under the EP-18-S5 lock. Posted through the EP-18-S1 function with no reference. Deduplicated by idempotency key (EP-03-S8). Entry and audit in one transaction.
- **Live events emitted / consumed:** Emitted: "Metal pool changed" (through EP-18-S12).
- **Audit entry written:** Yes: actor, time, entity (metal pool), action (`pool_adjusted`), before and after balance, delta in integer units, reason (epic section 13).
- **Data changes:** Inserts into `pool_entries`; updates `metal_pools.balanceG` and `version`. Adds Create Adjustment entry to the shared contract.
- **UI reference:** Not yet designed. The pool balance and ledger page is undrawn (MOCKUP-COVERAGE §3); the adjustment action belongs on it.
- **Non-functional checks:** Audit: an audit entry with reason in addition to the append-only ledger row (epic section 13). Security: owner only, checked on the server. Precision: integer arithmetic. Open question: who may post an adjustment besides the owner.
- **Depends on:** EP-18-S1, EP-18-S4, EP-18-S5, EP-03-S2, EP-03-S4, EP-03-S8, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S9: Owner can see the ledger with filters

- **Story ID:** EP-18-S9
- **Status:** Done
- **Title:** Owner can see the ledger with filters
- **As a:** Owner
- **I want:** to list pool entries newest first, 50 per page, through List Pool entries, filtered by kind, job, piece and date range, each row showing time, kind, signed grams, reference, actor and note
- **So that:** I can answer where my gold went for any job, piece or day (FR-18-9, FR-18-13, BR-18-5, BR-18-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the seeded ledger, when Sanjay Seth opens the ledger, then the newest entry is first and each row shows time in Asia/Kolkata, kind, signed grams to 4 decimals such as "−162.4000 g" or "+78.4000 g", the job or piece reference, the actor and the note.
  2. Given the filter kind `recovered`, when the list loads, then only recovered entries are shown, including "+78.4000 g · TAG-7701".
  3. Given the filter job MO-2026-118, when the list loads, then only its `issued` and `returned` entries are shown.
  4. Given the date range 1 Nov 2026 to 1 Nov 2026, when the list loads, then only entries made on that Asia/Kolkata day are shown, including those after 18:30 UTC on 31 Oct.
  5. Given 120 entries match, when Sanjay scrolls, then entries load 50 at a time by cursor (EP-03-S9), and a staff or karigar user calling List Pool entries is refused.
- **Rules enforced on the server:** Caller must hold the read-ledger permission (owner only, EP-05-S2). Filters are validated: kind from the enum, job and piece ids as strings, date range with from not after to. Date filters are applied as Asia/Kolkata days converted to UTC on the server (EP-10-S10). Paged by cursor with a page size of 50 (EP-03-S9). No money field is returned (BR-18-5).
- **Live events emitted / consumed:** Consumed: "Metal pool changed", which refetches the first page while it is open (EP-08-S9).
- **Audit entry written:** No. Reading the ledger changes nothing.
- **Data changes:** None in the product database beyond indexes. Migration adds indexes on `pool_entries` for (`at`), (`kind`, `at`) and (`ref_type`, `ref_id`). Adds List Pool entries to the shared contract and moves `MetalPool.tsx` off `useStore()` onto the EP-08 data layer.
- **UI reference:** Not yet designed. The pool balance and ledger page is undrawn (MOCKUP-COVERAGE §3, epic section 12). The prototype `src/components/stock/MetalPool.tsx` card inside route `stock` (hero balance and latest 8 entries) is reused until the design pass, with a link to the full list.
- **Non-functional checks:** Performance: the ledger pages 50 rows (proposed target, to confirm) and the screen loads within 2 seconds (PRODUCTION-SCOPE §5). Precision: grams formatted from integers with 4 decimals. Time: shown in Asia/Kolkata. Availability: loading, error and offline states (EP-08-S3, EP-08-S4, EP-08-S11).
- **Depends on:** EP-18-S1, EP-03-S9, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S11, EP-08-S13, EP-08-S17, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S10: Staff can see the pool balance on the order copy screen

- **Story ID:** EP-18-S10
- **Status:** Partial: order-copy is still a prototype screen until EP-19; the balance line, warning and offline state are built (FU-028).
- **Title:** Staff can see the pool balance on the order copy screen
- **As a:** Staff
- **I want:** to read the current pool balance through Read Pool balance and see it next to "Pure gold issued to …" on `order-copy`, with an early warning when the gold I enter is more than the balance
- **So that:** I know how much gold I can hand over before I send the order copy (FR-18-13, BR-18-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a balance of 812.5800 g, when Rajesh Verma opens `order-copy`, then the gold section shows the pool balance as "812.5800 g in the metal pool".
  2. Given Rajesh enters 900.0000 g as pure gold issued, when the field is checked on the client, then a warning shows that the pool holds 812.5800 g, and sending is still checked by the server (EP-18-S4).
  3. Given another user's issue commits while Rajesh has `order-copy` open, when "Metal pool changed" arrives, then the balance updates within about a second without a reload (epic acceptance criterion 6).
  4. Given a karigar user calls Read Pool balance, when the server checks the permission, then it is refused.
  5. Given the balance read fails or the device is offline, when `order-copy` is open, then the balance area shows the EP-08-S4 error with "Try again" or the EP-08-S11 offline state, and "Send the order copy" is disabled offline.
- **Rules enforced on the server:** Caller must hold the read-pool-balance permission (owner and staff, EP-05-S2). The response holds the balance in integer units, its display string and the pool version, and nothing about karigars or entries. The client warning is a convenience; the server check in EP-18-S4 decides.
- **Live events emitted / consumed:** Consumed: "Metal pool changed" (EP-08-S8, EP-08-S9).
- **Audit entry written:** No. Reading the balance changes nothing.
- **Data changes:** None in the product database. Adds Read Pool balance to the shared contract and a pool balance component to the web app, used on `order-copy` and on the `stock` pool card.
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("THE DUE DATE AND THE GOLD YOU HAND OVER", "Pure gold issued to Lakshmi", "from the metal pool", "Send the order copy"). The balance line and the warning are not drawn; the mockup shows "162.400 g", which v1 shows to 4 decimals as "162.4000 g". The rest of the screen is EP-19.
- **Non-functional checks:** Performance: proposed target, to confirm, of a balance read under 100 ms; the screen loads within 2 seconds. Precision: shown to 4 decimals from integers. Availability: offline and reconnecting states shown (EP-08-S10, EP-08-S11). D7 is decided: one shop, one pool, and staff see it.
- **Depends on:** EP-18-S1, EP-05-S2, EP-08-S1, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S8, EP-08-S9, EP-08-S10, EP-08-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S11: Owner can see gold with each karigar and a custody summary

- **Story ID:** EP-18-S11
- **Status:** Done
- **Title:** Owner can see gold with each karigar and a custody summary
- **As a:** Owner
- **I want:** a Read Custody summary operation that returns the gold in the pool, with each karigar on open jobs (issued less returned), in parcels not yet released, in stock and gone, and a Read Gold with karigar operation that the owner can call for any karigar and a karigar can call only for themselves
- **So that:** I can answer where all my gold is right now, and each karigar sees only the gold they hold (FR-18-13, BR-18-4, BR-18-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar · KG-04 has two open jobs issued 152.4000 g and 34.0000 g with no returns, when Sanjay Seth reads gold with Vijay, then it is 186.4000 g across 2 jobs.
  2. Given 7 open jobs across all karigars holding 612.0000 g in total, when Sanjay reads the custody summary, then "with karigars" is 612.0000 g with 7 open jobs and a per-karigar list, alongside the pool balance, gold in unreleased parcels, gold in stock (net of `in_stock` pieces) and gold gone (net of stocked-out pieces).
  3. Given Vijay Kumar is signed in on the karigar portal, when he reads gold with karigar for himself, then he gets 186.4000 g; when he asks for KG-01 Lakshmi Devi, then the server refuses (EP-05-S3).
  4. Given Rajesh Verma, a staff user, reads the custody summary, when the server checks the permission, then it is refused.
  5. Given a job is closed or settled, when the figures are read again, then its gold no longer counts as with the karigar.
- **Rules enforced on the server:** Custody summary is owner only; gold with karigar is owner, or the karigar linked to that karigar record (EP-05-S3, EP-05-S13). All figures are computed on the server from stored integers: open jobs' `goldIssuedG` less their `returned` entries; net of pieces in unreleased parcels, in `in_stock` and stocked out. No money figure and no other karigar's data is returned to a karigar. Open jobs are the statuses EP-19 defines as not closed.
- **Live events emitted / consumed:** Consumed: "Metal pool changed" refetches the summary while it is open (EP-08-S9).
- **Audit entry written:** No. Reading figures changes nothing.
- **Data changes:** None in the product database. Adds Read Custody summary and Read Gold with karigar to the shared contract, replacing the prototype selector `goldWithKarigar` in `src/store/selectors.ts`.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("WHERE THE GOLD IS RIGHT NOW", "Gold on the floor 1,847 g · 42 pieces, ready to sell", "Gold with karigars 612 g · 7 open jobs"); the tiles are built in EP-32 from this read. `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("GOLD WITH ME 186.400 g", "across 2 jobs"), built in EP-20 and shown to 4 decimals. A full custody page is not yet designed.
- **Non-functional checks:** Precision: sums of integers, shown to 4 decimals. Security: a karigar reads only their own figure (epic section 13). Performance: the summary reads within the 2-second screen budget for 50 karigars and 10,000 pieces. Open question Q5b / G23: whether a settled job's loss is shown here or only in the EP-16 scorecard. Open question (App. B sub-question 2): whether stone weight from scrap is tracked in custody. D7 is decided: figures are shop-wide.
- **Depends on:** EP-18-S1, EP-18-S7, EP-02-S5, EP-02-S6, EP-02-S8, EP-05-S2, EP-05-S3, EP-05-S13, EP-08-S2, EP-08-S3, EP-08-S9, EP-16-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-18-S12: System can push the balance live after a change

- **Story ID:** EP-18-S12
- **Status:** Done
- **Title:** System can push the balance live after a change
- **As a:** System
- **I want:** to emit "Metal pool changed" after every committed pool entry, carrying the new balance, the pool version and the entry kind, to owner and staff connections only
- **So that:** the order copy screen and the pool card always show the gold available to issue without a reload (FR-18-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has the `stock` pool card open and Rajesh Verma has `order-copy` open, when an issue of 162.4000 g commits, then both screens show 650.1800 g within about a second (epic acceptance criterion 6).
  2. Given the posting transaction rolls back, when it ends, then no "Metal pool changed" is sent (EP-07-S1).
  3. Given Vijay Kumar is connected on the karigar portal, when any pool entry commits, then he receives no "Metal pool changed" event.
  4. Given two entries commit in a row, when a screen receives the events out of order, then it keeps the figure with the higher pool version.
  5. Given Rajesh's connection drops while an entry commits, when he reconnects, then he catches up from his last sequence number and shows the current balance (EP-07-S7, EP-08-S10).
- **Rules enforced on the server:** The event is published only after the transaction commits (EP-07-S1), with sequence number, entity id and version (EP-07-S2). The audience is the roles allowed to open `order-copy`, owner and staff; karigars are excluded by the EP-07 registry and permission filter (EP-07-S5, EP-07-S11). The payload holds the balance, version and entry kind, not the reference, actor or note.
- **Live events emitted / consumed:** Emitted: "Metal pool changed".
- **Audit entry written:** No. Each posting writes its own record.
- **Data changes:** None in the product database. Wires the EP-18-S1 posting function to the EP-07 publisher and adds "Metal pool changed" to the client event-to-read map for the pool balance, ledger and custody reads (EP-08-S8).
- **UI reference:** No screen of its own. Effects show on `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy`, and on the pool card inside route `stock`.
- **Non-functional checks:** Performance: event reaches open screens within about a second (PRODUCTION-SCOPE §1). Concurrency: version in the payload lets a screen drop an older value. Security: no event to karigars.
- **Depends on:** EP-18-S1, EP-18-S10, EP-07-S1, EP-07-S2, EP-07-S4, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- App. B sub-question 1: does the metal pool already exist in the owner's books, and what is the opening balance? (EP-18-S2)
- App. B sub-question 2: is stone weight recovered from scrap and tracked, or written off? (EP-18-S6, S11)
- Q5b / G23: is the allowance judged per job against the ledger, and where is the flag raised? (EP-18-S3, S7, S11)
- Is the pool one number or one per purity (22K and 18K)? (EP-18-S1, S3)
- Who may post an opening or adjustment entry besides the owner? (EP-18-S2, S8)
- Does unused gold returned by a karigar go back to the pool, and is it weighed in? (EP-18-S7)
- G10: which stored unit holds balances exactly? (EP-18-S1)
- D7 is decided: one shop, no branches; one pool per shop (EP-18-S1, S10, S11).
