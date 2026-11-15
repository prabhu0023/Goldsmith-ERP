# EP-19: Order copy and karigar jobs

## 1. Summary

An order copy is the instruction sheet sent to a karigar: reference images, a brief, quantity, purity, target weights
with a tolerance, the karigar, a due date and the gold issued from the pool. Sending it creates a karigar job that moves
through sent, accepted, on the bench, ready and handed over. The business needs this to be buildable now directly by
staff, and later from a lead. It also needs a tracker so late jobs are seen, a settlement when the parcel comes back
(gold issued against net returned against the karigar's allowance, gap G23), and a reorder entry point for a sold-out
design (gap G3). This epic owns the job and its states; the karigar's phone is EP-20.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. `createOrderCopyAndJob` builds the order copy and a `sent` job, debits the pool and routes the lead line, and `OrderCopyBuilder` exists; the screen needs lead params so the "directly now" path exists in the transition but not the UI, and there is no tracker board, no cancel, no settlement beyond a stamp.

## 3. Roles involved

- Owner: sees overdue jobs on Decisions, can stop and clear, reads settlement flags.
- Staff: builds the order copy, picks the karigar and date, issues gold, watches the tracker, reorders a design.
- Karigar: receives the job, accepts it with a date, works it (EP-20).
- System: debits the pool in the same transaction, derives overdue status, schedules reminders, emits job events, settles on parcel release.

## 4. In scope

- Order copy without a lead (direct) and from a lead line (via EP-30).
- Reference images (stored by EP-09), brief, quantity, purity, target gross and net, tolerance.
- Karigar and due date; suggested gold from target plus allowance, display only.
- Issue gold from the pool in one transaction (EP-18).
- Job states: sent, accepted, on_bench, ready, handed_over; stopped flag.
- Job tracker board with an overdue lane ("See tracker").
- Overdue tracking from the agreed date (`confirmedDate` else due date), reminder to the karigar, owner sees it on Decisions.
- Cancel a job and return the gold (rule open).
- Settlement on parcel release (G23): record gold issued, net returned, the allowance and the loss.
- Reorder from a sold-out design: "Order another from Vijay" (G3).
- Edit an order copy after send (rule open).

## 5. Out of scope

- Pool balance and ledger (EP-18).
- Karigar record, allowance value, scorecard (EP-16).
- The karigar phone screens (EP-20).
- Parcel arrival, weights and tags (EP-21) and the match gate (EP-23).
- Converting a lead and routing lines (EP-30).
- Design master and its lists (EP-15).
- Photo storage (EP-09) and notification delivery (EP-11).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `OrderCopy {id, leadId, leadItemId, jobId, refImages, brief, qty, purity, targetGrossG, targetNetG, toleranceG, karigarId, dueDate, goldIssuedG, createdBy, createdAt}`; `KarigarJob {status, confirmedDate, stopped, parcelId, benchNote, settledAt, ...}`; `JobStatus`.
- `src/store/transitions.ts` `createOrderCopyAndJob`: "Pick who makes it.", "Enter the weight the finished piece should have.", "Gold issued cannot be negative.", pool check; routes the lead line as `make`; ids `MO-2026-NNN` and `OC-2026-NNN`.
- `acceptJob`, `startJob`, `markJobReady`, `handOver` and `stoppedGuard`; `finishRelease` sets `settledAt` and appends the parcel gap to `Karigar.gapsMg`.
- `src/store/selectors.ts` `agreedDate`, `jobOverdueDays`, `overdueJobs`, `goldWithKarigar`.
- `src/components/leads/OrderCopyBuilder.tsx` (route `order-copy`) needs `leadId` and `itemId` params.
- `src/components/people/Karigars.tsx` (route `karigars`) job ledger.
- Mockup 19 numbers: 2 pieces 22K (916), 80.000 g each, plus or minus 500 mg, Lakshmi Devi 0.7%, due 17 Nov, gold 162.400 g (160 g plus 0.7%).
- Reusable: the order copy and job shapes, the transition rules and sentences, overdue selectors, the builder layout.
- Must be rebuilt server-side: direct creation path, atomic issue, tracker, reminders, cancel, settlement, reorder, live events.

## 7. Functional requirements

- FR-19-1. Staff can create an order copy without a lead.
- FR-19-2. The server rejects a missing karigar with "Pick who makes it." and a target gross of 0 or less with "Enter the weight the finished piece should have."
- FR-19-3. The server issues gold from the pool in the same transaction as the job and fails both if the pool is short.
- FR-19-4. The screen shows suggested gold (target plus the karigar's allowance) as a hint only; staff type the issued figure.
- FR-19-5. Sending creates a job in `sent` and notifies the karigar.
- FR-19-6. Job state changes follow sent, accepted, on_bench, ready, handed_over and no other order.
- FR-19-7. A stopped job cannot advance until the owner clears the problem.
- FR-19-8. The tracker lists jobs by state with an overdue lane.
- FR-19-9. A job is overdue from the day after its agreed date until handed over.
- FR-19-10. The system reminds the karigar of an overdue job and shows the owner the overdue count.
- FR-19-11. Staff can cancel a job that is not handed over and the gold returns through EP-18 by the decided rule.
- FR-19-12. When the parcel is released, the server records settlement: issued, net returned, allowance and loss.
- FR-19-13. A settlement loss above the karigar's allowance is flagged to the owner (G23).
- FR-19-14. Staff can start an order copy from a sold-out piece, pre-filled with its category and style but no weights (G3).
- FR-19-15. The system emits "Karigar job status changed" on each transition.

## 8. Business rules

- BR-19-1. Gold issued cannot exceed the pool and cannot be negative. [src/store/transitions.ts createOrderCopyAndJob]
- BR-19-2. Gold issued is suggested as target plus the karigar's wastage, for example 160 g plus 0.7% = 162.400 g. [mockup 19]
- BR-19-3. The due date is meant to be about 3 days before the customer needs it, for QC. [mockup 19]
- BR-19-4. Past the agreed date the job joins the overdue tracker, the karigar is reminded and the owner sees it on Decisions. [mockup 12; mockup 13]
- BR-19-5. The agreed date is the confirmed date, else the due date. [src/store/selectors.ts agreedDate]
- BR-19-6. A stopped job cannot advance; only the owner starts it again. [src/store/transitions.ts stoppedGuard; mockup 11]
- BR-19-7. More loss than the allowance against a job is flagged to the owner. [mockup 24; SCOPE-ANALYSIS App. C reconciliation B]
- BR-19-8. No weight is pre-filled from a design or category. [SCOPE-ANALYSIS App. C, App. D]
- BR-19-9. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- OrderCopy: id, lead id (nullable), lead item id (nullable), design id (nullable, G3), reference image ids, brief, quantity, purity, target gross, target net, tolerance (all integer, units of 0.0001 g), karigar id, due date, gold issued (integer, units of 0.0001 g), allowance in force (basis points), created by, created at.
- KarigarJob: id, order copy id, title, style, quantity, purity, karigar id, status, sent at, due date, confirmed date, stopped flag, parcel id, bench note, settled at, cancelled at.
- JobSettlement: job id, issued, net returned, loss (all integer, units of 0.0001 g), allowance, flagged (boolean), settled at.
- Reminder schedule rows belong to EP-10.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Order copy and job | Build, issue gold and send | Staff, Owner |
| Read | Order copy | Detail with images | Staff, Owner, that Karigar |
| Update | Job state | Accept, start, ready, hand over | Karigar (own), System |
| List | Jobs | Tracker by state and overdue lane | Staff, Owner |
| Update | Job | Edit before accepted or cancel | Staff, Owner |
| Read | Suggested gold | Target plus allowance | Staff, Owner |
| Create | Reorder draft | Order copy from a sold-out design (G3) | Staff, Owner |
| Read | Job settlement | Issued, returned, loss, flag | Owner |

## 11. Live events

- Emits: "Karigar job status changed" — when a job is sent or changes state.
- Consumes: "Metal pool changed" — so the order-copy screen shows gold available.
- Consumes: "Karigar job status changed" — to refresh the tracker.
- Emits (proposed, not in catalogue): "Job passed its agreed date" — from the overdue job in EP-10, for the owner and karigar (gap G26).

## 12. Screens and UX references

- Route ids: `order-copy` (OrderCopyBuilder), `karigars` (ledger).
- Mockups: `19-order-copy-builder.svg`, `12-state-lifecycles.svg` (job rail), `13-notifications-escalation.svg` ("2 karigar jobs past their agreed date"), `03-showroom-stock.svg` ("Order another from Vijay").
- Not yet designed (MOCKUP-COVERAGE §3): job tracker board with overdue lane ("See tracker" on 13).

## 13. Non-functional requirements

- Precision: all weights integer, units of 0.0001 g.
- Concurrency: issue and job creation share one transaction with EP-18's lock.
- Security: a karigar reads only their own jobs; prices and customers are never in the job payload.
- Audit: create, cancel and settlement write audit entries; the prototype audits none of the job transitions.
- Time: due and agreed dates are dates in Asia/Kolkata; overdue is computed from them.
- Performance: the tracker loads under 2 seconds for 500 open jobs.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-16, EP-18, EP-08
- Downstream: EP-20, EP-30, EP-31, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given staff on `order-copy` with no lead, when they pick Lakshmi Devi, 2 pieces, 80.000 g, and issue 162.4000 g, then a job in `sent` and an order copy exist and the pool is debited.
2. Given a pool of 100.0000 g, when staff issue 162.4000 g, then nothing is created.
3. Given a job past its agreed date, when the owner opens `decisions`, then it counts under running late.
4. Given a stopped job, when the karigar tries to advance it, then the server refuses.
5. Given a released parcel for a job, when settlement runs, then issued, returned and loss are stored and a loss above the allowance is flagged.
6. Given a sold-out design, when staff choose reorder, then a draft order copy opens with category and style and empty weights.

## 16. Risks

- Risk: settlement is judged at parcel intake instead of the job, mixing reconciliations A and B. Mitigation: keep B in this epic and A in EP-23 (Q5b).
- Risk: gold is issued but the job is never accepted. Mitigation: overdue and reminder rules apply from send.
- Risk: cancel returns gold twice. Mitigation: one return entry per job, enforced in EP-18.
- Risk: one hand-over with several jobs (G14) does not fit one parcel per job. Mitigation: resolve G14 with EP-20 and EP-02 before EP-21.

## 17. Open decisions and questions

- Q5b: is the intake check only reconciliation A, with wastage handled against the job here?
- G23: when is settlement computed, who sees the flag, and is loss booked against the karigar ledger?
- G3: what does "Order another from Vijay" copy from the sold piece?
- Which channel carries the overdue reminder, and how often (compare A3)?
- G14: can one hand-over carry several jobs?
- Can an order copy be edited after send, and can a job be cancelled after accepted?
- G4: which job figures feed the karigar scorecard?
- D7 is decided: one shop, no branches ([decision record](../decisions/tenancy-and-branches.md)); jobs belong to the shop.

## 18. Candidate stories

1. EP-19-S1: System can store order copies, jobs and settlements with integer weights
2. EP-19-S2: System can issue gold and create a job in one transaction
3. EP-19-S3: Staff can build an order copy without a lead
4. EP-19-S4: Staff can pick a karigar and due date with suggested gold shown
5. EP-19-S5: Karigar can receive the sent job
6. EP-19-S6: System can enforce the job state order and the stopped guard
7. EP-19-S7: System can push job status changes live
8. EP-19-S8: Staff can see the job tracker with an overdue lane
9. EP-19-S9: System can flag overdue jobs and remind the karigar
10. EP-19-S10: Owner can see overdue jobs on Decisions
11. EP-19-S11: Staff can cancel a job and return the gold
12. EP-19-S12: System can settle a job when its parcel is released (G23)
13. EP-19-S13: Staff can start an order copy from a sold-out design (G3)
14. EP-19-S14: System can audit order copy and job changes
