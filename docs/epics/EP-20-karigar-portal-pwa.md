# EP-20: Karigar portal (PWA)

## 1. Summary

The karigar portal is the phone app the artisan uses at the bench. It shows only their own jobs, lets them accept a job
and confirm a date, mark it as being worked on, ready, and handed over, add a photo and a note, raise a problem, and see
how much gold they hold. Workshops often have weak signal, so status updates should queue offline and sync later
(decision D6). The business needs it because the job states drive delivery tracking, and the hand-over creates the
parcel that starts intake. It is an installable web app (D5), with large touch targets. v1 is English only; the हिन्दी toggle on mockup 09 is out of scope and owned by EP-44.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. `KarigarPhone.tsx` in `PhoneFrame` has the jobs, gold and me tabs, a job sheet, accept, start, ready, hand over and raise a problem; the language chip is static, and there is no photo upload, no voice note, no install and no offline queue.

## 3. Roles involved

- Owner: not a user of the portal; sees job states on the tracker and Decisions.
- Staff: not a user of the portal; sees job states and the arriving parcel.
- Karigar: signs in, sees own jobs, accepts, updates status, adds photo and note, raises a problem, hands over.
- System: filters data to the signed-in karigar, queues and syncs offline updates, creates the parcel on hand-over, emits events.

## 4. In scope

- Karigar sign-in on the phone (EP-04) and install as a web app.
- Jobs tab: own jobs only, with status, due date and reference image.
- Job sheet: accept with a confirmed date, "Working on it", "Ready for checking", "Sent to the showroom".
- Hand-over creates the arriving parcel; a sent-back parcel resets to weighing with tags cleared.
- Optional bench photo and note; "Type or speak" voice note (G16).
- Raise a problem on own job (stop the line).
- Gold tab: gold with me and the plus or minus 500 mg note.
- Me tab: own profile.
- Offline queue for status updates and sync status (D6).
- Hand-over of several jobs in one go (G14).
- Touch targets of 56 px and a 15 px text floor.

## 5. Out of scope

- Creating jobs and order copies (EP-19).
- Sign-in with phone and password, activation and reset links, and sessions (EP-04) and the user account (EP-05).
- Karigar master data (EP-16).
- Photo storage and resizing (EP-09).
- Live transport (EP-07) and notification delivery (EP-11).
- Parcel weighing, tagging and matching (EP-21, EP-23).
- Raised-problem rules and owner clearance (EP-24).
- v1 is English only: the language toggle (the हिन्दी chip on mockup 09), translated screens and any use of the karigar's stored language preference are out of scope, owned by EP-44 Localisation (gap G2 resolved).

## 6. Current state in the prototype

- `src/components/karigar/KarigarPhone.tsx` (route `k-jobs`): `Tab = 'jobs' | 'gold' | 'me'`, `JobSheet`, `GoldTab`, `MeTab`, a static `हिन्दी` chip; actions `acceptJob`, `startJob`, `markJobReady`, `handOver`; the notes field `benchNote`.
- `src/components/shell/PhoneFrame.tsx` frames the phone view; `landingRoute` sends the karigar to `k-jobs`.
- `src/components/problems/RaiseProblem.tsx` with `target {kind: 'job', id}`.
- `src/store/transitions.ts` `acceptJob`, `startJob`, `markJobReady`, `handOver` (creates `BATCH-2026-NNN` at stage 1, or resets a sent-back parcel), `stoppedGuard`.
- `src/store/selectors.ts` `jobsForKarigar`, `openJobsForKarigar`, `goldWithKarigar`.
- Seed: PR-101 stops Vijay's MO-2026-118.
- `Identity.karigarId` links the demo identity to the karigar.
- Reusable: the three-tab layout, job sheet, sentences, raise-problem modal, selectors.
- Must be rebuilt server-side: the own-jobs filter, real sign-in, photo and voice upload, install and offline queue, sync, and the push of new jobs. The static `हिन्दी` chip is not carried over in v1.

## 7. Functional requirements

- FR-20-1. A karigar can sign in on a phone and install the app to the home screen.
- FR-20-2. The server returns only jobs whose karigar is the signed-in user and returns not-found for any other job.
- FR-20-3. A karigar can accept a job and confirm a date, which becomes the agreed date.
- FR-20-4. A karigar can mark an accepted job as worked on, then ready, in that order only.
- FR-20-5. A karigar can hand over a ready job, which creates the arriving parcel for the staff.
- FR-20-6. If the owner sent the parcel back, the next hand-over resets the same parcel with tags cleared.
- FR-20-7. A stopped job cannot advance and the screen says why.
- FR-20-8. A karigar can add a photo and a typed or spoken note to a job.
- FR-20-9. A karigar can raise a problem on their own job.
- FR-20-10. The Gold tab shows gold with the karigar from open jobs, in grams to four decimals.
- FR-20-11. No karigar screen shows prices, margins, customers, leads, stock or another karigar's work.
- FR-20-12. With no signal, status updates are queued on the device and sent in order when the connection returns (D6).
- FR-20-13. The screen shows whether updates are waiting to sync.
- FR-20-14. A job newly sent to the karigar appears on the phone live.
- FR-20-15. Every karigar screen is in English in v1.
- FR-20-16. A deactivated karigar is signed out at once.

## 8. Business rules

- BR-20-1. A karigar sees only the jobs issued to him. [mockup 11]
- BR-20-2. A karigar never sees prices, margins, invoices, customers, leads, stock, or other karigars. [mockup 11]
- BR-20-3. Touch targets are 56 px and text is at least 15 px. [mockup 09; UX-SPEC §6]
- BR-20-4. The four states are Gold received, Working on it, Ready for checking, Sent to the showroom. [mockup 09]
- BR-20-5. A stopped job cannot advance; only the owner starts it again. [src/store/transitions.ts stoppedGuard; mockup 11]
- BR-20-6. Hand-over only from ready, or from on_bench after a send-back. [src/store/transitions.ts handOver]
- BR-20-7. "You may be off by 500 mg either way" is shown beside gold with me. [mockup 09]
- BR-20-8. Deactivation ends sessions at once. [PRODUCTION-SCOPE §5 Security]
- BR-20-9. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- No new master entities; this epic reads and writes KarigarJob (EP-19) and creates Parcel (EP-21).
- JobUpdate (queued on device): job id, action, confirmed date or note, client time, client id for idempotency.
- JobMedia: job id, file id (EP-09), kind (`photo`, `voice`), at.
- Device preference: language (stored only, unused until EP-44; v1 shows English).
- Gold with me is derived from open jobs, integer, units of 0.0001 g.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | My jobs | Own open and recent jobs | Karigar |
| Read | My job | Job sheet | Karigar (own) |
| Update | Job (accept, start, ready) | State changes with confirmed date | Karigar (own) |
| Create | Hand-over | Mark handed over and create or reset the parcel | Karigar (own) |
| Create | Job media | Attach photo or voice note | Karigar (own) |
| Update | Job note | Bench note | Karigar (own) |
| Read | Gold with me | Figure from open jobs | Karigar |
| Create | Raised problem | Stop the line on own job | Karigar |
| Sync | Queued updates | Replay offline updates idempotently | Karigar |

## 11. Live events

- Emits: "Karigar job status changed" — when the karigar accepts, starts, marks ready or hands over.
- Emits: "Parcel handed over by karigar" — when a hand-over creates the arriving parcel.
- Consumes: "Karigar job status changed" — so a new job sent to him appears on the phone.
- Consumes: "User deactivated or role changed" — to sign the phone out.
- Consumes (proposed, not in catalogue): "Problem raised on a job or piece" and "Problem cleared" — to show and lift the stop on the karigar's own job (gap G26, emitted by EP-24).
- Consumes (proposed, not in catalogue): "Job passed its agreed date" — to show the job as late on the phone (gap G26, emitted by EP-19).

## 12. Screens and UX references

- Route id: `k-jobs` (KarigarPhone, no rail; landing for the karigar role).
- Mockups: `09-karigar-phone.svg` ("GOLD WITH ME 186.400 g", four states, "Type or speak", हिन्दी toggle (out of scope for v1, owned by EP-44)), `11-roles-and-permissions.svg` (karigar CAN and NEVER SEES), `12-state-lifecycles.svg` (job and parcel rails).
- Not yet designed (MOCKUP-COVERAGE §3): "Gold" and "Me" tabs; offline and sync status.

## 13. Non-functional requirements

- Security: every request is filtered by the signed-in karigar on the server; other jobs return not-found.
- Availability: the app opens from cache with no signal and shows queued updates.
- Concurrency: replayed updates are idempotent; a state change that is no longer valid is refused with the reason.
- Performance: the jobs tab loads under 2 seconds on a mobile connection; images are resized by EP-09.
- Personal data: the phone holds only the karigar's own jobs.
- Time: dates shown in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-19, EP-07, EP-08
- Downstream: EP-21, EP-31, EP-35, EP-40, EP-41, EP-44.

## 15. Epic acceptance criteria

1. Given KG-04 signed in, when he requests a job of KG-01, then the server returns not-found.
2. Given a ready job, when the karigar hands it over, then a parcel at weigh stage exists and staff see it live.
3. Given no signal, when the karigar marks a job ready, then the update waits on the device and applies in order when signal returns.
4. Given a stopped job, when the karigar taps the next state, then it is refused.
5. Given the owner sends a job to him, when the phone is open, then the job appears without a refresh.
6. Done when no field on any karigar screen shows money, customers or stock.

## 16. Risks

- Risk: weak signal loses updates. Mitigation: queue with client ids and replay safely (D6).
- Risk: karigars share a phone, so own-jobs filtering fails. Mitigation: D4 decided that phone numbers are unique, so each karigar account has its own phone.
- Risk: voice notes bring storage and language-recognition cost. Mitigation: treat G16 as a separate story after the core flow.
- Risk: a queued "hand over" arrives after the owner stopped the job. Mitigation: the server re-checks state on replay.

## 17. Open decisions and questions

- D5: installable web app or native app?
- D6: no offline, read-only offline, or queued updates?
- D4 is decided: phone and password, phone numbers unique, so a karigar cannot sign in on a shared phone number ([decision record](../decisions/D4-sign-in.md)).
- D6 side question: what happens to a queued update that is no longer valid when it syncs?
- G14: can one hand-over carry several jobs (mockup 12)?
- G16: are bench voice notes ("Type or speak") in scope, and in which languages?
- Should the karigar see the due date the desk asked for after confirming their own?

## 18. Candidate stories

1. EP-20-S1: System can limit every karigar read to the signed-in karigar's jobs
2. EP-20-S2: Karigar can sign in on the phone
3. EP-20-S3: Karigar can see their own jobs
4. EP-20-S4: Karigar can accept a job and confirm a date
5. EP-20-S5: Karigar can mark a job worked on and ready
6. EP-20-S6: Karigar can hand over a ready job and create the parcel
7. EP-20-S7: Karigar can hand over again after a send-back
8. EP-20-S8: Karigar can raise a problem on a job
9. EP-20-S9: Karigar can see gold with me
10. EP-20-S10: Karigar can add a photo and a note
11. EP-20-S11: Karigar can receive a new job live
12. EP-20-S12: Karigar can install the app and use it offline with a sync queue
13. EP-20-S13: Karigar can hand over several jobs at once (G14)
