# EP-06: Audit log · stories

Epic document: [EP-06 Audit log](../epics/EP-06-audit-log.md)

Role note: stories where the server writes, protects or filters audit entries on its own use "System". Stories that describe reading the Security log use "Owner", the only role allowed to read it.

---

## EP-06-S1: System can store audit entries that cannot be updated or deleted

- **Story ID:** EP-06-S1
- **Title:** System can store audit entries that cannot be updated or deleted
- **As a:** System
- **I want:** the `audit_entries` table from EP-02-S11 extended with entity type, entity id, before, after, reason and token reference columns, and locked so the application's database role can only insert and select rows
- **So that:** no person, including the owner or a developer with a database tool in production, can change or remove the record of who changed the books (BR-06-1, BR-06-2, FR-06-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `audit_entries` is inspected, then it has id, at (UTC), actor id, actor name, actor role, entity type, entity id, action, summary, before, after, reason, token reference and ref columns, and every column is set at insert.
  2. Given an existing entry, when the application's database role runs an UPDATE or DELETE on `audit_entries`, then the database refuses it with a permission error and the row is unchanged (epic acceptance criterion 2).
  3. Given Sanjay Seth signed in as Owner, when he calls an update or delete operation on an audit entry through the API, then no such operation exists in the contract and the server returns `not_found` for the unknown operation, with the row unchanged (epic acceptance criterion 2).
  4. Given an entry with entity type `invoice`, which is not in the list piece, parcel, lead, job, edit, problem, scrap request, stock-out, setting, user, scale, karigar, customer, broadcast, wish, session, when it is inserted, then the database rejects it.
  5. Given a production database, when the grants on `audit_entries` are listed in a CI check against staging, then only INSERT and SELECT are granted to the application role, and no role used by the application or by developers in production has UPDATE, DELETE or TRUNCATE.
- **Rules enforced on the server:** Append-only is enforced twice: the contract has no update or delete operation for audit entries, and storage permissions (grants, or a row-level policy on a managed platform) allow only insert and select. A correction is a new entry whose ref points at the old entry id; the old entry is never touched (epic section 16 risk). Entity type and actor role are checked against fixed lists.
- **Live events emitted / consumed:** None. The audit log pushes no events (epic section 11).
- **Audit entry written:** No. This story builds the store; it writes no entries itself.
- **Data changes:** Migration on `audit_entries` (EP-02-S11): adds `entity type`, `entity id`, `before` and `after` (structured, for example JSON), `reason`, `token reference`; renames `kind` to `action` or keeps `kind` as the column name, matching EP-02 naming; adds an index on (entity type, entity id) and on (actor id, at). Migration revokes UPDATE, DELETE and TRUNCATE on the table from the application role. The prototype `AuditEntry {id, at, actorName, actorRole, kind, summary, detail, ref}` keeps its fields; `detail` stays as free text, and before and after are empty for entries written before this migration. Entity type `session` is added to the epic's list for the sign-in entries from EP-04-S14.
- **UI reference:** No screen
- **Non-functional checks:** Audit: append-only by storage permissions as well as by the API (epic section 13). Concurrency: inserts only, so no lock contention on existing rows. Open decision D1: on an own API the lock is a database grant; on a managed platform it is a row-level policy with no update or delete rule. Open question: whether a hash chain is also needed for tamper evidence; if yes, a `previous hash` column is added here.
- **Depends on:** EP-02-S1, EP-02-S11, EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S2: System can write an audit entry in the same transaction as every state change

- **Story ID:** EP-06-S2
- **Title:** System can write an audit entry in the same transaction as every state change
- **As a:** System
- **I want:** a service-layer wrapper that every state-changing operation runs through, which appends exactly one audit entry inside the operation's transaction before it commits
- **So that:** a change without an entry can never be committed, and a failed audit write rolls the change back (FR-06-1, FR-06-2, BR-06-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given lead LD-2026-213 in state `opened`, when Rajesh Verma calls the reference `markLeadLost` (EP-03-S12) with reason "Customer went elsewhere.", then one audit entry with entity type lead, entity id LD-2026-213, actor Rajesh Verma and reason "Customer went elsewhere." is written in the same transaction as the state change.
  2. Given a test that makes the audit insert fail inside a state-changing operation, when the operation ends, then the business row is unchanged and the caller gets an error (epic acceptance criterion 4; the stock-out case with a piece staying `in_stock` is re-run in EP-26 once stock-out exists).
  3. Given an operation that is refused by a rule, by the permission check or by a version conflict, when it ends, then no audit entry is written.
  4. Given an operation registered in the EP-03 contract as state-changing, when it is not wrapped by the audit writer, then a CI test fails and names the operation (epic section 16 risk).
  5. Given two operations committed one after the other, when the log is read, then their entries are in commit order.
- **Rules enforced on the server:** The Append Audit entry operation is internal and callable only from service functions, never from a client request. Actor and time come from `Ctx` (EP-03-S3), never from the request body. The entry insert and the business change share the one transaction from EP-03-S6. One state-changing call writes exactly one entry, even when it touches several rows.
- **Live events emitted / consumed:** None. After-commit events from other epics are emitted only once the transaction with its audit entry has committed.
- **Audit entry written:** Yes, for every wrapped operation: actor id, actor name, actor role, time, entity type, entity id, action, summary, reason when given.
- **Data changes:** Inserts into `audit_entries`. No schema change beyond EP-06-S1. Adds the audit writer and wrapper to `api`, and a list of state-changing operations to the shared contract.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: entries are written in the operation's transaction, so order matches commit order (epic section 13). Performance: the extra insert adds one row per operation and no extra round trip outside the transaction. Open decision D1: on a managed platform the wrapper may be a database function or trigger, but it must still run in the same transaction.
- **Depends on:** EP-06-S1, EP-03-S3, EP-03-S6, EP-03-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S3: System can record before and after values for each change

- **Story ID:** EP-06-S3
- **Title:** System can record before and after values for each change
- **As a:** System
- **I want:** the audit writer to take the row as it was read and the row as it will be saved, and store only the fields that changed in `before` and `after`
- **So that:** the owner can see exactly what each change did, and entries stay small over a year of use (FR-06-3, BR-06-2, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given lead LD-2026-213 in state `opened` with an empty note, when it is marked lost with reason "Customer went elsewhere.", then the entry has before `{state: "opened", note: null}` and after `{state: "lost", note: "Customer went elsewhere."}` and no unchanged field such as the customer name.
  2. Given a create operation, such as adding user Deepak Rao (EP-05-S4), when the entry is written, then before is empty and after holds the created fields, with the phone masked as "+91 ••••• 71145".
  3. Given a change to a field holding a list, such as `notifyChannels {whatsapp, app, email}`, when only `email` changes from false to true, then before and after hold `notifyChannels` with the old and new values.
  4. Given a field named `code`, `token`, `otp`, `password` or `tokenHash`, when it changed, then it is left out of before and after.
  5. Given any entry, when it is inspected, then no money field is present, because value fields stay off until EP-42.
- **Rules enforced on the server:** Before comes from the row read inside the transaction, not from the client. Only changed fields are stored. Secret fields are stripped before writing (shared with EP-04-S14). Phones are masked. A correction is a new entry; before and after of an earlier entry are never rewritten.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: before and after added to the fields written by EP-06-S2.
- **Data changes:** Writes `audit_entries.before` and `audit_entries.after`. No schema change beyond EP-06-S1.
- **UI reference:** No screen in this story. Before and after are shown by EP-06-S11.
- **Non-functional checks:** Audit: every state change records before and after values (PRODUCTION-SCOPE §1 Auditable). Personal data: customer names may appear in before or after, for example on stock-outs and wishes; listed under gap G22. Performance: storing only changed fields keeps an entry to a few hundred bytes.
- **Depends on:** EP-06-S2, EP-04-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S4: System can record a token reference instead of the token value

- **Story ID:** EP-06-S4
- **Title:** System can record a token reference instead of the token value
- **As a:** System
- **I want:** operations that use a one-time token (applying an edit, OTP-related actions) to store the id of the hashed token record in `token reference`, and never the 6-digit value
- **So that:** nobody reading the log or a backup can reuse or learn a token, and the habit of writing "Token ${edit.token}" from `applyEdit` is not carried into production (FR-06-5, BR-06-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth applies an edit to TAG-8841 with a valid token, when the operation commits, then the entry has a token reference that points to the hashed token record and the entry contains no 6-digit token anywhere in summary, before, after or reason (epic acceptance criterion 1).
  2. Given a test that searches every column of every entry written by the edit, sign-in and OTP tests for the 6 digits used, when it runs in CI, then it finds no match.
  3. Given the audit entry type in the shared package, when it is read, then it has a `tokenReference` field and no field that can hold the code value (epic section 16 risk).
  4. Given an operation that used no token, such as marking a lead lost, when its entry is written, then `token reference` is empty.
- **Rules enforced on the server:** The writer accepts a token record id only. The value is stripped by the same secret-field filter as EP-06-S3. Summary text is built by the server from field names and values and never from a client string that might include the token.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: token reference added to the fields written by EP-06-S2 when a token was used.
- **Data changes:** Writes `audit_entries.token reference`. The hashed token records themselves come from EP-04-S2 (OTP) and EP-25 (edit token).
- **UI reference:** `docs/ux/mockups/05-edit-propose-apply.svg` shows the edit and token flow that produces this entry ("Enter the token sent to your WhatsApp"). No screen in this story.
- **Non-functional checks:** Security: tokens are never logged in plain text; the reference points to the hashed token record (PRODUCTION-SCOPE §5, epic section 13). Audit: the reference lets the owner match an edit to the token sent to his WhatsApp without seeing the token.
- **Depends on:** EP-06-S3, EP-04-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S5: System can record weights in entries as integer units of 0.0001 g

- **Story ID:** EP-06-S5
- **Title:** System can record weights in entries as integer units of 0.0001 g
- **As a:** System
- **I want:** every weight inside before and after (for example `grossG`, `stoneG`, `lossG`, `gapNetG`, `deltaG`) stored as an integer in units of 0.0001 g using the shared conversion from EP-02-S2, and shown at four decimals
- **So that:** the log never rounds a weight differently from the books, and an edit of 40 mg shows as exactly 0.0400 g (FR-06-6, BR-06-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given an edit to TAG-8841 changing gross weight from 48.6500 g to 48.6100 g, when the entry is written, then before has `grossG` 486500 and after has `grossG` 486100 (epic acceptance criterion 1).
  2. Given that entry, when it is shown to the owner, then it reads "48.6500 g" and "48.6100 g", with four decimals and no rounding.
  3. Given an accepted loss with `lossG` 0.0350 g, when the entry is written, then it stores 350.
  4. Given the writer is passed a weight as a decimal such as 48.61, when it validates the entry, then it rejects it in tests, because weights must already be integers.
- **Rules enforced on the server:** Weight fields in before and after must be whole numbers. Conversion happens once, in the shared package, never in the audit writer.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: weight values inside before and after, as integers.
- **Data changes:** None beyond EP-06-S1. Weight values inside `before` and `after` are integers.
- **UI reference:** No screen in this story. Display at four decimals is used by EP-06-S11.
- **Non-functional checks:** Precision: weights are integers in units of 0.0001 g and shown to 4 decimals (PRODUCTION-SCOPE §5). Precision: a test confirms that 486500 to 486100 displays a difference of 0.0400 g.
- **Depends on:** EP-06-S3, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S6: System can record actions taken by the scheduler and integrations

- **Story ID:** EP-06-S6
- **Title:** System can record actions taken by the scheduler and integrations
- **As a:** System
- **I want:** a System actor for changes made with no signed-in user, with a name that says which part acted, such as "Scheduler" or "WhatsApp intake"
- **So that:** a lead escalated by the timer or a lead created from an incoming message still has an entry with a clear actor (FR-06-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a background job changes a record with no session, when its entry is written, then actor role is System, actor id is empty or the fixed System id, and actor name is the job's name, for example "Scheduler".
  2. Given an integration such as WhatsApp intake creates a record, when its entry is written, then actor name is "WhatsApp intake" and actor role is System.
  3. Given a client request that sends actor role System in its body, when the server handles it, then the actor is still taken from the session and the request cannot act as System.
  4. Given the owner later reads the log, when he filters by actor System, then these entries are listed (EP-06-S10).
- **Rules enforced on the server:** Only server-side job and integration code can build a System `Ctx`; no client request can. The actor role list is `owner`, `staff`, `karigar`, System. Each job or integration registers one fixed actor name.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor role System, actor name, time, entity, action, before, after.
- **Data changes:** Migration allows actor role System in `audit_entries` and allows an empty actor id for System rows, or seeds one fixed System user, matching the EP-02-S11 foreign key.
- **UI reference:** No screen
- **Non-functional checks:** Security: System context is never built from a request. Time: job time is the server's UTC time at commit.
- **Depends on:** EP-06-S2, EP-03-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S7: System can audit lead, job, parcel, problem, edit-proposal and onboarding transitions not audited today

- **Story ID:** EP-06-S7
- **Title:** System can audit lead, job, parcel, problem, edit-proposal and onboarding transitions not audited today
- **As a:** System
- **I want:** an action kind in the shared action list for every transition that the prototype does not audit, so that each one writes an entry when its feature epic ports it
- **So that:** the log covers every change, not only the 10 kinds the prototype writes today (FR-06-10, BR-06-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the shared action list, when it is compared with the "not audited today" list in epic section 6, then it has one action kind for each of createLead, confirmLead, startWorkingLead, markLeadLost, routeLeadItemToStock, createOrderCopyAndJob, acceptJob, startJob, markJobReady, handOver, parcel arrival, saveTag, qcTick, releaseParcel on an exact match, ownerRecheckTag, raiseProblem, proposeEdit, ownerAgreeEdit, requestScrap, onboarding of customer, karigar and staff, sendWishes, sendBroadcast and upsertScale, and none for releaseHold, because v1 has no holds.
  2. Given the 10 existing kinds `edit_applied`, `edit_refused`, `loss_accepted`, `parcel_sent_back`, `parcel_last_digit`, `problem_cleared`, `scrap_marked`, `scrap_declined`, `stock_out`, `setting_changed`, when the list is read, then they are all still present with the same names, so prototype entries stay readable.
  3. Given the karigar Lakshmi Devi hands over job for KG-04, when the operation commits in EP-19 or EP-20, then an entry exists with actor Lakshmi Devi, actor role `karigar` and the hand-over action (epic acceptance criterion 5).
  4. Given the reference `markLeadLost` from EP-03-S12, when it runs, then its entry uses the lead-lost action kind from this list.
  5. Given a new action kind is added to the list, when the migration runs, then the database accepts entries with it, and a kind not in the list is still rejected.
  6. Given every operation in the EP-03 catalogue, when the CI audit test runs, then each state-changing operation has a test that checks it writes an entry of its kind, and the run fails for any that does not (epic acceptance criterion 6).
- **Rules enforced on the server:** The action list lives in the shared package and the database check is generated from it. Each feature epic must use a kind from this list; EP-06-S2 refuses to commit an entry with an unknown kind. A transition removed in v1 (releaseHold) has no kind.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, by each feature epic's operation: actor, time, entity, action, before, after, reason where given.
- **Data changes:** Migration replaces the 10-value check on the action column from EP-02-S11 with the full list. The shared package gains the action list and the label for each kind.
- **UI reference:** No screen in this story. Labels show on the `security` route (EP-06-S9).
- **Non-functional checks:** Audit: every transition writes an entry (PRODUCTION-SCOPE §5). Open question: the final names of the new action kinds are not decided; this story fixes the list of transitions, and the names are set once that question is answered. Until then, working names such as `lead_lost` or `job_handed_over` are used and may change by migration before launch.
- **Depends on:** EP-06-S2, EP-06-S6, EP-03-S1, EP-03-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S8: System can audit the pricing flag and every other setting change

- **Story ID:** EP-06-S8
- **Title:** System can audit the pricing flag and every other setting change
- **As a:** System
- **I want:** every setting change, including `pricingEnabled`, to write a `setting_changed` entry with the setting key in ref and the old and new values in before and after
- **So that:** turning pricing on or off is on the record like any other rule change, which the prototype skips today (FR-06-11, BR-06-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given `pricingEnabled` is false, when Sanjay Seth sets it to true, then an entry is written with action `setting_changed`, ref `pricingEnabled`, before `{pricingEnabled: false}` and after `{pricingEnabled: true}`.
  2. Given `leadSlaHours` is 4, when the owner sets it to 6, then an entry is written with before 4 and after 6.
  3. Given the owner sets `leadSlaHours` to 0, when the server refuses with "The lead timer must be at least 1 hour.", then no entry is written.
  4. Given each of `pricingEnabled`, `leadSlaHours`, `requireEditToken`, `notifyChannels`, `lateLeadAudience` and `autoSendWishes`, when a test changes it, then exactly one `setting_changed` entry is written.
  5. Given the owner opens the Rules filter on the Security log, when entries load, then the `pricingEnabled` change is listed.
- **Rules enforced on the server:** The setting change and its entry share one transaction. There is no exception for `pricingEnabled`; the `if (a.key === 'pricingEnabled') return st;` skip in `setSetting` is not carried over. Who may change each setting is decided by EP-13 and the G12 question, not here.
- **Live events emitted / consumed:** None in this story. "Setting changed" is a proposed event (README gap G26) emitted by EP-13.
- **Audit entry written:** Yes: actor, time, entity setting, entity id the key, action `setting_changed`, before, after.
- **Data changes:** Inserts into `audit_entries`. No schema change.
- **UI reference:** Rules filter on the `security` route; settings screens are EP-13.
- **Non-functional checks:** Audit: a change to `pricingEnabled` writes an entry like any other setting (FR-06-11). Open question G12: who may change which setting is not settled, so this story audits every change regardless of who makes it.
- **Depends on:** EP-06-S2, EP-06-S3, EP-06-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S9: Owner can list audit entries newest first, one page at a time

- **Story ID:** EP-06-S9
- **Title:** Owner can list audit entries newest first, one page at a time
- **As a:** Owner
- **I want:** the Security log on route `security` to load entries from the server newest first, a page at a time, each row showing the kind label, ref, time in Asia/Kolkata, actor name and role, and summary
- **So that:** I can see what changed the books and who did it, even after a year of entries (FR-06-8, BR-06-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth signed in as Owner, when he opens "Security log" in the owner rail, then the screen shows the title "Security log", the subtitle "Everything that changed the books and who did it. Entries are never edited or removed." and the first page of entries newest first, loaded from the server.
  2. Given an entry for the edit applied to TAG-8841 at 09:02 UTC, when it is listed, then the row shows "Edit applied", "TAG-8841", the time as 14:32 IST, "Sanjay Seth (owner)" and the summary.
  3. Given more entries than one page, when the owner scrolls to the end of the list or presses the next-page control, then the next page loads by cursor with no repeats and no gaps (EP-03-S9).
  4. Given the list is loading, when the server has not answered, then a loading state shows; given the server fails, then an error message with a retry shows; given the connection drops, then the screen says it is reconnecting.
  5. Given no entries exist, when the screen loads, then it shows "Nothing has been logged under this heading.".
  6. Given a staging database with a year of seeded entries, when the first page is requested, then it loads in under 2 seconds.
- **Rules enforced on the server:** Only role `owner` may call List Audit entries (EP-06-S12). Order is by `at` descending, then id, so the cursor is stable. The page size has a server maximum.
- **Live events emitted / consumed:** None. A new entry does not push to an open Security log; the owner reloads or pages (epic section 11).
- **Audit entry written:** No. Reading changes nothing. Open question: whether reads of the log are themselves audited.
- **Data changes:** None in the product database. Uses the (at, id) index on `audit_entries`. Replaces the in-memory `state.audit` read in `src/components/settings/SecurityLog.tsx` with the server call.
- **UI reference:** Route `security` (`src/components/settings/SecurityLog.tsx`); owner rail item "Security log" on `docs/ux/mockups/08-owner-home.svg`. The Security log list itself is not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Performance: first page under 2 seconds with a year of entries (epic section 13). Time: stored in UTC, shown in Asia/Kolkata. Availability: loading, error and reconnecting states shown. Personal data: rows may show customer names; only the owner sees them.
- **Depends on:** EP-06-S2, EP-06-S12, EP-03-S9, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S10: Owner can filter the log by kind group, entity, actor and date

- **Story ID:** EP-06-S10
- **Title:** Owner can filter the log by kind group, entity, actor and date
- **As a:** Owner
- **I want:** to narrow the Security log by kind group (Everything, Tag edits, Parcels and losses, Problems, Scrap, Stock-out, Rules), by entity such as TAG-8841 or BATCH-2026-044, by actor, and by a date range
- **So that:** I can find every change to one piece or every action by one person quickly (FR-06-8, BR-06-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the owner presses "Tag edits", when the list reloads from the server, then only entries with `edit_applied` or `edit_refused` are shown, and the button shows as pressed.
  2. Given the owner enters TAG-8841 as the entity, when the list reloads, then only entries with that entity id or ref are shown, newest first.
  3. Given the owner picks actor Rajesh Verma and dates 1 to 7 March 2026, when the list reloads, then only Rajesh's entries with `at` from 1 March 00:00 IST to 7 March 23:59 IST are shown, and the range is converted to UTC on the server.
  4. Given a filter and more than one page of results, when the next page is requested, then the same filter applies and the cursor carries on within the filtered set.
  5. Given the new action kinds from EP-06-S7, when the groups are read, then each kind belongs to one group or to Everything only, and the group list is defined once in the shared package.
- **Rules enforced on the server:** Filtering runs in the query on the server, never by loading all entries in the browser as the prototype does. Only the owner may filter (EP-06-S12). A date range with the end before the start returns `validation` on field `to`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Uses the indexes on (entity type, entity id), (actor id, at) and on ref from EP-06-S1 and EP-02-S11.
- **UI reference:** Filter group "Kind of entry" on route `security` (`src/components/settings/SecurityLog.tsx`). Entity, actor and date filters are not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Performance: a filtered first page loads under 2 seconds with a year of entries. Time: date filters entered in Asia/Kolkata and applied in UTC.
- **Depends on:** EP-06-S9, EP-06-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S11: Owner can open one entry and see before and after values

- **Story ID:** EP-06-S11
- **Title:** Owner can open one entry and see before and after values
- **As a:** Owner
- **I want:** to open a row on the Security log and see the full entry: actor, role, time, entity, action, reason, token reference marker, and each changed field with its before and after value
- **So that:** I can check exactly what a change did, for example what a tag weight was before an edit (FR-06-3, BR-06-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the entry for the edit to TAG-8841, when the owner opens it, then it shows gross weight before "48.6500 g" and after "48.6100 g", actor Sanjay Seth, time in IST, the reason given, and "Token used" with no token digits (epic acceptance criterion 1).
  2. Given an entry for a lead marked lost, when it is opened, then it shows state "opened" to "lost" and the reason "Customer went elsewhere.".
  3. Given an entry written by the scheduler, when it is opened, then the actor reads "Scheduler (System)".
  4. Given an entry id that does not exist, when Read Audit entry is called, then the server returns `not_found`.
  5. Given a correction entry that references an earlier entry, when it is opened, then it links to the earlier entry, which is unchanged.
- **Rules enforced on the server:** Only role `owner` may call Read Audit entry (EP-06-S12). Weights are returned as integers and formatted at four decimals by the shared package. Token reference is shown as present or absent, never resolved to a value.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database.
- **UI reference:** Not yet designed. The entry detail on route `security` needs a design pass (MOCKUP-COVERAGE §3). The values match the edit shown on `docs/ux/mockups/05-edit-propose-apply.svg` ("TAG-8841 weight · 48.6500 → 48.6100 g (−40 mg)").
- **Non-functional checks:** Precision: weights shown at four decimals from integer units. Security: no token value is ever sent to the browser. Personal data: customer names in before or after are shown to the owner only.
- **Depends on:** EP-06-S9, EP-06-S3, EP-06-S4, EP-06-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-06-S12: System can refuse audit reads by staff and karigars

- **Story ID:** EP-06-S12
- **Title:** System can refuse audit reads by staff and karigars
- **As a:** System
- **I want:** List Audit entries and Read Audit entry to be in the owner's permission list only, so the permission hook refuses any staff or karigar call
- **So that:** only the owner reads who changed the books, whatever a screen shows (FR-06-9, BR-06-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when he calls List Audit entries directly, then the server returns `forbidden` with "Only the owner can read the security log." and no entry (epic acceptance criterion 3).
  2. Given Lakshmi Devi signed in as Karigar, when she calls Read Audit entry with any id, then the server returns `forbidden`.
  3. Given a Staff user who opens route `security` in the browser, when the screen loads, then "Security log" is not in his rail and the screen shows "Only the owner can read the security log.".
  4. Given a request with no valid session, when it calls List Audit entries, then the server returns `unauthenticated`.
- **Rules enforced on the server:** The check runs in the EP-05 permission hook before any query. The read operations exist only for role `owner`. Hiding the rail item is not the control.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused read changes nothing; repeated refusals are reported through EP-37 and EP-39.
- **Data changes:** None in the product database. Adds the two audit read operations to the `owner` entry of the permission matrix (EP-05-S1).
- **UI reference:** Route `security`, non-owner message in `src/components/settings/SecurityLog.tsx`.
- **Non-functional checks:** Security: every audit read is checked on the server (BR-05-3). Personal data: staff and karigars never receive entries that may hold customer names.
- **Depends on:** EP-05-S1, EP-05-S2, EP-06-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- How long are audit entries kept? (EP-06-S1, S9)
- G22: how does a DPDP deletion request apply to entries that contain a customer's name, given the log is append-only? (EP-06-S1, S3)
- Are reads of the audit log themselves audited? (EP-06-S9, S10, S11)
- Can the owner export the log, and in what format? (EP-06-S9)
- Is tamper evidence (a hash chain) required, or are storage permissions enough? (EP-06-S1)
- Which new action kinds are named for the transitions not audited today? (EP-06-S7, S10)
