# EP-08: Front-end production foundation

## 1. Summary

This epic connects the screens the prototype already has to the real system. Today every screen reads one in-memory
state object through `useStore()`, so data never has to travel, never fails and never changes behind the user's back.
In production each screen must load its data from the server, show a loading state while it waits, show an error when
a read or an action fails, show a "reconnecting" state when the internet connection drops, and update by itself when
someone else changes something. The business needs this so that staff, the owner and karigars see the same truth
within about a second, and never act on a stale or half-loaded screen. This epic builds that once, for every screen:
the shared API client, the query cache with invalidation, live-subscription hooks on the EP-07 channel, the loading,
error, reconnecting and offline patterns, and the signed-in app shell that hosts the EP-05 account menu. It comes
after EP-03, EP-04, EP-05 and EP-07 and before every feature epic, which then only wire their own screens to it.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. Every screen reads `useStore()` from `src/store/StoreProvider.tsx`, which holds the whole `AppState` in browser memory; there is no server read, no loading, load-error, reconnecting or offline state, no live update and no signed-in shell. The UI library and the screens exist and are reused.

## 3. Roles involved

- Owner: sees every owner screen load, fail and recover the same way; uses the signed-in shell and account menu.
- Staff: same as the owner for staff screens; sees another staff member's change appear without a refresh.
- Karigar: sees the phone app (`k-jobs`) load and recover the same way on weak signal; the offline queue itself is EP-20 under D6.
- System: keeps one live connection per signed-in client, maps each live event to the cached reads it affects, refetches them, and ends the signed-in shell when the session ends.

## 4. In scope

- One typed API client built from the EP-03 contract, used by every screen; it attaches the session, sends idempotency keys for actions, and turns the EP-03 error format into a code and a sentence a person can read.
- A query cache: each screen declares the reads it needs (for example "in-stock pieces", "parcel BATCH-2026-044", "Today cards"); results are cached, shared between screens, and invalidated after the user's own successful action.
- Live-subscription hooks: one live connection per signed-in client (EP-07); each event in the PRODUCTION-SCOPE section 1 catalogue is mapped to the cached reads it affects, which are refetched from the API, because events carry ids and versions only (EP-07 section 7, refetch on event).
- Loading pattern: a screen, card or list that is waiting for data shows a loading state in place of empty or stale content; a screen never shows "nothing here" before its first read returns.
- Error pattern for reads: a failed read shows what could not be loaded and a "Try again" action; the rest of the screen keeps working.
- Error pattern for actions: a refused action shows the server's sentence (the `DomainError` sentences the prototype already shows), at the place the action was taken; a network failure says the action may not have been saved and lets the user retry with the same idempotency key.
- Reconnecting pattern: when the live connection or the network drops, every open screen shows a "Reconnecting…" state; data on screen is marked as possibly out of date; after reconnect the client catches up by sequence number (EP-07) or refetches everything, and the banner clears.
- Offline pattern for the web app: with no network the shell says so and actions that need the server are disabled with a reason; staff and owner actions are not queued. The karigar offline queue is EP-20.
- Signed-in app shell: the app opens on sign-in (EP-04) when there is no session, routes a signed-in user to their role's landing route (`today`, `decisions`, `k-jobs`), refuses routes their role may not open, and returns to sign-in when the session ends or is ended ("User deactivated or role changed").
- The shell hosts the EP-05 account menu in the rail foot and the karigar shell in place of the `RoleChip` identity switcher; the demo `PricingToggle` is removed from the shell (the pricing switch belongs to EP-13 and EP-42).
- Rail badge counts (`railBadges` today) read from the server and kept current by live events.
- Shared current-user, current-branch (if D7) and server-time context for screens, replacing `identity`, `actor` and the demo clock `now` from `StoreProvider`.
- A documented pattern and one worked example for moving a screen from `useStore()` onto the data layer, so each feature epic wires its own screens the same way.
- Moving the screens of the epics that come before this one onto the data layer: sign-in (EP-04), `staff-directory` and `staff-new` (EP-05), `security` (EP-06).
- Removing the in-memory `StoreProvider` state, the seed load, the demo clock and the identity switch from production builds.

## 5. Out of scope

- The API itself, its contract and error format (EP-03).
- Sign-in, OTP and sessions on the server (EP-04); the sign-in and OTP screens' rules (EP-04).
- Users, roles, permissions and the account menu's rules and contents (EP-05).
- The live connection, subscriptions, sequence numbers and catch-up on the server (EP-07).
- Wiring each feature screen to its reads, actions and events: each feature epic does that for its own routes (EP-11 to EP-44), using this epic's patterns.
- The karigar phone's offline queue and sync status (EP-20 under D6).
- New screens with no route id today, such as the notification centre (EP-11, G21) and the report hub (EP-35).
- Redesigning the UI library or the screens; `src/components/ui/**` is kept as it is apart from the `RoleChip` swap.
- Front-end monitoring of errors and load times (EP-37).
- Translation of the UI: v1 is English only (EP-44).

## 6. Current state in the prototype

- `src/App.tsx` renders `<StoreProvider><AppShell /></StoreProvider>`: one provider, one shell, no router, no sign-in.
- `src/store/StoreProvider.tsx` holds `useState<AppState>(initialState)` from `src/data/seed.ts`. `buildActions` wraps 37 transitions from `src/store/transitions.ts`; each action runs synchronously against `stateRef.current`, replaces the whole state, and returns `ActionResult { ok, error?, id? }`, where `error` is the `DomainError` sentence. The provider also keeps `identityId` (starts as `ST-01`), `route` (starts as `today`), and `now` from `demoNow()` refreshed by `window.setInterval(..., 30_000)`.
- `useStore()` is the only data access: 39 component files call it, on 64 lines, reading `state`, `actions`, `route`, `role`, `identity`, `actor`, `now` and `go`.
- `src/store/selectors.ts` derives every list and figure from the whole state on each render: `inStockPieces`, `pureGoldOnFloor`, `openParcels`, `ownerQueues`, `railBadges(s, role, now)`, `identities`, `actorOf`, `wishesDueToday` and others.
- `src/store/transitions.ts` holds the rules as pure functions throwing `DomainError` with a sentence; screens show `r.error` when `r.ok` is false (33 call sites, for example `ScalesRules.tsx` "That did not save.", `QcCheck.tsx` "Could not save the check.").
- `src/nav.ts` defines the 30 route ids, `navFor(role)`, `landingRoute = { staff: 'today', owner: 'decisions', karigar: 'k-jobs' }` and `routeTitles`. `src/components/registry.tsx` maps each route id to a screen; screens read their ids from `useStore().route.params`.
- `src/components/shell/AppShell.tsx` picks the screen from `registry[route.id]`, renders the karigar layout with `RoleChip` and `PhoneFrame`, or the `Rail` with `railBadges`, the branch line ("All branches" or "Main showroom"), the `PricingToggle` dev switch and `RoleChip`, plus `TopBar` below `lg`.
- `src/components/ui/RoleChip.tsx` lists every identity under "Showroom" and "Karigars" and calls `switchIdentity`; `Rail.tsx` and `TopBar.tsx` are presentational; `ValueSlot.tsx` reads `state.settings.pricingEnabled` through `useStore()` and draws nothing while pricing is off.
- No file in `src/` has a loading state, a load-error state, a reconnecting or offline state, a `fetch` call, a suspense boundary or an error boundary. Nothing reaches the screen from another device.
- Reusable as they are: the UI library in `src/components/ui/**` (`Rail`, `TopBar`, `AttentionCard`, `StatusChip`, `WeightReadout`, `ValueSlot`, `OtpPanel`, `Modal`, `DetailDrawer`, `StepFrame`, `QueueReview`, `Button`, `Layout`), every screen's layout and wording, the route ids and titles in `src/nav.ts`, the `registry`, the per-role rail sections, the refusal sentences, and selectors where a screen still needs a client-side recompute after an event.
- Must be built: the typed API client, the query cache and invalidation, the live-subscription hooks and the event-to-query map, the loading, error, reconnecting and offline UI patterns, the signed-in shell with route guard and session end, the account-menu slot replacing `RoleChip`, server-time context instead of `demoNow`, and production builds without the seed, the demo clock and the identity switch.

## 7. Functional requirements

- FR-08-1. Every screen reads its data through the shared API client and query cache; no production screen reads the in-memory store.
- FR-08-2. While a read is in flight and nothing is cached, the screen, card or list shows a loading state, never an empty state.
- FR-08-3. When a read fails, the affected area says what could not be loaded and offers "Try again"; other areas of the screen keep working.
- FR-08-4. When an action is refused by the server, the screen shows the server's sentence where the action was taken and keeps what the user typed.
- FR-08-5. When an action fails on the network, the screen says it may not have been saved and lets the user retry; the retry reuses the idempotency key, so the action is applied at most once.
- FR-08-6. After the user's own action succeeds, the reads it affects are refetched before the screen shows new values.
- FR-08-7. A signed-in client keeps one live connection (EP-07) and maps every catalogue event to the cached reads it affects.
- FR-08-8. When a live event arrives, the affected reads are refetched and open screens update within about 1 second, without a reload.
- FR-08-9. When the live connection or the network drops, every open screen shows "Reconnecting…" within a few seconds and marks its data as possibly out of date.
- FR-08-10. On reconnect, the client catches up from its last sequence number, or refetches every open read when EP-07 signals the gap is too old, and the reconnecting state clears.
- FR-08-11. With no network, the web app shows an offline state and disables actions that need the server, each with a reason; nothing is queued for staff or owner.
- FR-08-12. With no session, the app shows sign-in (EP-04); after sign-in the user lands on `today`, `decisions` or `k-jobs` by role.
- FR-08-13. A route the user's role may not open is refused by the shell and the server; the shell shows the user's landing route instead.
- FR-08-14. When the session expires or "User deactivated or role changed" arrives for the user, the shell clears cached data and returns to sign-in.
- FR-08-15. The rail foot and the karigar shell show the EP-05 account menu; no screen offers an identity switch or the pricing dev switch.
- FR-08-16. Rail badge counts come from the server and update within about 1 second of a relevant event.
- FR-08-17. Screens get the current user, role, branch (if D7) and server time from the shell; no screen uses the demo clock.
- FR-08-18. The sign-in, `staff-directory`, `staff-new` and `security` screens use the data layer, as the worked examples for feature epics.

## 8. Business rules

- BR-08-1. The prototype is the UI contract; screens are kept and rewired from the in-memory store to the API and live channel. [PRODUCTION-SCOPE §2 Front end; §8 Reuse]
- BR-08-2. `useStore()` reads are replaced with API queries and live subscriptions. [PRODUCTION-SCOPE §8 `src/components/**`]
- BR-08-3. The server is authoritative; the browser only displays. [PRODUCTION-SCOPE §1 Authoritative]
- BR-08-4. A change by one person appears on everyone else's screen within about a second, with no refresh. [PRODUCTION-SCOPE §1 Live]
- BR-08-5. Clients refetch authoritative state rather than trusting event payloads. [EP-07 section 7]
- BR-08-6. Screens load under 2 seconds on a shop connection; live events arrive within about 1 second. [PRODUCTION-SCOPE §5 Performance]
- BR-08-7. The demo role switcher is replaced by an account menu. [PRODUCTION-SCOPE §6 EP-05 scope]
- BR-08-8. Hiding a button is not a control; every permission is checked on the server. [PRODUCTION-SCOPE §5 Security]
- BR-08-9. Empty states say what is happening; text is at least 14 px, 15 px on the karigar phone. [UX-SPEC §6]
- BR-08-10. Weights are integers in units of 0.0001 g and are shown in grams to four decimals. [PRODUCTION-SCOPE §5 Precision]
- BR-08-11. Display times in Asia/Kolkata from server UTC. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- No new server tables.
- Client query cache: query key (operation and parameters), data, fetched at, entity versions seen, status (loading, ready, failed, possibly stale).
- Event-to-query map: for each catalogue event, the query keys it invalidates (for example "Piece billed by one staff member" invalidates in-stock pieces, stock totals, Today cards and the sale list).
- Live client state: connection status (connected, reconnecting, offline), last sequence number received.
- Session context in memory only: user id, name, role, branch (if D7), landing route; cleared on sign-out or session end.
- Weights arrive as integers in units of 0.0001 g and are formatted to grams by the existing display helpers; no weight is converted to floating point for storage or comparison.
- No money fields; `ValueSlot` keeps reading the pricing setting, now from the server.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API. This epic
adds no server operation; it consumes these.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Current session | Who am I, role, landing route, branch | Signed-in user (EP-04) |
| Delete | Current session | Sign out from the account menu | Signed-in user (EP-04) |
| Read | Contract version | Detect a browser tab built against an old contract | Any signed-in client (EP-03) |
| Open / Resume | Live connection | Connect and catch up by sequence number | Signed-in user (EP-07) |
| Subscribe | Channels | User, role and entity channels for open screens | Signed-in user, filtered by EP-05 (EP-07) |
| Read | Rail badges | Counts for decisions, leads, parcels and stock | Staff, Owner |
| Any | Feature operations | Every feature epic's reads and actions through the shared client | Per the feature epic |

## 11. Live events

This epic emits none. It consumes the whole PRODUCTION-SCOPE section 1 catalogue on behalf of screens, maps each event
to the reads it affects, and refetches them.

- Consumes: "Piece billed by one staff member" — refetch stock lists, stock totals, Today figures, sale lists and suggestions.
- Consumes: "Parcel stopped (mismatch or raised problem)" — refetch parcel, Decisions and Today reads.
- Consumes: "Edit proposed / token sent" — refetch Decisions and the piece's edit state.
- Consumes: "Edit applied" — refetch the piece, stock lists and floor totals.
- Consumes: "Lead arrived / passed its SLA" — refetch the inbox, Today and Decisions reads and the leads badge.
- Consumes: "Karigar job status changed" — refetch job, tracker, Decisions and karigar phone reads.
- Consumes: "Parcel handed over by karigar" — refetch the parcels list and Today cards.
- Consumes: "Tag saved on a shared parcel" — refetch the parcel's items and untagged count.
- Consumes: "Metal pool changed" — refetch the pool figure on the order-copy and stock screens.
- Consumes: "User deactivated or role changed" — for the signed-in user, clear the cache and return to sign-in; for others, refetch user lists.
- Proposed events from other epics (G26) join the event-to-query map once they are added to the catalogue.

## 12. Screens and UX references

- Cross-cutting: every route id in `src/nav.ts` (all 30, from `today` and `decisions` to `k-jobs`) gets the loading, error, reconnecting and offline behaviour from this epic; feature epics keep their own route mappings.
- Shell: `src/components/shell/AppShell.tsx` (rail, top bar, karigar layout with `PhoneFrame`), the account menu slot in place of `RoleChip`, and the sign-in entry (EP-04, no route id yet).
- Screens moved onto the data layer here as worked examples: sign-in (EP-04), `staff-directory`, `staff-new` (EP-05), `security` (EP-06).
- Mockups: `01-foundations.svg` (the design system the patterns reuse), `10-navigation-map.mmd` (sign-in leading to the three homes), `02-staff-home.svg` and `08-owner-home.svg` (live cards), `13-notifications-escalation.svg` (live owner view), `20-parcel-arrival.svg` and `21-tag-one-item.svg` (several staff on one parcel).
- Not yet designed: the loading state, the read-error state with "Try again", the "Reconnecting…" banner, the offline state, the session-ended state and the account menu (MOCKUP-COVERAGE §3 lists the account menu under EP-05).

## 13. Non-functional requirements

- Performance: a screen shows its first data under 2 seconds on a shop connection; cached screens show data at once and refresh in the background; live changes appear within about 1 second.
- Availability: a dropped connection never leaves a screen silently stale; the reconnecting state appears within a few seconds and clears after catch-up.
- Concurrency: actions carry idempotency keys, so a retry after a network failure is applied at most once; the "already taken" refusals from the server are shown as sentences.
- Security: the session token is never stored where page scripts from other origins can read it; cached data is cleared on sign-out and session end; the shell hides routes a role may not open, and the server still refuses them.
- Personal data: cached customer data lives in memory only and is cleared on sign-out.
- Accessibility: loading, error and reconnecting states are announced to screen readers and meet the UX-SPEC §6 text sizes and touch targets.
- Time: screens use server time for "today", SLA clocks and overdue figures, shown in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03, EP-04, EP-05, EP-07
- Downstream: EP-11, EP-13, EP-14, EP-15, EP-16, EP-17, EP-18, EP-19, EP-20, EP-21, EP-22, EP-23, EP-24, EP-25, EP-26, EP-27, EP-28, EP-29, EP-30, EP-31, EP-32, EP-33, EP-34, EP-35, EP-36, EP-39, EP-40, EP-41, EP-42, EP-43, EP-44.

## 15. Epic acceptance criteria

1. Given a staff member opens `staff-directory` on a slow connection, when the read has not returned, then a loading state shows and no "no staff" empty state appears.
2. Given the server is unreachable, when the owner opens `security`, then the screen says the log could not be loaded and "Try again" loads it once the server is back.
3. Given two browsers signed in as two staff members, when one changes data through a migrated screen, then the other browser's open screen updates within about 1 second without a reload.
4. Given a signed-in browser, when its network is cut for 30 seconds, then "Reconnecting…" appears, and when the network returns it clears and the screen shows every change made meanwhile.
5. Given a signed-in staff member, when the owner deactivates them, then their browser returns to sign-in and shows none of the previous data.
6. Given a production build, when any user signs in, then no screen offers an identity switch or the pricing dev switch, and no data comes from `src/data/seed.ts`.
7. Done when the M1 demo works with the shell: a user signs in, lands on their home, and two browsers see each other's changes live (PRODUCTION-SCOPE §7).

## 16. Risks

- Risk: feature epics wire screens their own way and the patterns drift. Mitigation: one documented pattern, one worked example per pattern, and review against it in every feature epic.
- Risk: an event maps to too few reads and a screen stays stale. Mitigation: keep the event-to-query map in one place next to the catalogue, and test each event in EP-40.
- Risk: refetch storms when many events arrive at once on the owner's screens. Mitigation: coalesce refetches per query within a short window.
- Risk: the prototype's synchronous actions hide timing bugs that appear with a network (double submits, stale forms). Mitigation: disable a submit while it is in flight and reuse its idempotency key on retry.
- Risk: the choice of D3 changes the live client late. Mitigation: keep screens behind this epic's hooks so only the data layer changes.

## 17. Open decisions and questions

- D3: WebSocket or Server-Sent Events from the Node API? It decides how the live hooks connect and how "reconnecting" is detected.
- D6: does any of the karigar offline behaviour reach the web app, or is offline on the web read-only as proposed here?
- D7: does the shell carry a current branch, and can the owner switch it?
- How long may cached data be shown while reconnecting before the screen hides it?
- After how long without a response does a loading state turn into a read error?
- Should staff actions ever be queued offline, or always refused with a reason as proposed here?
- How does an old browser tab learn that the contract changed (EP-03 open question), and is it forced to reload?

## 18. Candidate stories

1. EP-08-S1: Developer can call every API operation through one typed client built from the contract
2. EP-08-S2: System can cache server reads and share them between screens
3. EP-08-S3: User can see a loading state while a screen's data arrives
4. EP-08-S4: User can see a read error with "Try again" when data cannot be loaded
5. EP-08-S5: User can see the server's sentence when an action is refused
6. EP-08-S6: User can retry an action after a network failure without applying it twice
7. EP-08-S7: System can refetch the affected reads after the user's own action
8. EP-08-S8: System can keep one live connection per signed-in client and map every catalogue event to reads
9. EP-08-S9: User can see a screen update by itself when someone else changes something
10. EP-08-S10: User can see "Reconnecting…" when the connection drops and catch up when it returns
11. EP-08-S11: User can see an offline state with server actions disabled
12. EP-08-S12: User can open the app to sign-in and land on their role's home in a signed-in shell
13. EP-08-S13: User can see only the routes their role may open
14. EP-08-S14: User can use the account menu in place of the role switcher
15. EP-08-S15: User can be returned to sign-in when the session ends or is ended
16. EP-08-S16: User can see rail badge counts from the server update live
17. EP-08-S17: Developer can move a screen from `useStore()` onto the data layer by a documented pattern
18. EP-08-S18: Developer can move the sign-in, staff and security log screens onto the data layer
19. EP-08-S19: Developer can ship production builds without the in-memory store, seed, demo clock and identity switch
