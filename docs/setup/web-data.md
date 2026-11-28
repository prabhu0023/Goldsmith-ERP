# Web data layer (EP-08)

How a screen reads from and writes to the server. The layer is hand-written, with no new runtime dependency (plan decision D-A). A framework-free core (`packages/web/src/query/query-client.ts`, `action-controller.ts`) holds the cache and the action state machine; `use-query.ts`, `use-paged-query.ts` and `use-action.ts` are thin React bindings built on `useSyncExternalStore`. The signed-in shell (`packages/web/src/shell/`) creates one cache, one connection store and one live channel per signed-in person and clears all three at sign-out.

Rules that hold everywhere:

- A screen reads only through `useQuery` or `usePagedQuery` and writes only through `useAction`. It never calls `fetch`, `opsCall` or `authCall` itself, and never imports `store/StoreProvider`, `store/selectors`, `store/transitions` or `data/seed`.
- The server decides. A live event carries ids and versions only; the cache refetches the reads the event affects (BR-08-5).
- Online only (D6). While the connection is down, actions are disabled with a reason and nothing is queued or stored.
- Text is at least 14 px (15 px on the karigar phone) and a state is never shown by colour alone.

## Declaring a query

A read is one contract operation with one input. `defineQuery` gives it a key built from both, so `readPiece` for TAG-8841 and for TAG-8842 are two cache entries that never overwrite each other.

```tsx
import { defineQuery } from '../../query/query-client';
import { useQuery } from '../../query/use-query';

const usersQuery = defineQuery({ op: 'listUsers', input: { pageSize: 200 } });

function Who() {
  const users = useQuery(usersQuery); // { status, data, error, refreshing, refetch }
  return <>{users.data?.items.map((u) => u.name)}</>;
}
```

- `status` is `loading | ready | failed | possibly_stale`. `refreshing` is true while a fetch runs and data is already held, so a refresh never flashes a loading state.
- Two components reading one key send one request. A result that carries an older version of an entity than the entry already holds is dropped (`versionsOf`).
- `enabled: false` never fetches (a karigar has no rail badges).
- A list read page by page uses `usePagedQuery({ op, input })`. Each page is its own entry. A changed `input` (a filter) starts a new chain of pages; `loadMore`, `hasMore`, `loadMoreError` and `refetch` come with it. `pagedBoundaryQuery(list)` turns it into what `QueryBoundary` takes.
- Hand-picked reads belong in the screen's module, next to the `defineQuery` call, not in a shared file.

## Declaring an action and what it affects

An action is one contract operation the person starts. `affects` names the cached reads that change; they are refetched from the server before the action reports success.

```tsx
import { defineAction } from '../../query/action-controller';
import { useAction } from '../../query/use-action';

const createUser = defineAction({ op: 'createUser', affects: () => [{ op: 'listUsers' }] });

const create = useAction(createUser); // { run, retry, busy, refusal, maybeNotSaved }
const answer = await create.run(input); // { ok: true, data, refetchFailed } | { ok: false, code, message, field? }
```

- A ref without `input` matches every cached entry of the operation; with `input` it matches that key only. Reads nobody is showing are only marked and refetch the next time a screen mounts.
- A refusal invalidates nothing, except `conflict`: another change got there first, so the affected reads are refetched and the server's sentence stays.
- The Idempotency-Key is made on the first send and kept only after a network failure. `retry()` resends the same input with the same key, so the server answers the first result and the record is not added twice. A changed input gets a new key. The screen never makes a key itself.
- A second press while the action works sends nothing.
- Sign-in uses `defineAuthAction({ op: 'signIn' })`: no key and no cache to refresh.

## Adding event-to-query entries

`packages/web/src/query/event-query-map.ts` maps every live event to the reads it affects. `EVENT_QUERIES` is typed over `LiveTopic`, so adding a topic to `LIVE_CATALOGUE` fails the typecheck until the new event is mapped.

1. Add the event to `LIVE_CATALOGUE` (see docs/setup/live.md); typecheck now names the missing entry.
2. Add the topic to `EVENT_QUERIES` with the reads it affects, for example `'user.list_changed': () => [R.listUsers]`.
3. A read that exists in the contract goes in `REAL_READS`. A read a later epic will add goes in `PLANNED_READS` with the epic named; a planned name matches nothing until a screen caches a read under it. The test `event-query-map.test.ts` fails when a planned read becomes real without moving.
4. Events inside one 300 ms window give one fetch per read. The user's own action refetches at once and absorbs the event the same change causes.

The one live connection stays `LiveClient` (EP-07); `connectLiveBridge` (`query/live-bridge.ts`) only listens to it.

## Loading, read error, reconnecting and offline states

Use the components in `components/ui`; do not draw these states again.

| Situation | What shows | Component |
| --- | --- | --- |
| First read in flight | "Loading the {label}…" in a `role="status"` line and a skeleton. Never an empty list. | `QueryBoundary label="staff list"` |
| Read finished with no rows | The screen's own empty sentence (the boundary's children). | `QueryBoundary` |
| Read failed | "The {label} could not be loaded." then the server's sentence, and "Try again". Data already held stays under it. A refused read (`forbidden`) says "You may not see this." with no button. | `QueryBoundary`, `ReadError` |
| Connection lost, data on screen | "Possibly out of date" with an icon, until the catch-up refetch settles. | `QueryBoundary`, `ConnectionBanner` |
| Reconnecting or offline | A banner in the shell (both layouts). Every `ActionButton` is disabled with the reason beside it. "Connected again." is announced once. | `ConnectionBanner`, `ActionButton` |

Each area of a screen has its own query and its own boundary, so one failing area leaves the others working. A read that failed while the connection was down stays failed after the connection returns until the person presses "Try again" (or another event refetches it); it is not retried by itself.

## Showing refusal sentences and retry

- The server's sentence is shown as written, beside the action that caused it: `<ActionError refusal={handle.refusal} maybeNotSaved={handle.maybeNotSaved} onRetry={() => void handle.retry()} busy={handle.busy} />`. When the server gives no sentence the action's `fallback` is shown.
- A refusal that names a form field (`answer.field`, for example the duplicate phone number) is shown on that field. What the person typed is never cleared: form state is local to the screen and server data never feeds it.
- After a network failure the sentence is "It may not have been saved. Check the connection and try again." with "Try again". Retry sends the same key.
- Use `ActionButton` for the button. It is disabled and says "Working…" while the action runs, and disabled with the connection's reason while the connection blocks actions.
- A drawer or form that stays open while someone else changes the row keeps what was typed and sends the version it was opened with. The server answers `conflict`, the list is refetched, and the screen shows the notice from `drawerNotice` ("This person was changed by someone else. Your edits are kept.").

## Weights

Weights cross the contract as decimal strings in grams and are stored as integers in units of 0.0001 g. Never use floating point to add, subtract or compare them.

- Convert text to integer units with `gramsToUnits("12.3456")` (123456). It accepts up to four decimals and returns an error for anything else; it is built digit by digit, never as `Number(text) * 10000`.
- Convert back with `unitsToGrams(123456)` ("12.3456"), or show a gram number with `fmtG`, always to four decimals.
- Do the arithmetic on the integer units (`netUnits`), then convert for display.
- The security log shows a changed weight as "48.6500 g → 48.6100 g" through the same helpers (`auditFieldRows`).

## Moving a screen off `useStore()`

Checklist:

1. Read the session from `useSession()` (`can(op)`, `user`, `shopName`, `serverNow()`, `shopToday()`) and navigate with `useNavigation()` (`go`, `route`). Neither needs the prototype store.
2. Declare each read with `defineQuery` or `usePagedQuery`; wrap the area in `QueryBoundary`.
3. Declare each write with `defineAction` and an `affects` list; render it with `ActionButton` and `ActionError`.
4. Add live events the screen needs to `EVENT_QUERIES`.
5. Remove every import of `store/*` and `data/seed`, and delete the path from `ALLOWED` in `scripts/check-store-usage.mjs`.
6. Update the screen's test to use `renderAs(name, role, <Screen />, { queries, connection, permissions })` from `src/test-support/render-as.tsx`. Web tests run in node with `renderToStaticMarkup`; seed a cache with `fakeApi` from `query/test-support.ts`.
7. Run `npm run lint`. It prints "N of M screens still use useStore()" with the file names and fails when a file outside the allow-list imports the store.

Production keeps prototype code out of the bundle: `@prototype` resolves to `src/prototype/index.ts` in dev and test and to `index.production.ts` (empty) in `vite build`. `npm run check:bundle` (also in the CI Build job) fails when the built bundle holds the identity switch, the pricing switch, the demo clock, the demo base date, the prototype store or seed data. An unwired route shows "not wired yet" in production.

## Worked example

| Screen | File | Shows |
| --- | --- | --- |
| Staff list and row actions | `components/people/StaffDirectory.tsx` | `usePagedQuery({ op: 'listUsers' })` inside `QueryBoundary label="staff list"`; one `defineAction` per row action and per drawer form, each with `affects: [{ op: 'listUsers' }]`; the drawer keyed by user id with `drawerNotice`. |
| Filtered, paged read | `components/settings/SecurityLog.tsx` | `usePagedQuery({ op: 'listAuditEntries', input: auditListInput(filters) })`, so a filter change is a new chain; `useQuery` for the "Who" filter and for one entry; "The security log could not be loaded." with "Try again". |
| Create with idempotent retry | `components/people/OnboardStaff.tsx` | `createUser` as an action; the key is held by the controller; duplicate phone on the phone field with name and role kept; success goes to `staff-directory`. |
| Sign-in | `auth/SignInPage.tsx` | `defineAuthAction({ op: 'signIn' })` with `ActionButton`. |

## Acceptance-criteria map

Tests are under `packages/web/src` unless a path starts with `packages/api` or `packages/shared`.

| Story | Where it is met | Test |
| --- | --- | --- |
| S1 typed client, cookie, key on actions, error shape, 401 | `api/api-client.ts` | `api/api-client.test.ts` (AC1 to AC5) |
| S2 one request, entry shape, older version ignored, separate keys | `query/query-client.ts` | `query/query-client.test.ts` (keys, S2 AC1 to AC4) |
| S3 loading, no empty state, per-area, no flash | `components/ui/QueryBoundary.tsx` | `components/ui/states.test.tsx` (loading S3); `components/people/people-screens.test.tsx` |
| S4 read error, Try again, forbidden, time-out | `ReadError.tsx`, `QueryBoundary.tsx` | `states.test.tsx` (read errors S4); `settings/security-log.test.tsx` (S4 AC1, AC2); `api-client.test.ts` (S4 AC5) |
| S5 refusal sentence, values kept, fallback, conflict | `query/action-controller.ts`, `ActionError.tsx` | `query/action-controller.test.ts` (refusal S5); `people/user-rows.test.ts` (`addUserRefusal`) |
| S6 maybe not saved, retry with one key, no second send | `action-controller.ts` | `action-controller.test.ts` (a second press and a lost connection S6) |
| S7 affected reads refetched, own action plus event, one fetch | `action-controller.ts`, `query-client.ts` | `action-controller.test.ts` (success S7); `query-client.test.ts` (S7 AC4) |
| S8 one connection, every event mapped, burst coalesced | `query/event-query-map.ts`, `shell/signed-in-runtime.ts` | `query/event-query-map.test.ts`; `shell/live-bridge.test.ts`; `query-client.test.ts` (S8 AC4, AC5) |
| S9 other browser updates within about 1 s | `user.list_changed` and the map | `packages/api/test/live/user-list-changed.test.ts`; `query/live-bridge.test.ts` (S9 AC2); lane-a run below |
| S10 reconnecting banner, catch-up, refetch_all, expired session | `query/connection.ts`, `live-bridge.ts` | `query/connection.test.ts`; `query/live-bridge.test.ts` (S10); `states.test.tsx` (connection banner) |
| S11 offline disables actions with a reason, nothing queued | `ActionButton.tsx`, `action-controller.ts` | `states.test.tsx` (S11 AC1); `action-controller.test.ts` (offline); `people-screens.test.tsx` (S11 AC1); `auth/auth-screens.test.tsx` (EP-08-S11 AC1) |
| S12 landing by role, server clock, deep link | `shell/navigation.tsx`, `shell/server-time.ts` | `shell/navigation.test.ts`; `shell/session-context.test.tsx` |
| S13 rail from the role, guarded routes | `nav.ts`, `components/shell/AppShell.tsx` | `components/shell/AppShell.test.tsx`; `shell/navigation.test.ts` |
| S14 account menu, no switch, sign-out clears the cache | `components/ui/AccountMenu.tsx`, `shell/SignedInApp.tsx` | `components/ui/account-menu.test.tsx`; `shell/session-end.test.ts` |
| S15 access ended, idle expiry, other user's event | `live-bridge.ts`, `shell/signed-in-runtime.ts` | `shell/session-end.test.ts`; `query/live-bridge.test.ts` (S15) |
| S16 rail badges from the server | `shell/rail-badges.ts` | `shell/rail-badges.test.tsx` |
| S17 pattern document, CI report, weights | this file; `scripts/check-store-usage.mjs` | `packages/api/test/scripts/web-data-doc.test.ts`; `packages/api/test/scripts/check-store-usage.test.ts` |
| S18 four screens on the data layer | `StaffDirectory.tsx`, `OnboardStaff.tsx`, `SecurityLog.tsx`, `SignInPage.tsx` | `people/people-screens.test.tsx`; `settings/security-log.test.tsx`; `auth/auth-screens.test.tsx`; `check-store-usage.test.ts`; lane-a run below |
| S19 production bundle | `src/prototype/*`, `scripts/check-production-bundle.mjs` | `packages/api/test/scripts/check-production-bundle.test.ts`; `components/shell/AppShell.test.tsx` (S14 AC2, S19) |

S19 AC3 (a staging demo) cannot be met yet: staging does not exist (EP-01-S12 waits on D1a). The lane-a run below is the demonstration. See FU-020 in docs/followups.md.

## Lane-a two-browser run (EP-08-S9, S18 AC2)

Run it on lane a only (api 4001, web 3001, database goldsmith_dev_a):

```sh
npm run db:reset && npm run db:seed
npm run db:dev-password -- "Sanjay Seth" "counter-2026"
LANE=a npm run dev
```

1. Open http://localhost:3001 in two isolated browser profiles and sign in as Sanjay Seth (phone 98410 33333) in both. A shop has one owner, so both sessions are the same owner.
2. Open Staff in both. In the first, press "Add a staff member", fill a name, a phone and an email, and submit. The second profile shows the new row without any action.
3. In the first, add a person with an existing phone number. The phone field shows "Another user already signs in with this phone number." and the name, email and role stay as typed.
4. Cut the network in the second profile (DevTools, Network, Offline). The banner says "You are offline. What you see may be out of date. Changes need the server." and every action button is disabled with the reason. Restore it: "Connected again." is announced and the banner clears.
5. Open Security log with the network cut: "The security log could not be loaded." with "Try again". Restore the network and press "Try again": the log loads with no reload.

Result of the run on the day this was written (two isolated Chrome contexts driven through the DevTools protocol, lane a):

- Step 2: the row appeared in the second profile 354 ms after the submit press.
- Step 3: the phone sentence showed on the phone field with name, email and the Staff role kept.
- Step 4: the offline banner and disabled buttons showed. The DevTools "Offline" setting blocks new requests but leaves an already open event stream running, so this run showed "offline", not "Reconnecting…". A change made in the first profile while the second was cut reached the second profile as an event, its refetch failed, and the list showed "The staff list could not be loaded." with "Try again" over the old rows; "Try again" after restoring the network loaded the change. A real network loss closes the stream too, which is the "Reconnecting…" path and is covered by `query/live-bridge.test.ts`.
- Step 5: the error and the recovery showed as described.
