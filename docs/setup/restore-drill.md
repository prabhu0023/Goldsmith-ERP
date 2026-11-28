# Restore drill (EP-38-S8)

A drill proves that a backup can be restored, that the audit log came back complete, and that people know what to do afterwards. Run it before go-live, after any change to the backup tools, and at the interval the owner sets (open question, [FU-018](../followups.md)). Commands and choices are in [backup.md](backup.md). Every restore goes into a throwaway database whose name carries the lane, never over the live one.

The expected times below are estimates for the local drill on the seeded data. The target for the whole drill is 60 minutes, provisional until the owner decides the number; the first recorded drill replaces these estimates.

## The eight steps

| # | Step | Who | Expected time | Local command or action |
| --- | --- | --- | --- | --- |
| 1 | Pick the restore point | Operator | 2 min | `npm run backup:list`; choose a complete `daily full` run (or `latest`). Write its id down. |
| 2 | Get approval | Owner | 5 min | The owner agrees to the restore point and to the work that will be redone. Production needs a named approver (open question); locally the owner says yes in chat or on paper and the operator notes it. |
| 3 | Restore the database | Operator | 2 min | `npm run restore:db -- --backup <id\|latest> --target goldsmith_restore_c` |
| 4 | Restore the files | Operator | 2 min | `npm run restore:files -- --backup <files run id\|latest> --bucket goldsmith-restore-c` |
| 5 | Check file references | Operator | 1 min | `npm run check:files -- --target goldsmith_restore_c --bucket goldsmith-restore-c`; then open one file through a signed link (below). |
| 6 | Check the audit log | Operator | 1 min | `npm run check:audit -- --backup <id\|latest> --target goldsmith_restore_c --source` |
| 7 | Reconnect clients | Operator | 10 min | Start the api against the copy and run the smoke test (below). In AWS this is the step that points the api and the web app at the restored instance. |
| 8 | Tell staff and karigars | Owner | 5 min | Use the list of sends and lost work below, and tell staff and karigars what to enter or send again. |

If step 3 or 6 fails, stop, run `npm run restore:drop -- goldsmith_restore_c`, and record the drill with that step marked `fail`.

## Start the drill

The automatic half (backup, restore, audit check, a deliberately damaged copy, drop) runs in one command and times each part:

```sh
npm run drill:run
```

It prints the timings and a ready `npm run drill:record` line. The damaged copy has one audit entry deleted and the check must fail and name it; if it does not, the command fails. It uses its own throwaway names (`goldsmith_restore_c_drill_<hex>`), drops both, and never touches `goldsmith_restore_c`. The manual steps below give the part of the drill the command cannot do (files, sign-in, people). If you only want the automatic check, stop after `drill:run`.

## Steps 3 to 6: restore and check

Take a fresh backup first when the drill should start from now:

```sh
npm run backup:db
npm run backup:files
npm run backup:list                      # note the db-... and files-... ids
npm run restore:db -- --backup latest --target goldsmith_restore_c
npm run restore:files -- --backup latest --bucket goldsmith-restore-c
npm run check:files -- --target goldsmith_restore_c --bucket goldsmith-restore-c
npm run check:audit -- --backup latest --target goldsmith_restore_c --source
```

Each command prints one line of what it checked and exits 0, or exits 1 with the reason. `check:audit` prints every difference (`FAIL [check] ...`, then the audit entry ids) before the error line. The throwaway names end in `_c` (and `-c` for the bucket) on purpose: the api adds the lane to a database name that does not end with it, so a name ending in `_c` is used as written in step 7.

## Step 7: reconnect and smoke test

Start the api on lane c's port 4003 against the copy. `APP_DATABASE_URL` points at the restored database and the api connects as `goldsmith_app`; the other values come from lane c's `.env`. Switching the jobs off keeps the copy still (the retention and publishing jobs would otherwise write to it):

```sh
export COPY=postgres://postgres:postgres@localhost:5432/goldsmith_restore_c
DATABASE_URL=$COPY npm run db:dev-password -- "Sanjay Seth" "counter-2026"   # the owner; sets the password in the copy only
DATABASE_URL=$COPY APP_DATABASE_URL=postgres://goldsmith_app:localapp@localhost:5432/goldsmith_restore_c \
  STORAGE_BUCKET=goldsmith-restore-c JOBS_ENABLED=false npm run dev -w @goldsmith/api
```

In a second terminal, sign in, read, and open a restored file (`localhost:4003`, never 4000 or 4001):

```sh
curl -s localhost:4003/health
curl -s -c /tmp/jar-restore -X POST localhost:4003/api/auth/signIn \
  -H 'content-type: application/json' -d '{"phone":"98410 33333","password":"counter-2026"}'
curl -s -b /tmp/jar-restore -X POST localhost:4003/api/ops/listAuditEntries \
  -H 'content-type: application/json' -d '{"pageSize":5}'
docker exec goldsmith-erp-postgres-1 psql -U postgres -d goldsmith_restore_c -Atc \
  "select s.code from stored_files s where s.removed_at is null and exists (select 1 from attachments a where a.file_id = s.id) order by s.code limit 1"
curl -s -b /tmp/jar-restore -X POST localhost:4003/api/ops/readFileLinks \
  -H 'content-type: application/json' -d '{"files":[{"fileId":"<FILE code from the line above>","size":"thumbnail"}]}'
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' 'localhost:4003<url from readFileLinks>'     # the url is a path starting /api/files/; expect: 200 image/...
```

Sign in as the owner: only the owner can read the security log, so a staff sign-in gets `forbidden` on `listAuditEntries`. Pass means: health answers, sign-in answers `ok`, `listAuditEntries` returns entries, and the signed link answers 200 with an image type. Use an attached file (the query above): an unattached file is readable only by its uploader, so another user gets `not_found`. Stop the api with Ctrl+C, then `rm /tmp/jar-restore`.

## Drop the copy

```sh
npm run restore:drop -- goldsmith_restore_c
```

The restored bucket `goldsmith-restore-c` stays and is reused by the next `restore:files`; no command here deletes buckets. `restores.jsonl` in `.backups/c/` records each restore with its target.

## Step 8: tell staff and karigars (S9)

A restore loses everything written after the restore point, and some of it left the system: wishes, broadcasts and messages already sent cannot be taken back. List what went out and what was lost, against the live database, for the window from the restore point until now:

```sh
npm run restore:sends -- --since <restore point ISO time with zone> [--until <ISO time>]
```

The list shows codes and ids only (outbox events, wishes, broadcasts, send-type audit entries) and counts the other audit entries of the window by kind, which is the work to redo. Then:

1. Tell staff which entries to enter again, kind by kind, from the counts.
2. Tell karigars which of their updates were lost and ask them to send those again.
3. Tell the owner which wishes or broadcasts already went out, so none is sent twice by hand.

Provider message ids, templates and delivery status are not in the list yet (they need EP-11 and EP-12), and automatic protection against double wishes needs EP-33; until then step 3 is a manual check.

## Record the drill

Measure the whole drill with a clock, from step 1 to step 8, and run the `drill:record` line that `drill:run` printed, replacing each `<pass|fail>` and the notes. Duration is in minutes (decimals allowed).

```sh
npm run drill:record -- --date 2026-11-30 --environment development \
  --restore-point "backup db-20261130T090000Z-ab12 taken 2026-11-30T09:00:00Z" --duration-minutes 28 \
  --step 1=pass --step 2=pass --step 3=pass --step 4=pass --step 5=pass --step 6=pass --step 7=pass --step 8=pass \
  --run-by "Operator name" --notes "Smoke test and file link passed"
```

This appends a row to [restore-drills.md](restore-drills.md) and says whether the duration is within the target (default 60 minutes, marked provisional) or over. Every one of the eight steps needs `pass` or `fail`; a missing step is refused and nothing is written. Commit the changed `restore-drills.md`.
