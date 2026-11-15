# EP-24: Stop the line · stories

Epic document: [EP-24 Stop the line](../epics/EP-24-stop-the-line.md)

Role note: stories where the server stores, freezes, restores, pushes or serialises on its own use "System". Anyone can stop the line and only the owner can start it again (BR-24-1). The karigar phone button and its first job-only version of the raise were written in EP-20-S8; this epic owns the shared problem operation behind it, the guard every transition calls, and the owner's clear. Mismatch stops are EP-23; this epic covers only stops raised by a person. v1 has no holds, so a cleared piece goes straight back to its previous state and is sellable at once if that state was `in_stock`. No price or value appears. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff), Vijay Kumar, Mahesh Soni and Lakshmi Devi (Karigar). The seed problem PR-101 is Vijay Kumar's stop on his own job MO-2026-118, "Two kemp stones cracked while setting", as on mockup 13 and epic acceptance criterion 2; job MO-2026-119 belongs to Lakshmi Devi.

---

## EP-24-S1: System can store a problem against a parcel, job or piece

- **Story ID:** EP-24-S1
- **Title:** System can store a problem against a parcel, job or piece
- **As a:** System
- **I want:** a Problem record with id (`PR-` prefix), target kind `parcel`, `job` or `piece`, target id, text, raised by, raiser role, raised at, status `open` or `cleared`, cleared by and cleared at, plus a shared read "open problems on a target" that every other epic can call
- **So that:** each stop raised by a person is kept with who raised it, on what and when, and EP-23 and the transition guard can ask one place whether a target is stopped (FR-24-16, BR-24-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when a problem is stored on job MO-2026-118 by Vijay Kumar with text "Two kemp stones cracked while setting", then the row has target kind `job`, the job's id in the job foreign key only, `raisedByRole` `karigar`, `status` `open`, `raisedAt` from the server clock, and `clearedBy` and `clearedAt` empty.
  2. Given a problem row whose target kind is `piece` but whose parcel column is set, when it is written, then the database rejects it, because exactly one target column must be set and it must match the kind (EP-02-S10).
  3. Given PR-101 is open on MO-2026-118 and a cleared problem exists on BATCH-2026-044, when the shared read "open problems on a target" is called for the job and for the parcel, then it returns PR-101 for the job and nothing for the parcel.
  4. Given the prototype seed is loaded (EP-02-S13), when the problems table is read, then PR-101 is present and open, and new ids continue after it with the `PR-` prefix.
  5. Given a problem row with `status` `cleared` and an empty `clearedBy`, when it is written, then the database rejects it.
- **Rules enforced on the server:** Status accepts only `open` and `cleared`; a cleared row must have `clearedBy` and `clearedAt`, an open row must have neither (check constraint). Target existence is enforced by foreign keys. Text is stored trimmed. The "open problems on a target" read is a service function used inside transactions, not a browser endpoint; browser reads are EP-24-S8.
- **Live events emitted / consumed:** None. Storing the table publishes nothing; events come from the raise and clear stories.
- **Audit entry written:** No. Tables and a read only; raises and clears are audited by EP-24-S13.
- **Data changes:** Migration on the EP-02-S10 `problems` table: adds the check that open and cleared rows carry the right cleared fields, a partial index on (target kind, target id) where `status` is `open`, and a nullable `branchId` only if D7 adds branches. Ports `openProblemOn` and `problemsOn` from `src/store/selectors.ts` into the server service layer.
- **UI reference:** No screen.
- **Non-functional checks:** Time: `raisedAt` and `clearedAt` in UTC, shown in Asia/Kolkata. Performance: the open-problem lookup uses the partial index so the guard in EP-24-S2 adds no table scan. Personal data: `text` is free text and may name a customer (G22). Open decision D7: whether a problem carries a branch id.
- **Depends on:** EP-02-S10, EP-02-S13, EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S2: System can refuse every transition on a stopped target

- **Story ID:** EP-24-S2
- **Title:** System can refuse every transition on a stopped target
- **As a:** System
- **I want:** one shared stopped guard in the server transition layer that every parcel, job and piece operation calls on its locked row, refusing with "This {parcel|job|piece} is stopped. Only the owner can start it again."
- **So that:** no path forgets the check and a frozen piece is never sold, a stopped job never moves along the bench, and a stopped parcel is never tagged, checked or released (FR-24-9, BR-24-5, BR-24-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 has an open raised problem, when Rajesh Verma saves a tag, ticks a quality check or presses release on it, then each request is refused with "This parcel is stopped. Only the owner can start it again." and nothing changes (epic acceptance criterion 1).
  2. Given MO-2026-118 is stopped, when Vijay Kumar presses "Gold received", "Working on it", "Ready for checking" or "Sent to the showroom", then each request is refused with "This job is stopped. Only the owner can start it again." (epic acceptance criterion 2).
  3. Given TAG-8802 is `stopped`, when anyone tries to sell it, propose an edit on it, apply an edit to it or request its scrap, then each request is refused with "This piece is stopped. Only the owner can start it again."
  4. Given the list of state-changing operations in the shared contract, when the CI guard test runs, then every operation whose target is a parcel, job or piece has a test that calls it on a stopped target and expects the refusal, and the run fails for any operation without one.
  5. Given a stopped target, when the owner calls Update Clear problem (EP-24-S9), then the guard lets that one operation through, because clearing is the only way to start the line again.
- **Rules enforced on the server:** The guard reads the target row under the transaction's lock and treats it as stopped when it has an open problem (EP-24-S1) or, for a parcel, a mismatch stop from EP-23. Only Update Clear problem and the EP-23 owner exits (which make their own open-problem check) bypass it. Refusals use the EP-03-S4 code and sentence format. The prototype `stoppedGuard`, and the stopped checks in `saveTag` and `releaseParcel`, are replaced by calls to this one guard.
- **Live events emitted / consumed:** None. A refused request changes nothing and publishes nothing.
- **Audit entry written:** No. Refused requests store nothing.
- **Data changes:** None in the product database. Adds the shared guard and the stopped refusal code to the server package, and wires it into the operations from EP-19-S6, EP-21-S5, EP-21-S13, EP-22-S2, EP-22-S8 and EP-23-S4.
- **UI reference:** No screen of its own. The stopped colour and "only the owner can clear it" are on `docs/ux/mockups/12-state-lifecycles.svg`; the sentence is shown as sent by the server (EP-08-S5).
- **Non-functional checks:** Security: the guard runs on the server; hiding buttons is not a control (epic section 13). Concurrency: the guard reads the locked row, so a raise that commits first blocks the transition (EP-24-S14).
- **Depends on:** EP-24-S1, EP-03-S4, EP-03-S6, EP-19-S6, EP-21-S5, EP-21-S13, EP-22-S2, EP-22-S8, EP-23-S4, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S3: Staff can raise a problem on a parcel

- **Story ID:** EP-24-S3
- **Title:** Staff can raise a problem on a parcel
- **As a:** Staff
- **I want:** a "Stop the line" composer on the parcel screens (`parcel-match`, and `parcel-tag` once designed) that shows the parcel id and piece count, "Nothing moves until the owner clears it", a "What is wrong?" box and the buttons "Tell the owner" and "Cancel"
- **So that:** when I see a cracked stone, a wrong hallmark or a missing piece, the parcel goes no further until the owner looks (FR-24-1, FR-24-4, FR-24-6, BR-24-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is open with 12 pieces, when Rajesh Verma types "Parcel is 138 mg under. Mahesh's last six averaged 31 mg. Please check." and presses "Tell the owner", then a problem with target kind `parcel`, `raisedByRole` `staff` and `status` `open` is stored, the parcel `status` is `stopped` with `stoppedAt` set, and tag saves and release are refused (epic acceptance criterion 1).
  2. Given Rajesh types "ok", when he presses "Tell the owner", then the server refuses with "Say what is wrong." and nothing is stored (FR-24-4).
  3. Given the problem is stored, when the composer closes, then the parcel screen shows the problem banner with the text, "Rajesh Verma · Staff" and the raised time in Asia/Kolkata, and no clear button for staff.
  4. Given BATCH-2026-044 is already stopped on a mismatch, when Deepak Rao raises a problem on it, then the problem is stored, `stoppedAt` keeps its first value, and the parcel stays stopped.
  5. Given the parcel is already `released`, when Rajesh opens the composer, then the button is not offered on the parcel, and a request sent anyway is refused with "This parcel has already been released."; a problem on one of its pieces uses EP-24-S4.
- **Rules enforced on the server:** Create Problem on a parcel is Staff and Owner only (EP-05-S2); a Karigar is refused with `forbidden` (FR-24-3). Text is trimmed and must be at least 3 characters (BR-24-8). The problem row, the parcel `status` and `stoppedAt`, and the audit entry are written in one transaction with the parcel row locked (EP-03-S6). The parcel's pieces keep their current state; the EP-24-S2 guard freezes them through the parcel.
- **Live events emitted / consumed:** Emitted after commit: "Parcel stopped (mismatch or raised problem)" with reason `raised`, problem id, raiser and text (audience in EP-24-S11). Consumed: none.
- **Audit entry written:** Yes: actor, role, time, entity (problem id and parcel id), action `problem_raised`, before (parcel `status` `open`), after (parcel `status` `stopped`, target kind, text).
- **Data changes:** Inserts into `problems`; updates `parcels.status` and `parcels.stoppedAt`. Adds Create Problem (parcel target) to the shared contract. Moves `RaiseProblem.tsx` in `ParcelMatch.tsx` onto the EP-08 data layer and ports the parcel branch of `raiseProblem`.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` (staff panel "Stop the line · BATCH-2026-044 · 12 pieces · Nothing moves until the owner clears it · What is wrong? · Tell the owner · Cancel"), route `parcel-match`; stopped segment of the parcel rail on `docs/ux/mockups/12-state-lifecycles.svg`. The composer on `parcel-tag` is not yet designed.
- **Non-functional checks:** Concurrency: the raise locks the parcel row, so a release in flight either commits first or is refused (EP-24-S14). Time: `stoppedAt` in UTC. Performance: owner sees the card within about 1 second (EP-24-S11). Personal data: the text may name a customer (G22).
- **Depends on:** EP-24-S1, EP-24-S2, EP-05-S2, EP-03-S6, EP-06-S2, EP-06-S7, EP-21-S13, EP-23-S7, EP-08-S5, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S4: Staff can raise a problem on a piece

- **Story ID:** EP-24-S4
- **Title:** Staff can raise a problem on a piece
- **As a:** Staff
- **I want:** a "Stop the line" action in the piece drawer on `stock` that uses the same composer as the parcel, and moves the piece to `stopped` while keeping its previous status
- **So that:** a piece with a fault cannot be sold or edited while the owner decides, and it goes back to where it was once cleared (FR-24-1, FR-24-7, BR-24-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8802 is `in_stock`, when Deepak Rao types "Hallmark stamp does not match the HUID" and presses "Tell the owner", then a problem with target kind `piece` and `status` `open` is stored, TAG-8802 is `stopped` with `prevStatus` `in_stock`, and the drawer no longer offers "Add to a sale".
  2. Given TAG-8802 is `stopped`, when Rajesh Verma tries to add it to a sale, then the server refuses with "This piece is stopped. Only the owner can start it again." (EP-24-S2).
  3. Given TAG-8802 is already `stopped` with `prevStatus` `in_stock`, when a second problem is raised on it, then the second problem is stored and `prevStatus` stays `in_stock`, never `stopped`.
  4. Given a piece in `draft` inside an open parcel, when Rajesh raises a problem on it, then it is `stopped` with `prevStatus` `draft`.
  5. Given "Su" as the text, when the request reaches the server, then it is refused with "Say what is wrong." and the piece is unchanged.
- **Rules enforced on the server:** Create Problem on a piece is Staff and Owner only; a Karigar is refused with `forbidden` (FR-24-3). Text at least 3 characters after trimming. The piece moves to `stopped` through Update Piece state (EP-22-S2) with the row locked; `prevStatus` is written only when the piece is not already stopped. A billed or scrapped piece is refused by EP-24-S7. The EP-22-S2 transition table (proposed, to confirm with EP-24) must allow `with_owner` to `stopped` as well as `draft` and `in_stock`, because FR-24-5 refuses only closed pieces.
- **Live events emitted / consumed:** Emitted after commit: "Problem raised on a job or piece" (proposed, G26) with problem id, piece id, tag number, raiser and new state (audience in EP-24-S11). Consumed: none.
- **Audit entry written:** Yes: actor, role, time, entity (problem id and tag number), action `problem_raised`, before (piece status), after (`stopped`, `prevStatus`, text); plus the piece transition through EP-22-S11.
- **Data changes:** Inserts into `problems`; updates `pieces.status`, `pieces.prevStatus` and `version`. Adds Create Problem (piece target) to the shared contract. Moves `RaiseProblem.tsx` in `PieceDrawer.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` (piece drawer); composer wording from `docs/ux/mockups/13-notifications-escalation.svg`; stopped colour on `docs/ux/mockups/12-state-lifecycles.svg`. The composer inside the drawer is not yet designed.
- **Non-functional checks:** Concurrency: a sale that reaches the piece lock first stands and the raise is then refused as closed; a raise that commits first makes the sale fail (EP-24-S14). Performance: other stock screens show the piece frozen within about 1 second. Personal data: the text may name a customer (G22).
- **Depends on:** EP-24-S1, EP-24-S2, EP-22-S2, EP-22-S5, EP-22-S8, EP-22-S11, EP-05-S2, EP-06-S2, EP-08-S5, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S5: Karigar can raise a problem on his own job

- **Story ID:** EP-24-S5
- **Title:** Karigar can raise a problem on his own job
- **As a:** Karigar
- **I want:** the "Raise a problem" button on my job sheet (`k-jobs`, built in EP-20-S8) to call the same shared Create Problem operation as staff, so my job stops and the owner hears about it
- **So that:** I can stop work on my bench when stones crack or gold is short, with the same wording and rules as staff (FR-24-2, FR-24-8, BR-24-2, BR-24-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 is assigned to Vijay Kumar and is `on_bench`, when he sends "Two kemp stones cracked while setting. I need a replacement before I can finish.", then a problem with a new `PR-` id, target kind `job`, `raisedByRole` `karigar` and `status` `open` is stored, and the job's stopped flag is true (epic acceptance criterion 2).
  2. Given the job is stopped, when Vijay presses "Gold received", "Working on it" or "Ready for checking", then each is refused with "This job is stopped. Only the owner can start it again." and the sheet shows that sentence with no clear button.
  3. Given Rajesh Verma (Staff) or Sanjay Seth (Owner) raises a problem on MO-2026-118 from the job tracker, when the request reaches the server, then the same operation stores it with their role and stops the job.
  4. Given the job's stopped flag, when it is read at any time, then it equals "the job has at least one open problem", because the flag and the problem row are written in the same transaction.
  5. Given Vijay types "no", when he sends, then the server refuses with "Say what is wrong." and the job is not stopped.
- **Rules enforced on the server:** Create Problem on a job is allowed for the karigar linked to the job (EP-05-S3, EP-20-S1), Staff and Owner. A karigar's request on any other target is refused by EP-24-S6. Text at least 3 characters. The problem row, `karigar_jobs.stopped` and the audit entry are written in one transaction with the job row locked. This replaces the job-only operation first written for EP-20-S8 with the shared one; the phone's request shape does not change.
- **Live events emitted / consumed:** Emitted after commit: "Problem raised on a job or piece" (proposed, G26) and "Karigar job status changed" with the stopped flag true (through EP-19-S7). Consumed: none.
- **Audit entry written:** Yes: actor, role, time, entity (problem id and job id), action `problem_raised`, before (stopped false), after (stopped true, target kind, text).
- **Data changes:** Inserts into `problems`; sets `karigar_jobs.stopped` and bumps `version`. Adds Create Problem (job target) to the shared contract, replacing the EP-20-S8 operation.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` (phone composer itself not yet designed, see EP-20-S8); permission on `docs/ux/mockups/11-roles-and-permissions.svg` ("Raise a problem on his own job"); owner card "Vijay Kumar stopped his own job MO-2026-118" on `docs/ux/mockups/13-notifications-escalation.svg`.
- **Non-functional checks:** Security: the own-job check runs on the server, not by hiding the button (epic section 13). Concurrency: a hand-over committed before the raise is not undone; the raise then applies to the handed-over job's state or is refused per EP-24-S14. Availability: raising needs a connection; offline queueing is not decided (EP-20-S12b).
- **Depends on:** EP-24-S1, EP-24-S2, EP-20-S1, EP-20-S8, EP-19-S6, EP-19-S7, EP-05-S3, EP-06-S2, EP-06-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S6: System can refuse a karigar's problem on someone else's job

- **Story ID:** EP-24-S6
- **Title:** System can refuse a karigar's problem on someone else's job
- **As a:** System
- **I want:** to refuse any Create Problem from a karigar whose target is a job assigned to another karigar, a parcel or a piece, without saying whether that target exists
- **So that:** a karigar can stop only his own bench, and cannot freeze the shop's parcels or stock or learn about other karigars' work (FR-24-3, BR-24-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-119 belongs to Lakshmi Devi, when Vijay Kumar sends a problem on it, then the server returns `not_found`, no problem is stored and the job is unchanged (epic acceptance criterion 3).
  2. Given Vijay sends a problem with target kind `parcel` on BATCH-2026-044, when it reaches the server, then it is refused with `forbidden` and the parcel is not stopped.
  3. Given Vijay sends a problem with target kind `piece` on TAG-8802, when it reaches the server, then it is refused with `forbidden` and the piece stays as it was.
  4. Given a karigar user who is not yet linked to a karigar record (EP-05-S13), when he sends a problem on any job, then it is refused with `not_found`.
- **Rules enforced on the server:** The role check (EP-05-S2) refuses parcel and piece targets for the Karigar role. The own-job scope (EP-05-S3) answers `not_found` for another karigar's job, the same answer as for a job that does not exist. Both checks run before any write.
- **Live events emitted / consumed:** None. A refused request publishes nothing.
- **Audit entry written:** No. Refused requests change no state; repeated refusals may be logged by EP-39 security monitoring.
- **Data changes:** None in the product database.
- **UI reference:** No screen. The karigar CAN and CANNOT lists are on `docs/ux/mockups/11-roles-and-permissions.svg`.
- **Non-functional checks:** Security: refusal is server-side and does not reveal whether another karigar's job exists.
- **Depends on:** EP-24-S5, EP-05-S2, EP-05-S3, EP-05-S13, EP-20-S1, EP-03-S4, EP-03-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S7: System can refuse a problem on a billed or scrapped piece

- **Story ID:** EP-24-S7
- **Title:** System can refuse a problem on a billed or scrapped piece
- **As a:** System
- **I want:** Create Problem on a piece to refuse a piece whose status is `billed` or `scrapped` with "A closed piece cannot be stopped."
- **So that:** a sold or scrapped piece keeps its final state and its frozen weights, and no one can reopen it by stopping it (FR-24-5, BR-24-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7914 is `billed`, when Rajesh Verma or Sanjay Seth raises a problem on it, then the server refuses with "A closed piece cannot be stopped." and no problem is stored (epic acceptance criterion 6).
  2. Given a piece that is `scrapped`, when anyone raises a problem on it, then the same refusal is returned.
  3. Given TAG-8802 is `in_stock` and its sale commits a moment before a raise on it, when the raise reaches the locked row, then it reads `billed` and is refused with "A closed piece cannot be stopped."
  4. Given the drawer of a billed piece on `stock`, when it is shown, then "Stop the line" is not offered.
- **Rules enforced on the server:** The status check runs inside the raise transaction on the locked piece row. `billed` and `scrapped` have no outgoing transitions (EP-22-S2), with no owner override. Problems on a parcel or job are not affected by this rule.
- **Live events emitted / consumed:** None. A refused request publishes nothing.
- **Audit entry written:** No. Refused requests change no state.
- **Data changes:** None in the product database.
- **UI reference:** `docs/ux/mockups/12-state-lifecycles.svg` ("Billed · locked", "Billed is the end"); piece drawer on `docs/ux/mockups/03-showroom-stock.svg`, route `stock`.
- **Non-functional checks:** Concurrency: the check reads the locked row, so a sale that commits first always wins (EP-24-S14).
- **Depends on:** EP-24-S4, EP-22-S2, EP-22-S8, EP-03-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S8: Owner can see open problems as blocking cards

- **Story ID:** EP-24-S8
- **Title:** Owner can see open problems as blocking cards
- **As a:** Owner
- **I want:** a List Open problems read, oldest first, with raiser, role, target and text, that feeds one blocking card per open problem in "NOTHING MOVES UNTIL YOU ANSWER" on `decisions`, and a Read Problems on a target that feeds the problem banner on `parcel-match`, `parcel-clear`, `stock` and `k-jobs`
- **So that:** I see every stopped line in one place and can open each one, and the people working a target see why it is stopped (FR-24-16, BR-24-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given PR-101 is open, when Sanjay Seth opens `decisions`, then a card reads "Vijay Kumar stopped his own job MO-2026-118" with the quoted text "Two kemp stones cracked while setting. I need a replacement before I can finish.", "Raised from the bench 08:40" in Asia/Kolkata, and the action "Clear it and start again".
  2. Given three open problems raised at 08:40, 09:05 and 10:20, when the list is read, then they come back in that order and each counts as one blocking card in the Decisions count.
  3. Given Rajesh Verma (Staff) calls List Open problems, when the server answers, then it returns only problems on parcels and pieces; given Vijay Kumar (Karigar) calls it, then it returns only problems on his own jobs.
  4. Given TAG-8802 has an open problem, when Deepak Rao opens its drawer on `stock`, then the banner shows the text, raiser, role and raised time, and no clear button is shown to him.
  5. Given a list longer than one page, when it is read, then it pages with a cursor (EP-03-S9).
- **Rules enforced on the server:** List Open problems and Read Problems on a target are scoped by role: Owner sees all; Staff sees parcel and piece problems; Karigar sees only problems on jobs linked to him (EP-05-S3). Card layout and ranking belong to EP-32; this story supplies the read and the card text.
- **Live events emitted / consumed:** Consumed: "Parcel stopped (mismatch or raised problem)", "Problem raised on a job or piece" and "Problem cleared" (proposed, G26) to refetch the list and banners (EP-08-S9).
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds List Open problems and Read Problems on a target to the shared contract. Moves `ProblemBanner.tsx`, the `openProblems` selector and the `ownerQueues.raisedProblems` count onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg` and `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` (block "NOTHING MOVES UNTIL YOU ANSWER", card "Vijay Kumar stopped his own job MO-2026-118", "a karigar can stop the line too"); banner on routes `parcel-match`, `parcel-clear`, `stock`, `k-jobs` (banner itself not separately drawn).
- **Non-functional checks:** Security: role scoping on the server. Performance: the list updates within about 1 second of a raise or clear. Time: raised times shown in Asia/Kolkata. Personal data: problem text shown only to roles that can see the target. Open decision D7: whether a branch owner sees every branch's problems or only his own.
- **Depends on:** EP-24-S1, EP-05-S2, EP-05-S3, EP-03-S9, EP-08-S2, EP-08-S3, EP-08-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S9: Owner can clear a problem and restore the previous state

- **Story ID:** EP-24-S9
- **Title:** Owner can clear a problem and restore the previous state
- **As a:** Owner
- **I want:** to press "Clear it and start again" on a Decisions card or the clear button on a problem banner, so the problem is marked cleared and, if it was the last open one, the target goes back to where it was
- **So that:** once I have dealt with the cause, the parcel, job or piece moves again without anyone re-entering anything (FR-24-10, FR-24-11, FR-24-13, BR-24-1, BR-24-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8802 is `stopped` with `prevStatus` `in_stock` under one open problem, when Rajesh Verma calls clear directly, then the server refuses with "Only the owner can clear a problem."; when Sanjay Seth clears it, then the problem is `cleared` with `clearedBy` Sanjay and `clearedAt` set, and TAG-8802 is `in_stock` again (epic acceptance criterion 4).
  2. Given PR-101 is the only open problem on MO-2026-118, when Sanjay clears it, then the job's stopped flag is false and Vijay Kumar can press "Working on it" again.
  3. Given BATCH-2026-044 was stopped only by a raised problem and its verdict is now `exact`, when Sanjay clears the problem, then the parcel is re-evaluated (EP-23-S2) and returns to `open` so staff can release it; given its verdict is `mismatch`, then it stays `stopped` and the three ways out on `parcel-clear` open (BR-24-6, BR-24-7).
  4. Given a problem that is already `cleared`, when Sanjay clears it again, then nothing changes, no audit entry or event is written, and the call returns success (FR-24-13).
  5. Given a piece stopped from `draft`, when its last problem is cleared, then it returns to `draft`, not `in_stock`.
- **Rules enforced on the server:** Update Clear problem is Owner only (EP-05-S2); other roles get "Only the owner can clear a problem." The problem, the target and the audit entry change in one transaction with both rows locked. A piece returns to `prevStatus` through Update Piece state (EP-22-S2) and `prevStatus` is emptied; a job's stopped flag is cleared; a parcel is re-run through the EP-23 verdict so a mismatch stays stopped. Restoration happens only when no other open problem remains (EP-24-S10). Clearing an already cleared problem is a no-op.
- **Live events emitted / consumed:** Emitted after commit: "Problem cleared" (proposed, G26) and, for a job, "Karigar job status changed" (through EP-19-S7); details in EP-24-S12. Consumed: none.
- **Audit entry written:** Yes: actor (owner), role, time, entity (problem id and target id), action `problem_cleared`, before (target state, problem open), after (target state, problem cleared), and the line "Raised by {name}: {text}"; reason only if the open question on a clearing reason is answered yes.
- **Data changes:** Updates `problems.status`, `clearedBy`, `clearedAt`; updates `pieces.status` and `prevStatus`, `karigar_jobs.stopped`, or `parcels.status` and verdict snapshot. Adds Update Clear problem to the shared contract and ports `clearProblem` from `src/store/transitions.ts`, replacing its fallback `prevStatus ?? 'in_stock'` with a database constraint that a stopped piece always has `prevStatus`.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Clear it and start again"); banner clear button on routes `parcel-clear` and `stock`; "Only the owner can start it again" on `docs/ux/mockups/11-roles-and-permissions.svg`.
- **Non-functional checks:** Security: the owner-only check runs on the server; hiding the button is not a control. Concurrency: two owners clearing the same problem at once give one clear and one no-op. Audit: every clear is audited (epic section 13). Time: `clearedAt` in UTC.
- **Depends on:** EP-24-S1, EP-24-S2, EP-24-S3, EP-24-S4, EP-24-S5, EP-24-S8, EP-22-S2, EP-23-S2, EP-19-S7, EP-05-S2, EP-06-S2, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S10: System can keep a target stopped while another problem is open

- **Story ID:** EP-24-S10
- **Title:** System can keep a target stopped while another problem is open
- **As a:** System
- **I want:** the clear operation to count the open problems left on the target after the clear, and restore the target only when that count is 0
- **So that:** clearing one problem never releases a target that someone else stopped for a different reason (FR-24-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given MO-2026-118 has two open problems, one from Vijay Kumar and one from Rajesh Verma, when Sanjay Seth clears Vijay's, then the job stays stopped and still refuses "Working on it"; when he clears Rajesh's, then the job is unstopped (epic acceptance criterion 5).
  2. Given TAG-8802 has two open problems, when the first is cleared, then it stays `stopped` with `prevStatus` `in_stock`, and the Decisions list shows the remaining card.
  3. Given BATCH-2026-044 has two open raised problems, when one is cleared, then the parcel stays `stopped` and the EP-23 owner exits still refuse with "Clear the raised problem first."
  4. Given two clears of the last two problems on one job arrive at the same moment, when both commit, then the job ends unstopped exactly once and its stopped flag matches "has an open problem".
- **Rules enforced on the server:** The count is read under the target row's lock in the clear transaction, so two clears are serialised. The stopped flag on a job is never set by a client; it is changed only by raise and clear in the same transaction as the problem row.
- **Live events emitted / consumed:** Emitted after commit: "Problem cleared" (proposed, G26) with the remaining open count, so screens keep the target frozen when the count is above 0. Consumed: none.
- **Audit entry written:** Yes, through EP-24-S9: the `problem_cleared` entry records the target state after, which stays stopped when other problems remain.
- **Data changes:** None beyond EP-24-S1 and EP-24-S9.
- **UI reference:** No screen of its own. The banner on `parcel-match`, `stock` and `k-jobs` lists each remaining open problem.
- **Non-functional checks:** Concurrency: clears on one target are serialised by the row lock. Precision: the job stopped flag is tested to equal the open-problem count above 0 after every raise and clear.
- **Depends on:** EP-24-S9, EP-24-S1, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S11: System can push a raised stop to the owner and to open screens

- **Story ID:** EP-24-S11
- **Title:** System can push a raised stop to the owner and to open screens
- **As a:** System
- **I want:** after each raise commits, to publish "Parcel stopped (mismatch or raised problem)" for a parcel target, or "Problem raised on a job or piece" (proposed, G26) for a job or piece, to the owner, the staff working that target and, for a job, the karigar's phone, and to hand the event to EP-11 for the owner's notice
- **So that:** the owner hears about a stop within about a second, and nobody keeps working on something that has just been frozen (FR-24-15, BR-24-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has the app open, when Rajesh Verma stops BATCH-2026-044 with "Parcel is 138 mg under", then within about 1 second a card appears on `decisions` and Sanjay gets the EP-11-S4 notice with the note and Rajesh's name (epic acceptance criterion 1).
  2. Given Deepak Rao has `parcel-tag` open on BATCH-2026-044, when the stop commits, then his form freezes within about 1 second with "This parcel is stopped. Only the owner can start it again." (EP-21-S13).
  3. Given Vijay Kumar stops MO-2026-118, when the event is published, then Sanjay sees "Vijay Kumar stopped his own job MO-2026-118" within about 1 second, and Lakshmi Devi's phone receives nothing.
  4. Given TAG-8802 is stopped, when another staff member has `stock` open, then TAG-8802 leaves "Can sell" within about 1 second (EP-22-S8).
  5. Given the raise transaction rolls back, when the request ends, then no event is published and no notice is sent.
- **Rules enforced on the server:** Events publish only after commit (EP-07-S1), carry the sequence number, target id and version (EP-07-S2), and are filtered by receiver permission (EP-07-S5): job events reach only the linked karigar (EP-07-S6), parcel and piece events reach Owner and Staff. The event payload carries problem id, target kind and id, raiser name and role, text and raised time.
- **Live events emitted / consumed:** Emitted: "Parcel stopped (mismatch or raised problem)" (raised half; EP-23 emits the mismatch half); "Problem raised on a job or piece" (proposed, G26; consumers EP-20, EP-22, EP-32). Consumed: none.
- **Audit entry written:** No. Publishing changes no state; the raise is audited by EP-24-S13.
- **Data changes:** None in the product database. Adds the "Problem raised on a job or piece" event type to the shared event list and to the EP-08-S8 event-to-read map.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions`; frozen states on routes `parcel-match`, `parcel-tag`, `stock`, `k-jobs`, `today` and `parcels`.
- **Non-functional checks:** Performance: owner receives the alert within about 1 second of the raise (epic section 13). Availability: a screen that was offline catches up from its last sequence number (EP-07-S7). Security: problem text is never sent to a karigar who does not own the job. Open question: channel and whether staff is told first (A3, D8).
- **Depends on:** EP-24-S3, EP-24-S4, EP-24-S5, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S6, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-11-S3, EP-11-S4, EP-21-S13, EP-22-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S12: System can push a clearance so the target unfreezes everywhere

- **Story ID:** EP-24-S12
- **Title:** System can push a clearance so the target unfreezes everywhere
- **As a:** System
- **I want:** after each clear commits, to publish "Problem cleared" (proposed, G26) with the problem id, target, the target's new state and the number of open problems left, to the same audience that received the raise
- **So that:** the card leaves Decisions and the target unfreezes on every open screen without a reload (FR-24-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar has `k-jobs` open on MO-2026-118, when Sanjay Seth clears PR-101, then within about 1 second the stopped sentence disappears and "Working on it" is offered again.
  2. Given Deepak Rao has `stock` open, when the last problem on TAG-8802 is cleared, then TAG-8802 is back under "Can sell" within about 1 second (EP-22-S8).
  3. Given Sanjay has `decisions` open on a second device, when he clears a problem on the first, then the card leaves the second device within about 1 second and the blocking count drops by 1.
  4. Given one of two open problems on a target is cleared, when the event arrives, then screens keep the target frozen and remove only the cleared problem from the banner (EP-24-S10).
  5. Given a no-op clear of an already cleared problem, when it returns, then no event is published.
- **Rules enforced on the server:** Publish after commit only (EP-07-S1), with permission filtering (EP-07-S5, EP-07-S6). A parcel whose clear leaves it stopped on a mismatch publishes "Problem cleared" with parcel state `stopped`, so screens stay frozen.
- **Live events emitted / consumed:** Emitted: "Problem cleared" (proposed, G26; consumers EP-20, EP-22, EP-32); "Karigar job status changed" for a job (EP-19-S7). Consumed: none.
- **Audit entry written:** No. Publishing changes no state; the clear is audited by EP-24-S9 and EP-24-S13.
- **Data changes:** None in the product database. Adds the "Problem cleared" event type to the shared event list and to the EP-08-S8 event-to-read map.
- **UI reference:** Routes `decisions`, `parcel-match`, `parcel-clear`, `stock`, `k-jobs`, `today` and `parcels`; the unfrozen state is the normal state of each screen.
- **Non-functional checks:** Performance: unfreeze within about 1 second of the clear. Availability: catch-up after reconnect (EP-07-S7, EP-08-S10).
- **Depends on:** EP-24-S9, EP-24-S10, EP-24-S11, EP-07-S1, EP-07-S5, EP-07-S6, EP-07-S7, EP-08-S8, EP-08-S9, EP-08-S10, EP-19-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S13: System can audit every raise and every clear

- **Story ID:** EP-24-S13
- **Title:** System can audit every raise and every clear
- **As a:** System
- **I want:** every raise to write a `problem_raised` entry and every clear a `problem_cleared` entry, in the same transaction, with actor, role, target, text, before and after state and time, and a CI test that fails if any raise or clear path writes none
- **So that:** the owner can see later who stopped what, why, and who started it again, which the prototype records only for clears (FR-24-14, BR-24-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma raises a problem on BATCH-2026-044, when the audit log is read, then it holds one `problem_raised` entry with actor Rajesh, role `staff`, entity the problem id and parcel id, the text, before `open` and after `stopped`.
  2. Given Sanjay Seth clears PR-101, when the log is read, then it holds one `problem_cleared` entry with actor Sanjay, the target MO-2026-118, the line "Raised by Vijay Kumar: Two kemp stones cracked while setting", before stopped true and after stopped false (epic acceptance criterion 4).
  3. Given the audit insert fails during a raise, when the transaction ends, then the problem is not stored and the target is not stopped.
  4. Given the owner filters the log by kind group "problems" on the audit screen (EP-06-S10), when it loads, then both kinds appear newest first.
  5. Given the CI audit test from EP-06-S7, when it runs, then it calls raise on each of the three target kinds and clear on each, and fails if any of the six calls writes no entry.
- **Rules enforced on the server:** Entries are append-only (EP-06-S1) and written in the operation's transaction (EP-06-S2). `problem_raised` is a new kind in the shared action list; `problem_cleared` keeps its prototype name so old entries stay readable. Refused raises and no-op clears write nothing.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, role, time, entity (problem id, target kind and target id), action `problem_raised` or `problem_cleared`, before, after, text; reason on clear only if the open question is answered yes.
- **Data changes:** Adds `problem_raised` to the audit kind list (migration on the EP-02-S11 check). Inserts into `audit_entries`.
- **UI reference:** Owner audit log screen from EP-06-S9 to EP-06-S11; no new screen.
- **Non-functional checks:** Audit: raise and clear both append-only with before and after (epic section 13). Personal data: problem text kept in the audit may name a customer; deletion follows G22. Time: entry time in UTC.
- **Depends on:** EP-24-S3, EP-24-S4, EP-24-S5, EP-24-S9, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S7, EP-06-S10, EP-02-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-24-S14: System can serialise a raise against a transition in flight

- **Story ID:** EP-24-S14
- **Title:** System can serialise a raise against a transition in flight
- **As a:** System
- **I want:** a raise and any other transition on the same target to take the same row lock, so whichever commits first decides and the other sees its result
- **So that:** a stop cannot be lost behind a release or a sale, and a sale that already happened is never undone by a late stop (epic section 13 Concurrency)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma presses release on BATCH-2026-046 and Deepak Rao raises a problem on it at the same moment, when the raise takes the lock first, then the release is refused with "This parcel is stopped. Only the owner can start it again."
  2. Given the same two requests, when the release takes the lock first, then the release commits and the raise is refused with "This parcel has already been released."; Deepak can then raise the problem on the released pieces with EP-24-S4.
  3. Given TAG-8802 is in a sale that commits first, when a raise on TAG-8802 reaches the lock, then it is refused with "A closed piece cannot be stopped." and the sale stands.
  4. Given Vijay Kumar presses "Ready for checking" on MO-2026-118 while Rajesh raises a problem on it, when the mark-ready commits first, then the raise applies to the job in `ready` and the job is stopped there; hand-over is then refused.
  5. Given the concurrency test runs 50 pairs of raise and release on one parcel, when it finishes, then every pair ends in one of the two outcomes above and no parcel is both released and holding an open problem raised before the release.
- **Rules enforced on the server:** Every raise and every transition locks the target row (parcel, job or piece) inside its transaction before reading state (EP-03-S6). The stopped guard (EP-24-S2) and the closed-piece check (EP-24-S7) run after the lock. Version checks (EP-02-S14) refuse a stale write from a client that read the old state.
- **Live events emitted / consumed:** None. This story publishes nothing of its own; the winning operation publishes its normal event after commit.
- **Audit entry written:** No. This story writes no entry of its own; the operation that commits writes its usual entry; the refused one writes none.
- **Data changes:** None in the product database.
- **UI reference:** No screen. The loser sees the server's sentence (EP-08-S5).
- **Non-functional checks:** Concurrency: serialised by row lock with a repeatable test in CI (EP-40). Performance: lock held only for the length of one transaction.
- **Depends on:** EP-24-S2, EP-24-S3, EP-24-S4, EP-24-S5, EP-24-S7, EP-02-S14, EP-03-S6, EP-23-S4, EP-23-S12, EP-19-S6, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Can the person who raised a problem withdraw it before the owner clears it, or only the owner? (EP-24-S9)
- Through which channel is the owner told of a raised problem, and is staff told first (A3, D8, EP-11 settings)? (EP-24-S11)
- Should a problem carry a category (stones, hallmark, missing piece, other) for reports? (EP-24-S1, EP-24-S3, EP-24-S4, EP-24-S5)
- Can a problem carry a photo, and where is it stored (EP-09)? (EP-24-S1, EP-24-S3, EP-24-S4, EP-24-S5)
- Must the owner give a reason when clearing? (EP-24-S9, EP-24-S13)
- G26: should "Problem raised on a job or piece" and "Problem cleared" be added to the live event catalogue? (EP-24-S4, EP-24-S5, EP-24-S11, EP-24-S12)
- G22: how does a deletion request treat customer names inside problem text kept in the append-only audit? (EP-24-S1, EP-24-S13)
- D7: if branches exist, is a problem visible to every branch's owner view or only its own? (EP-24-S1, EP-24-S8)
