# EP-08: Front-end production foundation · stories

Epic document: [EP-08 Front-end production foundation](../epics/EP-08-front-end-production-foundation.md)

Role note: stories about what a person sees use Owner, Staff or Karigar; where the candidate title says "User" every role is meant, and the "As a" field names the role used in the examples. "System" means the browser data layer (API client, query cache and live hooks) acting on its own. "Developer" means the person wiring screens and building releases. This epic adds no server operation, so "Rules enforced on the server" names the server checks from EP-03, EP-04, EP-05 and EP-07 that the client relies on and must not replace.

---

## EP-08-S1: Developer can call every API operation through one typed client built from the contract

- **Story ID:** EP-08-S1
- **Status:** Not started
- **Title:** Developer can call every API operation through one typed client built from the contract
- **As a:** Developer
- **I want:** one API client in `web`, typed from the EP-03 shared contract, that attaches the session, adds an idempotency key to every action, and turns the EP-03 error format into a code and a sentence a person can read
- **So that:** every screen talks to the server the same way and a contract change breaks the build instead of a screen (FR-08-1, BR-08-1, BR-08-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the shared contract defines `markLeadLost` (the EP-03-S12 reference operation), when a developer calls it through the client with a wrong argument type, then `pnpm typecheck` fails in `web` and names the call site.
  2. Given a signed-in Staff session, when the client sends any read or action, then the request carries the session by the method EP-04 chose and the page script never reads the raw token.
  3. Given an action call such as `markLeadLost`, when the client sends it, then the request carries a newly generated idempotency key, and a read call carries none.
  4. Given the server answers with the EP-03 rule-refusal format and the sentence "A converted lead cannot be marked lost.", when the client returns, then the caller gets `{ ok: false, code, message: "A converted lead cannot be marked lost." }` and no thrown exception.
  5. Given the server answers 401 `unauthenticated`, when the client returns, then it reports the session as ended to the shell (used by EP-08-S15) as well as returning the error to the caller.
- **Rules enforced on the server:** Every request is validated against the contract at the trust boundary (EP-03-S2). The actor comes from the session, never from a client field (EP-03-S3). Idempotency keys are deduplicated on the server (EP-03-S8). The client adds no rule of its own.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The client changes no business record; each operation it calls writes its own entry on the server.
- **Data changes:** None in the product database. Adds the API client module in `web`, built from the shared contract package (EP-03-S1).
- **UI reference:** No screen
- **Non-functional checks:** Security: the session token is never stored where scripts from other origins can read it (epic section 13). Concurrency: every action carries an idempotency key. Precision: weights pass through as integers in units of 0.0001 g; the client never converts them to floating point. D1 is decided (Option C): the client is built on the EP-03 contract and calls only the Node API on the shop's own domain; it never connects to the database or storage directly.
- **Depends on:** EP-03-S1, EP-03-S2, EP-03-S4, EP-03-S5, EP-03-S8, EP-04-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S2: System can cache server reads and share them between screens

- **Story ID:** EP-08-S2
- **Status:** Not started
- **Title:** System can cache server reads and share them between screens
- **As a:** System
- **I want:** a query cache keyed by operation and parameters, so each screen declares the reads it needs (for example "in-stock pieces", "parcel BATCH-2026-044", "Today cards") and screens that need the same read share one request and one result
- **So that:** moving between screens is fast, the same figure is never shown two ways, and the server is not asked for the same data twice at once (FR-08-1, BR-08-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given `today` and the rail both need the in-stock piece count, when both mount at once, then one request is sent and both show the same number, for example 42.
  2. Given Rajesh Verma opened `stock` 20 seconds ago and goes to `today` and back, when `stock` mounts again, then the cached list shows at once and a background refresh runs.
  3. Given a cache entry, when it is inspected in a test, then it holds the query key, data, fetched at, the entity versions seen, and a status of `loading`, `ready`, `failed` or `possibly stale` (epic section 9).
  4. Given a cached piece TAG-8841 at version 7, when a refetch returns version 6 because of a slow replica, then the cache keeps version 7.
  5. Given two reads for the same key with different parameters, such as parcel BATCH-2026-044 and parcel BATCH-2026-043, when they resolve, then each is stored under its own key and neither overwrites the other.
- **Rules enforced on the server:** Every read is permission-checked by EP-05-S2, so the cache only ever holds what the server allowed this user to see. Entity versions come from the server's version column (EP-02-S14).
- **Live events emitted / consumed:** None in this story. Invalidation by events is EP-08-S8.
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Adds the client query cache in memory: query key, data, fetched at, versions seen, status.
- **UI reference:** No screen. Used by every route in `src/nav.ts`.
- **Non-functional checks:** Performance: cached screens show data at once and refresh in the background (epic section 13). Personal data: the cache lives in memory only, never in local storage, so cached customer data does not survive the tab. Precision: cached weights stay integers in units of 0.0001 g.
- **Depends on:** EP-08-S1, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S3: User can see a loading state while a screen's data arrives

- **Story ID:** EP-08-S3
- **Status:** Not started
- **Title:** User can see a loading state while a screen's data arrives
- **As a:** Staff
- **I want:** a screen, card or list that is waiting for its first data to show a loading state in place of its content
- **So that:** I never read "nothing here" and decide wrongly while the data is still on its way (FR-08-2, BR-08-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma opens `staff-directory` on a connection slowed to 3 seconds per request, when the read has not returned, then a loading state shows and no "no staff" empty state appears (epic acceptance criterion 1).
  2. Given `today` loads its cards and its figures from separate reads, when the figures return first, then the figures show and each card still waiting shows its own loading state.
  3. Given the read returns an empty list, when it arrives, then the screen's existing empty state shows with its sentence, for example on `staff-directory`.
  4. Given a screen reader is running, when a loading state appears, then it is announced once as loading, and text in it is at least 14 px (15 px on the karigar phone `k-jobs`).
  5. Given cached data exists for the screen (EP-08-S2), when the screen mounts, then the cached data shows and no loading state replaces it during the background refresh.
- **Rules enforced on the server:** None beyond the read's own permission check (EP-05-S2). Loading is a display state only.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Display state only.
- **Data changes:** None in the product database. Uses the cache status `loading` from EP-08-S2.
- **UI reference:** Not yet designed (loading state, epic section 12). Type scale and colours follow `docs/ux/mockups/01-foundations.svg` (body copy 14 / 400 as the smallest text).
- **Non-functional checks:** Performance: a screen shows its first data in under 2 seconds on a shop connection (BR-08-6). Open question: after how long a loading state turns into a read error is not decided; tests use 15 seconds until it is.
- **Depends on:** EP-08-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S4: User can see a read error with "Try again" when data cannot be loaded

- **Story ID:** EP-08-S4
- **Status:** Not started
- **Title:** User can see a read error with "Try again" when data cannot be loaded
- **As a:** Owner
- **I want:** an area whose read failed to say what could not be loaded and offer "Try again", while the rest of the screen keeps working
- **So that:** a failed read is never mistaken for "nothing to show", and I can recover without reloading the app (FR-08-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the server is unreachable, when Sanjay Seth opens `security`, then the screen says the security log could not be loaded and shows "Try again" (epic acceptance criterion 2).
  2. Given the server is back, when Sanjay presses "Try again", then the log loads and the error goes away without a page reload (epic acceptance criterion 2).
  3. Given `decisions` loads its queues from several reads, when only one read fails, then only that card shows the error and "Try again", and the other cards stay usable.
  4. Given a read fails with `forbidden` from EP-05-S2, when the area shows its error, then it says the user may not see this, and "Try again" is not offered.
  5. Given a read is still unanswered after the loading time-out (EP-08-S3), when it times out, then it shows the same read error with "Try again".
- **Rules enforced on the server:** The read returns errors in the EP-03 format (EP-03-S5), with `forbidden` from the permission check (EP-05-S2). The client does not retry `forbidden` on its own.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A failed read changes nothing.
- **Data changes:** None in the product database. Uses the cache status `failed` from EP-08-S2.
- **UI reference:** Not yet designed (read-error state with "Try again", epic section 12). Shown first on route `security` (`src/components/settings/SecurityLog.tsx`).
- **Non-functional checks:** Availability: a failed read never leaves an area silently empty. Accessibility: the error is announced to screen readers and "Try again" meets the UX-SPEC §6 touch target. Open question: the loading time-out before a read error is not decided.
- **Depends on:** EP-08-S2, EP-08-S3, EP-03-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S5: User can see the server's sentence when an action is refused

- **Story ID:** EP-08-S5
- **Status:** Not started
- **Title:** User can see the server's sentence when an action is refused
- **As a:** Staff
- **I want:** a refused action to show the server's sentence at the place I took the action, and keep what I typed
- **So that:** I know exactly why it did not happen and can fix it without filling the form again (FR-08-4, BR-08-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao has just billed TAG-8841, when Rajesh Verma submits a stock-out for TAG-8841, then the stock-out step shows "TAG-8841 is not in stock." where he pressed the button.
  2. Given Rajesh submits `lead-create` with no customer name, when the server refuses it, then the form shows "Add the customer name." and keeps the items he entered.
  3. Given a refusal arrives, when it is shown, then the submit button is enabled again and the screen does not navigate away.
  4. Given the server returns a refusal with no sentence, when it is shown, then the screen falls back to its existing text, for example "That did not save." in `ScalesRules.tsx`.
  5. Given a `version_conflict` error from EP-02-S14, when it is shown, then the sentence says someone else changed the record and the affected read is refetched.
- **Rules enforced on the server:** The rule check and the `DomainError` sentence live on the server (EP-03-S4). The client shows the sentence as text and never decides the refusal itself. Version conflicts are detected on the server (EP-02-S14).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused action changes no business record.
- **Data changes:** None in the product database.
- **UI reference:** No screen of its own. Uses each screen's existing error line, for example `src/components/parcels/TagItem.tsx` ("Could not save the tag.") and `docs/ux/mockups/06-stock-out.svg`, route `stock-out`.
- **Non-functional checks:** Concurrency: the "already taken" and "not in stock" refusals for double-sell are shown as sentences (epic section 13). Accessibility: the sentence is announced to screen readers.
- **Depends on:** EP-08-S1, EP-03-S4, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S6: User can retry an action after a network failure without applying it twice

- **Story ID:** EP-08-S6
- **Status:** Not started
- **Title:** User can retry an action after a network failure without applying it twice
- **As a:** Staff
- **I want:** an action that fails on the network to say it may not have been saved and offer a retry that reuses the same idempotency key
- **So that:** I can safely try again without creating two leads or billing a piece twice (FR-08-5, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma submits `lead-create` and the response is lost after the server committed, when the screen shows the failure, then it says the lead may not have been saved and offers a retry.
  2. Given he retries, when the request reaches the server with the same idempotency key, then one lead exists and the screen shows the id returned by the first request (EP-03-S8).
  3. Given an action is in flight, when he presses submit again, then no second request is sent and the button shows it is working.
  4. Given he changes a field after the network failure, when he submits, then a new idempotency key is used, because it is a different request.
  5. Given a network failure on a non-create action such as a stock-out of TAG-8841, when he retries and the first attempt had committed, then the server's sentence "TAG-8841 is not in stock." or the first result is shown, and the piece is billed once.
- **Rules enforced on the server:** Creates are deduplicated by idempotency key (EP-03-S8). Each operation runs in one transaction (EP-03-S6), so a lost response means either all or nothing was saved. State checks refuse a second stock-out of the same piece.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The audit entry is written once by the operation on the server; the retry writes none.
- **Data changes:** None in the product database. The client keeps the pending action's idempotency key in memory until it succeeds or the form changes.
- **UI reference:** Not yet designed (network-failure message). Shown first on route `lead-create` (`docs/ux/mockups/17-lead-create.svg`).
- **Non-functional checks:** Concurrency: a retry is applied at most once (epic section 13). Availability: the user is never told "saved" before the server answers.
- **Depends on:** EP-08-S1, EP-08-S5, EP-03-S6, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S7: System can refetch the affected reads after the user's own action

- **Story ID:** EP-08-S7
- **Status:** Not started
- **Title:** System can refetch the affected reads after the user's own action
- **As a:** System
- **I want:** each action to declare the query keys it affects, and those reads to be refetched after the action succeeds, before the screen shows new values
- **So that:** the person who made the change sees the server's result, not a guess made in the browser (FR-08-6, BR-08-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma bills TAG-8841 on `stock-out`, when the action succeeds, then the in-stock pieces list, the stock totals and the Today figures are refetched, and TAG-8841 no longer appears on `stock`.
  2. Given the action succeeds, when the screen updates, then the values shown come from the refetch and none is computed in the browser from the request.
  3. Given an action that is refused, when the result arrives, then no read is invalidated.
  4. Given the same change also arrives as a live event to the same browser (EP-08-S8), when both happen within the coalescing window, then each affected read is fetched once.
  5. Given a refetch fails after the action succeeded, when the area updates, then it shows the read error with "Try again" (EP-08-S4) and the action is still reported as saved.
- **Rules enforced on the server:** The server is the only source of the new state (BR-08-3). Reads are permission-checked (EP-05-S2).
- **Live events emitted / consumed:** None in this story. The live path is EP-08-S8.
- **Audit entry written:** No. Refetching changes nothing.
- **Data changes:** None in the product database. Adds an "affects" list of query keys to each action wrapper in the client.
- **UI reference:** No screen
- **Non-functional checks:** Performance: the refetched values show within 2 seconds of the action on a shop connection. Precision: refetched weights are shown to four decimals from integers in units of 0.0001 g.
- **Depends on:** EP-08-S1, EP-08-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S8: System can keep one live connection per signed-in client and map every catalogue event to reads

- **Story ID:** EP-08-S8
- **Status:** Not started
- **Title:** System can keep one live connection per signed-in client and map every catalogue event to reads
- **As a:** System
- **I want:** the shell to open one EP-07 live connection after sign-in, and one event-to-query map, kept next to the catalogue, that names the query keys each event invalidates
- **So that:** every screen gets live updates the same way, and no event leaves a screen stale because nobody mapped it (FR-08-7, BR-08-5, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signs in and opens three screens in turn, when the connection count is checked on the server, then his tab has exactly one live connection.
  2. Given the event-to-query map, when it is compared with the 10 events of PRODUCTION-SCOPE §1, then every event has at least one query key, and a unit test fails if an event is added to the shared list without a map entry.
  3. Given "Piece billed by one staff member" arrives for TAG-8841, when the map runs, then it invalidates the in-stock pieces, stock totals, Today cards, sale lists and suggestions reads (epic section 11).
  4. Given "Parcel stopped (mismatch or raised problem)" arrives for BATCH-2026-044, when the map runs, then it invalidates the parcel, Decisions and Today reads, and only reads that are cached or on an open screen are refetched.
  5. Given 5 events invalidate the same query within 300 ms, when they arrive, then that query is refetched once (epic section 16 risk).
- **Rules enforced on the server:** The connection is authenticated (EP-07-S3), channels are assigned by the server (EP-07-S4), and each event is filtered by the receiver's permissions (EP-07-S5). Events carry ids and versions only (EP-07-S2), so the client always refetches.
- **Live events emitted / consumed:** consumed: all 10 catalogue events: "Piece billed by one staff member", "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Edit applied", "Lead arrived / passed its SLA", "Karigar job status changed", "Parcel handed over by karigar", "Tag saved on a shared parcel", "Metal pool changed", "User deactivated or role changed". Proposed events from README gap G26 join the map when they are added to the catalogue.
- **Audit entry written:** No. Receiving events changes nothing.
- **Data changes:** None in the product database. Adds the event-to-query map in `web` and the live client state: connection status and last sequence number received.
- **UI reference:** No screen
- **Non-functional checks:** Performance: refetches are coalesced per query so the owner's screens do not storm the API. Security: the client subscribes only to entity channels for screens it has open, and the server checks each (EP-07-S4). Open decision D3: WebSocket or Server-Sent Events from the Node API decides how the hook connects; the map does not change.
- **Depends on:** EP-08-S2, EP-07-S2, EP-07-S3, EP-07-S4, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S9: User can see a screen update by itself when someone else changes something

- **Story ID:** EP-08-S9
- **Status:** Not started
- **Title:** User can see a screen update by itself when someone else changes something
- **As a:** Staff
- **I want:** my open screen to change within about a second when another person changes data it shows, without me reloading
- **So that:** I never offer a customer a piece that someone else has just sold (FR-08-8, BR-08-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given two browsers signed in as Rajesh Verma and Deepak Rao, when Deepak changes data through a migrated screen, then Rajesh's open screen shows the change within about 1 second without a reload (epic acceptance criterion 3).
  2. Given the owner Sanjay Seth adds a user on `staff-new`, when the add commits, then another owner browser on `staff-directory` shows the new row within about 1 second.
  3. Given Rajesh is filling a form on the screen being updated, when the refetch arrives, then the values he typed are kept and only the read-only parts change.
  4. Given an event for a record Rajesh may not read, when the server filters it (EP-07-S5), then his screen does not change.
  5. Given the refetch returns a version older than the one on screen, when it arrives, then the screen keeps the newer version.
- **Rules enforced on the server:** Events go only to permitted receivers (EP-07-S5). The refetch is a permission-checked read (EP-05-S2). The server is authoritative (BR-08-3).
- **Live events emitted / consumed:** consumed: any catalogue event mapped by EP-08-S8. The demo uses "User deactivated or role changed" for other users' lists and, once their epics wire them, "Piece billed by one staff member" and "Tag saved on a shared parcel".
- **Audit entry written:** No. Display update only.
- **Data changes:** None in the product database.
- **UI reference:** Live cards on `docs/ux/mockups/02-staff-home.svg`, route `today`, and `docs/ux/mockups/08-owner-home.svg`, route `decisions`; several staff on one parcel on `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag`.
- **Non-functional checks:** Performance: a change appears on other screens within about 1 second (BR-08-6). Concurrency: an update never overwrites what the user is typing. Time: times on refreshed cards are shown in Asia/Kolkata from server UTC.
- **Depends on:** EP-08-S7, EP-08-S8, EP-07-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S10: User can see "Reconnecting…" when the connection drops and catch up when it returns

- **Story ID:** EP-08-S10
- **Status:** Not started
- **Title:** User can see "Reconnecting…" when the connection drops and catch up when it returns
- **As a:** Staff
- **I want:** every open screen to show "Reconnecting…" and mark its data as possibly out of date when the live connection or the network drops, and to catch up and clear the banner when it returns
- **So that:** a dropped connection never leaves me silently looking at old stock (FR-08-9, FR-08-10, epic section 13 Availability)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's browser on `stock`, when its network is cut for 30 seconds, then "Reconnecting…" appears within 5 seconds and the list is marked as possibly out of date (epic acceptance criterion 4).
  2. Given 4 events were published to his channels during the cut, when the network returns, then the client resumes from its last sequence number, refetches the affected reads, the banner clears, and the screen shows every change made meanwhile (epic acceptance criterion 4).
  3. Given EP-07 answers the resume with "refetch everything" because the gap is too old, when it arrives, then every open read is refetched before the banner clears.
  4. Given the session expired during the cut, when the resume is refused as `unauthenticated`, then the shell returns to sign-in (EP-08-S15).
  5. Given "Reconnecting…" is showing, when a screen reader is running, then the change is announced once, and announced again when the connection is back.
- **Rules enforced on the server:** Resume checks the session (EP-07-S3) and replays only permitted events in order (EP-07-S7). The "refetch everything" signal is decided by the server.
- **Live events emitted / consumed:** consumed: any catalogue event replayed by EP-07-S7 after resume.
- **Audit entry written:** No. Reconnecting changes nothing.
- **Data changes:** None in the product database. Uses the live client state: status `connected`, `reconnecting` or `offline`, and last sequence number received; sets cache status `possibly stale` while reconnecting.
- **UI reference:** Not yet designed ("Reconnecting…" banner, epic section 12). Amber means "needs a person: waiting" in `docs/ux/mockups/01-foundations.svg`.
- **Non-functional checks:** Availability: the banner appears within a few seconds and clears after catch-up (epic section 13). Concurrency: replayed events are applied in sequence order. Open decision D3: how a drop is detected depends on the transport. Open question: how long cached data may be shown while reconnecting before the screen hides it; tests keep it shown with the possibly-out-of-date mark until decided.
- **Depends on:** EP-08-S8, EP-07-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S11: User can see an offline state with server actions disabled

- **Story ID:** EP-08-S11
- **Status:** Not started
- **Title:** User can see an offline state with server actions disabled
- **As a:** Staff
- **I want:** the web app to say it is offline when there is no network, and disable every action that needs the server with a reason
- **So that:** I do not press "Bill" or "Save tag" and believe it worked when nothing reached the server (FR-08-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's browser reports no network, when he is on `stock-out`, then the shell shows the offline state and the submit button is disabled with the reason that the server cannot be reached.
  2. Given he is offline, when he reads the screen, then the data already shown stays visible and is marked as possibly out of date.
  3. Given he is offline, when he tries any staff or owner action, then nothing is queued to send later.
  4. Given the network returns, when the connection is back, then the actions are enabled again and the reconnect catch-up of EP-08-S10 runs.
  5. Given Lakshmi Devi on the karigar app `k-jobs`, when she is offline, then the same offline state shows, her step buttons are disabled with the reason, and nothing is queued (D6 decided: online only).
- **Rules enforced on the server:** None new. With no network nothing reaches the server; every action is still checked there once online.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Nothing is saved while offline.
- **Data changes:** None in the product database. Uses live client status `offline`.
- **UI reference:** Not yet designed (offline state, epic section 12).
- **Non-functional checks:** Availability: offline is always shown, never a silent failure. Accessibility: the disabled reason is readable at 14 px or more and announced. D6 is decided: online only, with no offline queue anywhere. The web app, staff and karigar alike, is read-only while disconnected, and actions are refused with a reason, not queued.
- **Depends on:** EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S12: User can open the app to sign-in and land on their role's home in a signed-in shell

- **Story ID:** EP-08-S12
- **Status:** Not started
- **Title:** User can open the app to sign-in and land on their role's home in a signed-in shell
- **As a:** Owner
- **I want:** the app to open on sign-in when I have no session, and after sign-in to open my home inside the signed-in shell with my name, role and server time available to every screen
- **So that:** nobody uses the app without signing in, and each role starts where its work is (FR-08-12, FR-08-17, BR-08-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given no session, when anyone opens the app, then the sign-in screen from EP-04 shows and no shell, rail or data read is shown.
  2. Given Sanjay Seth signs in, when the shell loads, then it opens `decisions`; Rajesh Verma opens `today`; Lakshmi Devi opens `k-jobs` inside the karigar layout (`landingRoute` in `src/nav.ts`).
  3. Given a signed-in user, when any screen asks the shell for the current user, role and time, then it gets them from Read Current session and the server clock, and `demoNow()` is not called.
  4. Given a valid session and a reload of the tab, when the app opens, then it goes straight to the landing route without showing sign-in.
  5. Given the shell is open on `today`, when Rajesh's screen shows "today" figures, then the date is the server's date in Asia/Kolkata, not the browser's clock.
- **Rules enforced on the server:** The session is created and checked by EP-04 (EP-04-S5). Read Current session returns user id, name, role, shop name and landing route (EP-04-S6). Every data read is refused without a session.
- **Live events emitted / consumed:** None in this story. The live connection opens after sign-in (EP-08-S8).
- **Audit entry written:** No. Sign-in is audited by EP-04-S14.
- **Data changes:** None in the product database. Adds the session context in memory: user id, name, role, shop name, landing route.
- **UI reference:** Node `SIGN` leading to STAFF home "Today", OWNER home "Decisions" and KARIGAR phone "My jobs" in `docs/ux/mockups/10-navigation-map.mmd`; routes `today`, `decisions`, `k-jobs`. Shell is `src/components/shell/AppShell.tsx`. The sign-in screen is not yet designed.
- **Non-functional checks:** Security: no route renders data before the session is confirmed. Time: "today", SLA clocks and overdue figures use server time shown in Asia/Kolkata. Performance: the landing route shows first data within 2 seconds of sign-in. D4 is decided (phone and password); this story does not depend on the sign-in method. D7 is decided: one shop, no branches, so the shell carries no current branch.
- **Depends on:** EP-08-S2, EP-04-S5, EP-04-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S13: User can see only the routes their role may open

- **Story ID:** EP-08-S13
- **Status:** Not started
- **Title:** User can see only the routes their role may open
- **As a:** Staff
- **I want:** the rail and the shell to show only the routes my role may open, and to send me to my landing route if I reach one I may not open
- **So that:** I am not shown screens I cannot use, while the server still refuses them on its own (FR-08-13, BR-08-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when the rail renders, then it shows the staff items from `navFor('staff')` and not "Security log" or "Decisions".
  2. Given Rajesh opens a link to `security`, when the shell checks the route, then it shows `today` instead and no request for the security log is sent.
  3. Given a test that calls the security log read directly with Rajesh's session, when it reaches the server, then it is refused as `forbidden` (EP-06-S12), proving the hidden route is also refused on the server.
  4. Given Lakshmi Devi signed in as Karigar, when she tries any staff or owner route such as `stock`, then the shell shows `k-jobs`.
  5. Given Sanjay Seth signed in as Owner, when the rail renders, then it shows the owner sections (OVERSIGHT, SHOPFLOOR) as on `docs/ux/mockups/08-owner-home.svg`.
- **Rules enforced on the server:** Every operation checks the caller's role (EP-05-S2). Karigar reads are limited to own jobs (EP-05-S3). The shell's route guard is a convenience only.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused route in the shell changes nothing; server refusals follow EP-05.
- **Data changes:** None in the product database. The route-to-role table comes from the EP-05 permission list in the shared package (EP-05-S1).
- **UI reference:** Rail on `docs/ux/mockups/08-owner-home.svg` (route `decisions`) and `docs/ux/mockups/02-staff-home.svg` (route `today`); who-does-what on `docs/ux/mockups/11-roles-and-permissions.svg`.
- **Non-functional checks:** Security: hiding a route is not a control; the server refuses it too (BR-08-8).
- **Depends on:** EP-08-S12, EP-05-S1, EP-05-S2, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S14: User can use the account menu in place of the role switcher

- **Story ID:** EP-08-S14
- **Status:** Not started
- **Title:** User can use the account menu in place of the role switcher
- **As a:** Staff
- **I want:** the rail foot and the karigar shell to show the EP-05 account menu with my name, role and "Sign out", where `RoleChip` is today, and no identity switch or pricing dev switch anywhere
- **So that:** each person acts only as themselves and nobody can flip pricing from the shell (FR-08-15, BR-08-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when he opens the menu at the rail foot, then it shows "Rajesh Verma", "Staff" and "Sign out", and no list of other identities.
  2. Given Lakshmi Devi on `k-jobs`, when the karigar shell renders, then the account menu appears where `RoleChip` was and `PhoneFrame` is not drawn around the app in production.
  3. Given any signed-in user, when the shell renders, then the `PricingToggle` dev switch is not present.
  4. Given Rajesh chooses "Sign out", when the sign-out commits (EP-04-S11), then the cache is cleared and sign-in shows.
  5. Given the owner rail, when it renders, then the line where the mockups print "All branches" shows the shop name from the session, not a fixed string (one shop, no branches, D7).
- **Rules enforced on the server:** The menu's contents come from Read Current user (EP-05-S12). Sign out is Delete Current session (EP-04-S11). The pricing switch is an owner-only setting owned by EP-13 and EP-42; no shell control calls it.
- **Live events emitted / consumed:** None
- **Audit entry written:** No in this story. Sign-out is audited by EP-04-S14.
- **Data changes:** None in the product database. `RoleChip` and `PricingToggle` are removed from `src/components/shell/AppShell.tsx`.
- **UI reference:** `src/components/ui/RoleChip.tsx` slot at the rail foot ("Sanjay Seth · Owner · switch" on `docs/ux/mockups/08-owner-home.svg`). The account menu is not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: no client control lets a user act as another identity (BR-08-7). Personal data: cache is cleared on sign-out. D7 is decided: one shop, so there is no branch switch.
- **Depends on:** EP-08-S12, EP-05-S12, EP-04-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S15: User can be returned to sign-in when the session ends or is ended

- **Story ID:** EP-08-S15
- **Status:** Not started
- **Title:** User can be returned to sign-in when the session ends or is ended
- **As a:** Staff
- **I want:** the shell to clear every cached read and return me to sign-in when my session expires, or when "User deactivated or role changed" arrives for me
- **So that:** a deactivated person sees none of the shop's data, and a re-roled person starts again with the right screens (FR-08-14, BR-08-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is signed in on `stock`, when Sanjay Seth deactivates him (EP-05-S7), then his browser returns to sign-in within about 1 second and shows none of the previous data (epic acceptance criterion 5).
  2. Given Deepak Rao's role changes from Staff to Karigar, when the event arrives for him, then his cache is cleared and he goes to sign-in; after signing in again he lands on `k-jobs`.
  3. Given an idle session expires (EP-04-S12), when Rajesh's next request returns `unauthenticated`, then the shell goes to sign-in and says the session ended.
  4. Given the cache is cleared, when the browser's memory is inspected in a test, then no customer, lead or piece data from the previous session remains, and the live connection is closed.
  5. Given "User deactivated or role changed" arrives for another user, when Sanjay is on `staff-directory`, then his list is refetched and he stays signed in.
- **Rules enforced on the server:** Sessions are ended on the server (EP-04-S13, EP-05-S10) and connections closed (EP-07-S10). Any later request with the old session is refused as `unauthenticated`.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed".
- **Audit entry written:** No in this story. The deactivation or role change is audited by EP-05-S14.
- **Data changes:** None in the product database. Clears the client query cache, session context and live client state.
- **UI reference:** Not yet designed (session-ended state, epic section 12).
- **Non-functional checks:** Security: access on screen ends within about 1 second of deactivation. Personal data: cached customer data is removed from memory on session end. D4 is decided: the sign-in screen asks for phone number and password.
- **Depends on:** EP-08-S1, EP-08-S8, EP-08-S12, EP-04-S12, EP-04-S13, EP-05-S10, EP-07-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S16: User can see rail badge counts from the server update live

- **Story ID:** EP-08-S16
- **Status:** Not started
- **Title:** User can see rail badge counts from the server update live
- **As a:** Owner
- **I want:** the rail to read its badge counts from the EP-07 badge-count read instead of the `railBadges` selector, and refresh them through the event-to-query map
- **So that:** the counts on my rail match the server and change within about a second (FR-08-16)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `decisions`, when the rail renders, then the Decisions, Leads, Parcels in and Showroom stock counts come from the badge-count read and `railBadges` in `src/store/selectors.ts` is not called.
  2. Given the Decisions badge shows 3, when "Parcel stopped (mismatch or raised problem)" arrives for BATCH-2026-044, then it shows 4 within about 1 second, as on `docs/ux/mockups/08-owner-home.svg`.
  3. Given the badge-count read is loading, when the rail renders, then no badge number shows rather than a 0.
  4. Given the badge-count read fails, when the rail renders, then the badges are hidden and the rail stays usable.
  5. Given Lakshmi Devi on `k-jobs`, when the shell renders, then no badge read is sent.
- **Rules enforced on the server:** Counts are computed on the server per role (EP-07-S9): owner gets decisions, late leads, open parcels and in-stock count; staff get leads needing a glance, open parcels and in-stock count; karigar gets none.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member", "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Edit applied", "Lead arrived / passed its SLA", "Parcel handed over by karigar" (through EP-08-S8).
- **Audit entry written:** No. Reading counts changes nothing.
- **Data changes:** None in the product database. Adds the badge-count query key to the event-to-query map.
- **UI reference:** Rail on `docs/ux/mockups/08-owner-home.svg` and `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions`; rail on `docs/ux/mockups/02-staff-home.svg` (Showroom stock 42, Parcels in 2), route `today`.
- **Non-functional checks:** Performance: badges change within about 1 second of the event, with refetches coalesced. D7 is decided: counts are for the one shop.
- **Depends on:** EP-08-S8, EP-08-S13, EP-07-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S17: Developer can move a screen from `useStore()` onto the data layer by a documented pattern

- **Story ID:** EP-08-S17
- **Status:** Not started
- **Title:** Developer can move a screen from `useStore()` onto the data layer by a documented pattern
- **As a:** Developer
- **I want:** one written pattern, with a worked example, for replacing a screen's `useStore()` reads and actions with queries, actions, loading, error and live updates
- **So that:** every feature epic from EP-11 to EP-44 wires its screens the same way and the patterns do not drift (BR-08-1, BR-08-2, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given the pattern document, when a developer reads it, then it covers: declaring queries, declaring an action and the reads it affects, adding event-to-query entries, using the loading, read-error, reconnecting and offline states, and showing refusal sentences.
  2. Given the worked example, when it is compared with a migrated screen from EP-08-S18, then they use the same hooks and the same states.
  3. Given a feature screen still calls `useStore()`, when the lint rule runs in CI (EP-01-S7), then it reports the file, so migration progress is visible.
  4. Given the pattern, when it describes weights, then it says weights arrive as integers in units of 0.0001 g and are shown to four decimals with the existing display helpers.
- **Rules enforced on the server:** None new. The pattern states that every permission and rule is checked on the server and the screen only shows the result (BR-08-8).
- **Live events emitted / consumed:** None in this story. The pattern explains how a screen uses events through EP-08-S8.
- **Audit entry written:** No. Documentation and lint only.
- **Data changes:** None in the product database. Adds the pattern document in the repository and a lint rule that flags `useStore()` in screens.
- **UI reference:** No screen
- **Non-functional checks:** Precision: the pattern forbids converting weights to floating point for storage or comparison (BR-08-10).
- **Depends on:** EP-08-S3, EP-08-S4, EP-08-S5, EP-08-S6, EP-08-S7, EP-08-S9, EP-08-S10, EP-08-S11, EP-01-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S18: Developer can move the sign-in, staff and security log screens onto the data layer

- **Story ID:** EP-08-S18
- **Status:** Not started
- **Title:** Developer can move the sign-in, staff and security log screens onto the data layer
- **As a:** Developer
- **I want:** the sign-in screen (EP-04), `staff-directory` and `staff-new` (EP-05), and `security` (EP-06) to use the data layer by the EP-08-S17 pattern
- **So that:** the screens of the epics before this one work in production and serve as the worked examples for feature epics (FR-08-18)
- **Acceptance criteria (Given / When / Then):**
  1. Given the four screens, when the lint rule from EP-08-S17 runs, then none of them calls `useStore()`.
  2. Given Sanjay Seth adds Deepak Rao on `staff-new`, when the add succeeds, then `staff-directory` is refetched and shows Deepak, and a second owner browser on `staff-directory` shows him within about 1 second.
  3. Given `staff-directory` on a slow connection, when the read has not returned, then the loading state shows and no empty state appears (epic acceptance criterion 1).
  4. Given the server is unreachable, when Sanjay opens `security`, then the read error with "Try again" shows, and the log loads after the server returns (epic acceptance criterion 2).
  5. Given `staff-new` is submitted with a phone already used by another user, when the server refuses it, then the server's sentence shows on the form and the entered name and role are kept.
- **Rules enforced on the server:** Add user is owner-only (EP-05-S4); the security log is owner-only (EP-06-S12); sign-in rules are EP-04's. The screens only show results.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed" (refetch user lists on `staff-directory`).
- **Audit entry written:** No in this story. Adding a user is audited by EP-05-S14 through the existing operation.
- **Data changes:** None in the product database. Changes `src/components/people/StaffDirectory.tsx`, the `staff-new` screen, `src/components/settings/SecurityLog.tsx` and the sign-in screen to use the data layer.
- **UI reference:** `docs/ux/mockups/25-onboard-staff.svg`, route `staff-new`; route `staff-directory` (`src/components/people/StaffDirectory.tsx`); route `security` (`src/components/settings/SecurityLog.tsx`). The sign-in screen is not yet designed.
- **Non-functional checks:** Performance: each screen shows first data under 2 seconds on a shop connection. Personal data: staff phone numbers stay in the in-memory cache only. D4 is decided: the sign-in screen has phone number and password fields, plus "Forgot password".
- **Depends on:** EP-08-S17, EP-08-S12, EP-04-S3, EP-04-S5, EP-05-S4, EP-05-S11, EP-06-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-08-S19: Developer can ship production builds without the in-memory store, seed, demo clock and identity switch

- **Story ID:** EP-08-S19
- **Status:** Not started
- **Title:** Developer can ship production builds without the in-memory store, seed, demo clock and identity switch
- **As a:** Developer
- **I want:** production builds of `web` to leave out the `StoreProvider` state, `src/data/seed.ts`, `demoNow()` and its 30-second interval, `switchIdentity` and `RoleChip`
- **So that:** no production user can see seed data, a fake clock or a way to become someone else (FR-08-1, FR-08-15, FR-08-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given a production build, when any user signs in, then no screen offers an identity switch or the pricing dev switch, and no data comes from `src/data/seed.ts` (epic acceptance criterion 6).
  2. Given the production bundle, when CI searches it for the seed module, `demoNow` and `switchIdentity`, then none is found and the step fails if any is.
  3. Given the M1 demo on staging, when a user signs in, lands on their home, and two browsers make changes, then each sees the other's changes live (epic acceptance criterion 7).
  4. Given a development build, when a developer runs the dev command (EP-01-S5), then the app still runs against the dev API and the dev database seeded by EP-02-S13, not the in-memory store.
- **Rules enforced on the server:** None new. The CI pipeline enforces the bundle check (EP-01-S9), and the server never accepts a client-chosen identity (EP-03-S3).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Build change only.
- **Data changes:** None in the product database. Removes `src/store/StoreProvider.tsx` state, the seed load and the demo clock from production code paths; adds a bundle check to CI.
- **UI reference:** No screen. Affects `src/App.tsx` and `src/components/shell/AppShell.tsx`.
- **Non-functional checks:** Security: no identity switch ships (BR-08-7). Time: no screen uses the demo clock; all times come from the server in UTC and show in Asia/Kolkata.
- **Depends on:** EP-08-S14, EP-08-S18, EP-01-S5, EP-01-S9, EP-01-S12, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D3: WebSocket or Server-Sent Events from the Node API? It decides how the live hooks connect and how "reconnecting" is detected. (EP-08-S8, S10)
- D6 is decided: online only, no offline queue anywhere. The web app, including the karigar app, is read-only while disconnected. (EP-08-S11)
- D7 is decided: one shop, no branches; the shell shows the shop name and has no branch switch (EP-08-S12, S14, S16).
- How long may cached data be shown while reconnecting before the screen hides it? (EP-08-S10)
- After how long without a response does a loading state turn into a read error? (EP-08-S3, S4)
- Staff and karigar actions are never queued offline; they are refused with a reason (answered by D6). (EP-08-S11)
- How does an old browser tab learn that the contract changed (EP-03 open question), and is it forced to reload? (EP-08-S1)
