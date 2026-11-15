# EP-10: Background jobs

## 1. Summary

This epic adds a scheduler that does work when nobody is looking at a screen. In the prototype every timer is worked
out when a screen is drawn: a lead shows "8 h limit passed · owner told" only because someone opened the inbox. In
production the owner must actually be told when a lead passes its 8-hour SLA, a karigar must be reminded when a job
passes its agreed date, an edit token must stop working after 10 minutes, and birthday wishes must go out at 9 am
without anyone pressing a button. This epic provides the scheduler, the registered jobs for these four triggers,
retries, and idempotency so that each event is acted on exactly once.

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. All timers are derived on read (`slaState` in `src/domain/leads.ts`, `jobOverdueDays` and `overdueJobs` in `src/store/selectors.ts`, `checkToken` at use time), and `sendWishes` runs only on a button press.

## 3. Roles involved

- System: runs scheduled and delayed jobs, retries failures, records each run, and hands results to the notifications engine.
- Owner: receives the outcome (late-lead and overdue alerts through EP-11); can see job run history if an ops view is added.
- Staff: receive late-lead alerts first when `lateLeadAudience` is `staff_then_owner` (through EP-11).
- Karigar: receives overdue reminders about their own jobs (through EP-11).

## 4. In scope

- A scheduler, built as a worker process of the team's own Node + TypeScript API (D1, Option C), that runs registered jobs at a time, after a delay, or on a repeat.
- Idempotency keys so a trigger acts once even if the job runs twice (for example one breach alert per lead).
- Retries with backoff and a final failed state.
- A run history per job: started, finished, result, attempts.
- SLA breach job: a lead in `needs_glance` or `opened` for `settings.leadSlaHours` (8) hours since `arrivedAt` becomes late and emits the passed-SLA event.
- Overdue job: a karigar job past its agreed date (`confirmedDate ?? dueDate`) and not `handed_over` becomes overdue and triggers reminders.
- Token expiry sweep: edit tokens and OTPs older than 10 minutes are marked expired.
- 9 am wishes trigger: when `autoSendWishes` is on, the day's birthday and anniversary queue is sent at 9 am Asia/Kolkata.
- A retention runner hook for EP-09 file retention.

## 5. Out of scope

- Who is notified, on which channel, and the escalation from staff to owner (EP-11).
- Lead states and the inbox (EP-28); this job only detects the breach.
- Job states and the tracker (EP-19).
- Edit token issue and check (EP-25); OTP issue and check (EP-04).
- The wishes queue, two sender identities and consent rules (EP-33).
- Scheduled broadcasts ("schedule for Deepavali eve", gap G17) (EP-34).
- Shop-hours calendar and settings values (EP-13).
- Alerting on failed jobs (EP-37).

## 6. Current state in the prototype

- `src/domain/leads.ts`: `slaRunning(lead)` is true for states `needs_glance` and `opened`; `slaState(lead, now, slaHours)` returns `late` with label "`${slaHours}` h limit passed · owner told" once elapsed hours reach the limit. Nobody is actually told.
- `src/store/selectors.ts`: `agreedDate(j) = j.confirmedDate ?? j.dueDate`; `jobOverdueDays(j, now)` counts whole days past the agreed date unless the job is `handed_over`; `overdueJobs` lists them; `lateLeads` lists late leads.
- `src/domain/edits.ts`: `TOKEN_TTL_MS = 10 * MIN`; `checkToken` returns `expired` only when someone enters a code.
- `src/store/transitions.ts` `sendWishes` records `WishRecord` rows when the button on `wishes` is pressed. `settings.autoSendWishes` (false in seed) is stored but nothing reads it on a timer.
- `src/domain/clock.ts`: `demoNow()` starts at Sunday 1 November 2026 11:06 and moves with real time; `startOfDay` uses the browser's local time zone.
- `StoreProvider` re-reads `now` every 30 seconds, which is the only "timer".
- Mockups: 26 "Send wishes automatically at 9 am"; 13 "both reminded automatically" (karigar overdue); 27 "schedule for Deepavali eve" (G17).
- Reusable: `slaRunning`, `slaState`, `agreedDate`, `jobOverdueDays`, `TOKEN_TTL_MS` as the conditions each job evaluates, from the shared package.
- Must be rebuilt server-side: the scheduler, triggers on the server clock, idempotency, retries, run history, and time-zone handling for 9 am and day boundaries in Asia/Kolkata.

## 7. Functional requirements

- FR-10-1. The scheduler runs a registered job at a set time, after a delay, or on a repeat, using the server clock.
- FR-10-2. Each job run records start, end, result and attempt count.
- FR-10-3. A failed job is retried with increasing delay up to a set number of attempts, then marked failed.
- FR-10-4. A job with an idempotency key acts once, even if two runs overlap or a run is retried.
- FR-10-5. A lead still in `needs_glance` or `opened` when `settings.leadSlaHours` hours have passed since `arrivedAt` is marked late once, and "Lead arrived / passed its SLA" is emitted once for it.
- FR-10-6. A lead that leaves `needs_glance` or `opened` before the limit is not marked late.
- FR-10-7. A change to `settings.leadSlaHours` applies to leads still running.
- FR-10-8. A karigar job not `handed_over` is marked overdue once per day it stays past its agreed date (`confirmedDate ?? dueDate`), and the reminder is handed to EP-11.
- FR-10-9. Edit tokens and sign-in OTPs older than 10 minutes are marked expired, so a code entered after expiry is refused even if the check-at-use rule fails.
- FR-10-10. When `autoSendWishes` is on, the wishes job runs at 9 am Asia/Kolkata each day and hands that day's queue to EP-33.
- FR-10-11. When `autoSendWishes` is off, the 9 am job does nothing.
- FR-10-12. Day boundaries for overdue and wishes are computed in Asia/Kolkata, while all stored times are UTC.
- FR-10-13. Every state change a job makes writes an audit entry with a System actor (EP-06).

## 8. Business rules

- BR-10-1. The scheduler covers SLA breaches, overdue jobs, token expiry and 9 am wishes, with retries and idempotency. [PRODUCTION-SCOPE §6 EP-10 scope]
- BR-10-2. A lead's clock runs from arrival until a person works it: states `needs_glance` and `opened`. [src/domain/leads.ts slaRunning]
- BR-10-3. The lead SLA is 8 hours by default (`leadSlaHours`). [PRODUCTION-SCOPE §1 live events; src/data/seed.ts settings]
- BR-10-4. The 8-hour SLA counts shop hours, pending confirmation of A2. [PRODUCTION-SCOPE §5 Time; SCOPE-ANALYSIS App. A A2]
- BR-10-5. A karigar is held to the date he confirmed, else the date on the order copy. [src/store/selectors.ts agreedDate]
- BR-10-6. Tokens expire after 10 minutes and are single use. [PRODUCTION-SCOPE §5 Security]
- BR-10-7. Wishes can be sent automatically at 9 am. [mockup 26]
- BR-10-8. Overdue karigars are reminded automatically. [mockup 13]
- BR-10-9. Store UTC; display Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- JobDefinition: name, schedule (cron-like or delay), handler, max attempts.
- JobRun: id, job name, idempotency key, scheduled at, started at, finished at, attempts, result (ok, retrying, failed), error text.
- Lead (EP-02, changed here): SLA breached at (UTC), breach notified flag.
- KarigarJob (EP-02, changed here): overdue since (UTC), last reminder at.
- PieceEdit and OtpChallenge: expired at.
- No weights or money fields are created or changed by this epic.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Schedule | Job | Register a delayed or repeating job (internal) | System, from service functions |
| Cancel | Job | Cancel a pending job, for example the SLA timer when a lead is worked (internal) | System |
| Run | Job | Execute a due job with its idempotency key (internal) | Scheduler |
| List | Job runs | See recent runs and failures | Owner or operations (to decide) |
| Retry | Job run | Re-run a failed job | Operations (to decide) |

## 11. Live events

- Emits: "Lead arrived / passed its SLA" — when a lead's SLA clock passes `leadSlaHours` while it is still `needs_glance` or `opened` (the passed-SLA half, on behalf of EP-28).
- Emits (proposed, not in catalogue): "Job passed its agreed date" — when a karigar job becomes overdue; listed in README gap G26 with EP-19 as owner.
- Consumes: none.

## 12. Screens and UX references

No screen of its own. Screens that depend on it: `leads` and `decisions` (late leads), `today` (needs-you-now cards),
`k-jobs` (overdue reminder), `wishes` (auto-send toggle), `edit-apply` (expired token). Mockups:
`13-notifications-escalation.svg` (running late, both reminded automatically), `26-wishes.svg` (9 am auto-send),
`27-broadcast.svg` (scheduled send, G17), `16-lead-inbox.svg` (SLA clock).

## 13. Non-functional requirements

- Time: stored UTC; 9 am and day boundaries in Asia/Kolkata; SLA counting by shop hours if A2 confirms it.
- Concurrency: idempotency keys (for example lead id plus "sla-breach") ensure one alert per breach even with several scheduler workers.
- Availability and recovery: jobs missed during downtime run on restart, and the breach time recorded is the time the limit passed, not the time the job ran.
- Audit: every state change by a job is audited with a System actor.
- Performance: a breach is detected within one minute of the limit, so the live event still arrives promptly.
- Security: the job list and retry operations are not open to staff or karigars.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-03
- Downstream: EP-11, EP-28, EP-33, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a lead that arrived at 09:00 and is still `needs_glance`, when 8 hours pass, then it is marked late once and "Lead arrived / passed its SLA" is emitted once.
2. Given the same lead opened by staff after 3 hours and moved to `being_worked`, when 8 hours pass, then no breach is recorded.
3. Given a job with agreed date yesterday and status `on_bench`, when the overdue job runs today, then one reminder is handed to EP-11 for today.
4. Given an edit token issued 11 minutes ago, when the sweep runs, then the token is marked expired.
5. Given `autoSendWishes` on, when it is 9 am Asia/Kolkata, then the day's queue is handed to EP-33 once.
6. Given a job run that fails three times, when retries are exhausted, then the run is marked failed with its error.

## 16. Risks

- Risk: two scheduler workers send the same alert twice. Mitigation: idempotency key per trigger, checked inside the transaction.
- Risk: the server's time zone is used for 9 am and "today", so wishes go out at the wrong hour. Mitigation: compute local times explicitly in Asia/Kolkata.
- Risk: A2 confirms shop hours after the job is built on clock hours. Mitigation: isolate the SLA due-time calculation in one shared function that a shop-hours calendar (EP-13) can replace.
- Risk: downtime during 9 am skips a day's wishes. Mitigation: on restart, run missed daily jobs for today only.
- Risk: job failures go unnoticed. Mitigation: hand failures to EP-37 alerting.

## 17. Open decisions and questions

- A2: does the 8-hour SLA count shop hours or clock hours? If shop hours, where does the shop-hours calendar live (EP-13)?
- Who may see job run history and retry a failed job: the owner, or only operations?
- How often is a karigar reminded while a job stays overdue: once, or every day?
- G17: are broadcasts scheduled by this scheduler, and who owns that trigger?
- G26: is "Job passed its agreed date" added to the event catalogue?

## 18. Candidate stories

1. EP-10-S1: System can register and run scheduled and delayed jobs on the server clock
2. EP-10-S2: System can record a run history for each job
3. EP-10-S3: System can retry a failed job with backoff and mark it failed after the last attempt
4. EP-10-S4: System can act once per idempotency key
5. EP-10-S5: System can mark a lead late when its SLA passes and emit the passed-SLA event
6. EP-10-S6: System can cancel a lead's SLA timer when staff start working it
7. EP-10-S7: System can mark a karigar job overdue past its agreed date
8. EP-10-S8: System can expire edit tokens and OTPs after 10 minutes
9. EP-10-S9: System can start the 9 am wishes run when auto-send is on
10. EP-10-S10: System can compute day boundaries and 9 am in Asia/Kolkata
11. EP-10-S11: System can run missed jobs after downtime
12. EP-10-S12: System can audit job-made changes with a System actor
13. EP-10-S13: Owner can see recent job runs and failures
