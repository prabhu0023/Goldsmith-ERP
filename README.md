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

This starts web on http://localhost:3000 and the api on http://localhost:4000 (`API_PORT`); check http://localhost:4000/health. Editing `packages/shared` reloads web and restarts the api. If either process stops, the other is stopped too and the output names the one that failed. Press Ctrl+C to stop both.

One package only: `npm run dev -w @goldsmith/web` (needs no `.env`) or `npm run dev -w @goldsmith/api`.

## Database (local)

PostgreSQL 17 runs in Docker (`docker-compose.yml`; on macOS use Colima, `colima start`). Add these lines to `.env`:

```sh
DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_dev
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_test
```

The `postgres` / `postgres` credentials are local-only: the container listens on 127.0.0.1 and the same values never go to staging or production.

```sh
npm run db:up       # start PostgreSQL and wait until it is healthy (creates goldsmith_dev and goldsmith_test)
npm run db:migrate  # apply pending migrations from packages/api/migrations; "up to date" when none
npm run db:status   # each migration: number, name, applied time (UTC), checksum, state
npm run db:seed     # load the web prototype's data into an empty database (refuses a non-empty one and production)
npm run db:reset    # drop everything in goldsmith_dev and migrate again (refused when APP_ENV=production)
npm run db:down     # stop the container (data stays in the pgdata volume; `docker compose down -v` deletes it)
```

To start over with demo data: `npm run db:reset && npm run db:seed`.

The api database tests run against `TEST_DATABASE_URL` and wipe that database at the start of each run. Without it they are skipped locally (with a notice); CI always sets it.

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
