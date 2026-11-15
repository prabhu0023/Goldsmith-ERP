# EP-10: Background jobs · stories

Epic document: [EP-10 Background jobs](../epics/EP-10-background-jobs.md)

Role note: this is a layer A platform epic. Most stories use "System" for the scheduler and its job handlers acting on their own, with no person pressing a button. "Developer" means the person registering jobs in code. Only EP-10-S13 has an end user (Owner). The scheduler's Schedule, Cancel and Run operations are internal and cannot be called from a browser session; only List job runs and Retry job run are exposed, and only to the roles decided in EP-10-S13.

---

## EP-10-S1: System can register and run scheduled and delayed jobs on the server clock

- **Story ID:** EP-10-S1
- **Title:** System can register and run scheduled and delayed jobs on the server clock
- **As a:** System
- **I want:** a scheduler that holds JobDefinition records (name, schedule, handler, max attempts) and runs each job at a set time, after a delay, or on a repeat, using the server clock
- **So that:** SLA breaches, overdue jobs, token expiry and 9 am wishes happen without anyone opening a screen (FR-10-1, BR-10-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given a job registered with a 5-minute delay, when 5 minutes pass on the server clock, then its handler runs once, within one minute of the due time.
  2. Given a job registered on a repeat of every minute, when 10 minutes pass, then it has run 10 times, each run starting within one minute of its due time.
  3. Given a job registered for a set UTC time, when that time arrives, then it runs, whatever the time zone of the server machine or of any browser.
  4. Given a browser session of any role (Owner, Staff or Karigar), when it calls Schedule, Cancel or Run, then the server refuses it, because these operations are internal.
  5. Given a pending delayed job, when Cancel is called for it by a service function, then it does not run and no JobRun row is created for it.
- **Rules enforced on the server:** Schedule, Cancel and Run are callable only from server-side service functions and the scheduler itself, never from a user session (EP-05-S2). Due times are taken from the server clock (EP-03-S3), never from a request field. JobDefinition names are unique.
- **Live events emitted / consumed:** None. The scheduler itself emits no catalogue event; the job handlers in EP-10-S5 and EP-10-S7 do.
- **Audit entry written:** No. Registering or running a job changes no business record; changes made by a handler are audited in EP-10-S12.
- **Data changes:** Adds the JobDefinition table (name, schedule as cron-like or delay, handler, max attempts) and a pending-job store (job name, due at UTC, payload, idempotency key) by migration (EP-02-S1).
- **UI reference:** No screen
- **Non-functional checks:** Time: due times stored in UTC. Performance: a due job starts within one minute of its due time (epic section 13). Security: internal operations unreachable from browser sessions. Open decision D1: the scheduler is a managed platform feature or an own worker process; the criteria hold for either.
- **Depends on:** EP-01-S6, EP-02-S1, EP-03-S1, EP-03-S3, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S2: System can record a run history for each job

- **Story ID:** EP-10-S2
- **Title:** System can record a run history for each job
- **As a:** System
- **I want:** one JobRun row per run, with job name, idempotency key, scheduled at, started at, finished at, attempts, result (ok, retrying, failed) and error text
- **So that:** anyone investigating a missed alert can see when a job ran, how often it was tried and why it failed (FR-10-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given the SLA breach job runs and succeeds, when it finishes, then its JobRun row has started at, finished at, attempts 1 and result ok.
  2. Given a run that throws an error, when it ends, then its JobRun row has result retrying or failed and the error text, with no customer phone numbers, OTPs or token values in that text.
  3. Given a run in progress, when the row is read, then started at is filled and finished at is empty.
  4. Given a run retried twice, when the row is read, then attempts is 3 and scheduled at still shows the original due time.
  5. Given JobRun rows older than the kept period, when the history is read, then the newest runs come first and old rows can be paged with a cursor.
- **Rules enforced on the server:** Only the scheduler writes JobRun rows. Error text is cut to a fixed length and passed through the same redaction used for logs before it is stored. Times come from the server clock (EP-03-S3).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A JobRun row is operational history, not a business change; business changes are audited in EP-10-S12.
- **Data changes:** Adds the JobRun table (id, job name, idempotency key, scheduled at, started at, finished at, attempts, result, error text) with an index on job name and started at, by migration (EP-02-S1).
- **UI reference:** No screen of its own. Read by the run list in EP-10-S13.
- **Non-functional checks:** Time: all JobRun times stored in UTC. Personal data: no phone numbers, codes or tokens in error text. Performance: the index lets the newest 50 runs of a job be read in under 200 ms.
- **Depends on:** EP-10-S1, EP-02-S1, EP-03-S3, EP-03-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S3: System can retry a failed job with backoff and mark it failed after the last attempt

- **Story ID:** EP-10-S3
- **Title:** System can retry a failed job with backoff and mark it failed after the last attempt
- **As a:** System
- **I want:** a failed run to be tried again with a longer wait each time, up to the job's max attempts, and then marked failed with its error
- **So that:** a short outage of the database or WhatsApp provider does not lose an alert, and a job that keeps failing stops and is visible (FR-10-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a job with max attempts 3 that fails on attempt 1, when it is retried, then attempt 2 starts after a longer delay than the first retry interval and the JobRun result is retrying.
  2. Given the same job fails on attempt 3, when retries are exhausted, then the JobRun result is failed, attempts is 3 and the last error text is stored (epic acceptance criterion 6).
  3. Given a job that fails on attempt 1 and succeeds on attempt 2, when it finishes, then the JobRun result is ok and attempts is 2.
  4. Given a run marked failed, when the scheduler next ticks, then it does not retry it again by itself.
  5. Given a run marked failed, when it is recorded, then the failure is handed to the alerting hook that EP-37 fills in.
- **Rules enforced on the server:** Retry delays grow with each attempt and are capped. Max attempts comes from the JobDefinition. A retry re-uses the same idempotency key, so EP-10-S4 still stops a double effect. Each attempt runs in its own transaction (EP-03-S6), so a failed attempt leaves no partial change.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A failed attempt changes no business record because its transaction is rolled back.
- **Data changes:** Updates JobRun attempts, result and error text. Adds the next-attempt-at column on the pending-job store by migration (EP-02-S1).
- **UI reference:** No screen
- **Non-functional checks:** Availability: a short outage of a dependency is ridden out by retries. Concurrency: a retry and a late original run cannot both apply, because they share one idempotency key. Open question: the exact backoff intervals are not set in the sources; tests use max attempts 3 and check that each wait is longer than the last.
- **Depends on:** EP-10-S1, EP-10-S2, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S4: System can act once per idempotency key

- **Story ID:** EP-10-S4
- **Title:** System can act once per idempotency key
- **As a:** System
- **I want:** each trigger to carry an idempotency key, such as the lead id plus "sla-breach", that is claimed inside the handler's transaction, so a second run with the same key does nothing
- **So that:** the owner gets one breach alert per lead and a karigar one reminder per day, even with two scheduler workers or a retry (FR-10-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given two scheduler workers pick up the SLA breach run for one lead at the same moment, when both finish, then the lead is marked late once and one "Lead arrived / passed its SLA" event is published.
  2. Given a run that committed its change but crashed before writing finished at, when it is retried with the same key, then it finds the key already claimed and makes no second change.
  3. Given the overdue job for MO-2026-118 runs twice on 2 November 2026, when both finish, then one reminder exists for that job for that day.
  4. Given the key for one lead is claimed, when the breach job runs for a different lead, then it is not blocked.
  5. Given a run whose transaction rolls back, when it is retried, then the key is not left claimed and the retry can act.
- **Rules enforced on the server:** The key is claimed by a unique constraint in the same transaction as the handler's change (EP-03-S6), not in a separate step. Keys are built by the handler from the entity id and the trigger name (and the Asia/Kolkata date for daily triggers), never from a request field.
- **Live events emitted / consumed:** None from this story. It stops duplicate "Lead arrived / passed its SLA" events published after commit (EP-07-S1).
- **Audit entry written:** No. Claiming a key changes no business record.
- **Data changes:** Adds a JobKey table (idempotency key unique, job name, claimed at) by migration (EP-02-S1).
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: one effect per key with several workers, checked inside the transaction (epic section 16 risk). Time: daily keys use the Asia/Kolkata date from EP-10-S10.
- **Depends on:** EP-10-S1, EP-10-S3, EP-03-S6, EP-03-S8, EP-07-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S5: System can mark a lead late when its SLA passes and emit the passed-SLA event

- **Story ID:** EP-10-S5
- **Title:** System can mark a lead late when its SLA passes and emit the passed-SLA event
- **As a:** System
- **I want:** a delayed job, scheduled when a lead arrives, that checks the lead at `arrivedAt` plus `settings.leadSlaHours` and, if it is still `needs_glance` or `opened`, sets SLA breached at and emits the passed-SLA event
- **So that:** "8 h limit passed · owner told" on `leads` is true, because the owner is actually told (FR-10-5, FR-10-7, BR-10-2, BR-10-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lead that arrived at 09:00 and is still `needs_glance`, when 8 hours pass, then SLA breached at is set to 17:00 (the time the limit passed), the breach notified flag is set once, and "Lead arrived / passed its SLA" is emitted once (epic acceptance criterion 1).
  2. Given a lead in `opened` when the limit passes, when the job runs, then it is marked late in the same way.
  3. Given `settings.leadSlaHours` is changed from 8 to 6 while a lead that arrived 7 hours ago is still `needs_glance`, when the change is saved, then the lead's due time is recalculated and it is marked late within one minute.
  4. Given the job runs at 17:00 for that lead, when the breach is recorded, then the event is published within one minute of 17:00 and staff on `leads` and the owner on `decisions` see "2 leads nobody has opened for over 8 hours" counts update.
  5. Given the due time is worked out, when the code is read, then it comes from one shared function that a shop-hours calendar (EP-13) can replace without changing the job.
- **Rules enforced on the server:** The job reads the lead's current state inside its transaction and acts only if it is `needs_glance` or `opened` (`slaRunning`). The breach is claimed with the key lead id plus "sla-breach" (EP-10-S4). SLA breached at is the due time, not the run time. Who is told and on which channel is left to EP-11.
- **Live events emitted / consumed:** emitted: "Lead arrived / passed its SLA" (the passed-SLA half, on behalf of EP-28). consumed: None.
- **Audit entry written:** Yes: actor (System, SLA breach job), time, entity (lead), action (lead marked late), before (SLA breached at empty), after (SLA breached at).
- **Data changes:** Adds SLA breached at (UTC) and breach notified flag to Lead by migration (EP-02-S7 table). Pending-job rows for each lead's SLA timer.
- **UI reference:** No screen of its own. Shown on `docs/ux/mockups/16-lead-inbox.svg`, route `leads` ("8 h limit passed · owner told"), and `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("RUNNING LATE · 2 · THE CLOCK TOLD ME, NOT A PERSON").
- **Non-functional checks:** Time: due time stored in UTC. Performance: breach detected within one minute of the limit (epic section 13). Concurrency: one breach per lead with several workers. Open decision A2: whether the 8 hours count shop hours ("shop hours, not clock hours" on mockup 13) or clock hours; tests use clock hours through the replaceable due-time function until decided.
- **Depends on:** EP-10-S1, EP-10-S4, EP-02-S7, EP-02-S12, EP-07-S1, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S6: System can cancel a lead's SLA timer when staff start working it

- **Story ID:** EP-10-S6
- **Title:** System can cancel a lead's SLA timer when staff start working it
- **As a:** System
- **I want:** the lead's pending SLA job to be cancelled in the same transaction that moves the lead out of `needs_glance` or `opened`
- **So that:** a lead that staff picked up in time is never shown or reported as late (FR-10-6, BR-10-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lead that arrived at 09:00, opened by Rajesh Verma at 12:00 and moved to `being_worked`, when 17:00 passes, then no SLA breached at is recorded and no passed-SLA event is emitted (epic acceptance criterion 2).
  2. Given the cancel happens at 16:59:59 and the breach job is already picked up at 17:00, when the job reads the lead, then it finds `being_worked` and makes no change, because it re-checks the state inside its transaction.
  3. Given a lead moved from `needs_glance` to `opened`, when the move commits, then the timer is not cancelled, because `opened` still runs the clock.
  4. Given the lead transition fails and rolls back, when the transaction ends, then the SLA timer is still pending.
  5. Given a lead already marked late, when it is moved to `being_worked`, then SLA breached at stays as recorded.
- **Rules enforced on the server:** The cancel is called by the lead transition service function (EP-28) inside its own transaction (EP-03-S6). The breach job re-checks `slaRunning` before acting, so a lost cancel still cannot cause a false breach.
- **Live events emitted / consumed:** None from this story. The lead state change itself is EP-28's.
- **Audit entry written:** No. Cancelling a timer changes no business record; the lead transition is audited by EP-28 (EP-06-S7).
- **Data changes:** Deletes or marks cancelled the lead's pending-job row.
- **UI reference:** No screen of its own. Affects the "within time · 6 h left" and "being worked" rows on `docs/ux/mockups/16-lead-inbox.svg`, route `leads`.
- **Non-functional checks:** Concurrency: a cancel racing a due breach never produces a breach for a worked lead.
- **Depends on:** EP-10-S1, EP-10-S5, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S7: System can mark a karigar job overdue past its agreed date

- **Story ID:** EP-10-S7
- **Title:** System can mark a karigar job overdue past its agreed date
- **As a:** System
- **I want:** a daily job that finds karigar jobs not `handed_over` whose agreed date (`confirmedDate ?? dueDate`) is before today in Asia/Kolkata, sets overdue since, and hands one reminder per job per day to EP-11
- **So that:** "2 karigar jobs past their agreed date · both reminded automatically" is true without staff chasing each karigar (FR-10-8, BR-10-5, BR-10-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given job MO-2026-118 with agreed date 1 November 2026 and status `on_bench`, when the overdue job runs on 2 November 2026, then overdue since is set, last reminder at is set, and one reminder is handed to EP-11 for that day (epic acceptance criterion 3).
  2. Given a job with `confirmedDate` 5 November and `dueDate` 1 November, when the job runs on 2 November, then it is not overdue, because the confirmed date wins.
  3. Given a job past its agreed date but `handed_over`, when the job runs, then it is not marked overdue.
  4. Given Mahesh Soni's job is 3 days over, when the job runs again on the same day, then no second reminder is handed over for that day.
  5. Given a job becomes overdue, when the change commits, then "Job passed its agreed date" is published so `decisions` and `k-jobs` update.
- **Rules enforced on the server:** The key is job id plus "overdue" plus the Asia/Kolkata date (EP-10-S4). Overdue days are counted in whole Asia/Kolkata days (`jobOverdueDays`, EP-10-S10). Overdue since is set once and not moved by later runs. The reminder audience and channel are EP-11's.
- **Live events emitted / consumed:** emitted: "Job passed its agreed date" (proposed in README gap G26, owner EP-19, emitted through EP-10). consumed: None.
- **Audit entry written:** Yes: actor (System, overdue job), time, entity (karigar job MO-2026-118), action (job marked overdue or reminder sent), before and after overdue since and last reminder at.
- **Data changes:** Adds overdue since (UTC) and last reminder at to KarigarJob by migration (EP-02-S8 table).
- **UI reference:** No screen of its own. Shown on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("Mahesh Soni 3 days over · Lakshmi Devi 1 day over · both reminded automatically"), and on `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Time: day boundary computed in Asia/Kolkata. Concurrency: one reminder per job per day. Open question: whether a karigar is reminded once or every day while overdue; tests cover one per day, the shape FR-10-8 states, until decided. Open question G26: "Job passed its agreed date" is proposed, not yet in the catalogue.
- **Depends on:** EP-10-S1, EP-10-S4, EP-10-S10, EP-02-S8, EP-07-S1, EP-07-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S8: System can expire edit tokens and OTPs after 10 minutes

- **Story ID:** EP-10-S8
- **Title:** System can expire edit tokens and OTPs after 10 minutes
- **As a:** System
- **I want:** a sweep that runs every minute and sets expired at on every PieceEdit token and OtpChallenge issued more than 10 minutes ago and not yet used
- **So that:** a code entered after 10 minutes is refused even if the check at use were wrong, and the owner's pending list does not show dead tokens (FR-10-9, BR-10-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an edit token issued 11 minutes ago and not used, when the sweep runs, then its expired at is set (epic acceptance criterion 4).
  2. Given a sign-in OTP issued 11 minutes ago, when the sweep runs, then its expired at is set and entering it returns the expired-code message from EP-04-S7.
  3. Given a token issued 9 minutes ago, when the sweep runs, then it is untouched.
  4. Given a token already used, when the sweep runs, then it is not changed.
  5. Given the sweep has not run yet for a token issued 10 minutes and 30 seconds ago, when the code is entered, then the check at use still refuses it.
- **Rules enforced on the server:** The 10-minute limit is `TOKEN_TTL_MS` from the shared package (EP-01-S3, EP-01-S4). The sweep sets expired at only; it never deletes rows. The check at use stays in EP-04 and EP-25 and does not rely on the sweep.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, for edit tokens: actor (System, token sweep), time, entity (piece edit), action (token expired), token reference (never the token value, EP-06-S4). No for OTPs: sign-in events are audited by EP-04-S14 without the code.
- **Data changes:** Adds expired at to PieceEdit (EP-02-S5 table) and to OtpChallenge (EP-04-S2) by migration.
- **UI reference:** No screen of its own. Affects `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply`.
- **Non-functional checks:** Security: tokens expire after 10 minutes and are single use (PRODUCTION-SCOPE §5). Audit: token reference only, never the value. Performance: the sweep finishes in under 5 seconds with an index on issued at.
- **Depends on:** EP-10-S1, EP-10-S12, EP-02-S5, EP-04-S2, EP-04-S7, EP-06-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S9: System can start the 9 am wishes run when auto-send is on

- **Story ID:** EP-10-S9
- **Title:** System can start the 9 am wishes run when auto-send is on
- **As a:** System
- **I want:** a daily job at 9 am Asia/Kolkata that reads `settings.autoSendWishes` and, when it is on, hands that day's birthday and anniversary queue to EP-33 once
- **So that:** "Send wishes automatically at 9 am" on `wishes` works without anyone pressing a button (FR-10-10, FR-10-11, BR-10-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given `autoSendWishes` is on, when it is 09:00 Asia/Kolkata on 1 November 2026 (03:30 UTC), then the day's queue, including Priya Malhotra's birthday, is handed to EP-33 once (epic acceptance criterion 5).
  2. Given `autoSendWishes` is off, when 09:00 Asia/Kolkata passes, then the job records a run with result ok and hands nothing over.
  3. Given the job runs twice at 09:00 on the same day, when both finish, then the queue is handed over once, because the key is "wishes" plus the Asia/Kolkata date.
  4. Given the server machine's time zone is UTC, when the job is scheduled, then it still fires at 09:00 Asia/Kolkata, not 09:00 UTC.
  5. Given Ravi Shankar is not opted in to WhatsApp, when the queue is handed over, then this job does not decide who is sent; consent is applied by EP-33.
- **Rules enforced on the server:** The setting is read at run time, so a change before 09:00 takes effect that day. The key is "wishes" plus the Asia/Kolkata date (EP-10-S4). Consent, sender identity and message text are EP-33's, not this job's.
- **Live events emitted / consumed:** None from this story. Wish sends are recorded by EP-33.
- **Audit entry written:** No. Handing the queue over changes no business record; each wish sent is audited by EP-33 with a System actor (EP-06-S6).
- **Data changes:** None in the product database beyond the JobRun and JobKey rows. Reads `autoSendWishes` from settings (EP-02-S12).
- **UI reference:** No screen of its own. Controlled by "Send wishes automatically at 9 am" on `docs/ux/mockups/26-wishes.svg`, route `wishes`.
- **Non-functional checks:** Time: 9 am computed in Asia/Kolkata (EP-10-S10). Concurrency: one hand-over per day. Availability: a missed 9 am run is caught up the same day (EP-10-S11).
- **Depends on:** EP-10-S1, EP-10-S4, EP-10-S10, EP-02-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S10: System can compute day boundaries and 9 am in Asia/Kolkata

- **Story ID:** EP-10-S10
- **Title:** System can compute day boundaries and 9 am in Asia/Kolkata
- **As a:** System
- **I want:** shared functions that give the start of the day, the date and 09:00 in Asia/Kolkata for any UTC instant, used by the overdue and wishes jobs
- **So that:** "today", "1 day over" and "9 am" mean the shop's day, not the server's or a browser's (FR-10-12, BR-10-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the UTC instant 2026-11-01T18:45:00Z, when the Asia/Kolkata date is asked for, then it is 2 November 2026 (00:15 local).
  2. Given the date 1 November 2026, when 09:00 Asia/Kolkata is asked for, then it is 2026-11-01T03:30:00Z.
  3. Given a job with agreed date 1 November and the instant 2026-11-01T18:45:00Z, when `jobOverdueDays` is computed, then it is 1.
  4. Given the server's TZ environment variable is set to UTC or to America/New_York, when the tests run, then every result above is the same.
  5. Given the prototype `startOfDay` in `src/domain/clock.ts`, when the server code is searched, then no job uses the browser-local version.
- **Rules enforced on the server:** All stored times are UTC. The Asia/Kolkata zone is named explicitly in code, never read from the machine. The functions live in the shared package so web and api agree (EP-01-S3, EP-01-S4).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Pure calculation.
- **Data changes:** None in the product database. Adds the time functions to the shared package.
- **UI reference:** No screen
- **Non-functional checks:** Time: store UTC, compute local days in Asia/Kolkata (PRODUCTION-SCOPE §5, epic section 16 risk).
- **Depends on:** EP-01-S3, EP-01-S4, EP-01-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S11: System can run missed jobs after downtime

- **Story ID:** EP-10-S11
- **Title:** System can run missed jobs after downtime
- **As a:** System
- **I want:** the scheduler, on start, to run every delayed job whose due time passed while it was down, and to run each missed daily job for today only
- **So that:** an outage does not lose a lead breach or skip today's wishes, and old days are not replayed (epic section 13 availability, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given the scheduler is down from 16:30 to 17:20 and a lead's SLA was due at 17:00, when it starts at 17:20, then the lead is marked late with SLA breached at 17:00, not 17:20.
  2. Given the scheduler is down from 08:50 to 09:40 Asia/Kolkata with `autoSendWishes` on, when it starts, then today's wishes run once.
  3. Given the scheduler was down for all of 1 and 2 November, when it starts on 3 November, then the wishes job runs for 3 November only and not for the two missed days.
  4. Given the overdue job missed today's run, when the scheduler starts, then it runs once for today.
  5. Given a lead was moved to `being_worked` during the downtime, when the missed breach job runs, then it makes no change.
- **Rules enforced on the server:** Catch-up runs go through the same idempotency keys (EP-10-S4), so a job that did run before the outage is not repeated. Daily jobs catch up only for the current Asia/Kolkata date (EP-10-S10).
- **Live events emitted / consumed:** None from this story. Catch-up runs emit what their handlers emit (EP-10-S5, EP-10-S7).
- **Audit entry written:** No. Catch-up itself changes nothing; the handlers' changes are audited (EP-10-S12).
- **Data changes:** None in the product database beyond JobRun rows.
- **UI reference:** No screen
- **Non-functional checks:** Availability: missed jobs run on restart, with the recorded breach time being the time the limit passed (epic section 13). Concurrency: catch-up on two workers still acts once per key.
- **Depends on:** EP-10-S1, EP-10-S4, EP-10-S5, EP-10-S9, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S12: System can audit job-made changes with a System actor

- **Story ID:** EP-10-S12
- **Title:** System can audit job-made changes with a System actor
- **As a:** System
- **I want:** every state change made by a job handler to write an audit entry whose actor is the System actor named after the job, in the same transaction as the change
- **So that:** the owner can tell in the security log that the clock, not a person, marked a lead late or expired a token (FR-10-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given the SLA breach job marks a lead late, when Sanjay Seth reads the audit log, then the entry shows actor System (SLA breach job), the lead, action lead marked late, and before and after SLA breached at.
  2. Given the overdue job marks MO-2026-118 overdue, when the log is read, then the entry shows actor System (overdue job).
  3. Given the token sweep expires an edit token, when the log is read, then the entry shows a token reference and not the token value.
  4. Given a job's transaction rolls back, when the log is read, then no entry exists for that attempt.
  5. Given the audit log filter by actor, when Sanjay picks System, then only job-made and integration-made entries show.
- **Rules enforced on the server:** Handlers write entries through the shared audit writer in the same transaction (EP-06-S2). The System actor comes from EP-06-S6 and cannot be set by a user session.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (System, job name), time, entity, action, before, after, token reference where a token is involved.
- **Data changes:** None beyond AuditEntry rows (EP-02-S11). Registers one System actor per job name.
- **UI reference:** No screen of its own. Entries show on the owner's audit log from EP-06-S9 to EP-06-S11.
- **Non-functional checks:** Audit: every state change by a job is audited with a System actor (epic section 13). Security: entries cannot be updated or deleted (EP-06-S1).
- **Depends on:** EP-10-S1, EP-06-S1, EP-06-S2, EP-06-S4, EP-06-S6, EP-06-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-10-S13: Owner can see recent job runs and failures

- **Story ID:** EP-10-S13
- **Title:** Owner can see recent job runs and failures
- **As a:** Owner
- **I want:** to list recent job runs newest first, filter to failed ones, and retry a failed run
- **So that:** I can check that late-lead alerts and 9 am wishes really ran, and restart one that failed (epic section 10 List and Retry)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is signed in as Owner, when he calls List job runs, then he gets the newest 50 runs with job name, scheduled at and started at in Asia/Kolkata, attempts, result and error text, and a cursor for more.
  2. Given he filters by result failed, when the list returns, then only failed runs show.
  3. Given a failed wishes run, when he calls Retry on it, then a new attempt runs with the same idempotency key and the queue is still handed over at most once that day.
  4. Given Rajesh Verma (Staff) or Lakshmi Devi (Karigar), when either calls List job runs or Retry, then the server answers `forbidden`.
  5. Given Sanjay retries a run, when it is recorded, then an audit entry names him as the actor of the retry.
- **Rules enforced on the server:** List job runs and Retry job run are allowed for Owner only until the open question is decided (EP-05-S1, EP-05-S2). Retry is allowed only on runs with result failed. Pages use a cursor (EP-03-S9).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, for Retry: actor (Owner), time, entity (job run id), action (failed run retried). No for List: reading changes nothing.
- **Data changes:** None in the product database beyond new JobRun attempts. Adds List job runs and Retry job run to the shared contract (EP-03-S1).
- **UI reference:** Not yet designed. No mockup shows a job run view.
- **Non-functional checks:** Security: job list and retry are not open to staff or karigars (epic section 13). Time: times shown in Asia/Kolkata. Open question: whether the owner or only operations may see run history and retry; criteria assume Owner and the permission can be narrowed without changing the operation.
- **Depends on:** EP-10-S2, EP-10-S3, EP-10-S4, EP-03-S1, EP-03-S9, EP-05-S1, EP-05-S2, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A2: does the 8-hour SLA count shop hours or clock hours? If shop hours, where does the shop-hours calendar live (EP-13)? (EP-10-S5, S11)
- D1: is the scheduler a managed platform feature or an own worker process? (EP-10-S1, S3, S11)
- Who may see job run history and retry a failed job: the owner, or only operations? (EP-10-S13)
- How often is a karigar reminded while a job stays overdue: once, or every day? (EP-10-S7)
- G17: are broadcasts scheduled by this scheduler, and who owns that trigger? (EP-10-S1)
- G26: is "Job passed its agreed date" added to the event catalogue? (EP-10-S7)
