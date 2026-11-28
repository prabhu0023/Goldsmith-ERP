# Testing (EP-40)

One command per suite, from the repository root. Every command works in a lane: set `LANE` in `.env` (see `docs/setup/parallel-lanes.md`) and the tests use that lane's `goldsmith_<lane>_test` database and bucket.

| What | Command | Needs |
| --- | --- | --- |
| Everything CI runs | `npm run lint && npm run typecheck && npm test && npm run build` | Postgres and the object store (`npm run db:up`, `npm run storage:up`) |
| Shared domain (weights, match, edit tokens, permissions) | `npm test -w @goldsmith/shared` | Nothing |
| Web | `npm test -w @goldsmith/web` | Nothing |
| Api | `npm test -w @goldsmith/api` | Postgres and the object store |
| One api folder or file | `npm test -w @goldsmith/api -- test/pipeline` | Same |
| Lint, including the focused-test guard | `npm run lint` | Nothing |
| Secret scan | `gitleaks git --config .gitleaks.toml --redact --no-banner .` | gitleaks |

The api global setup wipes and migrates the `_test` database once per run, so two api test runs in the same lane must not overlap.

## Rules the suites keep

- Weights are asserted as integers (stored units of 0.0001 g, comparison units of 0.00001 g). `no-float-tolerance.test.ts` fails if a test uses a float closeness matcher.
- Tests never read the real clock for a rule; they pass a fixed `now` or a test clock.
- A focused test (`.only`, `fit`, `fdescribe`) fails `npm run lint` (`scripts/check-focused-tests.mjs`).
- A skipped database suite is a hard error in CI.

## The operation coverage manifest

`packages/api/test/manifest/operation-coverage.test.ts` lists every operation in the production and sign-in contracts with the test file that proves success, validation refusal, rule refusal and permission. It fails when an operation has no row, when a row names an operation that no longer exists, or when a cited file is missing, does not name the operation or shows no case for the column.

To add an operation:

1. Write its tests: a success, a refusal for each rule, a validation failure, and each role that must be refused.
2. Add one row to `MANIFEST` with the file for each column. A cell with nothing to test is `{ na: 'reason' }`.
3. The permission column is `permissions/role-matrix.test.ts`, which loops over the whole contract; the validation column can be `manifest/validation-matrix.test.ts`, which sends an empty body to every operation with a required field.
4. Run `npm test -w @goldsmith/api -- test/manifest`.

`permissions/shop-scoping.test.ts` checks that a user of one shop never sees another shop's records through any list or read operation. Add the new list or read operation to its `CALLS` list.

## Races

`packages/api/test/support/concurrency.ts` has `releaseTogether(calls)`, which starts the calls on one barrier so their HTTP requests overlap, and `expectExactlyOne(results)`, which returns the winner and the losers. Repeat a race test to look for flakes:

```
for i in $(seq 20); do npm test -w @goldsmith/api -- test/pipeline/concurrent-stock-out.test.ts || break; done
```

## Run record in CI

Each test step writes a JSON report to `test-results/<suite>.json` (git-ignored). The step `Test run record` runs `node scripts/test-run-record.mjs`, which adds a table of commit, suite, passed, failed, skipped and duration to the job summary. Run it locally after a JSON run:

```
npm test -w @goldsmith/shared -- --reporter=default --reporter=json --outputFile.json=$PWD/test-results/shared.json
node scripts/test-run-record.mjs
```

## Not built yet

See `docs/followups.md` (FU-019 to FU-025): end-to-end tests on staging, the deploy gate, service-level match and edit tests, race tests on real operations, the currency rendering test and log redaction.
