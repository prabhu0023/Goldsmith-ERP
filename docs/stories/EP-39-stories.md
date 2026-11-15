# EP-39: Security and data protection · stories

Epic document: [EP-39 Security and data protection](../epics/EP-39-security-and-data-protection.md)

Role note: stories where the server limits, checks, erases or reminds on its own use "System". Stories where a person records consent or a deletion request at the counter use "Staff"; decisions on deletions, the access review and sign-offs use "Owner". "Developer" means the operator who rotates secrets and works with the penetration testers. Seed users named in criteria are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff) and Lakshmi Devi (Karigar); seed customers are Meera Iyer (+91 98840 21107) and Priya Malhotra. Many stories here harden and test mechanisms first built in EP-04, EP-12, EP-17, EP-25 and EP-34; each says which one it builds on. Legal duties under the Digital Personal Data Protection Act, 2023 must be checked with a professional; these stories build the mechanisms only.

---

## EP-39-S1: System can store a consent ledger per customer

- **Story ID:** EP-39-S1
- **Title:** System can store a consent ledger per customer
- **As a:** System
- **I want:** the `consent_events` table from EP-17-S2 to become the full consent ledger, with a `channel` column (WhatsApp in v1) and an `evidence_ref` column (the inbound message id for a reply), and a List Consent history operation that returns a customer's entries newest first
- **So that:** the shop can show, for any customer, each grant and withdrawal of WhatsApp consent with time, source and who recorded it, and the current consent is always the latest entry (FR-39-4, FR-39-5, BR-39-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when `consent_events` is inspected, then it has `channel` accepting only `whatsapp`, `evidence_ref` (nullable), and the existing `customer_id`, `kind` (`opt_in` or `opt_out`), `source` (`counter`, `form`, `whatsapp_reply`, `import`), `recorded_by` and `at` in UTC.
  2. Given existing rows written before the migration, when the migration runs, then each row gets `channel` `whatsapp` and `evidence_ref` null, and no row is deleted.
  3. Given Meera Iyer has an `opt_in` entry from source `form` at 10:02 and an `opt_out` entry from source `whatsapp_reply` at 16:40 with `evidence_ref` set to the inbound message id, when Rajesh Verma calls List Consent history for her, then both entries come back, the 16:40 one first, with source, recorded by, time in Asia/Kolkata and evidence reference.
  4. Given the same customer, when her current consent is read, then it equals the `kind` of the latest entry by `at` then `id`, and `customers.optedIn` matches it.
  5. Given Lakshmi Devi (Karigar), when she calls List Consent history, then the server refuses it and returns no entries.
- **Rules enforced on the server:** The ledger is insert-only; update and delete are refused at the database (EP-17-S2). List Consent history is for Staff and Owner only; karigars are refused (EP-05-S2, EP-17-S12). `recorded_by` comes from the session, or is System for the reply path (EP-03-S3). Time comes from the server clock.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story extends storage and adds a read; each consent change is audited where it is written (EP-17-S14).
- **Data changes:** Migration adds `channel` and `evidence_ref` to `consent_events` and backfills `channel` for existing rows. Adds List Consent history to the shared contract (EP-03-S1).
- **UI reference:** Not yet designed. The consent history panel belongs in the customer drawer on `customers` (epic section 12).
- **Non-functional checks:** Personal data: consent recorded with time and source (BR-39-5). Time: `at` stored in UTC, shown in Asia/Kolkata. Concurrency: two entries in the same second are ordered by `at` then `id`, so the current consent is always one row.
- **Depends on:** EP-17-S2, EP-17-S12, EP-03-S1, EP-03-S3, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S2: System can rate-limit OTP and edit-token requests and entries

- **Story ID:** EP-39-S2
- **Title:** System can rate-limit OTP and edit-token requests and entries
- **As a:** System
- **I want:** one shared rate-limit counter store, keyed by phone, user or address and by operation, that the sign-in OTP limits (EP-04-S8, EP-04-S9) and the edit-token limits (EP-25-S9) all use, with the limit values set in configuration
- **So that:** nobody can flood a phone with codes or guess a 6-digit OTP or edit token, and the limits are checked before any message is sent (FR-39-1, FR-39-2, BR-39-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a phone that has requested OTPs up to the configured limit inside the window, when another OTP is requested for it, then the server refuses with `rate_limited` and no challenge is created and no message is sent (epic acceptance criterion 1).
  2. Given one address that has requested OTPs for many different phones up to the per-address limit, when it requests one more, then the request is refused with `rate_limited`, whichever phone it names.
  3. Given an OTP that has had wrong entries up to the per-code limit, when one more entry is made, even with the right code, then it is refused and the code is invalidated, so the user must ask for a new code.
  4. Given an edit token for proposal ED-102 that has had wrong entries up to the per-token limit on `edit-apply`, when Sanjay Seth enters any code again, then it is refused with "Too many wrong tokens. Ask for a new one." and the piece is unchanged.
  5. Given the API runs on two instances, when requests for the same phone reach both inside one window, then the counts add up in the shared store and the limit holds across both.
  6. Given the window has passed, when a new request arrives, then the counter starts again from 0 and the request is allowed.
- **Rules enforced on the server:** The limit check runs before an OTP or token is created or sent. Counters are kept in a store shared by every API instance, not in process memory. Limits per phone, per address and per code are all applied; a request must pass every one. Refusals for unknown and known phones look the same (EP-04-S9). Counter keys hold a hash of the phone, never the phone in plain text.
- **Live events emitted / consumed:** None
- **Audit entry written:** No for each counted request. A lockout or an invalidated code is audited by EP-04-S14 and EP-25-S14 with a token reference only.
- **Data changes:** Adds a RateLimitCounter store (key, operation, window start, count) with expiry at the end of each window. Adds limit values per operation to environment configuration (EP-01-S6).
- **UI reference:** No screen of its own. Refusal messages show on the sign-in screen (EP-04-S7) and on route `edit-apply` (EP-25-S8).
- **Non-functional checks:** Security: limits apply before any OTP is sent, per phone, per user and per address (epic section 13). Concurrency: counts are atomic increments, so two requests in the same millisecond cannot both slip under the limit. Personal data: counter keys hold hashed phones. Open question: the actual limit values for OTP requests and wrong entries.
- **Depends on:** EP-03-S11, EP-04-S2, EP-04-S8, EP-04-S9, EP-25-S6, EP-25-S9, EP-01-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S3: System can apply a general request limit per user and address

- **Story ID:** EP-39-S3
- **Title:** System can apply a general request limit per user and address
- **As a:** System
- **I want:** to fill the rate-limit hook from EP-03-S11 with a general limit on every operation, counted per signed-in user and per address, using the store from EP-39-S2
- **So that:** one script or stolen session cannot overload the API or scrape the stock and customer lists (FR-39-3, BR-39-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is signed in, when his session sends more requests inside one window than the per-user limit, then the extra requests are refused with `rate_limited` in the standard error format (EP-03-S5) and change nothing.
  2. Given the shop's counter devices share one address, when Rajesh Verma and Deepak Rao each stay under the per-user limit, then neither is refused, because the per-address limit is set above the shop's normal combined use (epic section 16 risk).
  3. Given requests without a session from one address, when they pass the per-address limit, then they are refused with `rate_limited`.
  4. Given a refused request, when the response is read, then it says how many seconds to wait before trying again.
  5. Given a public showcase link opened many times a minute from one address, when the per-address limit is reached, then further opens are refused (EP-34-S14b).
- **Rules enforced on the server:** The limit runs before validation and before any database work (EP-03-S11). Per-user and per-address counts are both checked. The health check (EP-03-S10) is exempt so uptime checks keep working. Limits come from configuration (EP-01-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused request changes no state; refusal counts go to logs and dashboards (EP-37-S9).
- **Data changes:** None in business tables. Uses the RateLimitCounter store from EP-39-S2 with operation `general`. Adds per-user and per-address limit values to configuration.
- **UI reference:** No screen. The front end shows the refusal through its standard error state (EP-08).
- **Non-functional checks:** Security: general limit per user and per address on every operation (FR-39-3). Performance: the limit check adds no more than one round trip to the counter store per request. Availability: limits tuned in staging so a busy counter is never blocked. Open question: the general API limit values.
- **Depends on:** EP-39-S2, EP-03-S5, EP-03-S10, EP-03-S11, EP-34-S14b, EP-37-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S4: Staff can record a customer's consent or opt-out at the counter

- **Story ID:** EP-39-S4
- **Title:** Staff can record a customer's consent or opt-out at the counter
- **As a:** Staff
- **I want:** to record a customer's WhatsApp consent or opt-out at the counter, from the "Send wishes on WhatsApp" control on `customer-new` and from the consent panel on `customers`, each write going into the consent ledger with source `counter` or `form`
- **So that:** what the customer said at the counter is on record with who heard it and when, and their next wish or broadcast follows it (FR-39-4, FR-39-7, BR-39-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma adds Meera Iyer on `customer-new` with "Send wishes on WhatsApp" on and presses "Add this customer", then one ledger entry with kind `opt_in`, source `form`, recorded by Rajesh, channel `whatsapp` is written with the customer.
  2. Given he adds a customer with "Send wishes on WhatsApp" off, when it is saved, then no `opt_in` entry is written and the customer is not opted in.
  3. Given Meera Iyer is opted in, when Rajesh records her opt-out from the consent panel on `customers`, then an `opt_out` entry with source `counter` is written and her consent history shows it at the top.
  4. Given Meera Iyer is opted out, when Rajesh records her consent again, then a new `opt_in` entry with source `counter` is written, and the earlier entries stay.
  5. Given Lakshmi Devi (Karigar), when she calls Create Consent entry, then the server refuses it and nothing is written.
- **Rules enforced on the server:** Staff and Owner may create consent entries; karigars are refused (EP-17-S12). The entry, the `optedIn` copy and the audit entry are written in one transaction (EP-17-S2, EP-06-S2). Recording the state a customer already has writes nothing (EP-17-S7). Whether the box may start ticked is not decided; the server records only the value submitted.
- **Live events emitted / consumed:** None. Consent is read on the server at send time (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (customer id), action (`customer_consent_recorded` or `customer_opted_out`), before and after consent, source. Written through EP-17-S14.
- **Data changes:** Inserts into `consent_events`; updates `customers.optedIn` and `version`. No schema change beyond EP-39-S1.
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg`, route `customer-new` ("Send wishes on WhatsApp"). The consent panel on `customers` is not yet designed.
- **Non-functional checks:** Personal data: consent recorded with time, source and recorder (BR-39-5). Audit: each change appended. Time: stored in UTC, shown in Asia/Kolkata. Open question: whether a ticked-by-default consent box is acceptable or staff must ask each time; the prototype starts it ticked (`useState(true)` in `OnboardCustomer.tsx`).
- **Depends on:** EP-39-S1, EP-17-S3, EP-17-S6, EP-17-S7, EP-17-S12, EP-17-S14, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S5: System can withdraw consent from a WhatsApp opt-out reply

- **Story ID:** EP-39-S5
- **Title:** System can withdraw consent from a WhatsApp opt-out reply
- **As a:** System
- **I want:** an inbound WhatsApp message that matches a configured opt-out word to write an `opt_out` ledger entry for the matching customer with source `whatsapp_reply`, recorded by System, and the inbound message id as `evidence_ref`, at the moment it is received
- **So that:** a customer who replies "STOP" gets no further wish or broadcast, and the shop can prove which message withdrew consent (FR-39-6, BR-39-5, BR-39-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer is opted in, when she replies "STOP" to a broadcast, then an `opt_out` entry with source `whatsapp_reply`, recorded by System and `evidence_ref` set to the inbound message id is written, and the next morning's 9 am wishes run skips her (epic acceptance criterion 2).
  2. Given the reply " stop " or "Stop", when it is received, then it is treated as an opt-out; given "please don't stop the order", then it is not, and it goes to lead intake (EP-12-S10).
  3. Given the provider delivers the same "STOP" message twice, when the second copy arrives, then it is recognised by message id and no second entry is written (EP-12-S7).
  4. Given a "STOP" from a phone that matches no customer, when it is received, then the message is stored and no ledger entry is written.
  5. Given Meera Iyer opted out by reply, when Rajesh Verma opens her consent history, then the entry shows source "WhatsApp reply" and the message reference.
- **Rules enforced on the server:** Only webhook calls verified by EP-12-S6 can trigger this path. Matching uses the configured opt-out word list, "STOP" until decided. The keyword handler calls the consent service (EP-17-S7) and never writes `optedIn` itself. The entry and its audit entry are written in one transaction. Opt-out messages are not passed to lead intake.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor System (WhatsApp intake), time, entity (customer id), action `customer_opted_out`, before opted in, after opted out, source `whatsapp_reply`, inbound message id. Written through EP-17-S14.
- **Data changes:** Inserts into `consent_events` with `evidence_ref`; updates `customers.optedIn`. Adds the opt-out word list to configuration.
- **UI reference:** No screen. The result shows on `docs/ux/mockups/26-wishes.svg`, route `wishes` ("not opted in to WhatsApp · will not auto-send").
- **Non-functional checks:** Personal data: opt-out honoured when received (FR-39-6). Audit: written with a System actor (EP-06-S6). Concurrency: an opt-out received during a broadcast send stops the remaining sends to that customer (EP-39-S6). Open question: which reply words count as an opt-out; v1 is English only.
- **Depends on:** EP-39-S1, EP-12-S6, EP-12-S7, EP-12-S10, EP-17-S7, EP-17-S14, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S6: System can check consent at send time for wishes and broadcasts

- **Story ID:** EP-39-S6
- **Title:** System can check consent at send time for wishes and broadcasts
- **As a:** System
- **I want:** every outbound customer message (a wish, a broadcast message or a one-person showcase) to read the customer's current consent from the ledger just before it is handed to the WhatsApp provider, and to skip the send if consent is withdrawn
- **So that:** a customer who opted out after a broadcast was drafted, or partway through its send, gets nothing more (FR-39-5, FR-39-6, BR-39-7, BR-39-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a broadcast to VIP Bridal drafted when 86 customers were opted in, when Meera Iyer opts out before Send is pressed, then the send goes to 85 and she is counted as skipped.
  2. Given that broadcast is sending one message at a time, when Meera Iyer's "STOP" commits after the first 40 messages and before hers, then no message is sent to her and the recipient row is marked skipped with reason "opted out".
  3. Given Priya Malhotra opts out at 08:59 and has a birthday today, when the 9 am wishes run reaches her, then no wish is sent and `wishes` shows her as "not opted in to WhatsApp · will not auto-send".
  4. Given a customer who is not opted in, when a send to them is tried directly through the API, then it is refused by EP-12-S5 and nothing reaches the provider.
  5. Given a broadcast was sent, when its counts are read, then sent plus skipped equals the audience size.
- **Rules enforced on the server:** The consent check reads the committed latest ledger entry inside the send step, not at draft or queue time. A send handed to the provider before an opt-out committed is not recalled. The check sits in the WhatsApp send path (EP-12-S5), so no caller can bypass it.
- **Live events emitted / consumed:** None
- **Audit entry written:** No for each skipped message; the skip and its reason are kept on the recipient row. Broadcasts and wishes are audited by EP-34 and EP-33.
- **Data changes:** None in schema. Recipient rows for wishes and broadcasts get status `skipped` with reason `opted_out`.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes`; `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("86 customers · all opted in to WhatsApp").
- **Non-functional checks:** Personal data: consent checked at send time, not draft time (epic section 13). Concurrency: an opt-out that commits during a broadcast stops all remaining sends to that customer (epic section 13). Performance: the check is one indexed read per recipient.
- **Depends on:** EP-39-S1, EP-39-S5, EP-12-S5, EP-33-S5, EP-33-S9, EP-34-S2, EP-34-S7, EP-34-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S7: Staff can record a customer's deletion request

- **Story ID:** EP-39-S7
- **Title:** Staff can record a customer's deletion request
- **As a:** Staff
- **I want:** to record a deletion request a customer makes in person, with how it was received and when, so it waits for the owner's decision
- **So that:** no request to delete personal data is lost, and the owner sees each one with who took it (FR-39-7, BR-39-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Meera Iyer asks at the counter to have her details deleted, when Rajesh Verma records it from her customer record on `customers`, then a DeletionRequest with status `open`, received via `counter`, received at the server time and recorded by Rajesh is created and its id is returned.
  2. Given an open request for Meera Iyer, when Rajesh tries to record a second one, then the server refuses with "A deletion request is already open for this customer." and nothing is created.
  3. Given the request is recorded, when Sanjay Seth opens his notifications, then he sees a notice that a deletion request from Meera Iyer is waiting for his decision.
  4. Given Lakshmi Devi (Karigar), when she calls Create Deletion request, then the server refuses it.
  5. Given an erased customer, when a deletion request is recorded for them, then the server refuses with `not_found`.
- **Rules enforced on the server:** Staff and Owner may create a deletion request; karigars are refused (EP-05-S2). One open request per customer. Recording a request changes no customer data. Who may make a request on the customer's behalf is not decided; the server records received via and recorded by only.
- **Live events emitted / consumed:** None in the catalogue. The owner notice goes through the notifications engine (EP-11).
- **Audit entry written:** Yes: actor, time, entity (deletion request id and customer id), action `deletion_request_recorded`, received via. No personal values are copied into the entry.
- **Data changes:** Migration creates `deletion_requests` (id, customer id, received via, received at, recorded by, status `open` / `approved` / `refused` / `done`, decided by, decided at, reason, completed at, scope of erasure). Adds Create Deletion request to the shared contract.
- **UI reference:** Not yet designed. The deletion request panel belongs on `customers` (epic section 12).
- **Non-functional checks:** Personal data: deletion requests are recorded (BR-39-5). Audit: entry holds ids, not names. Time: stored in UTC, shown in Asia/Kolkata. Open question: who may make a request on the customer's behalf, and how long a request may take.
- **Depends on:** EP-17-S1, EP-17-S12, EP-05-S2, EP-06-S2, EP-11-S3, EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S8: Owner can approve or refuse a deletion request

- **Story ID:** EP-39-S8
- **Title:** Owner can approve or refuse a deletion request
- **As a:** Owner
- **I want:** to see open deletion requests and approve or refuse each one with a reason
- **So that:** every deletion is a recorded owner decision, and an approved one is carried out across all records (FR-39-8, BR-39-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given an open request for Meera Iyer, when Sanjay Seth approves it with the reason "Customer asked at the counter", then its status is `approved`, decided by Sanjay, decided at the server time, and the deletion run from EP-39-S9 is started.
  2. Given an open request, when Sanjay refuses it with a reason, then its status is `refused` with the reason, and the customer's data is unchanged.
  3. Given Sanjay presses approve or refuse with no reason, when it is sent, then the server refuses with "Give a reason." and the request stays `open`.
  4. Given Rajesh Verma (Staff), when he calls Update Deletion request, then the server refuses it.
  5. Given a request already `approved` or `refused`, when a second decision is sent, then the server refuses it as a conflict (EP-03-S5).
- **Rules enforced on the server:** Owner only (BR-39-1). Allowed transitions: `open` to `approved`, `open` to `refused`. A reason is required for both. The decision, the request version check and the audit entry are written in one transaction (EP-03-S6, EP-02-S14).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (deletion request id, customer id), action `deletion_request_approved` or `deletion_request_refused`, before status `open`, after status, reason.
- **Data changes:** Updates `deletion_requests` (status, decided by, decided at, reason, version). Adds List and Update Deletion request to the shared contract.
- **UI reference:** Not yet designed. The deletion request panel on `customers`; open requests may also appear among owner decisions (EP-32).
- **Non-functional checks:** Audit: both decisions appended with reason. Concurrency: two decisions on one request at once; only one commits, the other is refused on version. Personal data: the decision entry copies no personal value. Open question: how long a deletion request may take.
- **Depends on:** EP-39-S7, EP-05-S2, EP-03-S5, EP-03-S6, EP-02-S14, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S9: System can erase a customer's personal data across records and files

- **Story ID:** EP-39-S9
- **Title:** System can erase a customer's personal data across records and files
- **As a:** System
- **I want:** an approved deletion request to run a deletion that calls the customer erase from EP-17-S13, clears the customer's name and phone from leads linked to them, deletes their PO attachments and other stored files, records the scope erased and marks the request `done`
- **So that:** the customer's personal data is gone everywhere the product keeps it, while piece history by tag and grams stays whole (FR-39-9, FR-39-10, BR-39-5, BR-39-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an approved deletion request for Meera Iyer, when the deletion runs, then name, phone, address, birthday and anniversary are gone from her customer record, from every lead linked to her and from file storage, and her piece history by tag and grams remains (epic acceptance criterion 3).
  2. Given her history rows TAG-7521 (78.4000 g) and TAG-6690 (57.4900 g), when the run finishes, then both rows remain with tag, piece name, pure gold grams as integers in units of 0.0001 g, and date.
  3. Given a PO attachment and a WhatsApp image linked to her leads, when the run finishes, then the files and their thumbnail and display copies are deleted from storage and their signed links stop working.
  4. Given the run finishes, when the request is read, then status is `done`, completed at is set and scope of erasure lists the record kinds and counts erased (for example customer 1, leads 2, files 3).
  5. Given the run fails partway, when it is retried, then it finishes from where it stopped and does not fail on parts already erased.
  6. Given the run, when the audit log is read, then the new entries name the request and the erased field kinds, and contain neither "Meera Iyer" nor "9884021107"; earlier entries are not updated or deleted.
- **Rules enforced on the server:** Runs only for a request with status `approved` (EP-39-S8). Each step is idempotent per request id (EP-10-S4). The audit log stays append-only; how earlier entries that name the customer are treated follows the G22 decision (FR-39-10). The erased customer row is kept so history foreign keys stay valid (EP-17-S13).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor System, time, entity (deletion request id), action `deletion_run_done`, scope of erasure, no personal values. The customer erase writes its own `customer_erased` entry (EP-17-S14).
- **Data changes:** Updates `customers` through EP-17-S13; clears customer name and phone on linked leads; deletes linked file records and objects (EP-09); updates `deletion_requests` (status `done`, completed at, scope of erasure).
- **UI reference:** No screen. The result shows on the deletion request panel on `customers` (not yet designed).
- **Non-functional checks:** Personal data: deletion covers EP-09 file storage (epic section 13). Precision: piece history weights stay integer units of 0.0001 g, shown as 78.4000 g. Audit: no deleted value copied into new entries. Availability: the written procedure says how deletions are reapplied after a restore (EP-38). Open decision G22: how deletion applies to audit entries that name a customer. Open decision D10: whether personal data must stay in India.
- **Depends on:** EP-39-S8, EP-17-S9, EP-17-S13, EP-17-S14, EP-09-S1, EP-09-S11, EP-09-S12, EP-28-S1, EP-29-S4, EP-29-S7, EP-10-S4, EP-38-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S10: System can write token references instead of token values in audit

- **Story ID:** EP-39-S10
- **Title:** System can write token references instead of token values in audit
- **As a:** System
- **I want:** a check at audit write time that refuses any audit entry whose fields contain an OTP or edit-token value, plus a test that walks every token flow and scans audit entries, logs and stored messages for the six digits
- **So that:** no audit entry, log line or stored message ever holds a usable token, unlike the prototype's `applyEdit`, which wrote `Token ${edit.token}` into the audit detail (FR-39-16, BR-39-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given an edit applied with a token, when the audit log is read, then it shows a token reference and not the six digits (epic acceptance criterion 5).
  2. Given a service that tries to write an audit entry containing the token value it holds, when the write is made, then it is refused and the transaction rolls back.
  3. Given a sign-in with OTP, a token request on ED-102 and an edit applied on `edit-apply`, when audit entries, application logs and stored WhatsApp messages from those flows are searched for the issued codes, then none is found.
  4. Given the token reference in an audit entry, when Sanjay Seth opens it on `security`, then it shows the reference, which cannot be turned back into the code.
- **Rules enforced on the server:** Audit entries carry a token reference field only (EP-06-S4). Tokens are stored hashed (EP-25-S6, EP-04-S2). Log lines are redacted (EP-37-S2) and stored messages hold no codes (EP-12-S11).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, as the subject of the story: entries for edit apply and sign-in hold actor, time, entity, action and token reference, never the token value.
- **Data changes:** None in schema. Adds the audit write check and an automated scan test.
- **UI reference:** `security` route (owner audit log, EP-06-S11) shows token references.
- **Non-functional checks:** Security: OTP and edit tokens never logged in plain text (BR-39-2). Audit: entries stay append-only; the check refuses before insert.
- **Depends on:** EP-06-S4, EP-06-S11, EP-04-S2, EP-04-S14, EP-25-S6, EP-25-S14, EP-12-S11, EP-37-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S11: System can enforce owner-only settings on the server (G12)

- **Story ID:** EP-39-S11
- **Title:** System can enforce owner-only settings on the server (G12)
- **As a:** System
- **I want:** an automated test that calls the settings change operation as Staff and as Karigar for every setting EP-13 names owner-only, including `pricingEnabled` and `autoSendWishes`, and expects a refusal each time, with the guard fixed where it fails
- **So that:** hiding a switch in the UI is never the only control, and the prototype gaps where staff could flip auto-send wishes and anyone could flip pricing are closed (FR-39-14, BR-39-1, BR-39-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff), when he tries to change an owner-only setting through the API, then the server refuses it and the setting is unchanged (epic acceptance criterion 4).
  2. Given Rajesh calls the change operation for `autoSendWishes` directly, not from the `wishes` screen, when it reaches the server, then it is refused with `forbidden`.
  3. Given Lakshmi Devi (Karigar), when she calls the change operation for `pricingEnabled`, then it is refused, and no audit entry for a change is written.
  4. Given Sanjay Seth changes `pricingEnabled`, when it commits, then the change is audited with before and after value (EP-13-S9, EP-06-S8).
  5. Given a new setting is added to the owner-only list in EP-13, when the test runs, then it covers that setting without a code change to the test.
- **Rules enforced on the server:** Settings changes go through EP-13-S2's role check, read from the single owner-only list. Adding staff and changing a role stay owner-only (EP-05-S4, EP-05-S6; BR-39-10).
- **Live events emitted / consumed:** None emitted by this story. A permitted change emits the proposed "Setting changed" event from EP-13 (README gap G26).
- **Audit entry written:** No for a refused change. A permitted change is audited by EP-13-S3: actor, time, setting name, before, after.
- **Data changes:** None in schema. Adds the enforcement test and fixes any missing guard.
- **UI reference:** No screen. Affected screens: `wishes` (auto-send switch), the settings page (EP-13-S13), `docs/ux/mockups/25-onboard-staff.svg`, route `staff-new` ("Only the owner can add staff or change a role.").
- **Non-functional checks:** Security: every permission checked on the server (BR-39-1). Audit: the pricing switch is audited. Open decision G12: which settings are owner-only, and whether the pricing switch is audited.
- **Depends on:** EP-13-S2, EP-13-S3, EP-13-S7, EP-13-S9, EP-06-S8, EP-05-S2, EP-05-S4, EP-05-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S12: Owner can run an access review and deactivate users from it

- **Story ID:** EP-39-S12
- **Title:** Owner can run an access review and deactivate users from it
- **As a:** Owner
- **I want:** an access review list of every active user with name, role, last sign-in and created date, a way to deactivate any of them from the list, a "Mark review done" action that records the review, and a reminder when the next review is due
- **So that:** people who left the shop, and karigars no longer working for it, lose access, and the owner role is held only by the right people (FR-39-11, FR-39-12, BR-39-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given active users Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff) and Lakshmi Devi (Karigar), when Sanjay opens the access review, then all four are listed with role, last sign-in in Asia/Kolkata and created date, and users who never signed in show "Never".
  2. Given Deepak Rao has left, when Sanjay deactivates him from the review, then the deactivation goes through EP-05-S7 and Deepak's open sessions end at once.
  3. Given Sanjay presses "Mark review done", when it commits, then an AccessReview record is written with done at, done by, users reviewed 4 and users deactivated 1, and the next due date is set by the review interval.
  4. Given the due date passes with no review done, when the scheduler runs, then Sanjay gets a notice that the access review is due.
  5. Given Rajesh Verma (Staff), when he calls Read Access review, then the server refuses it.
  6. Given Sanjay is the last active owner, when he tries to deactivate himself from the review, then it is refused (EP-05-S9).
- **Rules enforced on the server:** Read Access review and Create Access review record are owner only. Deactivation uses EP-05-S7 and its last-owner rule (EP-05-S9). Last sign-in is read from the sign-in audit (EP-04-S14). The reminder runs on the server clock (EP-10-S1).
- **Live events emitted / consumed:** None of its own. Deactivation goes through EP-05, which emits "User deactivated or role changed" so that user's open sessions end at once (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (access review id), action `access_review_done`, users reviewed, users deactivated. Each deactivation writes its own entry through EP-05-S14.
- **Data changes:** Migration creates `access_reviews` (id, due at, done at, done by, users reviewed, users deactivated). Adds a scheduled reminder job. Adds Read Access review and Create Access review record to the shared contract.
- **UI reference:** Not yet designed. The access review list sits near `staff-directory` (epic section 12).
- **Non-functional checks:** Security: deactivation ends sessions at once (BR-39-3). Audit: each review recorded. Time: due dates on the Asia/Kolkata calendar (EP-10-S10). Open question: how often the access review is run.
- **Depends on:** EP-05-S7, EP-05-S9, EP-05-S10, EP-05-S11, EP-05-S14, EP-04-S13, EP-04-S14, EP-10-S1, EP-10-S10, EP-11-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S13: Operator can rotate secrets by a written procedure

- **Story ID:** EP-39-S13
- **Title:** Operator can rotate secrets by a written procedure
- **As a:** Developer
- **I want:** a written rotation procedure for each secret (WhatsApp provider token, email provider key, LLM key, file storage keys, database credentials and the session signing key) that swaps the secret without downtime, plus a SecretRotation record of each rotation
- **So that:** a leaked key can be replaced the same day without taking the shop offline, and there is a record of when each secret was last changed (FR-39-13, BR-39-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the procedure document, when it is read, then it lists for each secret where it is stored, how the new value is set in environment configuration, how the old value is retired and who may do it.
  2. Given the WhatsApp provider token is rotated in staging following the procedure, when a wish is sent during and after the change, then both sends succeed and no request fails because of the change.
  3. Given the database credentials are rotated in staging, when Rajesh Verma saves a tag during the change, then the save succeeds.
  4. Given a rotation is done, when the operator calls Create Secret rotation record, then a record with secret name, rotated at and rotated by is stored, and no field holds the secret value.
  5. Given the repository, when it is scanned by EP-01-S10 after a rotation, then no old or new secret value is found in code.
- **Rules enforced on the server:** Secrets live only in environment configuration (EP-01-S6, BR-39-4). Create Secret rotation record is for operators only. The record never stores the value. The session signing key rotation accepts the old key until existing sessions expire, so nobody is signed out mid-sale.
- **Live events emitted / consumed:** None
- **Audit entry written:** No in the product audit log. The SecretRotation record holds secret name, rotated at and rotated by.
- **Data changes:** Adds a SecretRotation record (secret name, rotated at, rotated by) kept in an operations table outside the business schema. Adds the rotation procedure document.
- **UI reference:** No screen
- **Non-functional checks:** Security: secrets never in the repo (BR-39-4). Availability: rotation causes no downtime. Open decision D1: on a managed platform some keys are rotated in the platform console; the procedure names those steps.
- **Depends on:** EP-01-S6, EP-01-S10, EP-12-S1, EP-04-S5, EP-37-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S14: Owner can sign off the public catalogue link review (G9)

- **Story ID:** EP-39-S14
- **Title:** Owner can sign off the public catalogue link review (G9)
- **As a:** Owner
- **I want:** a security review of the public showcase link from EP-34 against a fixed checklist, run as automated tests in staging, and to sign off the result or have the link switched off
- **So that:** the one surface a customer opens without signing in shows only the chosen in-stock pieces, with photos and weights, and never a price, a customer's data or a guessable piece list (FR-39-15, BR-39-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a showcase link, when its token is checked, then it holds at least 128 random bits, is unrelated to piece ids such as TAG-8841, and only its hash is stored.
  2. Given the link is opened, when the page and its responses are read, then they show piece name, karat, photo and pure gold weight to 4 decimals (for example 41.5900 g), and contain no price, no customer name or phone and no internal id beyond the tag.
  3. Given a piece in the showcase is sold, when the link is opened again, then that piece is no longer shown.
  4. Given the link has passed its expiry or was revoked, when it is opened, then it shows no pieces.
  5. Given the review results, when Sanjay Seth signs off, then a sign-off record with reviewed by, reviewed at and the checklist results is stored; if he does not, the "Copy a link" option stays switched off for launch.
- **Rules enforced on the server:** The public showcase read accepts only a valid, unexpired, unrevoked token (EP-34-S14b) and is rate-limited per address (EP-39-S3). Only `in_stock` pieces are returned. No price field is returned, whatever the pricing switch says. Sign-off is owner only.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (catalogue link review), action `catalogue_link_review_signed_off` or `catalogue_link_disabled`, checklist results.
- **Data changes:** Adds a sign-off record for the review. No change to showcase tables.
- **UI reference:** `docs/ux/mockups/28-catalogue-share.svg`, route `catalogue` ("Copy a link", "Photos and weights go — never a price.").
- **Non-functional checks:** Security: the token cannot be guessed from piece ids (epic section 13). Personal data: no customer data on the public page. Precision: weights shown to 4 decimals from integer units of 0.0001 g. Open decision G9: whether a public link exists, how long it lasts and what it may show.
- **Depends on:** EP-34-S12, EP-34-S14a, EP-34-S14b, EP-39-S3, EP-06-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-39-S15: Owner can accept or close each penetration test finding

- **Story ID:** EP-39-S15
- **Title:** Owner can accept or close each penetration test finding
- **As a:** Owner
- **I want:** to approve the scope of an external penetration test on staging, have each finding recorded with severity and summary, and mark each one fixed or accept it in writing
- **So that:** the product launches only after an outside tester has tried to break it and every finding has an owner decision (FR-39-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given the test scope (web app, karigar portal, API, public showcase link, WhatsApp webhook), when Sanjay Seth approves it, then the approval is recorded with date and scope before testing starts.
  2. Given the report is received, when the operator enters its findings, then each PenTestFinding has id, severity, summary and status `open`.
  3. Given a finding fixed on staging, when the fix is retested, then the finding is marked `fixed` with the fix reference, and Sanjay confirms it.
  4. Given a finding the shop will not fix before launch, when Sanjay accepts it, then status is `accepted` with his name, the date and a written reason.
  5. Given any finding still `open`, when the go-live checklist is checked, then launch is blocked; done when the report is received and each finding is fixed or accepted in writing (epic acceptance criterion 6).
- **Rules enforced on the server:** Accepting a finding is owner only. A finding needs a written reason to be accepted. The test runs against staging only, never production data.
- **Live events emitted / consumed:** None
- **Audit entry written:** No in the product audit log. The PenTestFinding record keeps status, decided by and decided at, and the written acceptance is kept with the report.
- **Data changes:** Adds PenTestFinding records (id, severity, summary, status `open` / `fixed` / `accepted`, decided by) kept in the operations document store or an operations table, outside the business schema.
- **UI reference:** No screen
- **Non-functional checks:** Security: an external test before launch with each finding fixed or accepted. Personal data: testers use seeded data from EP-02-S13, not real customer data. Open question: who carries out the penetration test, and when.
- **Depends on:** EP-39-S2, EP-39-S3, EP-39-S10, EP-39-S11, EP-39-S14, EP-01-S12, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D10: must all personal data, backups and logs stay in India? (EP-39-S9)
- G22: how does a deletion request apply to audit entries that name a customer? (EP-39-S9)
- G9: should a public catalogue link exist, how long does it last, and what may it show? (EP-39-S14)
- G12: which settings are owner-only, and is the pricing switch audited? (EP-39-S11)
- What rate limits apply to OTP requests, wrong entries and the general API? (EP-39-S2, S3)
- How often is the access review run? (EP-39-S12)
- Who carries out the penetration test, and when? (EP-39-S15)
- Is a ticked-by-default consent box acceptable, or must staff ask each time? (EP-39-S4)
- How long may a deletion request take, and who may make one on the customer's behalf? (EP-39-S7, S8)
- Do karigar phone numbers and staff phone numbers fall under the same deletion rules? (EP-39-S7, S9)
- Which reply words count as an opt-out ("STOP" or others, in which languages)? (EP-39-S5)
