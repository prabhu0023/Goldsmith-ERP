# Backup and recovery (EP-38)

Scripted, encrypted backups of the database and the file bucket, kept apart from live data, with a restore command, an audit-log completeness check, a written restore drill and failure alerts. The local half is built and tested; the AWS half is documented in [AWS mapping](#aws-mapping) and built at deployment (EP-01-S12). Stories: [EP-38 stories](../stories/EP-38-stories.md). Drill: [restore-drill.md](restore-drill.md), record: [restore-drills.md](restore-drills.md). Code: `packages/api/src/ops/`, tests: `packages/api/test/ops/`.

## Commands

Run from the repository root. Every command reads `DATABASE_URL`, `APP_ENV` and `LANE` like the database commands, so lane c backs up `goldsmith_dev_c`. They connect as the owner (the `DATABASE_URL` user), never as `goldsmith_app`. Exit code 0 on success; on failure one line `Error: ...` on stderr and exit code 1.

| Command | What it does |
| --- | --- |
| `npm run backup:db [-- --if-not-done-today]` | Encrypted `pg_dump` of the database into the lane folder, with a manifest. With the flag it does nothing when a complete daily backup already started on this UTC day. |
| `npm run backup:files` | Encrypted copy of every object in the lane's file bucket (`STORAGE_*` settings needed). |
| `npm run backup:list` | Every run: id, kind (`daily full`, `file storage`), status, environment, start, finish, size, encrypted, location. Deleted runs show as `deleted`. |
| `npm run backup:check` | Exit 1 and an alert when no complete daily backup finished in the last 24 hours plus `BACKUP_GRACE_HOURS`. |
| `npm run backup:prune [-- --dry-run] [--retention-days n]` | Deletes database and file backups older than the retention period and file objects no kept run uses. `--dry-run` lists and deletes nothing. |
| `npm run restore:db -- --backup <id\|latest> --target <name>` | Restores into a new throwaway database, then compares every table with the manifest. Never overwrites. |
| `npm run restore:drop -- <name>` | Drops a throwaway restore database. |
| `npm run restore:files -- --backup <id\|latest> --bucket <name>` | Restores the files of a run into a new throwaway bucket, verifying each checksum. |
| `npm run check:audit -- --backup <id\|latest> --target <name> [--source]` | Audit-log completeness check of a restored database (S7). `--source` also compares with the live database (`DATABASE_URL`). Exit 1 and the entry ids on a difference. |
| `npm run check:files -- --target <db> --bucket <name>` | Every file of the restored database is in the restored bucket; names missing file codes. |
| `npm run restore:sends -- --since <ISO> [--until <ISO>]` | Messages sent and audit entries written after a restore point (S9). Codes and ids only. |
| `npm run drill:run` | The automatic half of a drill: backup, restore, audit check, a deliberately damaged copy that must fail the check, drop of both copies, timings. Prints the `drill:record` command to finish. |
| `npm run drill:record -- --date <YYYY-MM-DD> --restore-point <text> --duration-minutes <n> --step 1=pass ... --step 8=pass [--environment <name>] [--run-by <name>] [--notes <text>] [--target-minutes <n>]` | Appends one row to [restore-drills.md](restore-drills.md). All eight steps need `pass` or `fail`. |

Restore targets are guarded. The name must match `goldsmith_restore...`, must not be the database `DATABASE_URL` names, and with `LANE` set must carry the lane as its own `_` segment (`goldsmith_restore_c`, `goldsmith_restore_c_ab12cd`; lane c never touches `goldsmith_dev`, `goldsmith_dev_a` or `goldsmith_restore_a`). Buckets follow the same rule with `-` (`goldsmith-restore-c`). `APP_ENV=production` is always refused; `APP_ENV=staging` needs `--allow-staging`. The refusal happens before any connection is opened.

## Variables

All are in `.env.example` with empty values. Errors name the variable and never print its value.

| Variable | Meaning |
| --- | --- |
| `BACKUP_ENCRYPTION_KEY` | Required for `backup:db`, `backup:files`, `restore:db`, `restore:files`, `drill:run`. 64 hex characters: `BACKUP_ENCRYPTION_KEY=<64 hex characters from openssl rand -hex 32>`. Keep it in a password manager apart from the backups; a lost key makes every backup unreadable. |
| `BACKUP_DIR` | Folder for backups. Default `.backups` in the repository (git-ignored). A subfolder per lane is added: lane c writes only under `.backups/c/` (`.backups/default/` without a lane). |
| `BACKUP_RETENTION_DAYS` | Days a backup is kept. Default 30, provisional: the story leaves the number open. |
| `BACKUP_GRACE_HOURS` | Hours added to 24 before `backup:check` calls a backup missing. Default 2. |
| `BACKUP_ALERT_GROUP_MINUTES` | The same failure (kind, environment, error) is alerted once inside this window. Default 60. |
| `BACKUP_PG_CONTAINER` | Docker container that runs PostgreSQL. Default: the container publishing the port of `DATABASE_URL`, else the host's `pg_dump`. |

## Choices

| Topic | Choice | Why |
| --- | --- | --- |
| Dump method | `pg_dump --format=custom` run inside the PostgreSQL container with `docker exec` (connection `127.0.0.1:5432` inside the container, password in the child's `PGPASSWORD`). Falls back to a host `pg_dump` when docker or the container is missing. | The host has no `pg_dump`, and the container's binary matches the server version. A pure-Node dump cannot reproduce triggers, grants and constraints faithfully, and a library for it would be a new dependency. CI's `postgres:17` service container publishes 5432, so the same lookup works there. |
| Consistency | The dump runs inside a `REPEATABLE READ READ ONLY` transaction snapshot (`pg_export_snapshot`, `pg_dump --snapshot`). The manifest statistics are read in the same snapshot. | The dump and the statistics describe one instant, and the snapshot takes no write lock, so the counter never waits (S1 AC3). |
| Encryption | AES-256-GCM through Node `crypto`: file = `GSBK1` + 12-byte IV + ciphertext + 16-byte tag. Restore verifies the whole file's tag before it sends one byte to `pg_restore`. There is no plain-text mode. | No `openssl` dependency, runs in CI, and unauthenticated bytes never reach the database. A wrong key or a damaged file gives one clear error and creates nothing. |
| Location | `<BACKUP_DIR>/<lane>/`, folder mode 0700, files 0600, written to a `.partial` name and renamed. | A host folder outside the Docker volumes that hold the live database and bucket. |
| Record | Append-only `runs.jsonl` in the lane folder, plus one `<id>.manifest.json` per backup (sha256, per-table row count and checksum, audit statistics). Restores go to `restores.jsonl`, alerts to `alerts.jsonl`. | No table, so no migration. |
| Table checksum | For every base table in `public`: `count(*)` and `md5` over the sorted `md5(row::text)` values. | One rule covers row counts, bigint weights (S1 AC4, AC5) and the S7 comparison, and a column added later is covered without a code change. |
| Files | Content-addressed: each object is encrypted and stored once as `files/objects/<sha256>.enc`; each run writes `files/files-<time>.manifest.json` with key, sha256, size and content type. | A file deleted from the live bucket after a run is still restorable from every run that listed it. |
| Alerts | Three sinks: stderr, `alerts.jsonl` (works with the database down), and an `outbox_events` row with topic `ops.backup_failed`. The text is redacted (no URLs, keys, addresses). | EP-11 (delivery) and EP-37 (alert route) do not exist yet. |
| Scheduler | Not wired into the EP-10 in-process job runner. Use cron or launchd (below). | The runner shares the api process; a backup must run when the api is down. |
| Point-in-time | Not built locally. A restore goes to a named backup. | WAL archiving (`archive_command`, `wal_level`) is a cluster setting of the one shared PostgreSQL container, so changing it would affect every lane's databases. RDS gives this (see AWS mapping). |

## Schedule on one machine

Backups run once a day; `--if-not-done-today` makes a repeat harmless. A cron line (every day at 02:30, then the missing-backup check at 06:00):

```cron
30 2 * * * cd /path/to/repo && npm run backup:db -- --if-not-done-today >> .backups/cron.log 2>&1
0 6 * * * cd /path/to/repo && npm run backup:check >> .backups/cron.log 2>&1
```

On macOS use launchd instead (`~/Library/LaunchAgents/com.goldsmith.backup.plist`, load it with `launchctl load`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.goldsmith.backup</string>
  <key>WorkingDirectory</key><string>/path/to/repo</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>-lc</string>
    <string>npm run backup:db -- --if-not-done-today</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>2</integer><key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardErrorPath</key><string>/path/to/repo/.backups/launchd.log</string>
</dict></plist>
```

Run `npm run backup:files` and `npm run backup:prune` the same way. Both jobs read `BACKUP_ENCRYPTION_KEY` from the repository's `.env`.

## Which role runs backups (FU-008)

Backups, restores and migrations use the owner connection (`DATABASE_URL`, locally `postgres`), never `goldsmith_app`. The api's role cannot read every table it would need to dump, cannot create databases, and must not be able to touch backups. In AWS the same split applies: the backup and restore jobs use the managed-service admin or a backup role, and the api keeps `APP_DATABASE_URL` for `goldsmith_app` (FU-008). Restoring keeps the grants, so a restored copy still has `goldsmith_app` with only SELECT and INSERT on `audit_entries`; `check:audit` verifies that.

## Acceptance map (S1 to S10)

Class: **L** built local and tested, **C** cloud, documented only (see AWS mapping, to build at deployment, EP-01-S12), **N** not possible yet because a story it needs does not exist.

| Story | Criterion | Class | How |
| --- | --- | --- | --- |
| S1 | 1 list shows daily full, complete, start, finish, size, location | L | `backup:list` |
| S1 | 2 one backup per day per environment | C + L | RDS backup window or EventBridge Scheduler (C); locally `backup:db --if-not-done-today` |
| S1 | 3 the counter does not wait | L | snapshot read, no write lock; a write during a slowed backup commits and is absent from the backup |
| S1 | 4 restore gives the same row counts | L | `restore:db` compares every table with the manifest |
| S1 | 5 weights identical, null money stays null | L | per-table checksum over the row text |
| S2 | 1 to 4 continuous log and restore points | C | RDS automated backups and point-in-time restore. N locally: WAL archiving would change the shared container |
| S3 | 1 photo and its copies in backup storage | L | `backup:files` copies every object, thumbnail and display copies included |
| S3 | 2 a restored photo opens through a signed link | L | `restore:files`, then the drill's link check |
| S3 | 3 a file deleted after the restore point is back | L | content-addressed objects are kept until no retained run lists them |
| S3 | 4 every file id checked, none missing or each named | L | `check:files` |
| S3 | 5 a record of kind `file storage` | L | `runs.jsonl` |
| S3 | bucket versioning, copy to another region or account | C | AWS mapping |
| S4 | 1 encrypted, apart from live data | L | AES-256-GCM always on, host folder |
| S4 | 2 India region | C | ap-south-1 |
| S4 | 3 only the operator reads | L + C | modes 0700/0600 locally; IAM role on AWS |
| S4 | 4 live credentials cannot delete backups | L + C | the folder is outside the app's reach; on AWS a separate bucket policy or account |
| S4 | 5 no key in code | L | key only from the environment; `.env.example` holds the name only; gitleaks in CI |
| S5 | 1 failed backup alerts with environment, kind, time, error | L | notifier sinks |
| S5 | 2 a missing backup alerts | L | `backup:check` |
| S5 | 3 continuous log one hour old | C | CloudWatch alarm on RDS metrics |
| S5 | 4 a failed file backup names `file storage` | L | same path |
| S5 | 5 repeats grouped | L | `BACKUP_ALERT_GROUP_MINUTES` |
| S5 | delivery to a person | N | needs EP-11 (outbox consumer) and EP-37 (alert route) |
| S6 | 1 restore to a time 30 minutes ago | C | RDS point-in-time restore to a new instance. Locally: restore to a named backup |
| S6 | 2 weight totals equal | L | table checksums include weight columns |
| S6 | 3 and 4 screens refetch after a restore | N | screens still read the prototype store (FU-012); the live channel's `refetch_all` exists (EP-07) |
| S6 | 5 production needs an approver and a record | C + L | production always refused; staging needs `--allow-staging`; `restores.jsonl` records backup, target, user, times and result. The approver is an open question (N) |
| S7 | 1 to 3 compare, name the entry, fail | L | `check:audit` (deleted and changed entries are named by id) |
| S7 | 4 append-only rule survives | L | triggers `audit_entries_no_change`, `audit_entries_no_truncate` and the `goldsmith_app` grants are checked |
| S7 | 5 weights in entries come back as integers | L | `before_value` and `after_value` are part of each entry's hash |
| S8 | 1 a written drill | L | [restore-drill.md](restore-drill.md) |
| S8 | 2 record date, environment, point, duration, steps, notes, run by | L | `drill:record` |
| S8 | 3 within or over target | L | `--target-minutes`, default 60, provisional |
| S8 | 4 go-live sign-off in staging | N | needs staging (EP-01-S12) |
| S8 | 5 reminder after an interval | C | follow-up FU-018 |
| S9 | 1 list of sends in the window | L (partial) | `restore:sends`. Provider message id, template and status are N: they need EP-11 and EP-12 |
| S9 | 2 token reference only | L | the query selects codes and ids, never a payload or token |
| S9 | 3 wishes not sent twice | N | needs EP-33 and EP-11 |
| S9 | 4 window of lost work, no phone numbers | L | audit entries by kind in the window |
| S9 | 5 karigars told to resend | L | step 8 of the drill |
| S10 | 1 old backup deleted, record `deleted` | L | `backup:prune` |
| S10 | 2 backups within the period kept | L | same |
| S10 | 3 log segments | C | RDS retention period |
| S10 | 4 old file versions deleted, current files untouched | L + C | file runs expire and unreferenced objects go; S3 noncurrent-version expiration on AWS |
| S10 | 5 the list shows nothing older than the period | L | after `backup:prune` |

## AWS mapping

Region ap-south-1 (Mumbai). Each item is to build at deployment (EP-01-S12); none exists locally.

| Local | AWS | Status |
| --- | --- | --- |
| Daily `pg_dump` in a host folder | RDS automated backups with a daily backup window outside shop hours (for example 21:00 to 21:30 UTC, 02:30 IST) and a retention period (provisional 30 days, the same number as `BACKUP_RETENTION_DAYS`) | to build at deployment (EP-01-S12) |
| Restore to a named backup | Point-in-time restore to a new instance. RDS ships transaction logs about every 5 minutes, which keeps the recovery point under 1 hour (`docs/PRODUCTION-SCOPE.md` section 5). The restore never overwrites the live instance; the api is pointed at the new one after the checks | to build at deployment (EP-01-S12) |
| `.backups/` folder, `backup:files` copy | S3 versioning on the file bucket, with a lifecycle rule that expires noncurrent versions after the retention period, plus replication to a bucket in another region or another AWS account (a copy the live credentials cannot delete) | to build at deployment (EP-01-S12) |
| AES-256-GCM with `BACKUP_ENCRYPTION_KEY` | KMS keys: one for RDS and snapshots, one for the S3 buckets, with key policies that name the operator role and the backup roles | to build at deployment (EP-01-S12) |
| `backup:check` and `alerts.jsonl` | CloudWatch alarm on RDS metrics and backup events, sent to an SNS topic; an EventBridge rule on failed backup jobs; delivery to a person goes through EP-11 and EP-37 | to build at deployment (EP-01-S12) |
| Owner connection and folder modes | IAM roles for backup: an operator role that reads and restores backups, a backup role that writes them, and no delete permission for the api's role | to build at deployment (EP-01-S12) |
| `drill:record` reminder | A calendar or EventBridge reminder after the drill interval (S8 AC5); the interval is an open question | to build at deployment (EP-01-S12) |

The restore command and checks (`check:audit`, `check:files`, `restore:sends`) work on any PostgreSQL copy, so they run against a database restored by RDS too: point `DATABASE_URL` at the restored instance. The local scripts use the lane naming guard, which does not apply to RDS instance names.

## Why no WAL archiving locally

Continuous archiving needs `wal_level`, `archive_mode` and `archive_command`, which are settings of the whole PostgreSQL server. All lanes share one container (`goldsmith-erp-postgres-1`), so changing them from lane c would change the default and lane a databases. The local equivalent is the daily backup, and the cloud answer is RDS point-in-time restore.

## Open items

Listed in [followups.md](../followups.md) (FU-018): the cloud items above, S9's provider details (EP-11, EP-12, EP-33) and the S8 reminder. Open questions from the stories that stay open: retention period, the drill's target time, the restore approver and the drill reminder interval.
