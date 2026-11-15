# EP-20: Karigar portal (PWA) · stories

Epic document: [EP-20 Karigar portal (PWA)](../epics/EP-20-karigar-portal-pwa.md)

Role note: stories where the server filters, creates, replays or pushes on its own use "System". The job state rules and the job payload come from EP-19; this epic builds the karigar's phone on `k-jobs` and the karigar-side operations. Parcel weighing and tagging are EP-21, send-back is EP-23, and clearing a raised problem is EP-24. Where those epics are not built yet, the stories here are tested with seeded parcels, jobs and problems. v1 is English only, so the "हिन्दी" chip on mockup 09 is not built in any story here (EP-44).

---

## EP-20-S1: System can limit every karigar read to the signed-in karigar's jobs

- **Story ID:** EP-20-S1
- **Title:** System can limit every karigar read to the signed-in karigar's jobs
- **As a:** System
- **I want:** every karigar-callable operation in this epic (List My jobs, Read My job, the state changes, Create Hand-over, Create Job media, Update Job note, Read Gold with me, Create Raised problem, Sync Queued updates) to filter by the karigar record linked to the session user, and to return a fixed allow-list of fields
- **So that:** a karigar sees only the jobs issued to him and never sees prices, margins, invoices, customers, leads, stock or another karigar's work (FR-20-2, FR-20-11, BR-20-1, BR-20-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar · KG-04 is signed in, when he calls Read My job for MO-2026-119, a job of Lakshmi Devi · KG-01, then the server returns `not_found`, the same response as for a job id that does not exist (epic acceptance criterion 1).
  2. Given Vijay is signed in, when he calls Create Hand-over, Create Job media, Update Job note or Create Raised problem with the id of a KG-01 job, then each returns `not_found` and nothing changes.
  3. Given a karigar user whose account has no linked karigar record (EP-05-S13), when he calls List My jobs, then the server returns an empty list and every job read returns `not_found`.
  4. Given the contract test suite runs, when the response of each karigar operation is checked against its allow-list, then the test fails if any response has a field for price, margin, invoice, customer name, customer phone, lead id, piece stock status or another karigar's id (epic acceptance criterion 6).
  5. Given a Staff or Owner session, when it calls List My jobs, then the server refuses with the EP-05-S2 permission error, because the desk reads jobs through the EP-19 shapes.
- **Rules enforced on the server:** The karigar id comes from the session user's link (EP-05-S13), never from the request. The filter is part of the query, not a check after the read (EP-05-S3). A job of another karigar and a job that does not exist return the same `not_found` (EP-03-S5). Karigar response shapes are allow-lists defined once in the shared contract (EP-03-S1). Only the Karigar role may call these operations (EP-05-S1, EP-05-S2).
- **Live events emitted / consumed:** None. The live filter for karigars is EP-07-S6.
- **Audit entry written:** No. Reads change nothing, and refused writes store nothing.
- **Data changes:** None in the product database. Adds the karigar response shapes and the allow-list contract test to the shared package and the `api` test suite.
- **UI reference:** No screen. The rule is drawn on `docs/ux/mockups/11-roles-and-permissions.svg` ("See the jobs issued to him, and only those", "NEVER SEES", "Prices, margins or invoices", "Customers, leads or stock", "Any other karigar's work or scorecard").
- **Non-functional checks:** Security: every karigar request is filtered on the server; other jobs return not-found (epic section 13). Personal data: the phone receives only the karigar's own jobs. D4 is decided: phone numbers are unique, so each session names one karigar.
- **Depends on:** EP-03-S1, EP-03-S5, EP-05-S1, EP-05-S2, EP-05-S3, EP-05-S13, EP-16-S6, EP-19-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S2: Karigar can sign in on the phone

- **Story ID:** EP-20-S2
- **Title:** Karigar can sign in on the phone
- **As a:** Karigar
- **I want:** to sign in on my phone with the method EP-04 provides, land on "My jobs" (`k-jobs`), stay signed in at the bench, and be signed out at once if the owner deactivates me
- **So that:** only I can see and move my jobs from my phone (FR-20-1, FR-20-16, BR-20-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar's phone number is on an active karigar user linked to KG-04, when he completes sign-in on a 5-inch phone, then he lands on `k-jobs` with the heading "My jobs" and "Vijay Kumar · KG-04", with no role switcher and no desk rail (EP-04-S6, EP-08-S12).
  2. Given the sign-in screen on the phone, when it is measured, then every button and input is at least 56 px tall and no text is below 15 px (BR-20-3).
  3. Given Vijay types a wrong or expired code, when the server answers, then the phone shows the EP-04-S7 sentence in at least 15 px text and lets him ask for a new code.
  4. Given Vijay is signed in on the phone, when the owner deactivates his user, then the phone is returned to sign-in within about a second if connected, and any later request with the old session is refused (EP-04-S13, EP-05-S10, EP-08-S15).
  5. Given Vijay presses "Sign out" on the Me tab, when the request completes, then the session ends and the phone shows sign-in (EP-04-S11).
- **Rules enforced on the server:** Sign-in, code checks, lockout and rate limits are EP-04's. Only a user with role Karigar and a linked karigar record lands on `k-jobs` (EP-05-S13). Deactivation ends every session of the user at once (EP-04-S13). Idle expiry follows EP-04-S12.
- **Live events emitted / consumed:** Consumed: "User deactivated or role changed" to close the connection and return to sign-in (EP-07-S10).
- **Audit entry written:** Yes, through EP-04-S14: actor, time, action (sign-in, failure, lockout, sign-out), with no code value.
- **Data changes:** None beyond EP-04 sessions. Moves `KarigarPhone.tsx` off the demo identity (`Identity.karigarId` and "Sign in as a karigar from the switcher") onto the real session.
- **UI reference:** Not yet designed for the phone sign-in. Landing is `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Vijay Kumar · KG-04", "My jobs").
- **Non-functional checks:** Security: no demo role switcher in the build (EP-08-S19); deactivation ends sessions at once (BR-20-8). D4 is decided: phone and password, phone numbers unique, so a karigar cannot sign in on a shared phone number. Open decision D5: installable web app or native app; this story assumes the browser on the phone.
- **Depends on:** EP-04-S3, EP-04-S5, EP-04-S6, EP-04-S7, EP-04-S11, EP-04-S12, EP-04-S13, EP-04-S14, EP-05-S10, EP-05-S13, EP-07-S10, EP-08-S12, EP-08-S15, EP-08-S19
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S3: Karigar can see their own jobs

- **Story ID:** EP-20-S3
- **Title:** Karigar can see their own jobs
- **As a:** Karigar
- **I want:** the Jobs tab to list my open jobs with title, pieces, purity, style, due label and reference image, and a job sheet with "What it should look like", "Finished piece must weigh", "Gold inside it, after stones", "Allowed to be off by" and "Note from the desk"
- **So that:** I know what is on my bench and what each piece must weigh without calling the desk (FR-20-2, FR-20-10, BR-20-1, BR-20-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar · KG-04 has MO-2026-118 "Peacock Ruby Pendant" (2 pieces · 22K · Antique, due today) and "Temple Haram" (1 piece · Chettinad, due in 9 days), when he opens `k-jobs`, then both cards show, MO-2026-118 first with "Due today", and the Temple Haram card shows "Target 84.5000 g · gold 78.4000 g".
  2. Given Vijay opens MO-2026-118, when the sheet loads, then it shows "Finished piece must weigh 18.2000 g", "Gold inside it, after stones 15.1000 g", "Allowed to be off by ± 500 mg", the reference image with "See bigger", the job status chip and the note from the desk.
  3. Given the job list, when the payload and the screen are checked, then no price, customer, lead, stock or other karigar's field appears (epic acceptance criterion 6).
  4. Given Vijay has no open jobs, when the tab loads, then it shows "Nothing on your bench. New work from the desk shows up here." and the "Finished jobs" line, for example "14 delivered this year".
  5. Given the jobs read fails or is slow, when the tab is open, then it shows the EP-08-S3 loading state and then the EP-08-S4 error with "Try again", and on a mobile connection a list of 20 jobs loads in under 2 seconds.
- **Rules enforced on the server:** List My jobs and Read My job use the EP-20-S1 filter and allow-list. Open jobs are those not handed over and not cancelled, sorted by agreed date (`confirmedDate` else `dueDate`), earliest first. Due labels ("Due today", "Due in 9 days", late) are computed from the agreed date in Asia/Kolkata (EP-10-S10). The "Finished jobs" count is jobs handed over in the current calendar year in Asia/Kolkata. Reference images are served through signed links for the karigar's own jobs only (EP-09-S9).
- **Live events emitted / consumed:** Consumed: "Karigar job status changed" (own jobs only) to refresh the list and sheet (EP-08-S9). New jobs arriving live are EP-20-S11.
- **Audit entry written:** No. Reading jobs changes nothing.
- **Data changes:** None in the product database. Moves the Jobs tab and `JobSheet` in `KarigarPhone.tsx` off `useStore()` and `jobsForKarigar` / `openJobsForKarigar` onto the EP-08 data layer. The Me tab shows the EP-16-S12 profile.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("1 · WHAT IS ON MY BENCH", "My jobs", "Due today", "What it should look like", "See bigger", "Finished piece must weigh", "Gold inside it, after stones", "Allowed to be off by", "Note from the desk", "Finished jobs", tabs "Jobs", "Gold", "Me"). The mockup shows weights to 3 decimals; v1 shows 4.
- **Non-functional checks:** Precision: weights shown to 4 decimals from integer units of 0.0001 g; the tolerance shown in mg from the same units. Performance: jobs tab under 2 seconds on a mobile connection; images are the EP-09-S4 resized copies. Time: due labels in Asia/Kolkata. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Open question: whether the karigar should still see the date the desk asked for after confirming his own.
- **Depends on:** EP-20-S1, EP-20-S2, EP-19-S5, EP-09-S4, EP-09-S9, EP-10-S10, EP-16-S12, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S10, EP-08-S11, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S4: Karigar can accept a job and confirm a date

- **Story ID:** EP-20-S4
- **Title:** Karigar can accept a job and confirm a date
- **As a:** Karigar
- **I want:** on a job in `sent`, a "Will you make this?" box with "I will deliver by" and "Accept this job", which accepts the job and makes my date the agreed date
- **So that:** the desk knows I have the gold and the date I will deliver by (FR-20-3, BR-20-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 in `sent` with due date 17 Nov 2026, when Lakshmi Devi · KG-01 opens it, then "I will deliver by" is filled with 17 Nov 2026 and the line "The desk asked for 17 Nov." shows under "Accept this job".
  2. Given Lakshmi picks 16 Nov 2026 and presses "Accept this job", when the server commits, then the job is `accepted` with `confirmedDate` 16 Nov 2026, the "Gold received" step shows ticked, and the desk tracker moves the card to Accepted within about a second.
  3. Given Lakshmi clears the date and presses "Accept this job", when the phone checks it, then it shows "Pick the date you will deliver by." and sends nothing.
  4. Given a date before today in Asia/Kolkata, or a job already accepted, when the request reaches the server, then it refuses, the second case with "This job has already been accepted.", and the phone shows the sentence (EP-08-S5).
  5. Given MO-2026-119 is stopped, when Lakshmi opens it, then "Accept this job" is not offered and the notice "This job is stopped. Only the owner can start it again." shows.
- **Rules enforced on the server:** Accept is the EP-19-S6 transition `sent` → `accepted`, callable only by the karigar linked to the job (EP-20-S1). The confirmed date is required and must be today or later in Asia/Kolkata (EP-10-S10). A stopped or cancelled job cannot be accepted. Version check on the job (EP-02-S14). Audit in the same transaction.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (accepted, through EP-19-S7).
- **Audit entry written:** Yes, through EP-19-S6: actor, time, entity (job id), action (`job_accepted`), before (`sent`), after (`accepted`, confirmed date).
- **Data changes:** Updates `karigar_jobs.status`, `confirmedDate` and `version`. No new tables.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` (step "Gold received"). The "Will you make this?" box is in the prototype `JobSheet` and not drawn on the mockup.
- **Non-functional checks:** Time: the date picker and the server check use Asia/Kolkata dates. Concurrency: a double tap or a retry after a drop applies once (EP-08-S6, EP-03-S8). Open question: whether the confirmed date may be later than the desk's due date, and whether the karigar keeps seeing the desk's date after confirming.
- **Depends on:** EP-20-S3, EP-19-S6, EP-19-S7, EP-03-S8, EP-08-S5, EP-08-S6, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S5: Karigar can mark a job worked on and ready

- **Story ID:** EP-20-S5
- **Title:** Karigar can mark a job worked on and ready
- **As a:** Karigar
- **I want:** under "Where is it now?", to tap "Working on it" and later "Ready for checking", one step at a time, with an optional note in "Anything to tell the desk?"
- **So that:** the desk sees how far each job has got without phoning me (FR-20-4, FR-20-7, BR-20-4, BR-20-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 is `accepted`, when Lakshmi Devi taps "Working on it", then the job is `on_bench`, the step is ticked, and only "Ready for checking" is enabled next.
  2. Given the job is `on_bench` and Lakshmi types "Clasp fitted, polishing tomorrow" in "Anything to tell the desk?", when she taps "Ready for checking", then the job is `ready` and `benchNote` holds the note.
  3. Given the job is `accepted`, when a request to mark it ready reaches the server, then it refuses with "Mark it as being worked on first." and the phone shows the sentence.
  4. Given MO-2026-118 is stopped, when Vijay Kumar opens it, then every step button is disabled, the notice "This job is stopped. Only the owner can start it again." shows, and a request sent anyway is refused with the same sentence (epic acceptance criterion 4).
  5. Given each step button and the note field, when they are measured, then they are at least 56 px tall with text of 15 px or more (BR-20-3).
- **Rules enforced on the server:** Start (`accepted` → `on_bench`) and mark ready (`on_bench` → `ready`) are the EP-19-S6 transitions, in that order only, callable by the karigar linked to the job. A stopped job cannot move (`stoppedGuard`). The bench note is trimmed and limited to 1,000 characters (proposed limit, to confirm). Version check on the job.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (through EP-19-S7). Consumed: "Problem raised on a job or piece" and "Problem cleared" (proposed, gap G26) to show and lift the stop on the sheet; until EP-24 emits them, the stop flag arrives on "Karigar job status changed".
- **Audit entry written:** Yes, through EP-19-S6: actor, time, entity (job id), action (`job_started` or `job_ready`), before and after status, bench note.
- **Data changes:** Updates `karigar_jobs.status`, `benchNote` and `version`. No new tables.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Where is it now?", "Tap one. The desk sees it at once.", "Gold received", "Working on it", "Ready for checking", "Sent to the showroom", "Anything to tell the desk?", "Send the update").
- **Non-functional checks:** Concurrency: version check; a state that is no longer valid is refused with the reason (epic section 13). Availability: offline taps are queued by EP-20-S12b; until then, server actions are disabled offline (EP-08-S11).
- **Depends on:** EP-20-S3, EP-20-S4, EP-19-S6, EP-19-S7, EP-08-S5, EP-08-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S6: Karigar can hand over a ready job and create the parcel

- **Story ID:** EP-20-S6
- **Title:** Karigar can hand over a ready job and create the parcel
- **As a:** Karigar
- **I want:** on a `ready` job, to tap "Sent to the showroom", which marks the job handed over and creates the arriving parcel in the same transaction
- **So that:** the staff see the parcel arrive and can weigh it at once (FR-20-5, BR-20-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 is `ready` and has no parcel, when Lakshmi Devi taps "Sent to the showroom", then the job is `handed_over`, a parcel BATCH-2026-NNN exists with karigar KG-01, job MO-2026-119, `stage` 1, `status` `open`, `verdict` `incomplete`, no weighings, and the phone shows "Sent. The desk will weigh it when it arrives."
  2. Given Rajesh Verma has `parcels` open, when the hand-over commits, then the new parcel appears in the list within about a second without a reload (epic acceptance criterion 2).
  3. Given MO-2026-119 is `on_bench` with no parcel, when a hand-over request reaches the server, then it refuses with "Mark the job ready before handing it over." and no parcel is created.
  4. Given the job is stopped, when a hand-over request reaches the server, then it refuses with "This job is stopped. Only the owner can start it again." and no parcel is created.
  5. Given the hand-over is sent twice with one idempotency key after a network drop, when the server processes it, then one parcel exists and the second call returns the same parcel id.
- **Rules enforced on the server:** Create Hand-over is callable only by the karigar linked to the job (EP-20-S1). Allowed only from `ready`, or from `on_bench` after a send-back (EP-20-S7). The parcel id is the next `BATCH-YYYY-NNN` without duplicates. `arrivedAt` and the actor come from the server clock and session (EP-03-S3). Job update, parcel insert and audit commit or roll back together (EP-03-S6). Deduplicated by idempotency key (EP-03-S8). Version check on the job.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (handed over, through EP-19-S7) and "Parcel handed over by karigar" to the Parcels-in screen (Owner and Staff).
- **Audit entry written:** Yes: actor, time, entity (job id and parcel id), action (`job_handed_over`, `parcel_created`), before (`ready`), after (`handed_over`, parcel id).
- **Data changes:** Inserts one row into `parcels` (EP-02-S6) and sets `karigar_jobs.parcelId`, `status` and `version`. Adds Create Hand-over to the shared contract and ports `handOver` from `src/store/transitions.ts` as a server service function.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Sent to the showroom"); the parcel appears on route `parcels` (built in EP-21). The rule is drawn on `docs/ux/mockups/12-state-lifecycles.svg` ("Handing over creates the arriving parcel.").
- **Non-functional checks:** Concurrency: version check and idempotency key stop a double parcel; a queued hand-over that arrives after the owner stopped the job is refused on replay (epic section 16). Audit: the parcel creation is audited (EP-06-S7). Open question G14: one hand-over carrying several jobs is EP-20-S13; this story creates one parcel per job.
- **Depends on:** EP-20-S5, EP-19-S6, EP-19-S7, EP-02-S6, EP-02-S14, EP-03-S3, EP-03-S6, EP-03-S7, EP-03-S8, EP-06-S2, EP-06-S7, EP-07-S1, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S7: Karigar can hand over again after a send-back

- **Story ID:** EP-20-S7
- **Title:** Karigar can hand over again after a send-back
- **As a:** Karigar
- **I want:** when the owner has sent my parcel back and the job is on my bench again, to tap "Sent to the showroom" and have the same parcel reset to weighing, with its weighings, QC ticks and draft tags cleared
- **So that:** the corrected work comes back under the same parcel number and the staff weigh and tag it from the start (FR-20-6, BR-20-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given parcel BATCH-2026-044 has `resolution` `sent_back` and its job MO-2026-118 is `on_bench` with `parcelId` BATCH-2026-044, when Vijay Kumar taps "Sent to the showroom", then the job is `handed_over` and BATCH-2026-044 has `stage` 1, `status` `open`, `resolution` empty, `verdict` `incomplete`, `gapNetG` empty, `stoppedAt` empty, no weighings and no QC ticks.
  2. Given BATCH-2026-044 had 8 draft pieces tagged before the send-back, when the hand-over commits, then those 8 draft pieces no longer exist and no new parcel was created.
  3. Given the job is `on_bench` and its parcel is not sent back, when a hand-over request reaches the server, then it refuses with "Mark the job ready before handing it over."
  4. Given the parcel holds a piece that is not in draft, when the hand-over runs, then the server refuses and nothing changes, because only draft tags may be cleared.
  5. Given Rajesh Verma has `parcels` open, when the reset commits, then BATCH-2026-044 shows again as arrived at the weigh stage without a reload.
- **Rules enforced on the server:** Same caller rule as EP-20-S6. The reset path applies only when the job's parcel has `resolution` `sent_back`. Weighings, QC ticks and the parcel's draft pieces are deleted and the parcel reset in one transaction with the job update and the audit entry. Version checks on the job and the parcel.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (handed over) and "Parcel handed over by karigar" (same parcel id).
- **Audit entry written:** Yes: actor, time, entity (job id and parcel id), action (`job_handed_over`, `parcel_reset_after_send_back`), before (parcel stage, verdict, weighing count, draft tag numbers), after (stage 1, `incomplete`).
- **Data changes:** Updates `parcels`; deletes its weighing and QC tick child rows and its draft rows in `pieces`; updates `karigar_jobs`. No new tables.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Sent to the showroom"). The send-back itself is on `docs/ux/mockups/22-owner-clear-mismatch.svg` (EP-23). No screen shows the reset to the karigar.
- **Non-functional checks:** Concurrency: version check on the parcel so a reset cannot race a staff member still tagging it. Audit: the cleared tag numbers are kept in the audit entry. Open question: whether tag numbers of cleared draft pieces may be reused (EP-15-S6 and EP-15-S7). Until EP-23 exists, the sent-back state is seeded for tests.
- **Depends on:** EP-20-S6, EP-02-S5, EP-02-S6, EP-02-S14, EP-03-S6, EP-06-S2, EP-06-S3, EP-06-S7, EP-15-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S8: Karigar can raise a problem on a job

- **Story ID:** EP-20-S8
- **Title:** Karigar can raise a problem on a job
- **As a:** Karigar
- **I want:** a "Raise a problem" button on my open job that asks "What is wrong" and stops the job until the owner starts it again
- **So that:** I can stop work when something is wrong, such as loose stones or short gold, and the owner hears about it (FR-20-9, BR-20-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 is `on_bench` and not stopped, when Vijay Kumar presses "Raise a problem", types "Two kemp stones are loose." and sends, then a problem with target kind `job`, `raisedByRole` `karigar` and status `open` exists, the job reads stopped, and the sheet shows "This job is stopped. Only the owner can start it again."
  2. Given Vijay types "ok" (under 3 characters), when he sends, then the server refuses with "Say what is wrong." and nothing is stored.
  3. Given the job is stopped, when Vijay or Rajesh Verma tries to move it, then the server refuses with the stopped sentence, and the karigar has no button to clear it.
  4. Given Sanjay Seth has `decisions` open, when the problem is stored, then the owner sees it within about a second and gets the EP-11-S4 notice.
  5. Given a job that is `handed_over` or another karigar's job, when Vijay raises a problem on it, then the button is not shown, and a request sent anyway is refused or returns `not_found`.
- **Rules enforced on the server:** Create Raised problem for a karigar is limited to his own open jobs (EP-20-S1). The text is required, trimmed, at least 3 characters. The problem row and the job's `stopped` flag are set in one transaction with the audit entry. Clearing a problem is Owner only and belongs to EP-24, which reuses this operation's problem row. No other roles' rules are defined here.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (stopped flag true, through EP-19-S7) and "Problem raised on a job or piece" (proposed, gap G26). Consumed: "Problem cleared" (proposed, gap G26) to lift the notice when the owner clears it.
- **Audit entry written:** Yes: actor, time, entity (problem id and job id), action (`problem_raised`), after (target kind, target id, text, stopped true).
- **Data changes:** Inserts into `problems` (EP-02-S10) and sets `karigar_jobs.stopped`. Moves `RaiseProblem.tsx` with `target {kind: 'job', id}` onto the EP-08 data layer for the phone, in its large layout.
- **UI reference:** Not yet designed for the phone. The permission is drawn on `docs/ux/mockups/11-roles-and-permissions.svg` ("Raise a problem on his own job", "Anyone can stop the line. Only the owner can start it again."); the stopped colour on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Concurrency: the stop and a state change on the same job are ordered by the job version; a hand-over committed first is not undone. Audit: raised problem audited (EP-06-S7). Availability: whether a problem can be raised offline and queued is not decided; this story needs a connection. Until EP-24 ships, the owner-side clear is tested with a seeded clear.
- **Depends on:** EP-20-S3, EP-19-S6, EP-19-S7, EP-02-S10, EP-06-S2, EP-06-S7, EP-11-S4, EP-08-S5, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S9: Karigar can see gold with me

- **Story ID:** EP-20-S9
- **Title:** Karigar can see gold with me
- **As a:** Karigar
- **I want:** a "GOLD WITH ME" figure on my phone, with the number of jobs it covers, my wastage allowance and the line "You may be off by 500 mg either way", and a Gold tab that lists the gold per open job
- **So that:** I know how much of the shop's gold I hold and can check it against my own record (FR-20-10, BR-20-7, BR-20-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar · KG-04 holds two open jobs with 186.4000 g issued in total, no returns, and an allowance of 0.8%, when he opens `k-jobs`, then the header reads "GOLD WITH ME 186.4000 g" and "across 2 jobs · 0.8% wastage allowed".
  2. Given the Gold tab, when it loads, then each open job shows its job number, title and gold with him, and "You may be off by 500 mg either way" shows beside the total.
  3. Given 2.0000 g was recorded as returned on one job (EP-18-S7), when the figure is read, then it is 184.4000 g.
  4. Given Vijay has no open jobs, when the Gold tab loads, then it shows "No gold with you right now."
  5. Given Vijay calls Read Gold with me, when the server answers, then it returns only KG-04's figure, and an attempt to pass another karigar's id is ignored.
- **Rules enforced on the server:** Read Gold with me is the EP-18-S11 Read Gold with karigar, called by a karigar for himself only, with the karigar id taken from the session. The figure is computed on the server in integer units of 0.0001 g. The allowance shown is the karigar record's current allowance (EP-16-S1).
- **Live events emitted / consumed:** Consumed: "Metal pool changed" and "Karigar job status changed" (own jobs) to refresh the figure.
- **Audit entry written:** No. Reading the figure changes nothing.
- **Data changes:** None in the product database. Moves `GoldTab` and `goldWithKarigar` in `src/store/selectors.ts` onto the EP-18-S11 read.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("GOLD WITH ME", "186.400 g", "across 2 jobs · 0.8% wastage allowed", "You may be off by 500 mg either way"). The Gold tab itself is not yet designed (MOCKUP-COVERAGE §3). v1 shows 4 decimals.
- **Non-functional checks:** Precision: integer units, shown to 4 decimals (BR-20-9). Security: a karigar reads only his own figure. Open question: the mockup puts "You may be off by 500 mg either way" under a job's weights, while BR-20-7 puts it beside gold with me; the design pass settles where it shows.
- **Depends on:** EP-20-S1, EP-20-S3, EP-18-S11, EP-18-S12, EP-16-S1, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S10a: Karigar can add a photo and a note (part 1: bench photo and typed note)

Split note: EP-20-S10 was split into S10a and S10b because the photo and typed note use existing EP-09 storage and can ship with the core flow, while the spoken note depends on the open gap G16 and brings its own storage and recognition cost (epic section 16).

- **Story ID:** EP-20-S10a
- **Title:** Karigar can add a photo and a note (part 1: bench photo and typed note)
- **As a:** Karigar
- **I want:** "Add a photo (optional)" with "Take a photo of the bench", and a typed note in "Anything to tell the desk?", sent with "Send the update"
- **So that:** the desk can see the work and read what I need to tell them without a call (FR-20-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 is `on_bench`, when Vijay Kumar takes a photo with the phone camera and presses "Send the update", then a JobMedia row with kind `photo` links the file to the job, and the desk sees the photo on the job.
  2. Given Vijay types "Kemp stones set deep as asked" and presses "Send the update", when it commits, then `benchNote` holds the text and the desk sees it.
  3. Given a 25 MB file or a file type other than an image, when it is uploaded, then the server refuses with the EP-09-S3 message and no media row is stored.
  4. Given Vijay is signed in, when he attaches a photo to another karigar's job, then the server returns `not_found`.
  5. Given the photo button and the note field, when they are measured, then they are at least 56 px tall with text of 15 px or more.
- **Rules enforced on the server:** Create Job media and Update Job note are callable by the karigar linked to the job (EP-20-S1) on jobs not handed over or cancelled. Upload, size and type checks, resizing and signed links are EP-09's (EP-09-S3, EP-09-S4, EP-09-S10). The note is trimmed and limited to 1,000 characters (proposed limit, to confirm). Media row and audit commit together.
- **Live events emitted / consumed:** None in the catalogue. The desk sees the photo on its next read of the job.
- **Audit entry written:** Yes: actor, time, entity (job id), action (`job_photo_added`, `job_note_updated`), after (file id, or note text).
- **Data changes:** Migration creates `job_media` (job id, file id, kind `photo` or `voice`, created at, created by). Updates `karigar_jobs.benchNote`. Adds Create Job media and Update Job note to the shared contract.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Add a photo (optional)", "Take a photo of the bench", "Anything to tell the desk?", "Send the update").
- **Non-functional checks:** Performance: the photo is resized by EP-09-S4 before the desk loads it. Personal data: photos are of the bench and the piece; they are served only to Owner, Staff and the job's karigar (EP-09-S6). Availability: photos are not queued offline; the photo button is disabled offline with the EP-08-S11 state (assumption, to confirm under D6).
- **Depends on:** EP-20-S3, EP-09-S1, EP-09-S3, EP-09-S4, EP-09-S6, EP-09-S10, EP-06-S2, EP-08-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S10b: Karigar can add a photo and a note (part 2: spoken note, G16)

Split note: EP-20-S10 was split into S10a and S10b because the photo and typed note use existing EP-09 storage and can ship with the core flow, while the spoken note depends on the open gap G16 and brings its own storage and recognition cost (epic section 16).

- **Story ID:** EP-20-S10b
- **Title:** Karigar can add a photo and a note (part 2: spoken note, G16)
- **As a:** Karigar
- **I want:** the "Type or speak" control on "Anything to tell the desk?" to let me record a short spoken note and send it with the update
- **So that:** I can tell the desk something with oily hands, without typing (FR-20-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 is `on_bench`, when Vijay Kumar holds "Type or speak", records a 20-second note and presses "Send the update", then a JobMedia row with kind `voice` links the audio file to the job and the desk can play it.
  2. Given a recording longer than the decided limit (proposed 60 seconds), when Vijay records, then the phone stops at the limit and sends only that length.
  3. Given an audio file of a type not allowed or over the size limit, when it is uploaded, then the server refuses with the EP-09-S3 message and no media row is stored.
  4. Given the phone has no microphone permission, when Vijay taps "Type or speak", then the phone asks for it once and, if refused, keeps the typed note field working.
- **Rules enforced on the server:** Same caller and job-state rules as EP-20-S10a. Allowed audio types and the size limit are added to the EP-09 allow-list. No text is produced from the audio unless G16 decides on recognition.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (job id), action (`job_voice_note_added`), after (file id, length in seconds).
- **Data changes:** Uses `job_media` from EP-20-S10a with kind `voice`. Adds the audio types to the EP-09 file type allow-list.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("Type or speak").
- **Non-functional checks:** Personal data: recordings may hold voices of people at the bench; retention follows EP-09-S12. Open question G16: whether voice notes are in scope at all, and in which languages; v1 is English only for screens, and this story stores audio without recognition. Do not build until G16 is answered.
- **Depends on:** EP-20-S10a, EP-09-S3, EP-09-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S11: Karigar can receive a new job live

- **Story ID:** EP-20-S11
- **Title:** Karigar can receive a new job live
- **As a:** Karigar
- **I want:** a job the desk sends me to appear at the top of "My jobs" while the phone is open, and a late job to show as late, without refreshing
- **So that:** I start new work the moment it is sent and see when I am behind (FR-20-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi · KG-01 has `k-jobs` open, when Rajesh Verma sends MO-2026-119 to her, then the card appears in her list within about a second without a refresh (epic acceptance criterion 5).
  2. Given Vijay Kumar · KG-04 has `k-jobs` open, when MO-2026-119 is sent to Lakshmi, then nothing changes on Vijay's phone and he receives no event.
  3. Given Lakshmi's phone lost signal while the job was sent, when it reconnects, then it shows "Reconnecting…" and then the new job, caught up from the last sequence number (EP-07-S7, EP-08-S10).
  4. Given MO-2026-121 passes its agreed date while Mahesh Soni has the phone open, when "Job passed its agreed date" arrives, then its card shows in the late colour with the days over.
  5. Given the phone app is closed, when a job is sent, then Mahesh gets the EP-11-S8 notification naming the job.
- **Rules enforced on the server:** Events reach only the user channel of the karigar linked to the job (EP-07-S6). Payloads carry no customer, lead or money field (EP-19-S7). The phone refetches the job through the EP-20-S1 filtered read rather than trusting the event body.
- **Live events emitted / consumed:** Consumed: "Karigar job status changed" (job sent) and "Job passed its agreed date" (proposed, gap G26, emitted by EP-19 through EP-10).
- **Audit entry written:** No. Receiving an event changes nothing.
- **Data changes:** None in the product database. Adds the karigar's event-to-read map entries for List My jobs, Read My job and Read Gold with me (EP-08-S8).
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("My jobs"). The late card style is not yet designed.
- **Non-functional checks:** Performance: the new job shows within about a second of commit (PRODUCTION-SCOPE §1). Security: no event for another karigar's job. Availability: reconnecting state and catch-up after a drop.
- **Depends on:** EP-20-S3, EP-19-S7, EP-19-S9, EP-07-S6, EP-07-S7, EP-08-S8, EP-08-S9, EP-08-S10, EP-11-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S12a: Karigar can install the app and use it offline with a sync queue (part 1: install and open from cache)

Split note: EP-20-S12 was split into S12a and S12b because installing the app and opening it from cache is a front-end packaging task that can ship alone, while the offline queue needs a server Sync operation, idempotent replay and refusal handling, and depends on decision D6.

- **Story ID:** EP-20-S12a
- **Title:** Karigar can install the app and use it offline with a sync queue (part 1: install and open from cache)
- **As a:** Karigar
- **I want:** to add the app to my phone's home screen and open it with no signal, seeing my jobs as they were last loaded and when they were last updated
- **So that:** I can check a job's weights at the bench even when the workshop has no signal (FR-20-1, FR-20-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar opens the app in the phone browser, when he chooses to add it to the home screen, then an icon is installed and the app opens full screen on `k-jobs`.
  2. Given Vijay loaded his jobs once and then lost signal, when he opens the app from the icon, then "My jobs", each job sheet and "GOLD WITH ME" show from cache, with a line saying when they were last updated, in Asia/Kolkata time.
  3. Given the app is offline, when it is open, then it shows the EP-08-S11 offline state, and any action that is not queued (photo, raise a problem) is disabled.
  4. Given Vijay signs out or is deactivated, when the session ends, then the cached jobs are removed from the phone.
  5. Given a new version is deployed, when Vijay next opens the app with signal, then it loads the new version without a manual cache clear.
- **Rules enforced on the server:** None new. The cache holds only data returned by the EP-20-S1 filtered reads. The app shell is served over HTTPS only.
- **Live events emitted / consumed:** None of its own. On reconnect, catch-up runs as in EP-20-S11.
- **Audit entry written:** No. Installing and reading from cache change nothing on the server.
- **Data changes:** None in the product database. Adds a web app manifest, icons and a service worker that caches the app shell and the karigar's own reads.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3: offline and sync status). Base screen is `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Availability: opens from cache with no signal (epic section 13). Personal data: the phone holds only the karigar's own jobs, cleared on sign-out. Security: cached data never includes desk shapes. Open decision D5: installable web app or native app; this story assumes the installable web app. Open decision D6: if D6 picks no offline, criteria 2 and 3 reduce to the offline state only.
- **Depends on:** EP-20-S2, EP-20-S3, EP-20-S9, EP-08-S2, EP-08-S11, EP-08-S15, EP-01-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S12b: Karigar can install the app and use it offline with a sync queue (part 2: offline queue and sync)

Split note: EP-20-S12 was split into S12a and S12b because installing the app and opening it from cache is a front-end packaging task that can ship alone, while the offline queue needs a server Sync operation, idempotent replay and refusal handling, and depends on decision D6.

- **Story ID:** EP-20-S12b
- **Title:** Karigar can install the app and use it offline with a sync queue (part 2: offline queue and sync)
- **As a:** Karigar
- **I want:** to accept, start, mark ready, hand over and add a typed note with no signal, have each update wait on the phone, and see it sent in order when signal returns
- **So that:** weak signal in the workshop never loses an update (FR-20-12, FR-20-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 is `on_bench` and the phone has no signal, when Vijay Kumar taps "Ready for checking", then the step shows as waiting and the screen says "1 update waiting to send" (epic acceptance criterion 3).
  2. Given two queued updates, "Ready for checking" then "Sent to the showroom", when signal returns, then Sync sends them in that order, the job ends `handed_over`, one parcel is created, and the waiting line goes away.
  3. Given a queued update is sent twice after a drop, when the server receives the second copy with the same client id, then it applies once and returns the first result.
  4. Given the owner stopped the job while Vijay was offline, when the queued "Ready for checking" syncs, then the server refuses it with "This job is stopped. Only the owner can start it again.", the job does not move, later queued updates for that job are not applied, and the phone shows the refusal on the job.
  5. Given the session expired while offline, when signal returns, then the queue is kept, Vijay is asked to sign in, and the queue syncs after sign-in as the same karigar only.
- **Rules enforced on the server:** Sync Queued updates replays each JobUpdate (job id, action, confirmed date or note, client time, client id) through the same operations and checks as EP-20-S4 to EP-20-S6, in client order per job. The client id is the idempotency key (EP-03-S8). Each update is re-checked against the current state on replay; an update no longer valid is refused with its reason. The server records its own time; client time is kept for information only. Updates are accepted only for the karigar of the current session (EP-20-S1).
- **Live events emitted / consumed:** Emitted after each applied update: "Karigar job status changed", and "Parcel handed over by karigar" for a hand-over.
- **Audit entry written:** Yes, through each replayed operation: actor, time (server), entity, action, before, after, plus the client time and client id of the queued update.
- **Data changes:** None new in the product database beyond the replayed operations; the idempotency store from EP-03-S8 holds the client ids. Adds Sync Queued updates to the shared contract and an on-device queue (JobUpdate) to the karigar app.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3: offline and sync status). Buttons are on `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`.
- **Non-functional checks:** Concurrency: replays are idempotent; a state change no longer valid is refused with the reason (epic section 13). Availability: queued updates survive closing the app and restarting the phone. Time: the screen shows queued times in Asia/Kolkata. Open decision D6: no offline, read-only offline or queued updates; this story is built only if D6 picks queued updates. Open decision D6 side question: what the phone does with a refused update after sync; criterion 4 shows the refusal and stops later updates for that job until decided.
- **Depends on:** EP-20-S12a, EP-20-S4, EP-20-S5, EP-20-S6, EP-20-S10a, EP-03-S8, EP-04-S12, EP-08-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-20-S13: Karigar can hand over several jobs at once (G14)

- **Story ID:** EP-20-S13
- **Title:** Karigar can hand over several jobs at once (G14)
- **As a:** Karigar
- **I want:** to pick several of my `ready` jobs and send them to the showroom in one hand-over that creates one arriving parcel
- **So that:** when I bring a day's work in one packet, the desk weighs it as one parcel, as mockup 12 shows ("One handover can carry many jobs.")
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar has MO-2026-118 and MO-2026-122 both `ready`, when he selects both and taps "Sent to the showroom", then both jobs are `handed_over` and one new parcel BATCH-2026-NNN references both jobs.
  2. Given one of the selected jobs is `on_bench` or stopped, when the request reaches the server, then the whole hand-over is refused with that job's sentence and no job moves and no parcel is created.
  3. Given the selection includes another karigar's job id, when the server checks it, then it returns `not_found` and nothing changes.
  4. Given Rajesh Verma has `parcels` open, when the hand-over commits, then one parcel appears listing both job numbers.
- **Rules enforced on the server:** Every job in the hand-over must belong to the session's karigar, be `ready` and not stopped. All jobs, the parcel and the audit entries commit or roll back together. Idempotency key and version checks per job as in EP-20-S6.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" for each job and one "Parcel handed over by karigar".
- **Audit entry written:** Yes: actor, time, entity (each job id and the parcel id), action (`job_handed_over`, `parcel_created`), after (parcel id, list of job ids).
- **Data changes:** Needs a parcel-to-job link that holds many jobs (for example a `parcel_jobs` table) in place of the single `Parcel.jobId`; the migration is defined with EP-02 when G14 is decided.
- **UI reference:** Not yet designed. The rule is drawn on `docs/ux/mockups/12-state-lifecycles.svg` ("One handover can carry many jobs.").
- **Non-functional checks:** Concurrency: all jobs locked in a fixed order (by job id) to avoid deadlock with a stop. Open question G14: can one hand-over carry several jobs; the data model has a single `Parcel.jobId`. Do not build until G14 is answered; the per-job settlement split is an EP-19-S12 open question.
- **Depends on:** EP-20-S6, EP-02-S6, EP-03-S6, EP-03-S8, EP-19-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D5: installable web app or native app? (EP-20-S2, S12a)
- D6: no offline, read-only offline, or queued updates? (EP-20-S10a, S12a, S12b)
- D4 is decided: phone and password; phone numbers are unique, so a karigar cannot sign in on a shared phone number (EP-20-S1, S2).
- D6 side question: what happens to a queued update that is no longer valid when it syncs? (EP-20-S12b)
- G14: can one hand-over carry several jobs (mockup 12)? (EP-20-S6, S13)
- G16: are bench voice notes ("Type or speak") in scope, and in which languages? (EP-20-S10b)
- Should the karigar see the due date the desk asked for after confirming their own? (EP-20-S3, S4)
