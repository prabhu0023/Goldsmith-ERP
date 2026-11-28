# EP-23: Exact-match gate and owner clearance · stories

Epic document: [EP-23 Exact-match gate and owner clearance](../epics/EP-23-exact-match-gate-and-owner-clearance.md)

Role note: stories where the server computes, stops, settles or serialises on its own use "System". The server is the only judge of a parcel's verdict; the browser runs the same shared functions only to show the answer early. Raised problems belong to EP-24, which is not built yet, so the "open problem blocks clearance" checks here are tested with seeded open problems. v1 has no holds, so a released piece is sellable at once. No price or value appears; gaps are weights only (BR-23-8). Weights are integers in units of 0.0001 g shown to 4 decimals; mockups 04 and 22 print 3 decimals or milligrams, and the figures below are their numbers written to 4 decimals. The seed parcel BATCH-2026-044 is from Mahesh Soni (KG-02), job MO-2026-118, order PO-2026-915, 12 items tagged TAG-9101 to TAG-9112; the parcel said gross 485.5000 g, stones 38.2000 g, pure gold 447.3000 g.

---

## EP-23-S1: System can compute the scale ceiling from the registry on the server

- **Story ID:** EP-23-S1
- **Status:** Not started
- **Title:** System can compute the scale ceiling from the registry on the server
- **As a:** System
- **I want:** to collect every weighing of a parcel (each parcel or tray weighing from EP-21 and each piece weighing on a tag), take the readability of the scale recorded on each one, pass them to the EP-14-S10 ceiling function, and keep the exact ceiling and its plain line on the parcel's verdict snapshot
- **So that:** the only allowance a parcel ever gets is what the scales used could cause, computed and never configured (FR-23-4, BR-23-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 was weighed once on the Bench balance (reads to 0.0001 g) and its 12 tags were all weighed on the Bench balance, when the server computes the ceiling, then it counts 13 weighings and the ceiling is 13 × ½ × 0.0001 g = 0.00065 g, with the plain line "13 weighings × ½ × 0.0001 g".
  2. Given a 10 kg parcel weighed whole on the Platform scale (reads to 0.01 g) with 300 tags on the Bench balance, when the ceiling is computed, then it is 0.0200 g and the line reads "300 × 0.00005 + 1 × 0.005", as on mockup 14.
  3. Given the same 300 pieces weighed in 20 trays on the Bench balance, when the ceiling is computed, then it is 320 × ½ × 0.0001 g = 0.0160 g.
  4. Given a request from the browser that carries its own ceiling figure, when the server evaluates the parcel, then the browser figure is ignored and the stored ceiling is the server's result.
  5. Given a weighing whose scale readability was edited after it was taken, when the ceiling is computed, then it uses the readability the EP-14-S6 rule decides (kept on the weighing, or edits refused while in use).
- **Rules enforced on the server:** The ceiling is computed only on the server from stored weighings and the scale registry; no setting, request field or role can change it. Every weighing must name a registered scale, else "Pick the scale this was weighed on." (EP-14-S10). The sum is exact: the server works in half-units of readability (for example it compares 2 × gap with the sum of readability units) and never uses floating point.
- **Live events emitted / consumed:** None. The ceiling is published as part of the verdict in EP-23-S3.
- **Audit entry written:** No. Computing a figure changes no state; the ceiling is recorded in the audit entries of the release and clearance stories.
- **Data changes:** Migration adds the verdict snapshot to `parcels`: `ceiling` (exact, in the unit decided under G10, for example a count of half 0.0001 g units so 0.00065 g is stored as 13), `ceilingLine` (text), `weighingCount`. No money fields.
- **UI reference:** No screen of its own. The formula and three worked parcels are on `docs/ux/mockups/14-match-rule-any-parcel.svg` ("ceiling = sum of ( ½ × the scale's smallest step ) for every weighing taken").
- **Non-functional checks:** Precision: 0.00005 g is not a whole number of 0.0001 g units, so the ceiling is held exactly in half-units and never rounded before comparison. Performance: ceiling for a 500-piece parcel well inside the 100 ms verdict budget (proposed target, to confirm). Open decision G10: which stored unit holds half-step ceilings, and whether 0.00065 g is shown as 0.00065 g or 0.0007 g (mockup 14).
- **Depends on:** EP-14-S1, EP-14-S6, EP-14-S10, EP-21-S1, EP-21-S3, EP-02-S2, EP-02-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S2: System can compute gaps and a verdict for a parcel

- **Story ID:** EP-23-S2
- **Status:** Not started
- **Title:** System can compute gaps and a verdict for a parcel
- **As a:** System
- **I want:** one shared function, Evaluate Parcel, that the server runs as the authority after every weighing or tag change, which returns `incomplete` until the parcel is weighed and every listed item is tagged, and otherwise the signed gaps on gross, stones and pure gold (tags minus parcel), the worst gap, the ceiling from EP-23-S1, and the verdict `exact`, `last_digit` or `mismatch`
- **So that:** the decision whether a parcel can go into stock is made in one place by the server, with the same numbers on every screen (FR-23-1, FR-23-2, FR-23-3, BR-23-1, BR-23-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-045 from Lakshmi Devi has 9 items still to tag, when it is evaluated, then the verdict is `incomplete`, the expected and tagged counts are stored, and no gap is stored.
  2. Given BATCH-2026-046 has every item tagged and the tags add to the same gross, stones and pure gold as the parcel, when it is evaluated, then all three gaps are 0, the worst gap is 0 and the verdict is `exact`.
  3. Given a parcel whose 12 tags add to 485.4996 g gross against 485.5000 g said, with stones equal, and a ceiling of 0.00065 g, when it is evaluated, then the gross and pure gold gaps are -0.0004 g (stored -4), the worst gap is 0.0004 g and the verdict is `last_digit` (epic acceptance criterion 2).
  4. Given BATCH-2026-044 whose 12 tags add to 485.3620 g gross, 38.2000 g stones and 447.1620 g pure gold, when it is evaluated, then the gaps are -0.1380 g, 0 and -0.1380 g (stored -1380, 0, -1380), the worst gap is 0.1380 g and the verdict is `mismatch` (epic acceptance criterion 3).
  5. Given the stones gap is the only non-zero gap, when the verdict is computed, then the worst of the three absolute gaps is still compared with the ceiling, so a stones-only gap above the ceiling is a mismatch.
- **Rules enforced on the server:** Verdict order: no weighings or tagged count below expected gives `incomplete`; worst gap 0 gives `exact`; 2 × worst gap no more than the summed readability units gives `last_digit`; anything above gives `mismatch`. Pure gold is gross minus stones computed from integers on the server, never taken from the client. The `last_digit` rule is one switchable function so Q5d can change it in one place. The verdict snapshot is written in the same transaction as the change that caused it (EP-03-S6).
- **Live events emitted / consumed:** None directly. EP-23-S3 publishes the result; EP-23-S7 acts on a `mismatch`.
- **Audit entry written:** No. The verdict is derived data; the actions taken on it are audited in EP-23-S5, S9, S10 and S11.
- **Data changes:** Migration adds to `parcels`: `verdict` (check constraint: `incomplete`, `exact`, `last_digit`, `mismatch`), `gapGross`, `gapStone`, `gapNet`, `worstGap` (signed integers in units of 0.0001 g unless G10 changes the unit), `expectedCount`, `taggedCount`, `evaluatedAt`. Ports `evaluateParcel` from `src/domain/match.ts` into the shared package with the unit changed from 0.00001 g to the G10 unit.
- **UI reference:** No screen of its own. The three answers are drawn on `docs/ux/mockups/04-parcel-match.svg` ("Matches exactly 0 mg", "Off by the last digit only 1 – 6 mg", "Gold unaccounted for 138 mg").
- **Non-functional checks:** Precision: the gate compares integers only (epic section 13). Performance: evaluation of a 500-piece parcel under 100 ms (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none). Open decision Q5d: whether a gap above 0 and within the ceiling is released and logged or treated as a mismatch; criterion 3 follows the prototype (released and logged). Open decision G10: the stored unit of the gaps if a finer unit is chosen.
- **Depends on:** EP-23-S1, EP-21-S1, EP-21-S5, EP-02-S2, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S3: Staff can see the live verdict while tagging

- **Story ID:** EP-23-S3
- **Status:** Not started
- **Title:** Staff can see the live verdict while tagging
- **As a:** Staff
- **I want:** the "Match and release" step (`parcel-match`) to show "EVERY ITEM ON THE LIST MUST BE TAGGED" with "12 of 12 tagged", the table "THE PARCEL SAID", "THE 12 TAGS SAY" and "GAP" for "On the scale", "Stones, pearls, lac" and "Pure gold", and the gauge "THE GAP ON PURE GOLD, EITHER WAY", all read from the server and updated within about a second whenever anyone saves a tag
- **So that:** every staff member on the parcel sees the same answer as the server while the work is still going on (FR-23-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma has BATCH-2026-046 open on `parcel-match` with 11 of 12 tagged, when Deepak Rao saves the 12th tag, then within about a second Rajesh's screen shows "12 of 12 tagged", every gap reads 0, the gauge reads "exactly 0 mg" and the line reads "Everything matches. Nothing needs the owner."
  2. Given the verdict is `last_digit` with a pure gold gap of -0.0004 g, when the screen shows it, then the gauge marks it on the "short" side inside the faint band, and the band line reads "The faint band is ±0.00065 g — all that 13 weighings of rounding could ever explain." with the ceiling shown in the G10 display form.
  3. Given the verdict is `mismatch`, when the screen shows it, then the release button is not offered and the screen reads "Stopped. Only the owner can clear it."
  4. Given the verdict is `incomplete`, when the screen shows it, then the gap column is empty and the count reads, for example, "8 of 12 tagged".
  5. Given Rajesh's connection drops while two tags are saved, when it returns, then "Reconnecting…" clears and the verdict catches up to the server's latest snapshot (EP-08-S10).
- **Rules enforced on the server:** Read Parcel verdict is Staff and Owner only; a karigar is refused with `forbidden` (BR-23-3, EP-05-S2). The read returns the stored snapshot from EP-23-S2, never a figure the client computed. The browser may run the shared function for instant feedback, but the server snapshot replaces it when it arrives.
- **Live events emitted / consumed:** Consumed: "Tag saved on a shared parcel" to refetch the verdict; "Parcel stopped (mismatch or raised problem)" to switch the screen to the stopped notice. Emitted: none by this story; the tag-save event carries the new parcel version and verdict.
- **Audit entry written:** No. Reading the verdict changes nothing.
- **Data changes:** None in the product database. Adds Read Parcel verdict to the shared contract. Moves `ParcelMatch.tsx` and its `MatchGauge` from `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match` ("3 · Match and release", "12 of 12 tagged", "no allowance here", "AND ALL THREE WEIGHTS MUST AGREE", "THE GAP ON PURE GOLD, EITHER WAY", "short", "over").
- **Non-functional checks:** Performance: the verdict reaches other staff within about 1 second of a tag save. Precision: gaps from integer units, shown to 4 decimals in grams and in milligrams where the gauge uses mg (BR-23-8); mockup 04 shows 3 decimals. Availability: catch-up after reconnect. Open decision G10: how the 0.00065 g ceiling is shown on the band.
- **Depends on:** EP-23-S2, EP-21-S11, EP-07-S7, EP-07-S11, EP-08-S2, EP-08-S3, EP-08-S9, EP-08-S10, EP-08-S17, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S4: Staff can release an exact match into stock

- **Story ID:** EP-23-S4
- **Status:** Not started
- **Title:** Staff can release an exact match into stock
- **As a:** Staff
- **I want:** to press "Release 12 pieces into stock" on `parcel-match` when the verdict is `exact` and every piece has passed its three quality checks, with the note "Releasing also closes Mahesh Soni's job and settles the gold issued against it."
- **So that:** a normal parcel reaches the showroom without waiting for the owner, and the owner never sees it (FR-23-6, BR-23-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-046 has 12 items tagged, every gap 0 and all 12 pieces checked, when Rajesh Verma presses "Release 12 pieces into stock", then the parcel `status` is `released` with `releasedAt` from the server clock and `releasedBy` Rajesh, and all 12 pieces are `in_stock` (epic acceptance criterion 1).
  2. Given the release commits, when Sanjay Seth looks at Decisions and his notifications, then BATCH-2026-046 does not appear and he got no notice (EP-11-S4 criterion 3).
  3. Given 11 of 12 pieces are checked, when Rajesh presses release, then the server refuses with "Check every piece before releasing the parcel." and nothing changes.
  4. Given the release commits, when another staff member has `stock` open, then the 12 pieces appear under "Can sell" within about a second.
  5. Given the same release request is sent twice with the same idempotency key, when the server processes it, then one release happens and the second call returns the first result; without the key the second call is refused with "This parcel has already been released."
- **Rules enforced on the server:** Create Parcel release is Staff and Owner only. Checks run inside one transaction with the parcel row locked: not already released, not stopped ("This parcel is stopped. Only the owner can start it again."), verdict recomputed from the locked state and equal to `exact` or `last_digit`, every piece of the parcel checked. Piece states change only through Update Piece state (EP-22-S2). The release effects are EP-23-S8.
- **Live events emitted / consumed:** Emitted after commit: "Parcel released into stock" (proposed, G26) for stock and both homes; "Karigar job status changed" when the job settles. Consumed: none.
- **Audit entry written:** Yes, for each piece through EP-22-S11: actor, time, entity (tag number), action `piece_state_changed`, before `draft`, after `in_stock`. A parcel-level `parcel_released` entry for an exact release is written only if the open question "Should an exact release by staff also be audited?" is answered yes; the prototype writes none.
- **Data changes:** Updates `parcels` (`status`, `releasedAt`, `releasedBy`, `stage` 3) and `pieces` through EP-22-S2. Adds Create Parcel release to the shared contract. Ports `releaseParcel` from `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match` ("Everything matches. Nothing needs the owner.", "Release 12 pieces into stock"); parcel rail on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Concurrency: release and tag saves are serialised on the parcel (EP-23-S12). Audit: piece transitions always audited; parcel-level entry per open question. Time: `releasedAt` in UTC. Performance: stock screens update within about 1 second.
- **Depends on:** EP-23-S2, EP-23-S3, EP-21-S8, EP-22-S2, EP-22-S11, EP-03-S4, EP-03-S6, EP-03-S8, EP-05-S2, EP-07-S1, EP-08-S5, EP-08-S6, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S5: Staff can release a last-digit match with an audit entry

- **Story ID:** EP-23-S5
- **Status:** Not started
- **Title:** Staff can release a last-digit match with an audit entry
- **As a:** Staff
- **I want:** to release a parcel whose verdict is `last_digit` the same way as an exact match, with the screen telling me the gap is within what the scales could cause, and the server writing an audit entry with the gap
- **So that:** rounding across many weighings does not pull the owner in, but every such release can still be found later (FR-23-7, BR-23-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a parcel with a pure gold gap of -0.0004 g against a ceiling of 0.00065 g and every piece checked, when Rajesh Verma releases it, then it is released and its pieces are `in_stock` (epic acceptance criterion 2).
  2. Given that release commits, when the audit log is read, then it holds one entry of kind `parcel_last_digit` with the parcel id, actor Rajesh, the gaps -0.0004 g gross, 0 stones and -0.0004 g pure gold, and the ceiling 0.00065 g.
  3. Given the verdict is `last_digit`, when the screen shows it, then the line names the gap and the ceiling, for example "Off by the last digit only · 0.4 mg, inside the 0.65 mg the scales could cause", and the release button is offered.
  4. Given Sanjay Seth's Decisions home, when the parcel has been released, then he gets no stop notice for it; the release is listed only where EP-32 shows parcels that "went through without you".
  5. Given the Q5d rule is switched to "treat as mismatch", when the same parcel is evaluated, then the verdict is `mismatch` and EP-23-S6 applies, with no other code change.
- **Rules enforced on the server:** Same checks as EP-23-S4. The audit entry is inserted in the release transaction (EP-06-S2); if the audit insert fails, the release rolls back.
- **Live events emitted / consumed:** Emitted after commit: "Parcel released into stock" (proposed, G26); "Karigar job status changed" when the job settles. Consumed: none.
- **Audit entry written:** Yes: actor, time, entity (parcel id), action `parcel_last_digit`, after (verdict, gaps on gross, stones and pure gold, worst gap, ceiling, piece count); plus piece transitions through EP-22-S11.
- **Data changes:** Inserts into `audit_entries`; same parcel and piece updates as EP-23-S4. Ports the `parcel_last_digit` branch of `finishRelease`, with the gap stored as integer units instead of rounded milligrams.
- **UI reference:** `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match` ("Off by the last digit only", "1 – 6 mg", "Rounding across 13 weighings can produce this with no gold lost.", "Your call — see the question below."); `docs/ux/mockups/14-match-rule-any-parcel.svg` ("0.4 mg is inside the 0.7 mg the scales could cause. Staff release it.").
- **Non-functional checks:** Audit: last-digit release writes actor and gap (epic section 13). Precision: gap and ceiling stored as integers, shown in grams to 4 decimals and in mg. Open decision Q5d: release and log, or treat as mismatch; the rule is one switchable function. Open decision G10: mockup 14 shows the ceiling as 0.7 mg, the exact figure is 0.65 mg.
- **Depends on:** EP-23-S4, EP-23-S2, EP-06-S2, EP-06-S5, EP-06-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S6: System can refuse a staff release of a mismatch

- **Story ID:** EP-23-S6
- **Status:** Not started
- **Title:** System can refuse a staff release of a mismatch
- **As a:** System
- **I want:** Create Parcel release to refuse any parcel whose server verdict is `mismatch` or `incomplete`, whatever the caller sends, with the prototype sentences
- **So that:** a parcel that does not add up can never reach stock by the normal release path, even from a modified browser (FR-23-8, BR-23-1, BR-23-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 with a pure gold gap of -0.1380 g against a ceiling of 0.00065 g, when Rajesh Verma sends a release request, then the server refuses with "The weights do not agree. Only the owner can clear this." and every piece stays out of stock (epic acceptance criterion 3).
  2. Given a parcel with 11 of 12 items tagged, when a release request arrives, then the server refuses with "Tag every item on the list first."
  3. Given a request that claims `verdict: exact` in its body for BATCH-2026-044, when it reaches the server, then the field is rejected by contract validation or ignored, and the server's own `mismatch` verdict decides the refusal.
  4. Given Sanjay Seth (Owner) calls Create Parcel release on BATCH-2026-044, when the server checks, then it refuses with the same sentence, because the owner's only path to stock for a mismatch is accept-loss (EP-23-S11).
  5. Given a refusal, when the screen shows it, then the sentence appears as sent by the server (EP-08-S5) and nothing on the parcel changes.
- **Rules enforced on the server:** The verdict is recomputed from locked stored data inside the release transaction; nothing in the request can set it. Refusals use the EP-03-S4 code and sentence format. A mismatch can move to `in_stock` only through Create Loss acceptance.
- **Live events emitted / consumed:** None. A refused request changes nothing and publishes nothing.
- **Audit entry written:** No. A refused request changes no state; the stop itself is recorded by EP-23-S7.
- **Data changes:** None in the product database.
- **UI reference:** `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match` ("Gold unaccounted for", "138 mg", "Parcel stops dead.", "Only the owner can clear it.").
- **Non-functional checks:** Security: the server is the only judge; a crafted request cannot release a mismatch. Concurrency: a tag saved during the release is seen before the verdict is read (EP-23-S12).
- **Depends on:** EP-23-S2, EP-23-S4, EP-03-S2, EP-03-S4, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S7: System can stop a mismatched parcel and notify the owner

- **Story ID:** EP-23-S7
- **Status:** Not started
- **Title:** System can stop a mismatched parcel and notify the owner
- **As a:** System
- **I want:** when an evaluation inside a tag save or weighing change gives `mismatch`, to set the parcel `status` to `stopped` with `stoppedAt` from the server clock, move its draft pieces to `with_owner`, and publish "Parcel stopped (mismatch or raised problem)" so the owner is notified and parcel screens freeze
- **So that:** a parcel that does not add up stops by itself and waits for the one person who may clear it (FR-23-9, FR-23-18, BR-23-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 has 11 of 12 tagged, when Deepak Rao saves the 12th tag and the verdict becomes `mismatch`, then in the same transaction the parcel is `stopped`, `stoppedAt` is set once, and the 12 pieces are `with_owner`.
  2. Given the stop commits, when Sanjay Seth has the app open, then within about 1 second he gets the notice "BATCH-2026-044 will not weigh up · 138 mg short" (EP-11-S4) and a parcel card appears on his Decisions home (epic acceptance criterion 3).
  3. Given the stop commits, when Rajesh Verma has `parcel-tag` or `parcel-qc` open on BATCH-2026-044, then his form freezes with "This parcel is stopped. Only the owner can start it again." (EP-21-S13).
  4. Given the parcel is already `stopped`, when it is evaluated again with the same verdict, then `stoppedAt` keeps its first value and no second event or notice is sent.
  5. Given Vijay Kumar or Mahesh Soni (Karigar), when the parcel stops, then no event or notification reaches the karigar and no gap is visible to him.
- **Rules enforced on the server:** The stop is decided only by the server's verdict inside the transaction that changed the weights. Pieces move `draft` to `with_owner` through Update Piece state (EP-22-S2). The event publishes after commit (EP-07-S1) and only to the owner and staff channels (EP-07-S5). Stops caused by a raised problem are EP-24 and use the same event.
- **Live events emitted / consumed:** Emitted after commit: "Parcel stopped (mismatch or raised problem)" with parcel id, karigar id, verdict, gaps, ceiling and version. Consumed: "Tag saved on a shared parcel" is the trigger path for re-evaluation on other screens.
- **Audit entry written:** Yes: actor (the staff member whose save caused the stop), time, entity (parcel id), action `parcel_stopped`, before (`status` `open`), after (`status` `stopped`, verdict, gaps, ceiling), reason `mismatch`; plus piece transitions through EP-22-S11.
- **Data changes:** Updates `parcels` (`status`, `stoppedAt`, verdict snapshot) and `pieces` (`draft` to `with_owner`). Adds `parcel_stopped` to the audit kind list. Ports the mismatch branch of `syncParcel` and `stampStop`.
- **UI reference:** Owner card on `docs/ux/mockups/08-owner-home.svg` (route `decisions`, layout owned by EP-32) and `docs/ux/mockups/13-notifications-escalation.svg`; stopped segment of the parcel rail on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Performance: owner notified within about 1 second (epic section 13). Concurrency: two tag saves that both complete the list produce one stop and one event. Time: `stoppedAt` in UTC. Security: the karigar channel never receives the gap.
- **Depends on:** EP-23-S2, EP-22-S2, EP-21-S13, EP-11-S4, EP-07-S1, EP-07-S5, EP-07-S11, EP-06-S2, EP-06-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S8: System can settle the job and record the gap on release

- **Story ID:** EP-23-S8
- **Status:** Not started
- **Title:** System can settle the job and record the gap on release
- **As a:** System
- **I want:** every release (staff release or owner accept-loss) to move all pieces to `in_stock`, call Settle Job for the parcel's job, and write one karigar gap row with the pure gold gap, all in the release transaction
- **So that:** stock, the karigar's job and his gap history never disagree, even if the server fails halfway (FR-23-10, BR-23-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-046 for job MO-2026-119 is released by Rajesh Verma, when the transaction commits, then all 12 pieces are `in_stock`, a `job_settlements` row exists for MO-2026-119 with `settledAt` set (EP-19-S12), and one `karigar_gaps` row stores the karigar id, parcel id, gap 0 and the release time.
  2. Given BATCH-2026-044 is released by accept-loss, when it commits, then the karigar gap row for KG-02 stores -1380 (0.1380 g short) and the settlement uses the net returned by the 12 pieces, 447.1620 g.
  3. Given Settle Job fails because the job is already settled, when the release runs, then the whole release rolls back, the pieces stay out of stock and the server returns its refusal.
  4. Given a parcel received with no job (EP-21-S4), when it is released, then no settlement runs and the gap row is written with an empty job.
  5. Given the release commits, when Sanjay Seth reads Mahesh Soni's scorecard, then the new gap is the newest of his last six (EP-16-S10).
- **Rules enforced on the server:** Piece moves, Settle Job and the gap row run in one transaction (EP-03-S6); any failure rolls back all of them. Settle Job is internal and never callable from a browser. The gap stored is the signed pure gold gap from the server verdict.
- **Live events emitted / consumed:** Emitted after commit: "Parcel released into stock" (proposed, G26); "Karigar job status changed" for the settled job; "Metal pool changed" only if G23 books the loss on the ledger. Consumed: none.
- **Audit entry written:** Yes, through EP-19-S14 for the settlement (actor, time, entity job id, action `job_settled`, after issued, net returned, loss, flagged) and EP-22-S11 for each piece; the parcel entry is written by EP-23-S5 or EP-23-S11.
- **Data changes:** Migration creates `karigar_gaps` (id, karigar id, parcel id, job id nullable, gap integer in units of 0.0001 g, at) with an index on (karigar id, at), unless EP-16-S10 reads gaps straight from released parcels, in which case `parcels.gapNet` and `releasedAt` are the source and no table is added. Replaces the prototype append to `Karigar.gapsMg` in `finishRelease`.
- **UI reference:** No screen. The note "Releasing also closes Mahesh Soni's job and settles the gold issued against it." is on `docs/ux/mockups/04-parcel-match.svg`.
- **Non-functional checks:** Precision: gap and settlement figures are integers. Concurrency: one settlement per job, enforced by the unique key. Time: release and gap times in UTC. Open decision G23: whether the accepted loss is booked on the karigar ledger and changes his scorecard. Open question G14: how net returned is split when one parcel carries several jobs.
- **Depends on:** EP-23-S4, EP-19-S12, EP-19-S14, EP-16-S10, EP-22-S2, EP-22-S11, EP-21-S4, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S9: Owner can send a stopped parcel back to the karigar

- **Story ID:** EP-23-S9
- **Status:** Not started
- **Title:** Owner can send a stopped parcel back to the karigar
- **As a:** Owner
- **I want:** on "Your three ways out" (`parcel-clear`), to press "Send it back" so the parcel is marked sent back, the karigar's job reopens to `on_bench`, and the pieces stay off the floor until he hands it over again
- **So that:** when gold is really missing, the karigar finds it and returns the parcel (FR-23-11, BR-23-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is stopped on a mismatch, when Sanjay Seth presses "Send it back", then the parcel `resolution` is `sent_back`, `recheckPieceId` is empty, job MO-2026-118 is `on_bench`, and all 12 pieces stay `with_owner` (epic acceptance criterion 4).
  2. Given the send-back committed, when Mahesh Soni taps "Sent to the showroom" again, then the parcel resets to weighing with its tags cleared (EP-20-S7) and no new parcel is created.
  3. Given Rajesh Verma (Staff) sends the same request, when the server checks the role, then it refuses with `forbidden` and nothing changes.
  4. Given the parcel is open or released, when Sanjay sends it back, then the server refuses with "Only a stopped parcel can be sent back."
  5. Given a raised problem is open on the parcel, when Sanjay presses "Send it back", then the server refuses with "Clear the raised problem first." and the screen shows "Clear the raised problem first. The three ways out open once it is cleared."
- **Rules enforced on the server:** Create Send-back is Owner only (EP-05-S2). The parcel must be `stopped` with no open raised problem (FR-23-14, BR-23-7; seeded in tests until EP-24). The job moves to `on_bench` through the EP-19-S6 job state rules. Parcel and job change in one transaction.
- **Live events emitted / consumed:** Emitted after commit: "Karigar job status changed" (the karigar sees a job to hand over again, never the gaps). Consumed: none.
- **Audit entry written:** Yes: actor (Sanjay Seth), time, entity (parcel id), action `parcel_sent_back`, before (`resolution` empty, job status), after (`resolution` `sent_back`, job `on_bench`), with the gap and ceiling at the time.
- **Data changes:** Updates `parcels` (`resolution`, `recheckPieceId`) and `karigar_jobs.status`. Migration adds `resolution` (check constraint: `sent_back`, `rechecking`, `loss_accepted`) to `parcels` if EP-21-S1 did not. Adds Create Send-back to the shared contract. Ports `ownerSendBack`.
- **UI reference:** `docs/ux/mockups/22-owner-clear-mismatch.svg`, route `parcel-clear` ("Send the parcel back to Mahesh", "He finds the missing 138 mg and returns the parcel.", "All 12 pieces stay off the floor until he does.", "Send it back").
- **Non-functional checks:** Security: owner-only on the server (epic section 13). Audit: send-back audited with actor and gap. Concurrency: version check on the parcel so a send-back cannot race a re-check or accept-loss. Open question: should a sent-back parcel keep its first tags for comparison.
- **Depends on:** EP-23-S7, EP-19-S6, EP-19-S7, EP-20-S7, EP-11-S8, EP-05-S2, EP-06-S2, EP-06-S7, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S10: Owner can point to one tag to re-check

- **Story ID:** EP-23-S10
- **Status:** Not started
- **Title:** Owner can point to one tag to re-check
- **As a:** Owner
- **I want:** on `parcel-clear`, to pick one tag in "Tag to redo" and press "Point to a tag to redo", so only that tag reopens for staff while the parcel stays stopped, and the parcel is judged again when the tag is saved
- **So that:** a single mistyped figure can close the whole gap without sending the parcel back (FR-23-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is stopped, when Sanjay Seth points to TAG-9108, then `resolution` is `rechecking`, `recheckPieceId` is TAG-9108, TAG-9108 returns to `draft` and its quality check is cleared, and the other 11 pieces stay `with_owner`.
  2. Given the re-check is open, when Rajesh Verma saves TAG-9108, then the save is accepted, and a save of TAG-9107 is refused with "This parcel is stopped. Only the owner can start it again." (EP-21-S13).
  3. Given Rajesh re-types TAG-9108 and the new verdict is `exact` or `last_digit`, when the save commits, then the parcel `status` is `open`, `resolution` and `recheckPieceId` are empty, and staff can check TAG-9108 and release (EP-23-S4).
  4. Given the re-typed TAG-9108 still leaves a mismatch, when the save commits, then the parcel stays `stopped`, `resolution` is empty, and Sanjay gets the stop notice again.
  5. Given Sanjay points to TAG-8841, which belongs to another parcel, when the server checks, then it refuses with "TAG-8841 is not in this parcel."; a Staff caller is refused with `forbidden`; an open raised problem gives "Clear the raised problem first."
- **Rules enforced on the server:** Create Re-check request is Owner only. The parcel must be `stopped`, with no open raised problem, and the piece must belong to it ("Only a stopped parcel can have a tag re-checked."). The re-check piece moves `with_owner` to `draft` through EP-22-S2. After the re-check save the server re-evaluates (EP-23-S2) and clears `resolution` and `recheckPieceId`.
- **Live events emitted / consumed:** Emitted after commit: "Parcel stopped (mismatch or raised problem)" re-sent with `resolution` `rechecking` and the piece id so staff parcel screens show which tag reopened; a dedicated event may be added to the G26 list. Consumed: "Tag saved on a shared parcel" for the re-check save.
- **Audit entry written:** Yes: actor (Sanjay Seth), time, entity (parcel id), action `parcel_recheck_requested`, after (`resolution` `rechecking`, piece TAG-9108, its gross and stones at the time). The prototype writes none; this is new.
- **Data changes:** Updates `parcels` (`resolution`, `recheckPieceId`) and the piece state; deletes the piece's quality check row. Adds Create Re-check request to the shared contract. Ports `ownerRecheckTag` and the re-check branch of `saveTag` and `syncParcel`.
- **UI reference:** `docs/ux/mockups/22-owner-clear-mismatch.svg`, route `parcel-clear` ("Have staff re-check a tag", "Often a single figure typed wrong closes the whole gap.", "The parcel stays stopped; only that tag reopens.", "Point to a tag to redo").
- **Non-functional checks:** Security: owner-only on the server. Audit: re-check request audited (epic section 13). Concurrency: version check on the parcel; a re-check and an accept-loss at once give one success and one conflict.
- **Depends on:** EP-23-S7, EP-23-S2, EP-21-S8, EP-21-S9, EP-21-S13, EP-22-S2, EP-11-S4, EP-05-S2, EP-06-S2, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S11: Owner can accept the loss with a reason

- **Story ID:** EP-23-S11
- **Status:** Not started
- **Title:** Owner can accept the loss with a reason
- **As a:** Owner
- **I want:** on `parcel-clear`, to type a reason in "Reason — why this loss is acceptable" and press "Release with the loss booked", so the parcel is released with the loss and my reason kept against my name
- **So that:** genuine wastage does not keep good pieces off the floor, and this is the only way a mismatched parcel reaches stock (FR-23-13, BR-23-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is stopped with a pure gold gap of -0.1380 g, when Sanjay Seth enters "kemp stones lost in setting" and presses "Release with the loss booked", then the parcel is `released` with `resolution` `loss_accepted`, `loss` 1380 (0.1380 g) and `lossReason` "kemp stones lost in setting", and all 12 pieces are `in_stock` (epic acceptance criterion 5).
  2. Given the reason "ok", when Sanjay presses the button, then the server refuses with "Say why this loss is acceptable. It is kept against your name." and nothing changes.
  3. Given a parcel whose verdict is no longer `mismatch`, when accept-loss is sent, then the server refuses with "This parcel does not have a loss to accept."
  4. Given Rajesh Verma (Staff), when he sends accept-loss, then the server refuses with `forbidden`; given an open raised problem, it refuses with "Clear the raised problem first."
  5. Given the release commits, when the audit log is read, then one `loss_accepted` entry names Sanjay, BATCH-2026-044, the gap 0.1380 g, the ceiling and the reason; and the release effects of EP-23-S8 have run.
- **Rules enforced on the server:** Create Loss acceptance is Owner only. The parcel must be `stopped`, with no open raised problem, and its recomputed verdict must be `mismatch`. The reason is trimmed and must be at least 3 characters. The release runs the EP-23-S8 effects in the same transaction.
- **Live events emitted / consumed:** Emitted after commit: "Parcel released into stock" (proposed, G26); "Karigar job status changed" for the settled job; "Metal pool changed" if G23 books the loss on the ledger. Consumed: none.
- **Audit entry written:** Yes: actor (Sanjay Seth), time, entity (parcel id), action `loss_accepted`, before (`status` `stopped`), after (`status` `released`, `resolution` `loss_accepted`, loss, gaps, ceiling), reason (the typed text).
- **Data changes:** Updates `parcels` (`status`, `resolution`, `loss` integer in units of 0.0001 g, `lossReason`, `releasedAt`, `releasedBy`). Migration adds `loss` and `lossReason` if EP-21-S1 did not. If G23 says yes, inserts a karigar-side pool entry through the EP-18 ledger. Adds Create Loss acceptance to the shared contract. Ports `ownerAcceptLoss`.
- **UI reference:** `docs/ux/mockups/22-owner-clear-mismatch.svg`, route `parcel-clear` ("Accept the loss and release anyway", "The parcel goes live and the loss is booked against Mahesh.", "Needs a reason, kept against your name.", "Releasing a parcel that does not add up is logged against you, with your reason.", "Release with the loss booked").
- **Non-functional checks:** Security: owner-only on the server. Audit: actor, reason and gap recorded (epic section 13). Precision: loss stored as an integer, shown as 0.1380 g and 138 mg. Concurrency: version check so accept-loss cannot race a send-back. Open decision G23: whether the loss is booked against the karigar ledger and changes his scorecard.
- **Depends on:** EP-23-S7, EP-23-S8, EP-18-S8, EP-05-S2, EP-06-S2, EP-06-S7, EP-02-S14, EP-03-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S12: System can serialise release against late tag saves

- **Story ID:** EP-23-S12
- **Status:** Not started
- **Title:** System can serialise release against late tag saves
- **As a:** System
- **I want:** release, tag save, re-check, send-back and accept-loss to take the same row lock on the parcel and carry the parcel version, so they run one at a time and each sees the state the previous one left
- **So that:** a tag saved while a release is running can never be missed, and a release never uses an old verdict (FR-23-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma presses release on BATCH-2026-046 while Deepak Rao saves a change to TAG-9105, when both arrive at the same moment, then one runs first and the other sees the new state (epic acceptance criterion 6).
  2. Given the tag save runs first and makes the verdict `mismatch`, when the release runs next, then it is refused with "The weights do not agree. Only the owner can clear this." and the parcel is stopped.
  3. Given the release runs first, when the tag save runs next, then it is refused with "This parcel has been released." and no released piece changes.
  4. Given Rajesh's release request carries parcel version 14 and the stored version is 15, when it reaches the server, then it is refused with the EP-02-S14 conflict and the screen shows the new verdict.
  5. Given a test that fires 50 tag saves and one release at random times, when it runs in CI, then in every run the released pieces equal the tags stored before the release committed.
- **Rules enforced on the server:** Every operation that reads or writes a parcel's tags or verdict locks the parcel row first inside its transaction (EP-03-S6). The verdict used for a release is computed after the lock. Version increments on every parcel write.
- **Live events emitted / consumed:** None of its own. Events from the winning operation publish after commit (EP-07-S1).
- **Audit entry written:** No. This story orders operations; each operation writes its own entry.
- **Data changes:** None beyond `parcels.version` (EP-02-S14). Adds the parcel lock helper to the server service layer, used by EP-21-S5 and every EP-23 operation.
- **UI reference:** No screen.
- **Non-functional checks:** Concurrency: release and late tag save serialised on the parcel; the second sees the new state (epic section 13). Performance: lock held only for the transaction, so a 500-piece release still completes inside the 100 ms evaluation budget plus write time.
- **Depends on:** EP-23-S4, EP-21-S5, EP-02-S14, EP-03-S6, EP-03-S5, EP-07-S1, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S13: Owner can see the karigar's last six gaps (G4)

- **Story ID:** EP-23-S13
- **Status:** Not started
- **Title:** Owner can see the karigar's last six gaps (G4)
- **As a:** Owner
- **I want:** the "IS THIS LIKE HIM?" panel on `parcel-clear` to show the karigar's name and code, the gold issued on this job, his last six parcel gold gaps, today's gap against his usual, and a plain line
- **So that:** I can judge whether today's gap is his normal polishing loss or something new before I choose a way out (FR-23-16)
- **Acceptance criteria (Given / When / Then):**
  1. Given Mahesh Soni (KG-02) has released parcels with gold gaps of 0.0280 g, 0.0330 g, 0.0300 g, 0.0290 g, 0.0350 g and 0.0310 g, when Sanjay Seth opens BATCH-2026-044 on `parcel-clear`, then the panel shows those six newest first with "28 mg … 31 mg" labels and "Kundan and Polki · gold issued this job 447.3000 g".
  2. Given today's gap is 0.1380 g and the six average 0.0310 g, when the panel shows it, then it reads "Today: 138 mg — over four times his usual." and "This is not his normal polishing loss."
  3. Given a karigar with no released parcel, when the panel shows, then it reads "No earlier parcels to compare with."
  4. Given Rajesh Verma (Staff) calls Read Karigar recent gaps, when the server checks, then it refuses with `forbidden`.
  5. Given a parcel of KG-02 is released while Sanjay has the panel open, when the release commits, then the panel refetches and the new gap is first.
- **Rules enforced on the server:** Read Karigar recent gaps is Owner only (EP-05-S2). It returns at most six gaps, newest first, from the EP-16-S10 computation. The "times his usual" figure is computed on the server from integers and rounded down to a whole number for the sentence.
- **Live events emitted / consumed:** Consumed: "Parcel released into stock" (proposed, G26) to refetch the gaps. Emitted: none.
- **Audit entry written:** No. Reading changes nothing.
- **Data changes:** None in the product database. Adds Read Karigar recent gaps to the shared contract, reading from `karigar_gaps` or released parcels (EP-23-S8).
- **UI reference:** `docs/ux/mockups/22-owner-clear-mismatch.svg`, route `parcel-clear` ("IS THIS LIKE HIM?", "Mahesh Soni · KG-02", "His last six parcels, gold gap", "Today: 138 mg — over four times his usual.").
- **Non-functional checks:** Security: owner-only on the server. Precision: gaps are integers shown to 4 decimals in grams with mg labels as on mockup 22 (BR-23-8). Open decision G4: what "Is this like him?" shows and over what period; criteria follow mockup 22.
- **Depends on:** EP-23-S8, EP-16-S10, EP-16-S11, EP-05-S2, EP-08-S2, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-23-S14: Staff can see a tray stop while the rest release (G15)

- **Story ID:** EP-23-S14
- **Status:** Not started
- **Title:** Staff can see a tray stop while the rest release (G15)
- **As a:** Staff
- **I want:** for a parcel weighed in trays, the server to judge each tray on its own (tray weighing against the tags linked to that tray, with the tray's own ceiling), stop only a tray that does not match, and let me release the pieces of every matching tray
- **So that:** one bad tray does not keep hundreds of good pieces off the floor, and the owner knows exactly where the gap is (FR-23-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given a 10 kg parcel of 300 pieces in 20 trays on the Bench balance, with 19 trays matching and Tray 14 off by 0.0380 g, when every item is tagged, then Tray 14 is `stopped`, the other 19 trays are matched, and the screen reads "Stops at tray 14 only" and "38 mg unaccounted for, in one tray of 20. The rest release."
  2. Given the 19 matching trays have every piece checked, when Rajesh Verma releases, then only the pieces linked to those 19 trays become `in_stock`, and the pieces of Tray 14 stay `with_owner`.
  3. Given Tray 14 is stopped, when Sanjay Seth opens `parcel-clear`, then he sees Tray 14's gap and ceiling and the same three ways out, applied to Tray 14 only.
  4. Given the last stopped tray is cleared, when its pieces are released, then the job is settled once for the whole parcel (EP-23-S8), not once per tray.
  5. Given a parcel weighed whole, with no trays, when it is evaluated, then the parcel-level verdict of EP-23-S2 applies and no tray verdict exists.
- **Rules enforced on the server:** A tray verdict uses the tray weighing and only the pieces whose `trayWeighingId` names it (EP-21-S1). Each tray's ceiling is the half-steps of its own weighing and its pieces. Partial release requires every piece in the released trays to be checked. The owner-only rules of EP-23-S9 to S11 apply per tray.
- **Live events emitted / consumed:** Emitted after commit: "Parcel stopped (mismatch or raised problem)" with the tray id; "Parcel released into stock" (proposed, G26) for each partial release. Consumed: "Tag saved on a shared parcel".
- **Audit entry written:** Yes: actor, time, entity (parcel id and tray id), action `tray_stopped` or `tray_released`, after (tray gap, ceiling, piece count).
- **Data changes:** Migration creates `parcel_tray_verdicts` (parcel id, tray weighing id, verdict, gap gross, gap stone, gap net, ceiling, status, released at), only if G15 is in scope.
- **UI reference:** `docs/ux/mockups/14-match-rule-any-parcel.svg` ("The same 10 kg, in trays", "19 trays match cleanly", "Tray 14 is off by 0.0380 g", "Stops at tray 14 only"); the tray view on `parcel-match` is not yet designed.
- **Non-functional checks:** Precision: tray gaps and ceilings in integer half-units. Concurrency: the parcel lock of EP-23-S12 covers tray releases. Open decision G15: whether per-tray stop and partial release are in scope and how trays are linked to pieces; this story is built only if G15 says yes. Mockup 14 reads "one tray of 15" for a 20-tray parcel; the criteria use 20.
- **Depends on:** EP-23-S2, EP-23-S4, EP-23-S7, EP-23-S12, EP-21-S1, EP-21-S3, EP-21-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Q5d: for a gap above 0 and within the ceiling, release and log, or treat as mismatch? (EP-23-S2, S5)
- Q5a (superseded) and Q5c: what are the largest and smallest parcels, to sanity-check the ceiling? (EP-23-S1)
- G10: which stored unit holds half-step ceilings, and how is 0.00065 g shown (mockup 14 shows 0.0007 g)? (EP-23-S1, S2, S3, S5)
- G15: is per-tray stop and partial release in scope, and how are trays linked to pieces? (EP-23-S14)
- G4: what does "Is this like him?" show and over what period? (EP-23-S13)
- G23: is the accepted loss booked against the karigar ledger, and does it change his scorecard? (EP-23-S8, S11)
- Should a sent-back parcel keep its first tags for comparison? (EP-23-S9)
- Should an exact release by staff also be audited? (EP-23-S4)
