# EP-18: Metal pool ledger

## 1. Summary

The metal pool is the shop's own stock of gold that is free to issue to karigars. Gold leaves the pool when a job is
issued and comes back when the owner marks a piece as scrap, so scrapping closes the piece but not the gold. The ledger
is the list of every movement, each with a reference to the job or piece that caused it. The business needs it to be
transactional and never negative, because it answers the owner's core question: where is my gold? Custody has five
places: the pool, with karigars, in parcels, in stock, and gone. This epic holds the pool and its ledger and gives the
other epics one safe way to move gold in and out.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. `MetalPool {balanceG, ledger}` with kinds opening, issued and recovered, debited in `createOrderCopyAndJob` and credited in `ownerScrap`, and `MetalPool.tsx` inside `stock` exist; there is no "returned" kind, no opening-balance flow, no per-karigar view and no transaction safety.

## 3. Roles involved

- Owner: records the opening balance and adjustments, reads the balance and ledger, sees where all gold sits.
- Staff: reads the balance on the order copy screen when issuing gold; cannot post adjustments.
- Karigar: sees only "gold with me" for their own open jobs (EP-20); never the pool.
- System: posts issue, return and recovery entries inside the same transaction as the job or scrap that causes them, and refuses a negative balance.

## 4. In scope

- Pool balance and an append-only ledger of entries: opening, issued, returned, recovered, adjustment.
- Owner records the opening balance once.
- Debit when gold is issued for a job (called by EP-19), refused if it exceeds the balance.
- Credit when a piece is scrapped (called by EP-27) with the piece's net gold.
- Credit when a karigar returns unused gold.
- Owner adjustment entry with a reason.
- Gold with each karigar, derived from open jobs (`goldWithKarigar`).
- A custody summary: pool, with karigars, in parcels, in stock.
- Ledger view with filters by kind, job, piece and date.
- Live update of the balance.
- Seed: pool 812.5800 g; 890.9800 g after scrapping TAG-7701 (78.4000 g).

## 5. Out of scope

- Creating the job and the order copy that trigger an issue (EP-19).
- Deciding scrap and marking the piece (EP-27).
- Settling a job against the karigar's allowance, reconciliation B (EP-19, gap G23).
- Parcel weights and the match gate (EP-23).
- Karigar allowance values (EP-16).
- The karigar scorecard (gap G4, owned by EP-16); this epic only supplies the loss figures it reads.
- The owner dashboard tiles "Gold with karigars" (EP-32) and reports (EP-35).
- Stone recovery from scrap (EP-27 decides with sub-question 2).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `PoolEntry {id, at, kind: 'opening' | 'issued' | 'recovered', deltaG, note, ref}`, `MetalPool {balanceG, ledger}`, `AppState.pool`.
- `src/store/transitions.ts` `createOrderCopyAndJob`: "The metal pool does not have that much gold to issue."; writes an `issued` entry with `deltaG` negative and ref = job id.
- `ownerScrap` writes a `recovered` entry with the piece's net and ref = piece id.
- Balance is kept with `round4(fromU(toU(...)))` on 0.00001 g units (gap G10).
- `src/components/stock/MetalPool.tsx` (embedded in route `stock`): hero balance and the latest 8 entries.
- `src/store/selectors.ts` `goldWithKarigar`: sum of `goldIssuedG` on a karigar's open jobs.
- Seed pool 812.5800 g, 890.9800 g after TAG-7701 Temple Haram (78.4000 g) is scrapped (.agents/tasks/jgd-redesign/review.md).
- Reusable: entry shape, the never-negative rule and sentence, the ledger view, `goldWithKarigar`.
- Must be rebuilt server-side: transactional posting, the returned and adjustment kinds, opening balance flow, custody summary, live balance, audit.

## 7. Functional requirements

- FR-18-1. The owner can record an opening balance once; a second opening entry is refused.
- FR-18-2. The server posts an issue entry for each job in the same transaction as the job.
- FR-18-3. The server refuses an issue larger than the balance with "The metal pool does not have that much gold to issue." and changes nothing.
- FR-18-4. The server refuses a negative gold figure on an issue.
- FR-18-5. The server posts a recovery entry in the same transaction as a scrap decision.
- FR-18-6. The owner can record gold returned by a karigar, linked to the job.
- FR-18-7. The owner can post an adjustment with a reason of at least 3 characters.
- FR-18-8. A staff or karigar user who posts opening, return or adjustment entries is refused.
- FR-18-9. Every entry has kind, signed amount, time, actor and a reference to its job or piece.
- FR-18-10. Ledger entries cannot be edited or deleted; a mistake is corrected by a new entry.
- FR-18-11. Two issues at the same moment cannot together exceed the balance.
- FR-18-12. The balance always equals the sum of all entries.
- FR-18-13. The system shows gold with each karigar from open jobs and a custody summary.
- FR-18-14. The system emits "Metal pool changed" after each committed entry.

## 8. Business rules

- BR-18-1. The balance is never negative. [src/store/transitions.ts createOrderCopyAndJob]
- BR-18-2. Scrapping closes the piece but not the gold; it returns to the pool and can be issued again. [SCOPE-ANALYSIS App. B Q6; mockup 12]
- BR-18-3. Gold issued is drawn from the pool, including recovered scrap, and settled against the job at reconciliation. [mockup 19]
- BR-18-4. Custody covers karigar, parcel, stock, scrapped and gone. [SCOPE-ANALYSIS App. F]
- BR-18-5. Metal is shown in grams, never as a cost. [SCOPE-ANALYSIS App. F]
- BR-18-6. Every movement is a ledger row with a reference. [PRODUCTION-SCOPE §6 EP-18; PRODUCTION-SCOPE §5 Audit]
- BR-18-7. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]
- BR-18-8. Two writers must not overdraw the pool. [PRODUCTION-SCOPE §5 Concurrency]

## 9. Data

- PoolEntry: id, kind (`opening`, `issued`, `returned`, `recovered`, `adjustment`), delta (signed integer, units of 0.0001 g), note, reference type and id, actor, at.
- PoolBalance: current balance (integer, units of 0.0001 g), version; derived from entries and checked against them.
- Custody summary (derived): pool, with karigars per karigar, in parcels, in stock.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Pool balance | Current balance | Owner, Staff |
| List | Pool entries | Ledger with filters | Owner |
| Create | Opening entry | Set the opening balance once | Owner |
| Create | Adjustment entry | Correct with a reason | Owner |
| Create | Issue entry | Draw gold for a job (inside job creation) | System (EP-19) |
| Create | Recovery entry | Credit scrap (inside scrap decision) | System (EP-27) |
| Create | Return entry | Record unused gold returned | Owner |
| Read | Custody summary | Where the gold is | Owner |
| Read | Gold with karigar | Gold on a karigar's open jobs | Owner, that Karigar |

## 11. Live events

- Emits: "Metal pool changed" — after any committed entry, so the order-copy screen shows gold available to issue.
- Consumes: none.

## 12. Screens and UX references

- No route id of its own; the pool card sits inside `stock` (ShowroomStock).
- Mockups: `19-order-copy-builder.svg` ("drawn from the metal pool, including anything recovered from scrapped pieces"), `08-owner-home.svg` ("Gold with karigars 612 g · 7 open jobs"), `09-karigar-phone.svg` ("GOLD WITH ME 186.400 g"), `12-state-lifecycles.svg`, `10-navigation-map.mmd` (pool issued again).
- Not yet designed (MOCKUP-COVERAGE §3): pool balance and ledger page.

## 13. Non-functional requirements

- Precision: all amounts are integers in units of 0.0001 g; the unit conflict G10 is settled before launch.
- Concurrency: issue uses a row lock or version check on the balance; the second of two overdrawing issues fails with the sentence above.
- Audit: the ledger is itself append-only; owner adjustments also write an audit entry with reason.
- Security: only the owner posts opening, return and adjustment; a karigar reads only their own figure.
- Performance: the pool card loads with its screen within 2 seconds (PRODUCTION-SCOPE §5). Proposed targets, to confirm: balance read under 100 ms; the ledger pages 50 rows.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-02, EP-06, EP-08
- Downstream: EP-19, EP-23, EP-27, EP-31, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a balance of 812.5800 g, when an issue of 162.4000 g is posted, then the balance is 650.1800 g and an issued entry references the job.
2. Given a balance of 100.0000 g, when two issues of 60.0000 g arrive together, then one succeeds and the other is refused.
3. Given a piece with net 78.4000 g, when the owner scraps it, then a recovered entry of 78.4000 g is posted in the same transaction.
4. Given a staff user, when they post an adjustment, then the server refuses.
5. Given any time, when the ledger is summed, then it equals the balance.
6. Given an issue commits, when another screen is open, then "Metal pool changed" updates its figure within about a second.

## 16. Risks

- Risk: the real books already hold a pool with its own opening figure and purity mix. Mitigation: ask sub-question 1 before the opening flow.
- Risk: purity is ignored, so 22K and 18K gold mix in one number. Mitigation: raise the purity question before EP-19.
- Risk: posting outside a transaction leaves a job without gold or gold without a job. Mitigation: post only inside the caller's transaction.
- Risk: rounding on half-step weights shifts the balance. Mitigation: G10 decision and integer-only arithmetic.

## 17. Open decisions and questions

- App. B sub-question 1: does the metal pool already exist in the owner's books, and what is the opening balance?
- App. B sub-question 2: is stone weight recovered from scrap and tracked, or written off?
- Q5b / G23: is the allowance judged per job against the ledger, and where is the flag raised?
- Is the pool one number or one per purity (22K and 18K)?
- Who may post an opening or adjustment entry besides the owner?
- Does unused gold returned by a karigar go back to the pool, and is it weighed in?
- G10: which stored unit holds balances exactly?
- D7: is there one pool per branch?

## 18. Candidate stories

1. EP-18-S1: System can store pool entries and a balance as integer weights
2. EP-18-S2: Owner can record the opening balance
3. EP-18-S3: System can post an issue entry inside job creation
4. EP-18-S4: System can refuse an issue above the balance
5. EP-18-S5: System can stop two issues overdrawing the pool
6. EP-18-S6: System can post a recovery entry inside a scrap decision
7. EP-18-S7: Owner can record gold returned by a karigar
8. EP-18-S8: Owner can post an adjustment with a reason
9. EP-18-S9: Owner can see the ledger with filters
10. EP-18-S10: Staff can see the pool balance on the order copy screen
11. EP-18-S11: Owner can see gold with each karigar and a custody summary
12. EP-18-S12: System can push the balance live after a change
