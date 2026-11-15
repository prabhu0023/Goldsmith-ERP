# EP-03: API foundation · stories

Epic document: [EP-03 API foundation](../epics/EP-03-api-foundation.md)

Role note: this is a layer A infrastructure epic with no end user. Stories use "Developer" for the person building and deploying the product, and "System" for the API server acting on its own.

---

## EP-03-S1: Developer can define an operation once in the shared contract and use it in web and api

- **Story ID:** EP-03-S1
- **Title:** Developer can define an operation once in the shared contract and use it in web and api
- **As a:** Developer
- **I want:** a contract module in the `shared` package, built from `src/types/jewellery.ts`, where each operation is declared once with its name, input shape, result shape and error codes, and imported by both `web` and `api`
- **So that:** the front end and the server cannot drift apart, and a breaking contract change fails the typecheck instead of failing in the shop (BR-03-3, FR-03-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given the contract module, when a developer declares the operation `markLeadLost` with input `{ leadId: string; reason?: string }` and result `{ ok: true }`, then `api` imports it to type its handler and `web` imports it to type its call, with no second copy of the type in either package.
  2. Given a change that renames the input field `leadId` to `id` in the contract, when CI runs the typecheck from EP-01-S7, then the run fails in every package that still uses `leadId` (FR-03-11).
  3. Given any operation input in the contract, when it is inspected, then it has no `by`, `actor`, `at` or `time` field, because the server sets those (epic section 16 risk mitigation).
  4. Given a weight field in the contract such as `grossG` or `approxWeightG`, when it is inspected, then its type is an integer of 0.0001 g units or a decimal string read by the EP-02-S2 helper, never a plain floating-point grams number.
  5. Given the money fields `valueINR`, `budgetINR`, `spentINR` and `amountINR`, when they appear in the contract, then they are typed as nullable and no operation in this epic reads or writes them.
  6. Given the contract module, when it is built, then it exports a contract version string that the Read Contract version endpoint returns (epic section 10).
- **Rules enforced on the server:** The `api` package registers handlers only for operations declared in the contract; registering an undeclared operation fails at startup. Actor and time fields cannot appear in an operation input type.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A type module changes no product state.
- **Data changes:** None in the product database. Adds the contract module to `shared` and the Read Contract version endpoint to `api`.
- **UI reference:** No screen
- **Non-functional checks:** Precision: weight fields in the contract are integers of 0.0001 g or exact decimal strings. Security: the contract has no actor or time input fields. Open decision: the contract format (shared TypeScript types only, or a schema that also validates at runtime) is open in section 17; this story declares operations so that either choice can produce both the type and the validator used in EP-03-S2. Open decision: API versioning and how an old browser tab learns the contract changed is open; this story only exposes the version string. D1 is decided (Option C): each operation is an endpoint on the Node API, declared once in this module.
- **Depends on:** EP-01-S3, EP-01-S4, EP-01-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S2: System can validate every request against the contract at the trust boundary

- **Story ID:** EP-03-S2
- **Title:** System can validate every request against the contract at the trust boundary
- **As a:** System
- **I want:** every incoming request checked against its operation's input shape in the contract before any service function runs
- **So that:** a wrong, missing or malformed field is refused with a message naming the field, and nothing changes in the database (FR-03-1, BR-03-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a `createLead` request with no `customerName` field, when the server handles it, then it returns error code `validation`, field `customerName`, and a sentence naming the field, and no lead row is written (epic acceptance criterion 3).
  2. Given a request with `grossG` sent as the string `12.34567` (five decimals) or as `12,3a`, when the server handles it, then it returns `validation` with field `grossG`, and the value is never rounded.
  3. Given a request with an extra field not in the contract, such as `by` or `status`, when the server handles it, then the extra field is dropped or refused and never reaches the service function.
  4. Given a request body larger than the configured maximum size, when the server receives it, then it is refused before parsing and the service function is not called.
  5. Given an operation name that is not in the contract, when a request for it arrives, then the server returns `not_found` and runs no code for it.
- **Rules enforced on the server:** Validation runs on the server for every operation, whatever the browser already checked. Weight strings are converted only by the EP-02-S2 helper. Unknown fields never pass into service functions.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused request changes no state.
- **Data changes:** None in the product database. Adds the validation step to the `api` request pipeline.
- **UI reference:** No screen. Screens that show a field error today, for example `stock-new` and `lead-new`, later show the field name this step returns.
- **Non-functional checks:** Security: input is validated at the trust boundary; error responses contain no stack trace or internal path. Precision: weights with more than four decimals are refused, not rounded. Open decision: whether validation uses compile-time types plus hand checks or a runtime schema follows the contract format question in section 17.
- **Depends on:** EP-03-S1, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S3: System can set the actor from the session and the time from the server clock

- **Story ID:** EP-03-S3
- **Title:** System can set the actor from the session and the time from the server clock
- **As a:** System
- **I want:** the request pipeline to build the `Ctx {by, at}` passed to every service function, with `by` taken from the authenticated session and `at` taken from the server clock in UTC
- **So that:** no browser can claim to be someone else or back-date an action, as the prototype allows through the RoleChip and `demoNow()` (FR-03-2, FR-03-3, BR-03-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a request from a session for user Rajesh Verma (Staff) whose body says the actor is Sanjay Seth (Owner), when the server handles it, then the service function receives Rajesh Verma as `by`, and any record written shows Rajesh Verma as actor (epic acceptance criterion 1).
  2. Given a request whose body carries `at` set to a date in 2025, when the server handles it, then the service function receives the server's current UTC time, and any record written shows that time (epic acceptance criterion 2).
  3. Given a request with no session, or with a session whose `ended` is set or whose `expires` has passed in the `sessions` table, when an operation other than Read Health is called, then the server returns error code `unauthenticated` and runs no service function.
  4. Given a time in a response, when it is inspected, then it is an ISO 8601 UTC value, and conversion to Asia/Kolkata happens only on screen.
  5. Given the `rememberScale` per-device preference, when the operation list is built, then it is not a server operation, because it takes no `Ctx` and changes no shared state.
- **Rules enforced on the server:** The actor comes only from the session; the time comes only from the server clock. A request without a valid session is refused with `unauthenticated`. A permission check hook runs after the actor is set and before the service function; it allows every call until EP-05 fills it in.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This step only supplies the actor and time that EP-06 audit entries record.
- **Data changes:** None in the product database. Reads `sessions` and `users` (EP-02-S3). Adds a session resolver interface and a clock module to `api`; tests use a fixed test clock and a test session.
- **UI reference:** No screen
- **Non-functional checks:** Security: actor and time never come from the client (epic section 13). Time: all times are UTC from the server clock. D4 is decided (phone and password); how a session is presented (cookie or token) is decided in EP-04, and this story reads the session through an interface so the acceptance criteria hold for either. D1 is decided (Option C): the session resolver reads the Node API's own sessions (EP-04), never a platform auth context.
- **Depends on:** EP-03-S1, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S4: System can return a rule refusal with a code and the DomainError sentence

- **Story ID:** EP-03-S4
- **Title:** System can return a rule refusal with a code and the DomainError sentence
- **As a:** System
- **I want:** a `DomainError` thrown by a service function to become an error response with code `rule_refused` and the same sentence the prototype shows
- **So that:** the person at the counter sees a plain reason such as "Only the owner can accept a loss." instead of a technical error (FR-03-4, BR-03-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given a service function that throws `DomainError("A converted lead cannot be marked lost.")`, when the server handles the request, then the response has code `rule_refused`, message "A converted lead cannot be marked lost." and no field.
  2. Given the same refusal, when the response is inspected, then it has no stack trace, file path or database text, and the HTTP status is the same for every `rule_refused` error.
  3. Given a second request to stock out a piece that the first request already sold, when the server handles it, then it returns `rule_refused` with a sentence saying the piece is already taken (BR-03-6).
  4. Given a refusal, when the database is checked, then no change from that request remains (relies on EP-03-S6).
  5. Given an unexpected error that is not a `DomainError`, when the server handles it, then the response has code `internal` and a generic sentence, and the details go only to the server log.
- **Rules enforced on the server:** Only `DomainError` sentences are shown to people; any other exception is hidden behind a generic message. The error shape is `{code, message, field?}` as in epic section 9.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused action changes no state. Whether refusals are logged for security review belongs to EP-37 and EP-39.
- **Data changes:** None in the product database. Moves `DomainError` into `shared` and adds the error mapper to `api`.
- **UI reference:** No screen. The sentence is shown later on screens such as `parcel-match` (`docs/ux/mockups/04-parcel-match.svg`), `edit-apply` and `stock-out`.
- **Non-functional checks:** Security: no stack traces in error responses (epic section 13). Concurrency: the losing request of two competing sells gets a clear "already taken" sentence, never a silent success.
- **Depends on:** EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S5: System can return not-found, validation and conflict errors in the same format

- **Story ID:** EP-03-S5
- **Title:** System can return not-found, validation and conflict errors in the same format
- **As a:** System
- **I want:** missing records, invalid fields, stale versions, missing sessions and forbidden calls all returned in the same `{code, message, field?}` shape as rule refusals
- **So that:** the shared API client in EP-08 handles every error one way and every screen can show the sentence as it is (FR-03-5, FR-03-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given a request for parcel BATCH-2026-099, which does not exist, when the server handles it, then it returns code `not_found` and message "Parcel BATCH-2026-099 was not found." (the prototype `need()` sentence).
  2. Given an update to piece TAG-8841 carrying version 3 while the stored version is 4, when the server handles it, then it returns code `conflict` and the message "Someone else changed this piece. Reload and try again." (FR-03-12).
  3. Given a request with an invalid field, when the server handles it, then it returns code `validation` with `field` set to the field name, as in EP-03-S2.
  4. Given the error codes `rule_refused`, `not_found`, `validation`, `conflict`, `unauthenticated` and `forbidden`, when a test triggers each one, then each response has a code, a non-empty sentence and, only for `validation`, a field.
  5. Given the shared contract, when it is inspected, then the error codes are one exported union type that `web` and `api` both use.
- **Rules enforced on the server:** Every error leaves the server in one shape. The stale-version error raised by the EP-02-S14 helper maps to `conflict`. `forbidden` is returned by the permission hook once EP-05 fills it in.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. An error response changes no state.
- **Data changes:** None in the product database. Adds the error codes to the contract and mappers for not-found and conflict to `api`.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: a version conflict returns a clear sentence, never a silent overwrite (epic section 13). Security: a `not_found` response for a record the caller may not see does not reveal whether it exists; the exact rule is set with EP-05.
- **Depends on:** EP-03-S2, EP-03-S4, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S6: System can run each operation in one transaction

- **Story ID:** EP-03-S6
- **Title:** System can run each operation in one transaction
- **As a:** System
- **I want:** the request pipeline to open one database transaction per operation, run the service function inside it, and commit only if the function returns without error
- **So that:** a failed rule leaves no partial change, and later epics have one commit point to hang audit writes and live events on (FR-03-7, BR-03-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a service function that writes a piece row and then throws `DomainError`, when the operation runs, then neither the piece change nor any other write from that call is in the database afterwards.
  2. Given a service function that updates a parcel and adds a pool entry, when it succeeds, then both writes are committed together and a reader never sees one without the other.
  3. Given a successful operation, when the transaction commits, then an after-commit hook runs once; given a failed operation, the after-commit hook does not run (the point EP-07 uses to publish events).
  4. Given two operations that update the same piece at the same time, when both commit, then one succeeds and the other gets `conflict` from the version check, not a silent overwrite.
  5. Given the database connection drops mid-operation, when the server handles it, then the transaction is rolled back and the caller gets an error, not a success.
- **Rules enforced on the server:** Service functions get a transaction handle and cannot open their own connection. Only committed changes trigger after-commit hooks. Version checks from EP-02-S14 run inside the same transaction.
- **Live events emitted / consumed:** None. This story provides the after-commit hook where EP-07 later emits events.
- **Audit entry written:** No. This story writes no audit itself; EP-06 writes audit entries inside the same transaction so an action and its audit entry commit together.
- **Data changes:** None in the product database. Adds the transaction wrapper and the after-commit hook to `api`.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: one transaction per operation; version conflicts return a clear sentence (epic section 13). Availability: a rolled-back transaction leaves the database consistent. D1 is decided (Option C): the Node API opens and commits the transaction on the managed PostgreSQL database (D2, decided), reached over the cloud provider's private network.
- **Depends on:** EP-03-S4, EP-02-S1, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S7: System can return the created id from a create operation

- **Story ID:** EP-03-S7
- **Title:** System can return the created id from a create operation
- **As a:** System
- **I want:** every create operation to return a success result holding the id of the record it created, with the id generated by the database
- **So that:** the screen can open the new lead, job or parcel straight away, as the prototype `Made` tuple and `ActionResult.id` allow today (FR-03-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given a valid `createLead` request, when the server handles it, then the response is `{ok: true, id}` where `id` is the id of the new lead row, for example `LD-2026-214`.
  2. Given a valid `recordParcelArrival` request, when it succeeds, then the response holds the new parcel id and a read of that id returns the parcel.
  3. Given two create requests that commit at the same moment, when both succeed, then their ids are different, because ids come from the database and not from the prototype per-store `seq` counter.
  4. Given an operation that is not a create, such as `markLeadLost`, when it succeeds, then the response is `{ok: true}` with no id.
- **Rules enforced on the server:** Ids are generated by the database or the server, never sent by the client. The success shape is defined in the contract.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story shapes the response only.
- **Data changes:** None in the product database beyond reading the id produced by the insert. Adds the success shape to the contract.
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: ids cannot collide under parallel creates (epic section 16 risk on `seq`). Open question: whether human-readable ids such as `BATCH-2026-044` and `LD-2026-…` are the primary key or a display reference (EP-02 open question); the response returns the id the screens use either way.
- **Depends on:** EP-03-S1, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S8: System can deduplicate a create operation by idempotency key

- **Story ID:** EP-03-S8
- **Title:** System can deduplicate a create operation by idempotency key
- **As a:** System
- **I want:** create operations to accept an idempotency key and store it with the result id, so a retried request returns the first result instead of creating a second record
- **So that:** a shop connection that drops and retries does not create two leads, two parcels or two stock-outs (FR-03-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a `createLead` request with idempotency key `k-123`, when the same request reaches the server twice, then one lead exists and both responses return the same id (epic acceptance criterion 4).
  2. Given two requests with key `k-123` arriving at the same moment, when both are handled, then still only one record is created and the second waits for or returns the first result.
  3. Given key `k-123` used by Rajesh Verma for `createLead`, when Deepak Rao sends the same key, or Rajesh Verma sends it for `recordParcelArrival`, then it is treated as a new key and does not return Rajesh Verma's lead.
  4. Given a first request with key `k-123` that was refused with `rule_refused`, when it is retried with the same key, then the operation runs again and no stored result blocks it.
  5. Given an idempotency record older than its expiry, when the cleanup runs, then the record is removed.
- **Rules enforced on the server:** The idempotency key is scoped by key, operation and caller user id. Only successful results are stored. The key record is written in the same transaction as the created record.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A duplicate returns the stored result and changes no state; the original create is audited by its own epic through EP-06.
- **Data changes:** Migration creates `idempotency_records` with key, operation, caller user id, result id, created time and expiry (epic section 9), with a unique key on (key, operation, caller user id).
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: the unique key stops two parallel requests with the same key from both creating a record. Time: created time and expiry stored in UTC. Open decision: how long idempotency keys are kept is open in section 17; the expiry is a configuration value, and the cleanup schedule is moved to EP-10 once it exists.
- **Depends on:** EP-03-S6, EP-03-S7, EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S9: System can page long lists with a cursor

- **Story ID:** EP-03-S9
- **Title:** System can page long lists with a cursor
- **As a:** System
- **I want:** a list template that returns one page of items, the page size and a next cursor, with a maximum page size enforced on the server
- **So that:** long lists such as audit entries, leads, stock, parcels and customers load fast on a shop connection (FR-03-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given 500 audit entries, when the first page is requested with no page size, then the response holds at most the default page size of entries and a next cursor (epic acceptance criterion 5).
  2. Given the next cursor from page 1, when page 2 is requested, then it returns the following entries with no repeats and no gaps, in the same order.
  3. Given a page size above the server maximum, when the list is requested, then the server returns at most the maximum and does not fail.
  4. Given a new entry added between page 1 and page 2, when page 2 is requested with the cursor, then no entry from page 1 appears again.
  5. Given the last page, when it is returned, then its next cursor is null.
- **Rules enforced on the server:** The page shape is `{items, nextCursor, pageSize}` (epic section 9). The server caps the page size. The sort order of each list is fixed by the server and includes a unique tie-breaker so cursors are stable. A cursor that cannot be read returns `validation` with field `cursor`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads change no state.
- **Data changes:** None in the product database. Adds the list template and page shape to the contract and `api`. Each feature epic adds the index its list needs.
- **UI reference:** No screen. Lists such as `inbox`, `stock`, `parcels` and `audit` later use this paging.
- **Non-functional checks:** Performance: a page of the 500-entry list returns fast enough for the screen to load under 2 seconds on a shop connection (PRODUCTION-SCOPE §5). Security: a cursor carries no data the caller could not already read, and permission checks still apply to every page.
- **Depends on:** EP-03-S1, EP-03-S2, EP-02-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S10: System can report API and database health

- **Story ID:** EP-03-S10
- **Title:** System can report API and database health
- **As a:** System
- **I want:** a Read Health endpoint that anyone can call and that reports whether the API is running and whether the database is reachable
- **So that:** uptime checks in EP-37 and the deploy in EP-01 can tell a working server from a broken one (FR-03-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given the API and the database are both up, when Read Health is called, then it returns API `up` and database `up` with a success status.
  2. Given the database is stopped, when the next health check runs, then it reports database `down` and a failure status within that one check (epic acceptance criterion 6).
  3. Given a caller with no session, when Read Health is called, then it answers, because it needs no sign-in (epic section 10).
  4. Given the health response, when it is inspected, then it contains no connection string, host name, version of the database software or other secret.
  5. Given a database that does not answer, when Read Health is called, then the check gives up after a short timeout and reports `down` instead of hanging.
- **Rules enforced on the server:** Read Health is the only operation callable without a session. It runs a trivial read and changes no data. The rate-limit hook from EP-03-S11 still applies to it.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A health check changes no state.
- **Data changes:** None in the product database. Adds the Read Health endpoint to `api`.
- **UI reference:** No screen
- **Non-functional checks:** Availability: the health check is what EP-37 uptime checks and the EP-01-S12 deploy step call. Security: the response reveals no internal details.
- **Depends on:** EP-03-S1, EP-02-S1, EP-01-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S11: System can expose a rate-limit hook for EP-39 to fill in

- **Story ID:** EP-03-S11
- **Title:** System can expose a rate-limit hook for EP-39 to fill in
- **As a:** System
- **I want:** a named step in the request pipeline, before validation, where a rate limiter can count requests per caller and operation and refuse extra ones
- **So that:** EP-39 can add limits to sign-in, token entry and other operations without changing every handler (epic section 4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the default hook, when any request arrives, then it is allowed, and the request continues to validation unchanged.
  2. Given a test limiter that allows 2 calls per minute for one operation, when a caller sends 3 calls in a minute, then the third is refused with code `rate_limited` and a sentence asking the person to wait, and the service function does not run.
  3. Given the hook, when it is called, then it receives the operation name, the caller user id if signed in, and the client address, and nothing from the request body.
  4. Given the error format, when `rate_limited` is added, then it uses the same `{code, message}` shape as EP-03-S5.
- **Rules enforced on the server:** The hook runs before validation and before the service function. It never changes the request. Limit values are not set in this story.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The default hook refuses nothing and changes no state.
- **Data changes:** None in the product database. Adds the hook interface and the `rate_limited` error code to `api` and the contract.
- **UI reference:** No screen
- **Non-functional checks:** Security: the hook is in place for EP-39 abuse controls. Personal data: the client address is used for counting only and is not stored by this story.
- **Depends on:** EP-03-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-03-S12: Developer can port one prototype transition as the reference service function

- **Story ID:** EP-03-S12
- **Title:** Developer can port one prototype transition as the reference service function
- **As a:** Developer
- **I want:** `markLeadLost` from `src/store/transitions.ts` ported to `api` as a service function that runs through the full pipeline, without the hold release the prototype does
- **So that:** every feature epic has one working example to copy, showing the contract, validation, session actor, server time, transaction, version check and error sentences together (BR-03-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given lead LD-2026-213 in state `opened` in a seeded staging database, when a signed-in Staff user calls `markLeadLost` with reason "Customer went elsewhere.", then the lead state becomes `lost`, its note is the reason, and the response is `{ok: true}`.
  2. Given lead LD-2026-201 in state `converted`, when `markLeadLost` is called, then the response is `rule_refused` with "A converted lead cannot be marked lost." and the lead is unchanged.
  3. Given lead id LD-2026-999, when `markLeadLost` is called, then the response is `not_found` with "Lead LD-2026-999 was not found."
  4. Given a request with no `leadId`, when it is sent, then the response is `validation` with field `leadId`.
  5. Given the ported function, when its code is read, then it takes its actor and time from `Ctx` built by EP-03-S3, has no `heldForLeadId` logic (v1 has no holds), and updates the lead through the EP-02-S14 version check.
  6. Given the reference function, when its tests run in CI, then they cover each of the criteria above.
- **Rules enforced on the server:** A converted lead cannot be marked lost. The lead must exist. The update uses the lead's version. Who may mark a lead lost is left to the EP-05 permission hook, and the lead workflow rules belong to EP-28 and EP-30.
- **Live events emitted / consumed:** None. The epic emits no events. Any lead event added later by EP-07 and EP-28 hooks into the after-commit point from EP-03-S6.
- **Audit entry written:** No in this story. The audit entry (actor, time, entity, action, before, after, reason) is added when EP-06 exists.
- **Data changes:** None in the product database schema. Updates `leads.state`, `leads.note` and `leads.version` on the seeded rows from EP-02-S13. Adds the `markLeadLost` service function and its tests to `api`.
- **UI reference:** No screen in this story. The lead detail screen in EP-28 calls it later.
- **Non-functional checks:** Concurrency: two parallel `markLeadLost` calls on the same lead give one success and one `conflict`, or two idempotent `lost` results, never a lost write. Time: the action time is the server's UTC time. Security: the actor is the session user, not a body field.
- **Depends on:** EP-03-S3, EP-03-S4, EP-03-S5, EP-03-S6, EP-02-S7, EP-02-S13, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D1a: which cloud provider hosts the Node API and its database? D1 is decided: own Node + TypeScript API using the `express` already in `package.json`. (EP-03-S6)
- Which contract format is used between `web` and `api`: shared TypeScript types only, or a schema that also validates at runtime? (EP-03-S1, S2)
- How is the API versioned, and how does an old browser tab learn that the contract changed? (EP-03-S1)
- How long are idempotency keys kept? (EP-03-S8)
