# Background jobs (EP-10)

The api runs its own job scheduler (`packages/api/src/jobs/`). It starts after the api listens, polls PostgreSQL every `JOBS_POLL_INTERVAL_MS`, and stops on SIGTERM/SIGINT. Nothing else is needed: no Redis, no managed platform (D1). All times are stored in UTC; days and wall-clock hours are Asia/Kolkata (shared `shop-time.ts`).

## Runner choice: small in-house scheduler on the existing `pg` pool

Requirements: survives restarts, no duplicate execution with two API processes, retries with backoff, run history, catch-up for missed runs, testable with a controllable clock, no new infrastructure.

| Option | Verdict |
| --- | --- |
| pg-boss (PostgreSQL queue library) | Rejected. It creates and migrates its own `pgboss` schema outside our migrator (`src/db/migrator.ts`, `npm run db:new`), so its tables skip our conventions (every table has `shop_id`) and the rule "migrations only via db:new". Due times come from the database `now()`, so tests could not drive a fake server clock (S1 "5 minutes pass", S11 downtime, S10 9 am IST). Handlers run outside our `runInTransaction`, but S4 needs the idempotency claim in the same transaction as the change, and S2/S13 need our own `job_runs` shape anyway. |
| graphile-worker | Rejected for the same reasons (own `graphile_worker` schema and migrations, database clock, own run tables). |
| **In-house scheduler** (chosen) | Tables in `public` through one `db:new` migration with `shop_id` on every row. Claims with `select … for update skip locked`, so two API processes never run the same row. A lease (`locked_until`) plus a `locked_by` check at commit stops a stolen run from committing twice. Every time comes from the injected `Clock` (`src/pipeline/server-clock.ts`) and is passed to SQL as a parameter, so tests move time. Uses the existing `pg` ^8 pool and `runInTransaction`. **No new dependency.** |

## How it works

- Tables (migration `20261121T1845_ep10_background_jobs.sql`): `job_definitions` (one row per shop and job), `pending_jobs` (one row per occurrence, unique `(shop_id, job_name, run_key)`), `job_runs` (run history, code `RUN-<year>-NNNNN`), `job_keys` (claimed idempotency keys), `outbox_events`.
- Each tick: create the next occurrence of every recurring job, then claim due rows one at a time (`for update skip locked`, lease 2 minutes), run the handler in one transaction with its idempotency key claim, and mark the row done in that same transaction.
- Failure: the handler transaction rolls back (no change, no audit, key not claimed). The row is retried after `min(30 s × 2^(attempt-1), 15 min)` and the run shows `retrying`; after the last attempt the run is `failed` with a redacted error text (max 500 characters) and the `onJobFailed` hook is called (EP-37 fills it; today it logs). The scheduler never picks up a failed row again; only the Owner's retry does. If a worker stops during a run's last attempt, the run is marked `failed` once its lease expires (no extra attempt) and handed to `onJobFailed`.
- Catch-up: a past-due row runs on the first tick after start. A daily occurrence left from an earlier Asia/Kolkata day that never started is marked `skipped` (it has no JobRun), so old days are not replayed; today's occurrence still runs. An occurrence that already has a JobRun (a backoff retry or an Owner retry) is never skipped, so a failed 9 am run retried the next morning runs under its own date and key.
- Audit: a job's change is written to `audit_entries` in its transaction with `actor_role = 'system'`, no user id, and actor name `System (<job label>)`. This is the same System model EP-04 uses for its sign-in entries (`audit_entries_actor_present`: no actor id exactly when the role is `system` or `setup`); the migration's kind check lists the base kinds, EP-04's sign-in kinds and the EP-10 kinds.

## Jobs

| Name | Label (actor `System (<label>)`) | Schedule | Run key | Idempotency key | What it does |
| --- | --- | --- | --- | --- | --- |
| `lead-sla-timers` | SLA timers | every 1 minute | slot UTC ISO time | none (idempotent SQL) | Keeps one `lead-sla-breach` timer per lead in `needs_glance`/`opened` that is not yet late, due at `leadSlaDueAt`; moves it when the setting changes; cancels timers of leads no longer running. |
| `lead-sla-breach` | SLA breach job | delay (one row per lead) | lead uuid | `<lead code>:sla-breach` | Sets `leads.sla_breached_at` once if the lead is still running; outbox `lead.sla_passed`; audit `lead_marked_late`. |
| `karigar-overdue` | overdue job | daily 00:05 Asia/Kolkata | IST date | per job `<job code>:overdue:<IST date>` | For jobs not handed over past their agreed date (confirmed date, else due date): sets `overdue_since` once, `last_reminder_at`; outbox reminder daily, `karigar_job.overdue` on the first day; audit `job_marked_overdue` / `job_reminder_sent`. |
| `edit-token-expiry` | token sweep | every 1 minute | slot UTC ISO time | none (idempotent SQL) | `piece_edits` with a token sent more than 10 minutes ago get `expired_at = token_issued_at + 10 min`; audit `edit_token_expired` with the token reference, never its value. |
| `wishes-9am` | wishes job | daily 09:00 Asia/Kolkata | IST date | `wishes:<IST date>` | When `settings.auto_send_wishes` is on, hands the day's birthday/anniversary queue to EP-33 via outbox `wishes.run_requested`. No consent filter here. |
| `file-retention` | retention run | daily 03:00 Asia/Kolkata | IST date | none (removed files are skipped) | Registered only when file storage is configured (`STORAGE_BUCKET`, EP-09-S12, `src/files/file-retention.ts`). Removes files past their class's keep period (`po`: `FILE_RETENTION_PO_DAYS`, default 365; `standard`: `FILE_RETENTION_STANDARD_DAYS`, unset = kept): deletes the three objects, sets `removed_at`, deletes the attachments, audit `file_removed_by_retention` per owner. A file whose object delete fails is retried next run. Logs `[jobs] file-retention removed po=N standard=N failed=N`. |

## Outbox topics

Rows in `outbox_events` are written in the job's transaction. The live channel (EP-07, [live.md](live.md)) publishes the rows whose topic is in its catalogue; the others wait for EP-11/EP-12 (notifications, WhatsApp) and EP-33 (wishes), and the live publisher never touches them. Payloads hold human codes only, never phone, name or token.

| Topic | Payload |
| --- | --- |
| `lead.sla_passed` | `{ leadId, slaBreachedAt }` |
| `karigar_job.overdue` | `{ jobId, overdueSince }` |
| `notify.karigar_job_overdue_reminder` | `{ jobId, karigarId, overdueDays, date }` |
| `wishes.run_requested` | `{ date, items: [{ customerId, kind: 'birthday' \| 'anniversary' }] }` |
| `lead.alert` (live) | written by the SLA breach job next to `lead.sla_passed`: "Lead arrived / passed its SLA" to staff and owner |
| `karigar_job.status_changed` (live) | written by the overdue job on the first overdue day next to `karigar_job.overdue`: "Karigar job status changed" to staff, owner and the job's karigar |
| `user.access_changed` (live) | written by EP-05 on deactivate or role change; delivered to that user's streams |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `JOBS_ENABLED` | `true` | `false` keeps the scheduler off (the api still serves requests). |
| `JOBS_POLL_INTERVAL_MS` | `15000` | How often the scheduler looks for due jobs, 1000–60000. |

The lead SLA uses `settings.lead_sla_hours` (default 8) and `settings.lead_sla_counting` (only `clock_hours` for now, see A2).

## Scheduling and cancelling from service code

Schedule, Cancel and Run are TypeScript functions, never contract operations, so no browser session can call them (`POST /api/ops/scheduleJob` answers `not_found`). Call them inside the operation's transaction (`tx.client`) so they commit or roll back with the change:

- `scheduleJob(client, shop, { jobName, runKey, dueAt, maxAttempts, now, payload?, idempotencyKey? })` and `cancelJob(client, shop, jobName, runKey)` in `src/jobs/job-store.ts`.
- Lead transitions: `scheduleLeadSlaTimer(client, shop, leadId, now)` when a lead arrives, `leadSlaTimerAfterTransition(client, shop, { leadId, state })` after a state change (cancels only when the lead leaves `needs_glance`/`opened`), `rescheduleLeadSlaTimers(client, shop, now)` after an SLA setting change (`src/jobs/handlers/lead-sla.ts`). `markLeadLost` already calls `leadSlaTimerAfterTransition`.
- A new job: add a `JobDefinition` (`src/jobs/job-definition.ts`) to `productionJobs` in `src/jobs/production-jobs.ts`.

## Owner view of runs (S13)

- `listJobRuns` (list): `{ cursor?, pageSize?, result?: 'ok' | 'retrying' | 'failed', jobName? }` → newest 50 first with `id` (run code), `jobName`, `scheduledAt`/`startedAt`/`finishedAt` (UTC ISO) and `*Local` (Asia/Kolkata with `+05:30`), `attempts`, `result`, `errorText`, and `nextCursor`.
- `retryJobRun` (command): `{ runId }` puts a failed run back for one more attempt under the same idempotency key; audited `job_run_retried` with the Owner as actor. A run that is not failed answers `rule_refused`.
- Both are Owner only (`ctx.by.role === 'owner'`); Staff and Karigar get `forbidden`. API only: S13 has no mockup, so there is no screen yet.

## Open items

- **A2 (open decision):** does the 8-hour lead SLA count shop hours or clock hours? The due time comes only from shared `leadSlaDueAt(arrivedAt, { leadSlaHours, leadSlaCounting })`. The setting `settings.lead_sla_counting` defaults to `clock_hours` and its check allows only that value; it is a placeholder until EP-13 adds shop opening hours and `shop_hours`. No opening hours are invented.
- **Overdue job hour:** 00:05 Asia/Kolkata is chosen here; the sources do not name an hour.
- **Reminder frequency:** one overdue reminder per job per Asia/Kolkata day.
- **Who may see and retry runs:** Owner only for now; the check reads `ctx.by.role`, so it keeps working when EP-04 sessions replace the EP-03 dev stub.
- **G17 broadcasts:** scheduled broadcasts are not a job yet.
- **G26 event names:** fixed by EP-07. The live catalogue names are `lead.alert` and `karigar_job.status_changed` (written by the same jobs in the same transaction); `lead.sla_passed` and `karigar_job.overdue` stay as they are for the notification epics.
- **EP-09 file retention** is scheduled as `file-retention` (above, when storage is configured); **EP-03 idempotency-record cleanup** is not scheduled yet. Run history grows fast: `lead-sla-timers` and `edit-token-expiry` each write a JobRun every minute (about 2,880 rows a day), so the newest 50 cover about 25 minutes and `RUN-<year>` codes pass 99,999 after about 35 days (codes keep working, they get longer). Use `jobName` (e.g. `lead-sla-breach`, `wishes-9am`) to find the runs that matter; retention of sweep runs is not handled by `file-retention` (it removes stored files only) and is still open.
- **29 February wishes:** the wishes queue matches birthday/anniversary month and day exactly, so a 29 February date is only queued in leap years. Whether to greet on 28 February or 1 March in common years is left to EP-33.
- **Live delivery** of the live topics is EP-07 ([live.md](live.md)); notifications and wishes stay with EP-11 / EP-33. Screen counts updating live (S5 AC4): the Leads rail badge refreshes from the server on `lead.alert`; the screens themselves read the in-memory store until EP-08.

## Acceptance criteria map (S1–S13)

Test paths are under `packages/api/test/jobs/` unless they start with `shared/` (`packages/shared/test/`) or `services/` (`packages/api/test/services/`).

| Story | AC | Code | Test |
| --- | --- | --- | --- |
| S1 | 1 delay 5 min runs once within 1 min | `scheduleJob`, `scheduler.tick` | `scheduler.test.ts` "S1 AC1: runs a 5-minute delayed job once, within a minute of its due time" |
| S1 | 2 every minute × 10 | recurring `every` slots | `scheduler.test.ts` "S1 AC2: runs an every-minute job 10 times in 10 minutes" |
| S1 | 3 set UTC time, any machine zone | due times as `timestamptz` params from `Clock` | `scheduler.test.ts` (runs under `TZ` `America/New_York` and `Asia/Tokyo`) |
| S1 | 4 browser session cannot Schedule/Cancel/Run | not in contract → `not_found` | `services/job-runs.test.ts` "S1 AC4: no browser session can Schedule, Cancel or Run a job" |
| S1 | 5 cancelled delayed job never runs | `cancelJob` | `scheduler.test.ts` "S1 AC5: never runs a cancelled delayed job and records no JobRun" |
| S1 | rule: unique names | `createJobRegistry`, `unique (shop_id, name)` | `scheduler.test.ts` "refuses two jobs with the same name", `jobs-schema.test.ts` |
| S2 | 1 ok run | handler transaction finish | `run-history.test.ts` "S2 AC1", `lead-sla.test.ts` "S5 AC1 / S2 AC1" |
| S2 | 2 error text redacted | `redact-error-text.ts` | `run-history.test.ts` "S2 AC2" |
| S2 | 3 in progress: no finish time | claim commits before the handler | `run-history.test.ts` "S2 AC3" |
| S2 | 4 retried twice: 3 attempts, original scheduled time | one run row per occurrence | `run-history.test.ts` "S2 AC4" |
| S2 | 5 newest first, cursor paging | `run-history.ts listRuns` | `run-history.test.ts` "S2 AC5", `services/job-runs.test.ts` "S13 AC1 / S2 AC5" |
| S3 | 1, 2, 4, 5 growing delay, failed after 3, left alone, EP-37 hook | `backoffDelayMs`, failure transaction, `onJobFailed` | `retry-backoff.test.ts` "S3 AC1, AC2, AC4, AC5" and "grows from 30 s, doubling, and stops at 15 minutes" |
| S3 | 3 fail then ok: 2 attempts | | `retry-backoff.test.ts` "S3 AC3" |
| S3 | no attempt past the maximum after a worker stops | `failExhaustedLeases` | `retry-backoff.test.ts` "S3: a worker that stops during the last attempt …" |
| S4 | 1 two workers, one change | `skip locked` + `job_keys` claim | `idempotency.test.ts` "S4 AC1", "runs each pending row once when two runner instances tick together"; `lead-sla.test.ts` "S4 AC1" |
| S4 | 2 committed then crashed | lease reclaim + claimed key | `idempotency.test.ts` "S4 AC2" |
| S4 | 3 overdue twice on one day: one reminder | `<code>:overdue:<date>` | `karigar-overdue.test.ts` "S7 AC4 / S4 AC3" |
| S4 | 4 other key not blocked | per-record key | `idempotency.test.ts` "S4 AC4" |
| S4 | 5 rolled back: key free | key claim in the same transaction | `idempotency.test.ts` "S4 AC5" |
| S5 | 1 09:00 lead late at 17:00, once | `leadSlaBreachJob` | `lead-sla.test.ts` "S5 AC1 / S2 AC1" |
| S5 | 2 opened lead also late | `slaRunning` | `lead-sla.test.ts` "S5 AC2" |
| S5 | 3 8 → 6 h within a minute | `leadSlaTimersJob` | `lead-sla.test.ts` "S5 AC3" |
| S5 | 4 event within a minute | outbox row at the due tick | `lead-sla.test.ts` "S5 AC4" (live screens: EP-07) |
| S5 | 5 one replaceable function | `leadSlaDueAt` | `lead-sla.test.ts` "S5 AC5", `shared/job-timers.test.ts` |
| S6 | 1 worked at 12:00: no breach | `leadSlaTimerAfterTransition` | `lead-sla.test.ts` "S6 AC1" |
| S6 | 2 cancel races pickup | `for update` re-check | `lead-sla.test.ts` "S6 AC2" |
| S6 | 3 needs_glance → opened keeps timer | | `lead-sla.test.ts` "S6 AC3" |
| S6 | 4 transition rolls back: timer pending | cancel in caller's transaction | `lead-sla.test.ts` "S6 AC4" |
| S6 | 5 already late keeps breach time | | `lead-sla.test.ts` "S6 AC5", "S6: markLeadLost cancels the timer" |
| S7 | 1 MO-2026-118 overdue on 2 Nov | `karigarOverdueJob` | `karigar-overdue.test.ts` "S7 AC1" |
| S7 | 2 confirmed date wins | `agreedDate` | `karigar-overdue.test.ts` "S7 AC2", `shared/job-timers.test.ts` |
| S7 | 3 handed over never overdue | | `karigar-overdue.test.ts` "S7 AC3" |
| S7 | 4 same day: no second reminder | key | `karigar-overdue.test.ts` "S7 AC4 / S4 AC3" |
| S7 | 5 "passed its agreed date" published | outbox `karigar_job.overdue` once | `karigar-overdue.test.ts` "S7 AC5" |
| S8 | 1 11 min → expired | `editTokenExpiryJob` | `edit-token-expiry.test.ts` "S8 AC1" |
| S8 | 2 ED-101/ED-102 expired and refused | sweep + shared `checkToken` | `edit-token-expiry.test.ts` "S8 AC2" |
| S8 | 3 9 min untouched | | `edit-token-expiry.test.ts` "S8 AC3" |
| S8 | 4 used token unchanged | `status = 'token_sent'` filter | `edit-token-expiry.test.ts` "S8 AC4" |
| S8 | 5 10 min 30 s before sweep: refused | shared `checkToken` | `edit-token-expiry.test.ts` "S8 AC5" |
| S9 | 1 09:00 IST = 03:30 UTC, handed once | `wishesJob` | `wishes.test.ts` "S9 AC1" |
| S9 | 2 off: run ok, nothing handed | | `wishes.test.ts` "S9 AC2" |
| S9 | 3 twice: once | `wishes:<date>` | `wishes.test.ts` "S9 AC3" |
| S9 | 4 UTC machine: still 09:00 IST | `dailyOccurrence` | `wishes.test.ts` "S9 AC4" |
| S9 | 5 consent not applied | no consent filter | `wishes.test.ts` "S9 AC5" |
| S10 | 1 18:45Z → 2 Nov | `shopDate` | `shared/shop-time.test.ts` "S10 AC1" |
| S10 | 2 09:00 IST 1 Nov = 03:30Z | `shopDateTime` | `shared/shop-time.test.ts` "S10 AC2" |
| S10 | 3 1 day overdue | `jobOverdueDays` | `shared/job-timers.test.ts` "S10 AC3" |
| S10 | 4 same with TZ UTC / New York | | `shared/job-timers.test.ts` (TZ `UTC`, `America/New_York`), `shared/shop-time.test.ts` |
| S10 | 5 no browser-local day maths in jobs | | `no-local-time.test.ts` |
| S11 | 1 down 16:30–17:20, late at 17:00 | past-due rows run on start | `catch-up.test.ts` "S11 AC1" |
| S11 | 2 down 08:50–09:40: wishes once | today's daily occurrence | `catch-up.test.ts` "S11 AC2" |
| S11 | 3 down several days: only today | stale daily → `skipped` | `catch-up.test.ts` "S11 AC3" |
| S11 | 4 overdue missed: once for today | | `catch-up.test.ts` "S11 AC4" |
| S11 | 5 worked during downtime: no change | re-check | `catch-up.test.ts` "S11 AC5" |
| S12 | 1 SLA entry as System (SLA breach job) | `writeJobAudit` | `system-audit.test.ts` "S12 AC1" |
| S12 | 2 overdue entry as System (overdue job) | | `system-audit.test.ts` "S12 AC2" |
| S12 | 3 token reference, never value | `detail` = `token ref <token_ref>` | `system-audit.test.ts` "S12 AC3" |
| S12 | 4 rolled back: no entry | audit in the handler transaction | `system-audit.test.ts` "S12 AC4" |
| S12 | 5 filter by System | `actor_role = 'system'` | `system-audit.test.ts` "S12 AC5" (reader screens: EP-06) |
| S13 | 1 Owner: newest 50 with IST times + cursor | `listJobRuns` | `services/job-runs.test.ts` "S13 AC1 / S2 AC5" |
| S13 | 2 filter failed | `result` input | `services/job-runs.test.ts` "S13 AC2"; by job: "S13: filtering by job name …" |
| S13 | 3 retry failed wishes run: same key, at most once | `retryJobRun` | `services/job-runs.test.ts` "S13 AC3 / AC5" and "S13 AC3: retrying a wishes run that failed on an earlier shop day …" |
| S13 | 4 Staff/Karigar → forbidden | owner check | `services/job-runs.test.ts` "S13 AC4" |
| S13 | 5 retry audited with the Owner | `writeUserAudit` | `services/job-runs.test.ts` "S13 AC3 / AC5" |

"Deployed to staging" in every definition of done waits on D1a / EP-01-S12.
