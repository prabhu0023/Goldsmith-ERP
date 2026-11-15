# EP-03: API foundation

## 1. Summary

This epic builds the server layer that every screen will talk to. In the prototype each business rule runs inside the
browser, and the browser decides who did what and at what time. In production the server must be the authority: it
validates every request, applies the rule, stamps the actor and the time itself, and returns either the result or a
plain sentence explaining why the action was refused. This epic provides the framework, request validation, the
error format, pagination, a contract shared with the front end, and a health check. Feature epics then add their
operations on top.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. `express` is listed in `package.json` but there is no server; all 37 actions run in the browser through `StoreProvider`.

## 3. Roles involved

- System: the API validates requests, injects the actor from the session and the time from the server clock, and returns results or errors.
- Owner, Staff, Karigar: not involved directly. Every action they take in later epics passes through this layer.
- Developer (not a product role): adds operations using the shared contract and error format.

## 4. In scope

- The API framework or platform function layer, chosen per D1.
- Request validation at the trust boundary for every operation, using the shared contract types.
- One error format that carries a person-readable sentence (today's `DomainError` message) plus a machine code.
- A success format that returns the id of whatever was created (today's `Made` tuple and `ActionResult.id`).
- Pagination for long lists: audit entries, leads, stock, parcels, customers.
- An API contract package shared with `web` (built from `src/types/jewellery.ts`).
- Actor and time injected from the session and the server clock, never from the client.
- An idempotency key on create operations so a retried request does not create a second record.
- A health check that reports the API and database as up or down.
- A hook point for rate limiting, filled in by EP-39.

## 5. Out of scope

- Sign-in, OTP and sessions (EP-04).
- Permission checks per role (EP-05); this epic provides the place where they plug in.
- Audit writing (EP-06).
- The push connection for live events (EP-07).
- File upload and serving (EP-09).
- Scheduled jobs (EP-10).
- The business operations themselves; each feature epic (EP-13 to EP-43) adds its own.
- Logs, error tracking and uptime checks (EP-37).
- Rate limit values and abuse controls (EP-39).
- API, unit and end-to-end test suites (EP-40).
- Front-end foundation: API client, signed-in shell, loading, error, reconnecting and offline states. Owned by EP-08 Front-end production foundation (was gap G1), placed after EP-07 and before every feature epic.

## 6. Current state in the prototype

- `src/store/StoreProvider.tsx` `buildActions` defines 37 actions: createLead, confirmLead, startWorkingLead, markLeadLost, routeLeadItemToStock, releaseHold, createOrderCopyAndJob, acceptJob, startJob, markJobReady, handOver, recordParcelArrival, saveTag, qcTick, releaseParcel, ownerSendBack, ownerRecheckTag, ownerAcceptLoss, raiseProblem, clearProblem, proposeEdit, ownerAgreeEdit, applyEdit, refuseEdit, stockOut, requestScrap, ownerScrap, ownerDeclineScrap, onboardCustomer, onboardKarigar, onboardStaff, sendWishes, sendBroadcast, simulateReply, upsertScale, rememberScale, setSetting. This is the starting operation list, less `releaseHold` and the hold part of `routeLeadItemToStock`, which v1 drops (no holds).
- Every transition in `src/store/transitions.ts` takes `Ctx {by: Actor, at: number}`. `StoreProvider` fills `by` from the identity picked in the RoleChip and `at` from `demoNow()` in `src/domain/clock.ts`. Both come from the client today.
- Rule failures throw `DomainError` with a sentence such as "Only the owner can accept a loss." `StoreProvider` turns this into `ActionResult {ok: false, error}`; success returns `{ok: true, id}`.
- `Made = readonly [AppState, string]` returns the new state and the created id.
- `need()` throws "`<thing>` was not found." for missing records; this maps to a not-found error.
- `rememberScale` takes no `Ctx` and is a per-device preference, not a business transition.
- `package.json` lists `express` ^4.21.2, `@types/express`, `tsx`, `dotenv`, all unused.
- Reusable: the action catalogue as the operation list; `DomainError` sentences as the error text; `src/types/jewellery.ts` as the contract; transitions as the service functions, one per operation (PRODUCTION-SCOPE §8).
- Must be rebuilt server-side: request parsing and validation, session-derived actor, server time, transactions around each operation, id generation in the database, pagination, health check.

## 7. Functional requirements

- FR-03-1. Every operation validates its input against the shared contract and rejects an invalid request with a validation error naming the field.
- FR-03-2. The server sets the actor of every operation from the authenticated session and ignores any actor sent by the client.
- FR-03-3. The server sets the time of every operation from its own clock in UTC and ignores any time sent by the client.
- FR-03-4. A rule refusal returns an error with a machine code and the same person-readable sentence the prototype `DomainError` would show.
- FR-03-5. A missing record returns a not-found error whose sentence names the thing, for example "Parcel BATCH-2026-099 was not found."
- FR-03-6. A successful create operation returns the id of the created record.
- FR-03-7. Each operation runs in one database transaction, so a failed rule leaves no partial change.
- FR-03-8. A create operation called twice with the same idempotency key creates one record and returns the same id both times.
- FR-03-9. List operations return pages with a cursor or page number and a page size limit.
- FR-03-10. The health check reports whether the API is running and whether the database is reachable.
- FR-03-11. The front end and the server compile against the same contract package; a contract change that breaks either fails the typecheck.
- FR-03-12. A version conflict from EP-02 version checks returns a conflict error with a sentence the screen can show, such as "Someone else changed this piece. Reload and try again."

## 8. Business rules

- BR-03-1. The server enforces every rule; the browser only displays. [PRODUCTION-SCOPE §1 Authoritative]
- BR-03-2. `src/store/transitions.ts` becomes the server-side service layer, one function per endpoint. [PRODUCTION-SCOPE §8]
- BR-03-3. `src/types/jewellery.ts` is the basis for the API contract. [PRODUCTION-SCOPE §8]
- BR-03-4. Every permission is checked on the server; hiding a button is not a control. [PRODUCTION-SCOPE §5 Security]
- BR-03-5. Errors carry a sentence fit to show a person. [src/store/StoreProvider.tsx ActionResult]
- BR-03-6. The second of two competing sell requests gets a clear "already taken" message. [PRODUCTION-SCOPE §5 Concurrency]
- BR-03-7. Times are stored in UTC. [PRODUCTION-SCOPE §5 Time]
- BR-03-8. Scope is framework, validation, error format, pagination, shared contract and health check. [PRODUCTION-SCOPE §6 EP-03 scope]

## 9. Data

- No business entities of its own.
- Idempotency record: key, operation, caller user id, result id, created time, expiry.
- Error shape: code (for example `rule_refused`, `not_found`, `validation`, `conflict`, `unauthenticated`, `forbidden`), message (sentence), field (optional).
- Page shape: items, next cursor, page size.
- Weights in requests and responses are integers in units of 0.0001 g, or decimal strings converted by the shared helper; never floats.
- Money fields in the contract (`valueINR`, `budgetINR`, `spentINR`, `amountINR`) are nullable value sockets, unused until EP-42.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Health | Report API and database status | Anyone, including uptime checks (EP-37) |
| Read | Contract version | Let the front end detect a mismatched contract | Any signed-in client |
| Any | Feature operation (template) | Validate input, inject actor and time, run the service function in a transaction, return id or error | Defined per operation by EP-05 permissions |
| List | Any collection (template) | Return one page and a cursor | Defined per collection by EP-05 permissions |

## 11. Live events

None. This epic emits and consumes no events. EP-07 publishes events after an operation's transaction commits; this
epic provides the commit point it hooks into.

## 12. Screens and UX references

No screen of its own. Every route in `src/nav.ts` depends on it. Every screen that shows an action error today
(for example `parcel-match`, `edit-apply`, `stock-out`) shows the error sentence this layer returns.

## 13. Non-functional requirements

- Security: validate input at the trust boundary; actor and time come only from the session and server clock; no stack traces in error responses. [PRODUCTION-SCOPE §5 Security]
- Concurrency: one transaction per operation; version conflicts return a clear sentence. [PRODUCTION-SCOPE §5 Concurrency]
- Precision: weights cross the API as integers in units of 0.0001 g or exact decimal strings, never as floats.
- Performance: a typical read returns fast enough for screens to load under 2 seconds on a shop connection; list pages are capped in size. [PRODUCTION-SCOPE §5 Performance]
- Time: all times in responses are UTC; screens convert to Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-02
- Downstream: EP-04, EP-08, EP-09, EP-10, EP-37, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a request whose body names a different actor than the session, when the server handles it, then the record shows the session's user as actor.
2. Given a request with a client-supplied time, when the server handles it, then the record shows the server's UTC time.
3. Given a request missing a required field, when the server handles it, then it returns a validation error naming that field and changes nothing.
4. Given a create request retried with the same idempotency key, when it reaches the server twice, then one record exists.
5. Given a list of 500 audit entries, when the first page is requested, then at most one page of entries and a cursor are returned.
6. Done when the health check reports database down within one check after the database stops.

## 16. Risks

- Risk: the client-supplied `by` and `at` pattern from `StoreProvider` is copied into the server. Mitigation: the contract for operations has no actor or time fields at all.
- Risk: error sentences diverge between server and screens. Mitigation: keep the sentences in the shared service functions and show them unchanged.
- Risk: D1 is decided late and this layer is built twice. Mitigation: settle D1 before EP-01.
- Risk: each feature epic builds its own API client. Mitigation: EP-08 builds one shared API client on this contract before any feature epic starts.
- Risk: per-store `seq` id generation moves to the server unchanged and collides. Mitigation: ids come from the database (EP-02).

## 17. Open decisions and questions

- D1: own Node API using the `express` already in `package.json`, or a managed platform with built-in database, auth, realtime and storage?
- Which contract format is used between `web` and `api`: shared TypeScript types only, or a schema that also validates at runtime?
- How is the API versioned, and how does an old browser tab learn that the contract changed?
- How long are idempotency keys kept?

## 18. Candidate stories

1. EP-03-S1: Developer can define an operation once in the shared contract and use it in web and api
2. EP-03-S2: System can validate every request against the contract at the trust boundary
3. EP-03-S3: System can set the actor from the session and the time from the server clock
4. EP-03-S4: System can return a rule refusal with a code and the DomainError sentence
5. EP-03-S5: System can return not-found, validation and conflict errors in the same format
6. EP-03-S6: System can run each operation in one transaction
7. EP-03-S7: System can return the created id from a create operation
8. EP-03-S8: System can deduplicate a create operation by idempotency key
9. EP-03-S9: System can page long lists with a cursor
10. EP-03-S10: System can report API and database health
11. EP-03-S11: System can expose a rate-limit hook for EP-39 to fill in
12. EP-03-S12: Developer can port one prototype transition as the reference service function
