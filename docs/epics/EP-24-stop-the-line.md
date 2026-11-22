# EP-24: Stop the line

## 1. Summary

Anyone who sees something wrong can stop the line. A staff member can raise a problem on a parcel or a piece, and a
karigar can raise one on his own job. Raising a problem freezes the target at once: a stopped parcel cannot be
tagged, checked or released, a stopped piece cannot be sold or edited, and a stopped job cannot move along the bench.
Only the owner can start it again, and every clearance is written to the audit log. The business needs this because
a cracked stone, a wrong hallmark or a missing piece must not travel further down the pipeline while people argue
about it, and the owner must hear about it within seconds.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M4 Exceptions
- Prototype status: Built. `raiseProblem` (any role, parcel, job or piece) and `clearProblem` (owner only, audited) work on mock data with the `RaiseProblem` modal and `ProblemBanner`; server authority, persistence, live push and real notification delivery are absent.

## 3. Roles involved

- Staff: raises a problem on a parcel or a piece with a short text; sees the stopped state and who raised it; cannot clear it.
- Karigar: raises a problem on his own job from the phone (for example "Two kemp stones cracked while setting"); cannot raise on another karigar's job, a parcel or a piece; cannot clear it.
- Owner: may raise a problem on anything; is the only person who can clear one; sees each open problem as a blocking card on Decisions.
- System: freezes the target, refuses every transition on it while a problem is open, restores the previous state on clearance, notifies the owner through EP-11, and writes the audit entry.

## 4. In scope

- A problem record on one target: kind parcel, job or piece, plus the target id.
- Text of at least 3 characters, raiser name and role, raised time.
- Freezing the target on raise: parcel status stopped (via the parcel sync rule), job `stopped = true`, piece status `stopped` with the previous status kept.
- Refusal of every transition on a stopped target with the sentence "... is stopped. Only the owner can start it again."
- Refusal to stop a closed piece (billed or scrapped) with "A closed piece cannot be stopped."
- Karigar may raise only on a job assigned to him.
- Several open problems on one target: the target stays stopped until the last one is cleared.
- Owner-only clearance with an audit entry `problem_cleared` (raiser, text, clearer, time).
- Restoring the previous state on clearance: piece back to its `prevStatus`, job unstopped, parcel re-evaluated.
- Blocking owner clearance of a parcel mismatch while a raised problem is open on that parcel (the check lives in EP-23; this epic supplies the open-problem query).
- Live alert to the owner when a problem is raised, and to the people working that target.

## 5. Out of scope

- Mismatch stops caused by the weights (EP-23). This epic only covers stops raised by a person.
- Delivery of the alert by WhatsApp, in-app or email, and the escalation rules (EP-11, EP-12, settings in EP-13).
- The Decisions screen layout and card ranking (EP-32).
- The Today screen card for a stopped parcel or piece (EP-31).
- The karigar phone shell (EP-20). An install flow and an offline queue are not in v1 (D6 decided: online only).
- The append-only audit store itself (EP-06).
- Reports of problems over time (EP-35).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `ProblemTarget = { kind: 'parcel' | 'job' | 'piece'; id }` and `Problem { id, target, text, raisedBy, raisedByRole, raisedAt, status: 'open' | 'cleared', clearedBy, clearedAt }`; `Piece.prevStatus`; `KarigarJob.stopped`.
- `src/store/transitions.ts`:
  - `raiseProblem` checks text length ("Say what is wrong."), creates `PR-` ids, stops a parcel through `syncParcel` and `stampStop`, sets `stopped: true` on a job, and moves a piece to `stopped` with `prevStatus`; a billed or scrapped piece is refused.
  - `clearProblem` calls `requireOwner(by, 'clear a problem')`, marks the problem cleared, re-syncs a parcel, unstops a job only when `openProblemOn` finds no other open problem, restores a piece to `prevStatus ?? 'in_stock'`, and audits `problem_cleared` with "Raised by {name}: {text}".
  - `stoppedGuard` refuses `acceptJob`, `startJob`, `markJobReady` and `handOver` on a stopped job; `saveTag` and `releaseParcel` refuse a stopped parcel; `ownerRecheckTag` and `ownerAcceptLoss` refuse while `openProblemOn(s, 'parcel', id)` is true.
- `raiseProblem` does not check that a karigar owns the job; the karigar phone only offers the button on his own jobs. Raising is not audited.
- Selectors: `openProblems`, `problemsOn` in `src/store/selectors.ts`; `ownerQueues.raisedProblems` counts each open problem as one blocking card.
- Components: `src/components/problems/RaiseProblem.tsx` (modal, used in `ParcelMatch.tsx`, `PieceDrawer.tsx`, `KarigarPhone.tsx`), `src/components/problems/ProblemBanner.tsx` (shows open problems and an owner "clear" button, used in `ParcelMatch.tsx`, `OwnerClearMismatch.tsx`, `PieceDrawer.tsx`), `OwnerDecisions.tsx` card "Clear it and start again".
- Seed: PR-101, Vijay Kumar stopped his own job MO-2026-118 ("Two kemp stones cracked while setting").
- Reusable: the problem model, the guard sentences, the clear-restores-previous-state rule, the modal and banner components.
- Must be rebuilt server-side: the problem table and its foreign keys, the stopped guard inside every transition, the karigar-owns-the-job check, audit of the raise as well as the clear, the live alert, and concurrency between a raise and a transition already in flight.

## 7. Functional requirements

- FR-24-1. A staff member can raise a problem on a parcel or a piece with text of at least 3 characters.
- FR-24-2. A karigar can raise a problem on a job assigned to him with text of at least 3 characters.
- FR-24-3. The server refuses a karigar's problem on a job assigned to someone else, on a parcel or on a piece.
- FR-24-4. The server refuses text shorter than 3 characters with "Say what is wrong."
- FR-24-5. The server refuses a problem on a billed or scrapped piece with "A closed piece cannot be stopped."
- FR-24-6. Raising a problem on a parcel sets the parcel to stopped and records the stop time.
- FR-24-7. Raising a problem on a piece sets it to `stopped` and stores the previous status.
- FR-24-8. Raising a problem on a job sets the job's stopped flag.
- FR-24-9. While a target has an open problem, the server refuses every state change on it with "This {parcel|job|piece} is stopped. Only the owner can start it again."
- FR-24-10. The owner can clear an open problem; any other role is refused with "Only the owner can clear a problem."
- FR-24-11. Clearing the last open problem on a piece restores its previous status; on a job it clears the stopped flag; on a parcel it re-evaluates the parcel so a mismatch stays stopped.
- FR-24-12. Clearing one of two open problems on the same target leaves the target stopped.
- FR-24-13. Clearing a problem that is already cleared changes nothing and returns success.
- FR-24-14. Every raise and every clear writes an audit entry with actor, role, target, text and time.
- FR-24-15. The owner sees a raised problem within about 1 second, and everyone viewing the target sees it stopped.
- FR-24-16. The system lists open problems for the owner, oldest first, with raiser, role, target and text.

## 8. Business rules

- BR-24-1. Anyone can stop the line. Only the owner can start it again. [docs/ux/mockups/README.md; mockup 11]
- BR-24-2. Staff and karigars use the same composer, worded identically. [SCOPE-ANALYSIS App. A decision 3; mockup 13]
- BR-24-3. A karigar may raise a problem only on his own job. [mockup 11 karigar CAN list; src/components/people/permissions.ts]
- BR-24-4. A closed piece (billed or scrapped) cannot be stopped. [src/store/transitions.ts raiseProblem]
- BR-24-5. A stopped job cannot advance; a stopped parcel cannot be tagged or released. [src/store/transitions.ts stoppedGuard, saveTag, releaseParcel]
- BR-24-6. Clearing restores the previous state; a parcel that still mismatches stays stopped. [src/store/transitions.ts clearProblem, syncParcel]
- BR-24-7. An open raised problem blocks owner clearance of a mismatch on the same parcel. [src/store/transitions.ts ownerRecheckTag, ownerAcceptLoss]
- BR-24-8. The text must say what is wrong, at least 3 characters. [src/store/transitions.ts raiseProblem]
- BR-24-9. "Nothing moves until the owner clears it." [mockup 13 staff composer]
- BR-24-10. Every state change is audited, including the raise. [PRODUCTION-SCOPE §5 Audit]
- BR-24-11. A raised stop must reach the owner immediately. [PRODUCTION-SCOPE §1 "Parcel stopped (mismatch or raised problem)"]

## 9. Data

- Problem: id, target kind (`parcel`, `job`, `piece`), target id, text, raised by (user id), raiser role, raised at (UTC), status (`open`, `cleared`), cleared by (user id, nullable), cleared at (nullable), shop ID (D7).
- Piece: status `stopped`, previous status (nullable). Weights are untouched by this epic; where shown they are integers in units of 0.0001 g.
- KarigarJob: stopped flag (boolean, derived or stored; it must equal "has an open job problem").
- Parcel: status `stopped`, stopped at.
- Audit entries: `problem_raised` (new kind) and `problem_cleared`.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Problem on a parcel | Stop a parcel with a text | Staff, Owner |
| Create | Problem on a piece | Stop a piece with a text | Staff, Owner |
| Create | Problem on a job | Stop a job with a text | Karigar (own job only), Staff, Owner |
| List | Open problems | Owner's blocking cards and banners | Owner; Staff for parcels and pieces; Karigar for own jobs |
| Read | Problems on a target | Banner on the parcel, piece or job screen | Any role that can see the target |
| Update | Clear a problem | Start the line again | Owner |

## 11. Live events

- Emits: "Parcel stopped (mismatch or raised problem)" — when a person raises a problem on a parcel (the raised half; EP-23 emits the mismatch half), for the owner and anyone tagging that parcel.
- Emits (proposed, not in catalogue): "Problem raised on a job or piece" — when a job or piece is stopped, for the owner, the karigar's phone and stock screens (gap G26; consumers EP-20, EP-22, EP-32).
- Emits (proposed, not in catalogue): "Problem cleared" — when the owner clears a problem, so the target unfreezes on every open screen (gap G26; consumers EP-20, EP-22, EP-32).
- Consumes: none from the catalogue. Raising and clearing need no other event; banners refresh from this epic's own events.

## 12. Screens and UX references

- Route ids where the composer opens: `parcel-match` (ParcelMatch), `stock` (PieceDrawer), `k-jobs` (KarigarPhone job sheet). The plan also names `parcel-tag`; the prototype does not show the composer there yet.
- Route ids where the owner clears: `decisions` (card "Clear it and start again"), `parcel-clear` (ProblemBanner), `stock` (ProblemBanner in the drawer).
- Route ids that show the stopped state: `today` (card "... stopped ... Only the owner can start it again"), `parcels`.
- Mockups: `13-notifications-escalation.svg` (staff composer "Stop the line · BATCH-2026-044 · Nothing moves until the owner clears it · What is wrong? · Tell the owner"; owner card "Vijay Kumar stopped his own job MO-2026-118"), `11-roles-and-permissions.svg` (stop the line for every role), `12-state-lifecycles.svg` (stopped segment on parcel, job and piece rails).

## 13. Non-functional requirements

- Security: the owner-only clear and the karigar-own-job rule are checked on the server; hiding the clear button is not a control.
- Concurrency: a raise and a transition on the same target (for example a release or a stock-out) are serialised; if the raise wins, the transition is refused; if the transition wins, the raise applies to the new state or is refused for a closed piece.
- Audit: raise and clear both write append-only entries with actor, role, target, text, before and after state.
- Performance: the owner receives the alert within about 1 second of the raise.
- Personal data: problem text is free text and may name a customer; it is kept with the audit log and falls under the deletion question in G22.
- Time: raised and cleared times stored in UTC, shown in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-23, EP-11, EP-08
- Downstream: EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given parcel BATCH-2026-044 is open, when a staff member raises "Parcel is 138 mg under" on it, then the parcel is stopped, tag saves and release are refused, and the owner sees a card within about 1 second.
2. Given job MO-2026-118 belongs to Vijay Kumar, when Vijay raises a problem on it from his phone, then the job is stopped and "Gold received / Working on it / Ready for checking" actions are refused.
3. Given a karigar tries to raise a problem on another karigar's job, when the request reaches the server, then it is refused and nothing changes.
4. Given a stopped piece with previous status in_stock, when a staff member calls clear directly, then the server refuses; when the owner clears it, then the piece is in_stock again and an audit entry names the raiser, the text and the owner.
5. Given two open problems on one job, when the owner clears one, then the job stays stopped until the second is cleared.
6. Given a billed piece, when anyone raises a problem on it, then the server refuses with "A closed piece cannot be stopped."

## 16. Risks

- Risk: one transition path forgets the stopped guard and a frozen piece is sold. Mitigation: enforce the guard in one shared place in the server transition layer and cover every transition in EP-40 tests.
- Risk: the owner is away and a stopped parcel blocks the counter for hours. Mitigation: escalation and reminders through EP-11; the withdrawal question below.
- Risk: karigars raise problems for things that are not stops (questions, chat). Mitigation: keep the composer short and show raised problems in reports (EP-35) so the owner can coach.
- Risk: the job stopped flag drifts from the open problems. Mitigation: derive it from open problems, or update both in one transaction.
- Risk: problem text contains personal data that cannot be deleted from the audit. Mitigation: resolve G22 with EP-39 and EP-06.

## 17. Open decisions and questions

- Can the person who raised a problem withdraw it before the owner clears it, or only the owner?
- Through which channel is the owner told of a raised problem, and is staff told first (A3, D8, EP-11 settings)?
- Should a problem carry a category (stones, hallmark, missing piece, other) for reports?
- Can a problem carry a photo, and where is it stored (EP-09)?
- Must the owner give a reason when clearing?
- G26: should "Problem raised on a job or piece" and "Problem cleared" be added to the live event catalogue?
- G22: how does a deletion request treat customer names inside problem text kept in the append-only audit?
- D7 is decided: one shop, no branches ([decision record](../decisions/tenancy-and-branches.md)); the owner sees every problem in the shop.

## 18. Candidate stories

1. EP-24-S1: System can store a problem against a parcel, job or piece
2. EP-24-S2: System can refuse every transition on a stopped target
3. EP-24-S3: Staff can raise a problem on a parcel
4. EP-24-S4: Staff can raise a problem on a piece
5. EP-24-S5: Karigar can raise a problem on his own job
6. EP-24-S6: System can refuse a karigar's problem on someone else's job
7. EP-24-S7: System can refuse a problem on a billed or scrapped piece
8. EP-24-S8: Owner can see open problems as blocking cards
9. EP-24-S9: Owner can clear a problem and restore the previous state
10. EP-24-S10: System can keep a target stopped while another problem is open
11. EP-24-S11: System can push a raised stop to the owner and to open screens
12. EP-24-S12: System can push a clearance so the target unfreezes everywhere
13. EP-24-S13: System can audit every raise and every clear
14. EP-24-S14: System can serialise a raise against a transition in flight
