# Goldsmith-ERP

JGD Enterprise Suite for Jai Gulab Dev Jewellers. Today the web app is the clickable prototype on in-memory demo data; the api is a minimal Node + TypeScript server that grows from EP-02 onward. Planning documents are in [docs/](docs/).

## Layout

npm workspaces monorepo:

| Package | Folder | What it holds |
| --- | --- | --- |
| `@goldsmith/shared` | `packages/shared` | Pure domain rules (weights, match, leads, edits, clock) and types. No React, no I/O. Used by both web and api. |
| `@goldsmith/web` | `packages/web` | React 19 + Vite 8 + Tailwind 4 app (the prototype). |
| `@goldsmith/api` | `packages/api` | Express + TypeScript API. Health endpoint today; database in EP-02, sign-in in EP-04. |

Do not copy a shared module into web or api: `npm run lint` fails and names the copy.

## Prerequisites

Node 22.18 or newer (the team uses Node 26, see `.nvmrc`) and npm 11.

## Install

```sh
npm ci            # or npm install when you change dependencies
```

## Configure

All configuration comes from environment variables. `.env.example` lists every variable with no values.

```sh
cp .env.example .env
```

Fill in at least `APP_ENV=development`, `APP_URL=http://localhost:3000` and `SESSION_SECRET` (32 or more characters, e.g. `openssl rand -hex 32`). `.env` is git-ignored; never commit a real value. The api refuses to start and names the variable when a required one is missing. Staging and production values are set in the hosting provider's secret store (decision D1a), never in a file.

## Run

```sh
npm run dev
```

This starts web on http://localhost:3000 (`WEB_PORT`) and the api on http://localhost:4000 (`API_PORT`); check http://localhost:4000/health. Editing `packages/shared` reloads web and restarts the api. If either process stops, the other is stopped too and the output names the one that failed. Press Ctrl+C to stop both.

One package only: `npm run dev -w @goldsmith/web` (needs no `.env`) or `npm run dev -w @goldsmith/api`.

Two branches at once on one machine: give each worktree its own lane (`LANE=a`, `LANE=b`) for separate databases and ports. See [docs/setup/parallel-lanes.md](docs/setup/parallel-lanes.md).

The api's endpoints, error format and how to add an operation are in [docs/setup/api.md](docs/setup/api.md). To call it locally before sign-in exists (EP-04), open a development session for a seeded user with `npm run db:dev-session -- "Rajesh Verma"` and send the printed id as the `x-dev-session` header.

## Database (local)

PostgreSQL 17 runs in Docker (`docker-compose.yml`; on macOS use Colima, `colima start`). Add these lines to `.env`:

```sh
DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_dev
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_test
```

The `postgres` / `postgres` credentials are local-only: the container listens on 127.0.0.1 and the same values never go to staging or production.

```sh
npm run db:up       # start PostgreSQL and wait until it is healthy (creates goldsmith_dev and goldsmith_test)
npm run db:create   # create the databases DATABASE_URL and TEST_DATABASE_URL name if missing (e.g. a lane's); safe to repeat
npm run db:migrate  # apply pending migrations from packages/api/migrations; "up to date" when none
npm run db:status   # each migration: version, name, applied time (UTC), checksum, state (applied, pending, changed, missing)
npm run db:new -- <name>  # create an empty packages/api/migrations/YYYYMMDDTHHMM_<name>.sql (UTC time)
npm run db:seed     # load the web prototype's data into an empty database (refuses a non-empty one and production)
npm run db:reset    # drop everything in goldsmith_dev and migrate again (refused unless APP_ENV=development)
npm run db:down     # stop the container (data stays in the pgdata volume; `docker compose down -v` deletes it)
```

To start over with demo data: `npm run db:reset && npm run db:seed`.

New migrations are named `YYYYMMDDTHHMM_<name>.sql` (UTC minute, e.g. `20261121T1030_metal_pool_ledger.sql`), so branches built in parallel never take the same number; `0001` to `0015` keep their names and run first. Rules: [docs/setup/parallel-lanes.md](docs/setup/parallel-lanes.md#migration-names).

The api database tests run against `TEST_DATABASE_URL` and wipe that database at the start of each run, so they refuse any database whose name does not end in `_test`. Without it they are skipped locally (with a notice); CI always sets it.

Weights are stored as integers of 0.0001 g (`48.65 g` is `486500`), converted only with `gramsToUnits` / `unitsToGrams` from `@goldsmith/shared`. Schema, tool choices and the EP-02 acceptance map: [docs/setup/database.md](docs/setup/database.md).

## Check and build

```sh
npm run lint       # Biome lint + shared-duplicate check
npm run typecheck  # tsc --noEmit in every package
npm test           # Vitest in every package
npm run build      # shared, then web (packages/web/dist), then api (packages/api/dist)
npm run clean      # remove every package's dist
```

## CI

`.github/workflows/ci.yml` runs Lint, Typecheck, Test, Build and Secret scan (gitleaks) on every push and pull request. The Test job starts a PostgreSQL 17 service, migrates and seeds it, then runs the database tests. A green run on main stores the build as the `release-<commit sha>` artefact. Merges into main need all five checks green: see [docs/setup/branch-protection.md](docs/setup/branch-protection.md). Where the repository lives and who administers it: [docs/setup/repository.md](docs/setup/repository.md).
