# Parallel lanes (two branches on one Mac)

A lane is a second (or third) checkout of the repository, a git worktree on its own branch, that builds, tests and runs next to the others without touching their databases or ports. One variable selects it: `LANE`, a single lower-case letter. With `LANE` unset everything works as before.

| | Default (no `LANE`) | `LANE=a` | `LANE=b` |
| --- | --- | --- | --- |
| Development database | `goldsmith_dev` | `goldsmith_dev_a` | `goldsmith_dev_b` |
| Test database (wiped by `npm test`) | `goldsmith_test` | `goldsmith_a_test` | `goldsmith_b_test` |
| api port (`API_PORT`) | 4000 | 4001 | 4002 |
| web dev port (`WEB_PORT`) | 3000 | 3001 | 3002 |

Lane `n` gets ports 4000 + n and 3000 + n (a = 1, b = 2, … z = 26). The lane is added to the database names in `DATABASE_URL` and `TEST_DATABASE_URL`, so a lane's `.env` keeps the same URLs as the main checkout. The test database is `goldsmith_<lane>_test` rather than `goldsmith_test_<lane>` so that it still ends in `_test`: the test wipe guard (`packages/api/test/db/test-db-guard.ts`) refuses every other name. A URL that already names the lane's database is kept as it is. An `API_PORT` or `WEB_PORT` that is set wins over the lane default. The code is in `packages/api/src/lane.ts` (api, database commands, tests) and `packages/web/vite.config.ts` (web port).

## Create a lane

From the main checkout (`.worktrees/` is git-ignored):

```sh
git fetch origin
git worktree add .worktrees/lane-a -b <branch> origin/main
cp .env .worktrees/lane-a/.env
cd .worktrees/lane-a
npm ci
```

Then add these lines to the lane's `.env` (it is git-ignored like every `.env`; never commit it):

```sh
LANE=a
APP_URL=http://localhost:3001
```

Leave `DATABASE_URL`, `TEST_DATABASE_URL`, `API_PORT` and `WEB_PORT` as they are in the main checkout's `.env` (local docker-compose values: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_dev`, `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/goldsmith_test`, ports empty). Lane b is the same with `.worktrees/lane-b`, `LANE=b` and port 3002.

Create the lane's databases, then load them:

```sh
npm run db:create                      # creates goldsmith_dev_a and goldsmith_a_test if missing; safe to repeat
npm run db:reset && npm run db:seed    # the lane's development database only
npm test                               # wipes and migrates goldsmith_a_test only
```

`db:create` creates the databases that `DATABASE_URL` and `TEST_DATABASE_URL` name, after the lane is applied, and prints `Created` or `Exists` for each. It never drops anything, so it is safe on a Docker volume that already holds data. The database commands print `Lane a: database goldsmith_dev_a` first, so you can see which database they act on.

## Run lanes at the same time

One PostgreSQL container serves every lane. Start and stop it from the main checkout only (`npm run db:up`, `npm run db:down`); `db:up` from a worktree can recreate the container (its mount path differs), though the data volume stays.

Then, in each checkout's own terminal:

```sh
npm run dev       # main: web 3000, api 4000; lane a: 3001 / 4001; lane b: 3002 / 4002
npm test          # each lane wipes only its own test database
```

Check each api with `curl http://localhost:4001/health` (lane a) or `curl http://localhost:4002/health` (lane b).

## Migration names

New migrations are named with the UTC minute they were created, in the format `YYYYMMDDTHHMM_<name>.sql`, for example `20261121T1030_metal_pool_ledger.sql`. `<name>` uses only `a-z`, `0-9` and `_`. Create one with:

```sh
npm run db:new -- metal_pool_ledger    # writes packages/api/migrations/<UTC timestamp>_metal_pool_ledger.sql
```

Then write the SQL into that file. The existing `0001_…` to `0015_…` keep their names and always run first: the runner applies files in file-name order, and a four-digit name sorts before every timestamp. Never add another four-digit file, and never rename or edit a migration after it is applied anywhere.

Two branches merge in either order, so a migration from the branch merged second can have an earlier timestamp than one already applied. The runner applies every file that has no history row, even one that sorts before an applied file, and `npm run db:status` lists it as `pending` until then. `db:status` also shows `applied`, `changed` (file edited after it was applied) and `missing` (applied, but the file is gone); `db:migrate` stops on `changed` or `missing` before applying anything. Two files with the same timestamp stop the run with an error naming both: run `db:new` again on the branch not yet merged and move its SQL into the new file.

The history table `schema_migrations` stores the version as a number: `7` for `0007`, `202611211030` for `20261121T1030`. On a database migrated before timestamp names existed, the next `db:migrate` widens that column from `integer` to `bigint` and keeps its rows.

## Merge order

Each lane has its own pull request. When both are ready:

1. Merge the first PR whose five checks (Lint, Typecheck, Test, Build, Secret scan) are green.
2. Rebase the other branch onto the new main: `git fetch origin && git rebase origin/main`, then `git push --force-with-lease`.
3. Let CI run again on the rebased branch. CI tests one database, `goldsmith_test`, with every migration of both branches, in name order.
4. Merge it once all five checks are green again.

After the rebase, run `npm run db:migrate` in the lane to apply the other branch's migrations to its development database.

## Remove a lane

```sh
git worktree remove .worktrees/lane-a
```

Its databases stay until you drop them, for example with `docker compose exec postgres dropdb -U postgres goldsmith_dev_a`.
