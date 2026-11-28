# Metal pool ledger (EP-18)
The shop has one metal pool: a balance of gold in grams and an append-only ledger of the entries that moved it. Code: `packages/api/src/pool/`; contract: `packages/shared/src/contract/pool-contract.ts`; rules and sentences: `packages/shared/src/domain/metal-pool.ts`; schema: migration `20261128T1130_ep18_metal_pool_ledger.sql` (extends `metal_pools` and `pool_entries` from `0007_metal_pool.sql`).
Every weight is an integer number of 0.0001 g in the database and in audit values (`balanceG`, `deltaG` keys hold units), and a four-decimal gram string in the contract (`"812.5800"`; an entry's `deltaG` is signed, `"-162.4000"`). There is no price or money field anywhere.
## Operations
| Operation | Kind | Who | Input | Answer |
| --- | --- | --- | --- | --- |
| `readPoolBalance` | read | staff, owner | `{}` | `{ ok, balanceUnits, balanceG, version }`; a shop with no pool row yet answers 0 and version 0 |
| `listPoolEntries` | list | owner | `{ cursor?, pageSize?, kind?, job?, piece?, from?, to? }` | page of `{ id, at, atLocal, kind, deltaG, note, refType, refId, actorName }`, newest first |
| `createOpeningEntry` | create | owner | `{ amountG, note? }` | `{ ok, id }` (the `PL-001` style entry code) |
| `createReturnEntry` | create | owner | `{ jobId, amountG, note? }` | `{ ok, id }` |
| `createAdjustmentEntry` | create | owner | `{ adjustmentDeltaG, reason }` | `{ ok, id }` |
| `readCustodySummary` | read | owner | `{}` | `{ ok, poolG, withKarigars: { totalG, openJobs, karigars: [{ karigarId, name, openJobs, goldG }] }, inParcelsG, inStockG, goneG }` |
| `readGoldWithKarigar` | read | owner, karigar | `{ karigarId? }` | `{ ok, karigarId, karigarName, goldG, openJobs, jobs: [{ jobId, issuedG, returnedG, withKarigarG }] }` |
`jobId` is the job code (`MO-2026-118`) and `karigarId` the karigar code (`KG-04`), as the rest of the contract names records. A refused caller gets `forbidden` with the sentence in `OPERATION_RULES`: "Only the owner can record the opening balance of the metal pool.", "Only the owner can record gold returned to the metal pool.", "Only the owner can adjust the metal pool.", "Only the owner can read the metal pool ledger.", "Only the owner can see where the gold is.", "Only the owner or the karigar can see the gold with a karigar." (staff on `readGoldWithKarigar`) and the karigar sentence on `readPoolBalance`.
Entries have five kinds (`POOL_ENTRY_KINDS`): `opening`, `returned` and `recovered` add gold, `issued` takes it out, `adjustment` is either. `issued` and `recovered` are not contract operations: EP-19 and EP-27 post them from inside their own operations (below).
### Rules
- **Opening** (S2): allowed only while the shop's ledger has no entry of any kind; otherwise 422 `opening_exists` "The metal pool already has entries. Record an adjustment instead.". The amount must be above zero (`validation` on `amountG`). The same `Idempotency-Key` stores one entry.
- **Return** (S7): the job must exist (`not_found` "Job <code> was not found."), whatever its status. The amount must be above zero and at most the job's `gold_issued_units` less its earlier `returned` entries, else 422 `rule_refused` "That is more gold than was issued for this job and not yet returned.". There is no scale id and no weighing-in step.
- **Adjustment** (S8): `reason` is 3 to 500 characters after trimming (`validation` on `reason`); zero is `validation` on `adjustmentDeltaG`. An adjustment that would take the balance below zero is refused by the posting check with `pool_insufficient` (see open decisions).
- **Never below zero** (S4): every posting goes through `postPoolEntry`, which refuses a result below zero with 422 `pool_insufficient` "The metal pool does not have that much gold to issue." and changes nothing.
- **Listing** (S9): `at desc, id desc` with the shared cursor, default 50 per page (at most 200). `kind`, `job` (entries whose reference is that job), `piece` (the piece's tag), `from` and `to` (Asia/Kolkata days, both inclusive; `to` before `from` is `validation` on `to`) are where clauses, so every page keeps them. An entry at 20:00 UTC on 31 October is on 1 November.
- **Gold with a karigar** (S11): an open job is one whose status is not `handed_over` and that has no `settled_at`. The gold with the karigar on it is `gold_issued_units` less the sum of its `returned` entries, never below zero. A karigar sees only their own figure: no `karigarId` means their own, another karigar's code answers `not_found` (not `forbidden`), as `readMyJob` does. The owner must send `karigarId` (`validation` otherwise).
- **Custody summary** (S11): net gold is `gross_units - stone_units`. In parcels = pieces `draft`, `with_owner` or `stopped`; in stock = `in_stock`; gone = `billed`. Scrapped pieces are not counted (their gold returns to the pool when EP-27 posts the recovery) and parcel gold before tagging is not counted.
Each create writes one audit entry in the same transaction: `pool_opening_recorded`, `pool_return_recorded` or `pool_adjusted`, entity type `metal_pool`, entity id `metal-pool`, `ref` the new entry's code (the job code for a return), `reason` the note or the adjustment's reason, `before` `{ balanceG }` and `after` `{ balanceG, deltaG }` in integer units.
## Posting from other operations
`postPoolEntry(tx, ctx, { kind, deltaUnits, note?, ref? })` is the only code that changes `metal_pools.balance_units` or inserts into `pool_entries`. It refuses to run outside a transaction (`isInTransaction`), takes the pool lock, checks the balance, writes the entry and the new balance together and records `metal_pool.changed` for the live channel in the same transaction.
- **EP-19** (`createOrderCopyAndJob`) calls `postIssue(tx, ctx, { jobCode, amountUnits })` after it has validated the job and before it commits. A refusal (`pool_insufficient`) rolls the whole job back.
- **EP-27** (`ownerScrap`) calls `postRecovery(tx, ctx, { tagNo })`. The weight is read from the piece on the server (gross less stones), a piece is recovered once (unique index on `ref_id` for `recovered` entries) and a piece with no gold weight is refused.
- **Lock order: pool, then job or piece.** Take the pool lock (`lockPool(tx, ctx.shop)`, a `select ... for update` on the shop's `metal_pools` row, created when missing) before any read that a posting depends on. `createReturnEntry` and `postRecovery` do this; an operation that locks a job or piece row first and the pool second can deadlock against them.
- Posting misuse (outside a transaction, a zero or fractional delta, a wrong sign for the kind, half a reference) throws a plain `Error`, a 500 if it ever reached a route. Operations validate their input first.
## Consistency check
`checkPoolConsistency(client, shop)` returns the stored balance, the ledger sum and whether they are equal; `assertPoolConsistent` throws naming both. The tests call it after postings and after 20 concurrent issues. Nothing runs it in production yet.
## Live event
Every posting emits `metal_pool.changed` ("Metal pool changed", entity id `metal-pool`, entity version = the pool row's `version`). The envelope carries no weight; the screens refetch `readPoolBalance`. The event reaches the owner and staff streams: `ENTITY_READ_PERMISSIONS.metal_pool` is `['readPoolBalance']`, which a karigar may not call. See [live.md](live.md).
## Decisions fixed by the plan
1. Stored names stay `balance_units` and `delta_units`; `reference` became `ref_id`, with new `ref_type`, `actor_id`, `actor_name`.
2. Two new error codes, `pool_insufficient` and `opening_exists`, both 422. Everything else uses existing codes.
3. A shop may have no pool row; reads answer 0 and version 0, the first posting creates it.
4. The live event carries ids and versions only.
5. Open job and gold with a karigar as defined above.
6. Custody figures as defined above.
7. Returns are allowed on any existing job, capped by issued less returned.
8. Opening is allowed only on an empty ledger. The seeded development database already has entries, so it refuses there.
9. One pool per shop, purity ignored; the owner alone posts opening, return and adjustment.
10. Not built here: `postIssue` inside `createOrderCopyAndJob` (EP-19), `postRecovery` inside `ownerScrap` (EP-27), parcel-gold figures (EP-21), the karigar portal figure (EP-20), dashboard tiles (EP-32), the launch opening (EP-41).
## Open decisions (for the owner, see docs/followups.md)
- Whether the pool already exists in the owner's books and its opening figure (Appendix B question 1).
- Whether stone weight from scrap is tracked or written off (question 2). Built: net gold only.
- Whether the allowance is judged per job against the ledger, and where the flag is raised (Q5b, G23). Built: nothing.
- One pool or one per purity (22K, 18K). Built: one number per shop.
- Who besides the owner may post an opening or an adjustment. Built: the owner only.
- Whether returned gold is weighed in. Built: the owner records it, capped by the job's issued gold, no scale id.
- Wording of the `opening_exists`, return-too-much and already-recovered sentences needs the owner's review.
- An adjustment that would overdraw the pool answers `pool_insufficient`, whose sentence speaks of issuing. The stories do not say which sentence it should show.
- Issued entries reference the job by its code, so renaming a job code would orphan the reference.
## Story to test map
| Story | Where it is tested |
| --- | --- |
| S1 storage, kinds, balance, append-only | `test/pool/post-pool-entry.test.ts`, `test/db/metal-pool.test.ts` |
| S2 opening entry | `test/pool/opening-entry.test.ts` |
| S3 issue inside a job | `test/pool/post-pool-entry.test.ts` |
| S4 refuse an issue above the balance | `test/pool/post-pool-entry.test.ts`, `test/pool/adjustment-entry.test.ts` |
| S5 concurrent issues | `test/pool/post-pool-entry.test.ts` (20 at once on 150 g), `test/pool/return-entry.test.ts` |
| S6 recovery | `test/pool/post-pool-entry.test.ts` |
| S7 return | `test/pool/return-entry.test.ts` |
| S8 adjustment | `test/pool/adjustment-entry.test.ts` |
| S9 ledger and filters | `test/pool/pool-reads.test.ts` |
| S10 balance read (server) | `test/pool/pool-reads.test.ts` |
| S11 custody | `test/pool/custody.test.ts` |
| S12 live event | `test/pool/pool-live.test.ts`, `test/pool/post-pool-entry.test.ts` (rollback) |
The permission, validation, shop-scoping and audit guards cover the seven operations through `test/permissions/role-matrix.test.ts`, `test/manifest/*`, `test/permissions/shop-scoping.test.ts` and `test/audit/every-operation-audits.test.ts`.
