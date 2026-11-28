# API (EP-03)

The api (`packages/api`) serves every operation of the shared contract (`packages/shared/src/contract/contract.ts`) through one route. The contract is declared once with zod: the same declaration gives the TypeScript types for web and api and the runtime validator.

## Endpoints

| Method and path | Session | Answer |
| --- | --- | --- |
| `GET /health` | not needed | `{ status, service, env, api, database, shared }`; 200 when the database is up and the shared rules load, else 503. The database check runs on its own probe connection (not a pool slot) and times out after 2 s. |
| `GET /api/contract-version` | needed | `{ ok: true, version }` (`CONTRACT_VERSION`). |
| `POST /api/ops/<operation>` | needed | The operation's result, e.g. `{ ok: true }`. JSON body = the operation's input. |
| `POST /api/auth/<operation>` | depends on the operation | Sign-in operations (EP-04), see [Sign-in](#sign-in-ep-04). |
| `GET /dev/mailbox`, `GET /dev/mailbox.json` | not needed | The account-email stub's mailbox; development and staging only. |
| `POST /api/files?…`, `GET /api/files/<FILE-code>/<size>?exp=…&sig=…` | upload needed, download not (signed link) | File upload and download (EP-09), see [files.md](files.md). |
| `GET /api/live` | needed (cookie) | The live channel's Server-Sent Events stream (EP-07); 401 `unauthenticated` without a live session, 403 for a foreign `Origin`. See [live.md](live.md). |
| `POST /api/dev/live/emit` | needed | The live channel's test-event stub `{ event, entityId }` (EP-07-S12); development and staging only, karigar refused. |

Production registers one operation today: `markLeadLost` (`{ leadId, reason? }`).

With file storage configured (EP-09) the api also registers `readFileLinks`, `createAttachment`, `deleteAttachment` and `listAttachments`; without it they answer `not_found`. Inputs, answers and refusal codes: [files.md](files.md).

## What happens to a request

`POST /api/ops/<operation>` runs these steps in order (`packages/api/src/pipeline/operation-router.ts`):

1. Body parsing: JSON only, at most `API_MAX_BODY_BYTES` (default 102400). Too large: 413; not JSON: 400.
2. Look up the operation in the contract and the registered handlers. Unknown: `not_found`.
3. Resolve the session from the `gs_session` cookie (EP-04). A session counts only when it has not ended or expired, its user is active and the user's role is still the role it was issued for.
4. Rate-limit hook `{ operation, userId, clientAddress }`. Refused: `rate_limited`. The default allows everything; real limits are EP-39.
5. No session: `unauthenticated`. Then the permission hook with the session's actor (see Permissions below). Refused: `forbidden`, before the body is validated or a transaction opens.
6. Validate the body against the operation's input schema. Unknown fields are dropped, so a client-sent `by`, `actor`, `at` or `time` never reaches the handler.
7. Check the `Idempotency-Key` header (create operations only).
8. One database transaction: load the shop, build `ctx = { by, at, shop }` from the session and the server clock, run the handler. Any error rolls everything back; after-commit hooks run only after a commit.
9. Send the result.

## Errors

Every error body is `{ code, message }`, plus `field` for `validation`. The message is a sentence for the user. Bodies never contain stack traces, file paths or database text; unexpected errors are logged on the server only.

| Code | HTTP | When |
| --- | --- | --- |
| `validation` | 400 (413 for a too-large body, 415 for a body not in UTF-8 or in an unsupported content encoding) | Input does not match the contract; `field` names the input path (`body` for the whole body, `cursor`, `Idempotency-Key`). Every body-parser error with a 4xx status answers `validation` on `body` with that status and is not logged as unexpected. |
| `unauthenticated` | 401 | No live session. |
| `forbidden` | 403 | The permission hook refused. |
| `not_found` | 404 | The record does not exist in the caller's shop, or the operation does not exist. |
| `conflict` | 409 | Someone else changed the record first (version mismatch), or an `Idempotency-Key` is reused with a different input (see below). |
| `rule_refused` | 422 | A shared domain rule refused (`DomainError`). |
| `rate_limited` | 429 | The rate-limit hook refused. |
| `internal` | 500 | Anything unexpected: "Something went wrong on the server. Please try again." |

The codes are the shared `ERROR_CODES` union, used by web and api.

## Success and page shapes

- Commands: `{ ok: true }`.
- Creates: `{ ok: true, id }`, where `id` is the record's human code.
- Lists: `{ ok: true, items, nextCursor, pageSize }`. Input `{ cursor?, pageSize? }`; default 50, at most 200 (larger values are clamped). `nextCursor` is `null` on the last page.

Weights travel as decimal strings in grams (`"12.3456"`, at most four decimals; more is refused, never rounded). Times are ISO 8601 UTC strings.

## Ids

Database primary keys are uuids and never leave the server. The api's ids are the per-shop human codes (`LD-2026-214`, `BATCH-2026-045`, `TAG-8841`). New codes come from `nextCode()` (`packages/api/src/db/codes.ts`, table `code_counters`), so parallel creates never collide. The year in a code is the UTC year of the server clock.

Cursors are opaque base64url text holding the sort time and row id of the last row returned (keyset paging), so pages stay stable when rows are inserted between calls.

## Idempotent creates

Send `Idempotency-Key: <1 to 200 printable characters>` with a create. A repeat with the same key, operation and user returns the first result (`{ ok: true, id }`) without creating another record, also when both requests arrive at once. A refused first try leaves no record, so the retry runs again. The record stores a SHA-256 hash of the validated input (canonical JSON, keys sorted; unknown fields are stripped before hashing). A repeat with the same key, operation and user but a different input is refused with `409 { code: 'conflict', message: 'This Idempotency-Key was already used for a different request. Send it again with a new key.' }` and creates nothing; the code is the existing `conflict`, so the contract's error list is unchanged. Keys are kept `IDEMPOTENCY_RETENTION_HOURS` (default 24); `deleteExpiredIdempotencyRecords(pool, now)` removes expired keys (scheduling it is EP-10). Other operation kinds ignore the header.

## Adding an operation

Copy the reference service `packages/api/src/services/mark-lead-lost.ts`:

1. Declare the operation in `packages/shared/src/contract/contract.ts` with `defineOperation({ name, kind, input, result, errors })`. Inputs never contain `by`, `actor`, `at` or `time`; weight fields end in `G` and use `weightG` (non-negative; "-1.0000" is refused as `validation`). Only a signed difference, a field ending in `DeltaG` or `GapG` such as a ledger delta or the gap between two weighings, uses `signedWeightG`.
2. Write `packages/api/src/services/<operation-name>.ts` exporting a `Handler<typeof contract.<name>>`. Take the actor, time and shop from `ctx`, query with `tx.client` scoped to `ctx.shop.shopId`, take rules from `@goldsmith/shared`, write with `insertScoped` / `updateVersioned`, throw `NotFoundError(entity, code)` for a missing record.
3. Register it in `packages/api/src/services/index.ts`. A handler the contract does not declare stops the app at startup.
4. Test it over HTTP like `packages/api/test/services/mark-lead-lost.test.ts`.

Never name an api file after a shared module (`contract.ts`, `leads.ts`, `clock.ts`, ...): `npm run lint` refuses it.

## Permissions (EP-05)

- **The list.** `packages/shared/src/permissions/permissions.ts` holds the fixed permission list for the three roles: `OPERATION_RULES` gives each operation the roles allowed to call it and the sentence a refusal shows. `roleMay(role, op)`, `refusalFor(op)` and `permissionsFor(role)` read it; `signIn` and `readCurrentSession` return `permissionsFor(role)` as `permissions`, which the web uses only to hide buttons.
- **Adding a rule.** A new contract operation needs one `OPERATION_RULES` entry, e.g. `myOp: ownerOnly('Only the owner can …')`. `npm run typecheck` fails with "Property 'myOp' is missing" until it has one. An operation the prototype has but the contract does not yet declare is listed in `PLANNED_OPERATIONS`; delete it there when it is ported.
- **Deny by default.** An operation with no entry is refused for every role with "You are not allowed to do this.".
- **Where it runs.** `matrixPermissionCheck` (`packages/api/src/auth/permission-check.ts`) is the app's default permission hook. The operation router calls it right after the session check (step 5 above), with `{ id, name, role }` from the session, never from the body, so a refused call reads and writes nothing. Sign-in operations are not role-gated (`AUTH_OPERATION_ACCESS`).
- **Karigar scope.** A karigar reads only their own jobs (`listMyJobs`, `readMyJob`). Filter in SQL by `callerKarigarId(tx, ctx)` (`packages/api/src/auth/karigar-scope.ts`), the karigar record on the caller's user row; another karigar's record answers `not_found`, not `forbidden`.
- **User operations** (owner only, `packages/api/src/users/`): `createUser` (a create; mails the activation link), `resendActivation`, `updateUserProfile`, `updateUserRole`, `deactivateUser`, `reactivateUser`, `unlockUser`, `linkKarigar` and `listUsers`. `userId` is the user's uuid and `karigarId` the karigar code ("KG-04"); writes other than resend and unlock take the user's `version`. Each write locks the shop row first, so one shop always has exactly one owner ("The shop already has an owner.", "The shop needs its owner."), and writes its lifecycle audit entry (masked phones and emails) in the same transaction.
- **Karigar operations (EP-16)** (`packages/api/src/karigars/`, details in `docs/setup/karigars.md`): `onboardKarigar` (a create, returns the `KG-NN` code), `updateKarigarDetails`, `updateKarigarWastage`, `updateKarigarStatus`, `linkKarigarAccount`, `listKarigars` and `readKarigarScorecard` are owner only. `listKarigarPicker` is for staff and owner, and `readMyKarigarProfile` for the karigar (their own record, found through `callerKarigarId`). `karigarId` is the code. Writes take the karigar's `version`; each writes one audit entry in the same transaction. Handlers that touch a linked user lock the shop row first, then the karigar row. `assertKarigarActive` (shared by the later order-copy and parcel-arrival work) takes the karigar row `for share`.
- **`user.list_changed`.** Each of the seven user writes (`createUser`, `updateUserProfile`, `updateUserRole`, `deactivateUser`, `reactivateUser`, `unlockUser`, `linkKarigar`) also adds one `user.list_changed` row in the same transaction (`emitUserListChanged`, `packages/api/src/users/user-live.ts`): the user's id and version, no phone, name or email. It goes to `role:owner`, so an owner's other browser refreshes its staff list within about a second (EP-08). A rolled-back write adds nothing. `resendActivation` changes nothing a list shows and emits nothing.
- **`user.access_changed`.** A role change or deactivation ends every open session of the user and adds one `user.access_changed` row to `outbox_events` in the same transaction: `{ userId, reason: 'deactivated' | 'role_changed', role?, at }`, ids only. The live channel (EP-07) delivers it as "User deactivated or role changed" to that user's open streams, then closes them (`closed access_changed`). The user's next request is refused as `unauthenticated` either way.

## Background refresh (EP-08)
A request with the header `X-Background-Refresh: 1` (`BACKGROUND_REFRESH_HEADER` in `packages/shared/src/contract/define-operation.ts`) marks a re-read the browser makes on its own, such as a refetch after a live event. For a `read` or `list` operation and for `readCurrentSession`, the server checks and row-locks the session but does not extend its idle expiry, so an unattended tab still times out (EP-04-S12; closes FU-017). An ended or expired session still answers 401 and is not revived. A `create` or `command` ignores the header and extends the session as usual.
## Piece read (EP-08)
`readPiece` (read, shop floor: staff and owner, a karigar is refused `forbidden`, `packages/shared/src/contract/pieces-contract.ts`): `{ tagNo }` → `{ ok, piece: { tagNo, name, kind, collection, style, purity, huid, grossG, stoneG, stoneCount, size, status, version, inStockAt, soldAt, note } }`. Weights are four-decimal gram strings; there is no price field. An unknown tag, or one of another shop, answers `not_found`. It is the live entity cache's read for `piece` events (closes FU-013) and writes no audit entry.
## Live channel (EP-07)

The browser's side of the live channel is ordinary operations, all with the rule `shopFloor` (staff and owner; a karigar is refused `forbidden`): `subscribeLiveChannel` / `unsubscribeLiveChannel` `{ connectionId, channel }`, `joinParcelPresence` (also the presence heartbeat) / `leaveParcelPresence` `{ connectionId, parcelId }`, and `readRailBadges` `{}` → `{ ok, badges: { decisions?, leads?, parcels?, stock? } }` for the caller's role. The browser makes these calls on its own, so they are declared `extendsSession: false` (an optional field of the operation definition): the router checks and row-locks the session but does not extend its idle expiry (EP-04-S12). A service records a live event with `emitLiveEvent(tx, shop, topic, …)` in its own transaction. Protocol, catalogue and timings: [live.md](live.md).

## Audit log and settings (EP-06)
- **`setSetting`** (command, owner only, "Only the owner can change the rules."): `{ key, value }` with `key` one of `pricingEnabled`, `leadSlaHours`, `requireEditToken`, `notifyChannels`, `lateLeadAudience`, `autoSendWishes`; `value` is parsed with the key's schema (`SETTING_VALUE_SCHEMAS`, a wrong shape is `validation` on field `value`). `leadSlaHours` below 1 answers `rule_refused` "The lead timer must be at least 1 hour.". A change writes one `setting_changed` entry (before and after hold the key's old and new value); the value already stored answers `{ ok: true }` and writes nothing.
- **`listAuditEntries`** (list, owner only, "Only the owner can read the security log."): `{ cursor?, pageSize?, group?, entity?, actorId?, actorRole?, from?, to? }`. `group` is one of `AUDIT_GROUP_IDS` (`all` filters nothing); `entity` matches the entry's entity id or its reference; `actorRole: 'system'` lists job and integration entries; `from` and `to` are shop dates (`YYYY-MM-DD`, Asia/Kolkata, both inclusive), and `to` before `from` is `validation` on field `to`. Newest first on `(at desc, id desc)` with the shared cursor; every filter applies to every page. Items: `id`, `at` (UTC ISO), `atLocal` (`+05:30`), `kind`, `entityType`, `entityId`, `ref`, `actorId`, `actorName`, `actorRole`, `summary`, `tokenUsed`.
- **`readAuditEntry`** (read, owner only): `{ id }` → `{ ok, entry }` with the item fields plus `before`, `after` (weights in units of 0.0001 g), `reason`, `detail`, `tokenReference` (the token's record id, never the token) and `corrects` (`{ id, kind, at }` of the earlier entry when this one is a correction, else null). An id that is not a uuid or not an entry of the shop answers `not_found` "Audit entry <id> was not found.".
- No operation changes or removes an audit entry. How entries are written: [audit.md](audit.md).

## Sign-in (EP-04)

Sign-in has its own router, `POST /api/auth/<operation>` (`packages/api/src/auth/auth-router.ts`), because these calls may run without a session and set or clear the session cookie. The operations are declared in `packages/shared/src/contract/auth-contract.ts` (`authContract`); errors use the same `{ code, message, field? }` body. The shop of a public call is the installation's only shop, never the client's.

| Operation | Session | Input | Answer |
| --- | --- | --- | --- |
| `signIn` | not needed | `{ phone, password, deviceLabel? }` | `{ ok, user: { userId, name, role }, landingRoute, permissions, shopName, serverTime }` and sets the cookie (`shopName` is the shop's name, `serverTime` the server's ISO time, EP-08). A wrong password, an unknown, pending or deactivated phone: 401 "Phone number or password is wrong.". |
| `readCurrentSession` | needed | `{}` | The same as `signIn` (including `shopName` and `serverTime`); extends the session, unless the request carries `X-Background-Refresh: 1` (see below). |
| `signOut` | needed | `{}` | `{ ok: true }`; ends the session and clears the cookie. |
| `requestPasswordReset` | not needed | `{ phone }` | Always `{ ok: true }`; only an active user with that phone gets a reset email. |
| `checkPasswordLink` | not needed | `{ token, purpose: 'activation' \| 'reset' }` | `{ ok: true, state: 'valid' \| 'used' \| 'expired' }`. Unknown and replaced links are `expired`. |
| `activateAccount` | not needed | `{ token, password }` | `{ ok: true }`; sets the first password and makes the user active. |
| `resetPassword` | not needed | `{ token, password }` | `{ ok: true }`; sets the new password and ends every open session of the user. |
| `createFirstOwner` | not needed | `{ name, phone, email }` | `{ ok: true }`; only while the shop has no owner and setup is not complete (the setup wizard, EP-45). Then 422 "The first owner has already been created.". |

`issueActivationLink`, `unlockAccount` and `revokeAllSessions` are server-only functions (EP-05, EP-45) with no route.

- **Phone:** an Indian mobile number in any common form ("98410 11111", "+91 98410 11111", "09841011111"), normalised to E.164.
- **Passwords:** at least 8 characters, stored as scrypt hashes (`$scrypt$ln=15,r=8,p=3$<salt>$<hash>`; N = 2^15, r = 8, p = 3). The plain password is never stored or logged.
- **Cookie:** `gs_session=<token>; Path=/; HttpOnly; SameSite=Lax`, plus `Secure` outside development. The token is 32 random bytes; only its sha256 is stored (`sessions.token_hash`).
- **Expiry:** sliding; a session ends `SESSION_IDLE_MINUTES` (default 720) after the last accepted operation.
- **Lockout:** 5 wrong passwords in a row lock the account (or an unknown phone) for 15 minutes: 422 "Too many wrong passwords. Try again after HH:MM." (Asia/Kolkata).
- **Rate limits:** per hashed phone and per client address, in fixed windows stored in `auth_rate_counters`, for `signIn` and `requestPasswordReset`. Over a limit: 429 "Too many requests. Wait a few minutes and try again.".
- **Links:** activation links last 24 hours and reset links 1 hour; each works once, and a new link replaces the earlier unused one. The token is in the URL fragment (`<APP_URL>/activate#token=…`, `<APP_URL>/reset-password#token=…`) and is stored only as its sha256.
- **Account email:** `ACCOUNT_EMAIL_MODE=stub` (the default outside production) keeps the last 50 emails in the api's memory, readable at `http://localhost:<API_PORT>/dev/mailbox` (and `/dev/mailbox.json`); the console line names the subject and the masked address, never the link. In production the mode defaults to disabled (sending fails) and `stub` stops the server at startup. A real sender is EP-11-S12.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ACCOUNT_EMAIL_MODE` | `stub`, or disabled in production | Account-email delivery; only `stub` today. |
| `SESSION_IDLE_MINUTES` | 720 | Idle time after which a session ends. |
| `AUTH_RATE_WINDOW_MINUTES` | 15 | Length of a rate-limit window. |
| `AUTH_SIGN_IN_PER_PHONE` | 10 | Sign-in attempts per phone per window. |
| `AUTH_SIGN_IN_PER_DEVICE` | 30 | Sign-in attempts per client address per window. |
| `AUTH_RESET_PER_PHONE` | 3 | Reset requests per phone per window. |
| `AUTH_RESET_PER_DEVICE` | 10 | Reset requests per client address per window. |

`SESSION_SECRET` keys the HMAC of phones and client addresses in the rate-limit and lockout tables.

## Calling the api locally

Every operation needs the `gs_session` cookie. Seeded users are `pending_activation` with no password, so give one a password first. Both commands below run in development only (`APP_ENV=development`). A lane uses its own api port (4001 for lane a, see `docs/setup/parallel-lanes.md`).

```sh
npm run db:reset && npm run db:seed
npm run db:dev-password -- "Rajesh Verma" "counter-2026"   # sets the password; the user becomes active
npm run dev -w @goldsmith/api
curl -s localhost:4000/health
curl -s -c /tmp/jar -X POST localhost:4000/api/auth/signIn \
  -H 'content-type: application/json' -d '{"phone":"98410 11111","password":"counter-2026"}'
curl -s -b /tmp/jar -X POST localhost:4000/api/ops/markLeadLost \
  -H 'content-type: application/json' \
  -d '{"leadId":"LD-2026-213","reason":"Customer went elsewhere."}'
# {"ok":true}
curl -s -b /tmp/jar -X POST localhost:4000/api/ops/markLeadLost \
  -H 'content-type: application/json' -d '{"leadId":"LD-2026-201"}'
# {"code":"rule_refused","message":"A converted lead cannot be marked lost."}  (HTTP 422)
```

Without signing in, `npm run db:dev-session -- "Rajesh Verma"` opens a 12 h session for an active user and prints its token; send it as `curl -b 'gs_session=<token>' …`.

Activation and reset emails go to the stub mailbox: after `curl -s -X POST localhost:4000/api/auth/requestPasswordReset -H 'content-type: application/json' -d '{"phone":"98410 11111"}'`, open `http://localhost:4000/dev/mailbox` for the link.
