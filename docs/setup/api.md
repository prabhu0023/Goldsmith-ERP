# API (EP-03)

The api (`packages/api`) serves every operation of the shared contract (`packages/shared/src/contract/contract.ts`) through one route. The contract is declared once with zod: the same declaration gives the TypeScript types for web and api and the runtime validator.

## Endpoints

| Method and path | Session | Answer |
| --- | --- | --- |
| `GET /health` | not needed | `{ status, service, env, api, database, shared }`; 200 when the database is up and the shared rules load, else 503. The database check times out after 2 s. |
| `GET /api/contract-version` | needed | `{ ok: true, version }` (`CONTRACT_VERSION`). |
| `POST /api/ops/<operation>` | needed | The operation's result, e.g. `{ ok: true }`. JSON body = the operation's input. |

Production registers one operation today: `markLeadLost` (`{ leadId, reason? }`).

## What happens to a request

`POST /api/ops/<operation>` runs these steps in order (`packages/api/src/pipeline/operation-router.ts`):

1. Body parsing: JSON only, at most `API_MAX_BODY_BYTES` (default 102400). Too large: 413; not JSON: 400.
2. Look up the operation in the contract and the registered handlers. Unknown: `not_found`.
3. Resolve the session (today the development stub, see below; EP-04 replaces it).
4. Rate-limit hook `{ operation, userId, clientAddress }`. Refused: `rate_limited`. The default allows everything; real limits are EP-39.
5. No session: `unauthenticated`.
6. Validate the body against the operation's input schema. Unknown fields are dropped, so a client-sent `by`, `actor`, `at` or `time` never reaches the handler.
7. Check the `Idempotency-Key` header (create operations only).
8. One database transaction: load the shop, build `ctx = { by, at, shop }` from the session and the server clock, run the permission hook, run the handler. Any error rolls everything back; after-commit hooks run only after a commit.
9. Send the result.

## Errors

Every error body is `{ code, message }`, plus `field` for `validation`. The message is a sentence for the user. Bodies never contain stack traces, file paths or database text; unexpected errors are logged on the server only.

| Code | HTTP | When |
| --- | --- | --- |
| `validation` | 400 (413 for a too-large body) | Input does not match the contract; `field` names the input path (`body` for the whole body, `cursor`, `Idempotency-Key`). |
| `unauthenticated` | 401 | No live session. |
| `forbidden` | 403 | The permission hook refused. |
| `not_found` | 404 | The record does not exist in the caller's shop, or the operation does not exist. |
| `conflict` | 409 | Someone else changed the record first (version mismatch). |
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

Send `Idempotency-Key: <1 to 200 printable characters>` with a create. A repeat with the same key, operation and user returns the first result (`{ ok: true, id }`) without creating another record, also when both requests arrive at once. A refused first try leaves no record, so the retry runs again. Keys are kept `IDEMPOTENCY_RETENTION_HOURS` (default 24); `deleteExpiredIdempotencyRecords(pool, now)` removes expired keys (scheduling it is EP-10). Other operation kinds ignore the header.

## Adding an operation

Copy the reference service `packages/api/src/services/mark-lead-lost.ts`:

1. Declare the operation in `packages/shared/src/contract/contract.ts` with `defineOperation({ name, kind, input, result, errors })`. Inputs never contain `by`, `actor`, `at` or `time`; weight fields end in `G` and use `weightG`.
2. Write `packages/api/src/services/<operation-name>.ts` exporting a `Handler<typeof contract.<name>>`. Take the actor, time and shop from `ctx`, query with `tx.client` scoped to `ctx.shop.shopId`, take rules from `@goldsmith/shared`, write with `insertScoped` / `updateVersioned`, throw `NotFoundError(entity, code)` for a missing record.
3. Register it in `packages/api/src/services/index.ts`. A handler the contract does not declare stops the app at startup.
4. Test it over HTTP like `packages/api/test/services/mark-lead-lost.test.ts`.

Never name an api file after a shared module (`contract.ts`, `leads.ts`, `clock.ts`, ...): `npm run lint` refuses it.

## Calling the api locally

Sign-in is EP-04. Until then, in development only, a session comes from the database: `npm run db:dev-session -- "<user name>"` opens a 12 h session for a seeded user and prints its id; send it as the `x-dev-session` header. The stub is refused when `APP_ENV` is `staging` or `production`, where every operation answers `unauthenticated`.

```sh
npm run db:reset && npm run db:seed
npm run db:dev-session -- "Rajesh Verma"     # prints the session id
npm run dev -w @goldsmith/api
curl -s localhost:4000/health
curl -s -X POST localhost:4000/api/ops/markLeadLost \
  -H 'content-type: application/json' -H 'x-dev-session: <session id>' \
  -d '{"leadId":"LD-2026-213","reason":"Customer went elsewhere."}'
# {"ok":true}
curl -s -X POST localhost:4000/api/ops/markLeadLost \
  -H 'content-type: application/json' -H 'x-dev-session: <session id>' \
  -d '{"leadId":"LD-2026-201"}'
# {"code":"rule_refused","message":"A converted lead cannot be marked lost."}  (HTTP 422)
```
