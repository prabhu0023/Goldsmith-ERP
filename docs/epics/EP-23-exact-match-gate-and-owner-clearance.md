# EP-23: Exact-match gate and owner clearance

## 1. Summary

The exact-match gate decides whether a parcel can go into stock. Two hard conditions apply: every listed item is
tagged, and the three weights (gross, stones, pure gold) of the tags equal what the parcel said. The tolerance is not a
setting. The only allowance is the ceiling that the scales themselves can cause, computed as half the smallest step of
the scale used for each weighing, added up. A parcel that matches is released by the staff who tagged it, and the owner
never sees it. A parcel that does not match stops, and only the owner can send it back, ask for a tag to be re-checked,
or accept the loss with a reason kept against his name. The business needs the server to be the only judge, so a
mismatched parcel can never reach stock.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. `evaluateParcel` and `computeCeiling`, `syncParcel`, `releaseParcel`, `finishRelease`, `ownerSendBack`, `ownerRecheckTag`, `ownerAcceptLoss`, and the screens `parcel-match` and `parcel-clear` work on mock data; persistence, server authority and live push are absent, and per-tray partial release is not modelled.

## 3. Roles involved

- Owner: sees only stopped parcels; sends back, points to a tag to re-check, or accepts the loss with a reason.
- Staff: sees the live verdict while tagging; releases an exact or last-digit match after every piece is checked.
- Karigar: sees a sent-back parcel as a job to hand over again (EP-20); never sees the gaps.
- System: computes the verdict and ceiling, stops a mismatched parcel, notifies the owner, books the accepted loss, and refuses an invalid release.

## 4. In scope

- Verdicts: incomplete, exact, last_digit, mismatch.
- Gap per figure: tags minus parcel, signed, on gross, stone and net; the worst of the three compared with the ceiling.
- Ceiling computed on the server from EP-14's registry.
- Live verdict while tagging.
- Staff release of an exact match, and of a last-digit match with an audit entry.
- Auto-stop of a mismatched parcel and owner notification.
- Owner send-back: the job reopens to on_bench and the next hand-over resets the parcel.
- Owner re-check of one tag.
- Owner accept-loss with a reason of at least 3 characters, audited, loss booked against the karigar (G23).
- "Is this like him?" history: the last six parcel gaps (G4).
- Per-tray stop and partial release (G15).
- Release effects: pieces in_stock, job settled, karigar gap recorded.
- Unit of the ceiling (G10).

## 5. Out of scope

- Recording weighings, tagging and quality checks (EP-21).
- The scale registry and readabilities (EP-14).
- Raised problems and their clearance (EP-24); this epic only respects an open problem.
- The karigar's allowance and job settlement, reconciliation B (EP-19, G23).
- Owner Decisions layout and the "went through without you" block (EP-32).
- Printing the parcel sheet (EP-36, G8).
- Stock list after release (EP-22).

## 6. Current state in the prototype

- `src/domain/match.ts`: `computeCeiling(weighings, scales)` and `evaluateParcel(parcel, pieces, scales)` returning verdict, expected, tagged, said, tags, gap, `worstU`, and ceiling; one ceiling for gross, stone and net.
- `src/domain/weights.ts` `UNITS_PER_G = 100000` (0.00001 g), finer than PRODUCTION-SCOPE §5 (gap G10).
- `src/store/transitions.ts`:
  - `syncParcel` stops a parcel on an open problem, a send-back or a mismatch, and moves pieces between draft and with_owner.
  - `releaseParcel`: "Tag every item on the list first.", "The weights do not agree. Only the owner can clear this.", "Check every piece before releasing the parcel."
  - `finishRelease` sets pieces in_stock, `settledAt` on the job, appends mg to `Karigar.gapsMg`, and audits `parcel_last_digit`.
  - `ownerSendBack`, `ownerRecheckTag`, `ownerAcceptLoss` (reason of at least 3 characters, audit `loss_accepted`), each owner-only; a send-back sets the job on_bench.
  - An open problem blocks owner clearance ("Clear the raised problem first.").
- Screens `src/components/parcels/ParcelMatch.tsx` (route `parcel-match`, `MatchGauge` symmetric) and `OwnerClearMismatch.tsx` (route `parcel-clear`).
- Seed: BATCH-2026-044 mismatch of -0.1380 g against a ceiling of 0.00065 g (13 weighings, "197 times"), BATCH-2026-046 exact.
- Mockup numbers: 0 mg / 1 to 6 mg "Your call" / 138 mg; "Release 12 pieces into stock"; "Releasing also closes Mahesh Soni's job and settles the gold".
- Reusable: the pure functions in `match.ts`, the transitions' rules and sentences, the gauge, both screens.
- Must be rebuilt server-side: the same logic as the only authority in a shared package, transactional release, concurrency with late tag saves, live notifications, per-tray release, and loss booking.

## 7. Functional requirements

- FR-23-1. The server computes the verdict for a parcel from its weighings, manifest and tags, and returns incomplete until all listed items are tagged and the parcel is weighed.
- FR-23-2. The server computes gaps for gross, stone and net as tags minus parcel, signed.
- FR-23-3. The verdict is exact when the worst gap is 0, last_digit when it is above 0 and no more than the ceiling, and mismatch above the ceiling.
- FR-23-4. The ceiling is the sum of half the readability of the scale recorded on each weighing, over every piece and parcel weighing.
- FR-23-5. The verdict updates live for everyone tagging as each tag is saved.
- FR-23-6. Staff can release an exact or last-digit parcel once every piece is checked.
- FR-23-7. A last-digit release writes an audit entry with the gap in mg.
- FR-23-8. The server refuses a release of a mismatched parcel from staff with "The weights do not agree. Only the owner can clear this."
- FR-23-9. A mismatched parcel stops automatically and the owner is notified.
- FR-23-10. The release changes every piece to in_stock, settles the job and records the gap on the karigar in one transaction.
- FR-23-11. The owner can send a stopped parcel back; the job reopens to on_bench and the next hand-over resets the parcel with tags cleared.
- FR-23-12. The owner can name a tag to re-check; only that tag may be saved while the parcel is stopped.
- FR-23-13. The owner can accept the loss with a reason of at least 3 characters; the parcel is released, the loss and reason are stored against his name and audited.
- FR-23-14. The server refuses owner clearance while a raised problem is open on the parcel.
- FR-23-15. A tag saved after a release attempt starts cannot be missed: release and tag save are serialised on the parcel.
- FR-23-16. The owner screen shows the karigar's last six parcel gaps (G4).
- FR-23-17. Where trays are used, the system supports stopping only the mismatched tray and releasing the rest (G15).
- FR-23-18. The system emits "Parcel stopped (mismatch or raised problem)" on a mismatch stop.

## 8. Business rules

- BR-23-1. A parcel is released only when the list is complete and the three weights agree. [SCOPE-ANALYSIS App. D]
- BR-23-2. The ceiling is computed, never configured: sum of half the readability over every weighing. [SCOPE-ANALYSIS App. E; mockup 14]
- BR-23-3. Staff release a matching parcel and the owner never sees it. [SCOPE-ANALYSIS App. B Q3]
- BR-23-4. Only the owner clears a mismatch. [mockup 11; src/store/transitions.ts releaseParcel]
- BR-23-5. Accept-loss is the only way a mismatched parcel reaches stock, with a reason kept against his name. [mockup 22; src/store/transitions.ts ownerAcceptLoss]
- BR-23-6. A send-back reopens the job to on_bench and the next hand-over resets the parcel. [src/store/transitions.ts handOver]
- BR-23-7. An open raised problem blocks owner clearance. [src/store/transitions.ts ownerRecheckTag]
- BR-23-8. The gap is shown in grams and milligrams, never as a cost. [SCOPE-ANALYSIS App. F]
- BR-23-9. The middle case (within the ceiling) is released and logged in the prototype; the rule is still listed open. [SCOPE-ANALYSIS App. E "Still genuinely open"]
- BR-23-10. The check is reconciliation A, inside the parcel; manufacturing loss belongs to the job. [SCOPE-ANALYSIS App. C]
- BR-23-11. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Parcel verdict snapshot: verdict, gap gross, gap stone, gap net (signed integers, units of 0.0001 g unless G10 changes the unit), worst gap, ceiling, expected count, tagged count.
- Parcel resolution fields: status, resolution (`sent_back`, `rechecking`, `loss_accepted`), re-check piece id, loss (integer, units of 0.0001 g), loss reason, released at, released by, stopped at.
- KarigarGap history: karigar id, parcel id, gap in mg or units, at (last six read by the owner screen).
- Optional per-tray verdict (G15): tray id, gap, ceiling, status.
- Ceiling needs half-steps: 0.00005 g is not a whole number of 0.0001 g units, so the stored unit is open.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Parcel verdict | Verdict, gaps, ceiling and its plain line | Staff, Owner |
| Create | Parcel release | Release an exact or last-digit parcel | Staff, Owner |
| Create | Send-back | Send a stopped parcel back to the karigar | Owner |
| Create | Re-check request | Name a tag to re-check | Owner |
| Create | Loss acceptance | Release a mismatched parcel with a reason | Owner |
| List | Stopped parcels | Owner's mismatch cards | Owner |
| Read | Karigar recent gaps | Last six gaps | Owner |

## 11. Live events

- Emits: "Parcel stopped (mismatch or raised problem)" — when a mismatch stops the parcel, for the owner and parcel screens.
- Emits (proposed, not in catalogue): "Parcel released into stock" — when a parcel is released, for stock and both homes (gap G26).
- Consumes: "Tag saved on a shared parcel" — to recompute the verdict.

## 12. Screens and UX references

- Route ids: `parcel-match` (ParcelMatch), `parcel-clear` (OwnerClearMismatch).
- Mockups: `04-parcel-match.svg` (three answers 0 mg, 1 to 6 mg, 138 mg), `14-match-rule-any-parcel.svg` (formula, trays, "Stops at tray 14 only… The rest release"), `22-owner-clear-mismatch.svg` (send back, re-check a tag, accept the loss; "Is this like him?"), `12-state-lifecycles.svg` (parcel rail), `08-owner-home.svg` and `13-notifications-escalation.svg` (parcel cards).

## 13. Non-functional requirements

- Precision: the match gate compares integers only; the unit that holds half-steps is settled (G10) before build.
- Concurrency: release and a late tag save are serialised on the parcel; the second sees the new state.
- Security: send-back, re-check and accept-loss are owner-only on the server; a staff request is refused.
- Audit: last-digit release, send-back, re-check and accept-loss write entries with actor, reason and gap; the prototype audits all but a plain exact release.
- Performance: verdict recalculation for a 500-piece parcel under 100 ms (proposed target, to confirm; PRODUCTION-SCOPE §5 sets none); owner notified within about 1 second.
- Time: stop and release times stored in UTC.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-21, EP-18, EP-08
- Downstream: EP-24, EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given 12 items tagged and all three weights equal, when staff release, then the pieces become in_stock and the owner sees nothing.
2. Given a gap of 0.0004 g against a ceiling of 0.00065 g, when staff release, then it is released and an audit entry records the gap.
3. Given a gap of -0.1380 g against a ceiling of 0.00065 g, when staff try to release, then the server refuses and the owner is notified.
4. Given a stopped parcel, when the owner sends it back, then the job is on_bench and the parcel's tags are cleared after the next hand-over.
5. Given a stopped parcel, when the owner accepts the loss with a reason of "kemp stones lost in setting", then the parcel is released, the loss is stored and audited.
6. Given a staff member saves a tag during a release, when both arrive, then one is processed first and the other sees the new state.

## 16. Risks

- Risk: the 0.0001 g integer unit cannot hold half-steps, so the server and mockup 14 disagree on the ceiling. Mitigation: settle G10 before this epic.
- Risk: the middle case is wrongly treated and the owner is pulled into every parcel (or never). Mitigation: keep Q5d open and make the rule one switchable function.
- Risk: a late tag save changes the verdict after release. Mitigation: serialise on the parcel inside the transaction.
- Risk: accepted losses pile up against one karigar unnoticed. Mitigation: book losses on the ledger (G23) and show last six gaps.
- Risk: tray partial release (G15) needs a tray-to-piece link that EP-21 lacks. Mitigation: decide G15 before EP-21 stories freeze.

## 17. Open decisions and questions

- Q5d: for a gap above 0 and within the ceiling, release and log, or treat as mismatch?
- Q5a (superseded) and Q5c: what are the largest and smallest parcels, to sanity-check the ceiling?
- G10: which stored unit holds half-step ceilings, and how is 0.00065 g shown (mockup 14 shows 0.0007 g)?
- G15: is per-tray stop and partial release in scope, and how are trays linked to pieces?
- G4: what does "Is this like him?" show and over what period?
- G23: is the accepted loss booked against the karigar ledger, and does it change his scorecard?
- Should a sent-back parcel keep its first tags for comparison?
- Should an exact release by staff also be audited?

## 18. Candidate stories

1. EP-23-S1: System can compute the scale ceiling from the registry on the server
2. EP-23-S2: System can compute gaps and a verdict for a parcel
3. EP-23-S3: Staff can see the live verdict while tagging
4. EP-23-S4: Staff can release an exact match into stock
5. EP-23-S5: Staff can release a last-digit match with an audit entry
6. EP-23-S6: System can refuse a staff release of a mismatch
7. EP-23-S7: System can stop a mismatched parcel and notify the owner
8. EP-23-S8: System can settle the job and record the gap on release
9. EP-23-S9: Owner can send a stopped parcel back to the karigar
10. EP-23-S10: Owner can point to one tag to re-check
11. EP-23-S11: Owner can accept the loss with a reason
12. EP-23-S12: System can serialise release against late tag saves
13. EP-23-S13: Owner can see the karigar's last six gaps (G4)
14. EP-23-S14: Staff can see a tray stop while the rest release (G15)
