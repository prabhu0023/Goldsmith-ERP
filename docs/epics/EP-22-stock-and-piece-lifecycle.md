# EP-22: Stock and piece lifecycle

## 1. Summary

This epic is the showroom stock list and the life of a piece. A piece moves through six states: draft, with the owner,
stopped, in stock, billed and scrapped. The server must enforce that state machine, so a piece cannot be sold twice and
a stopped piece cannot be sold at all. Staff search the in-stock list and open a piece to see its pure gold, facts and
history. The business needs this because double-selling a piece is the most visible failure at the counter. The
prototype is safe only because there is one user. v1 has no hold mechanism: the owner decided that a piece the shop can
sell cannot be held for anyone (no holds in v1), so an in-stock piece goes straight to billed or scrapped. This epic also owns the "Sold
out" fact about a design (G3, with EP-15).

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. Six states with `prevStatus`, `ShowroomStock` cards with search and count chips, and `PieceDrawer` exist; state changes are spread across many transitions and double-selling is impossible only because one user acts. The prototype also has holds through `heldForLeadId`, which production v1 drops.

## 3. Roles involved

- Owner: sees every piece and state; can clear stops (EP-24), apply edits (EP-25) and scrap (EP-27).
- Staff: searches stock, opens a piece, adds it to a sale (EP-26), shares it (EP-34).
- Karigar: never sees stock (mockup 11).
- System: owns the state machine, takes a row lock or version check on sale, rejects the second seller, and pushes changes.

## 4. In scope

- The six states and the allowed transitions, enforced on the server. From in stock a piece goes only to billed, scrapped or stopped; there is no held state, because v1 has no holds.
- In-stock list with search by tag, HUID, name or collection and chips: Can sell, With QC, Sold out, Billed.
- Piece detail: pure gold hero, tag, BIS hallmark, made by, came in with, days in stock, reordered before, weight breakdown, edit history, photos.
- Double-sell prevention: two staff selling the same piece at the same moment, only one succeeds and the other gets "already taken".
- "Sold out" as a design fact, with a reorder pointer (G3, with EP-15).
- Days in stock and the ageing signal (threshold from EP-13, alert in EP-32).
- Frozen weights once billed.
- Live removal from other screens when a piece is billed.
- Pure gold on the floor total.

## 5. Out of scope

- Holds of any kind, the "Held for a customer" state and hold expiry: deferred, not in v1 (PRODUCTION-SCOPE §6 Layer F notes). Every in-stock piece stays sellable to anyone.
- Parcel arrival, tagging and release (EP-21, EP-23).
- Stock-out recording (EP-26).
- Edit proposals and the token (EP-25); scrap (EP-27); stop the line (EP-24).
- Lead conversion, which links a lead line to a piece for reference only (EP-30).
- Design master and its lists (EP-15); the reorder order copy (EP-19).
- Pricing and value on the card (EP-42).
- Sharing a piece in a catalogue (EP-34).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `PieceStatus = 'draft' | 'with_owner' | 'stopped' | 'in_stock' | 'billed' | 'scrapped'`; `Piece.prevStatus`, `inStockAt`, `heldForLeadId` (prototype only; dropped in v1), `soldAt`, `stockOutId`, `valueINR` (nullable socket).
- `src/store/selectors.ts` `inStockPieces`, `pureGoldOnFloor` (1,847.2 g in the seed), `heldBackPieces`, `daysInStock`, `piecesOutToday`, `openEditFor`.
- `src/components/stock/ShowroomStock.tsx` (route `stock`): search, chips Can sell, With QC, Billed (as in the prototype, "Sold out" is mockup text), held cards (prototype only; dropped in v1).
- `src/components/stock/PieceDrawer.tsx`: facts, "Days in stock", edit history.
- The prototype has holds: `Piece.heldForLeadId`, `routeLeadItemToStock` in `src/store/transitions.ts` ("`<id>` is not in stock.", "`<id>` is already held for another customer.") and `releaseHold`; `markLeadLost` releases holds. Production v1 drops them: `heldForLeadId`, the held cards and the hold refusals are not carried over.
- `syncParcel` sets draft or with_owner; `finishRelease` sets in_stock; `stockOut` sets billed; `ownerScrap` sets scrapped; `raiseProblem` sets stopped and `prevStatus`; `clearProblem` restores.
- `src/components/ui/StatusChip.tsx` prints the state word.
- Reusable: the six states and words, selectors (the hold ones are dropped in v1), list and drawer layouts.
- Must be rebuilt server-side: one state machine module with a transition table, row locks or version checks, "already taken" responses, live echo, and the design-level sold out.

## 7. Functional requirements

- FR-22-1. The server holds one transition table for the six states and refuses any other change.
- FR-22-2. A billed piece cannot change state or weights.
- FR-22-3. A stopped piece cannot be sold.
- FR-22-4. Staff can search the in-stock list by tag, HUID, name or collection.
- FR-22-5. The list shows counts for Can sell, With QC, Sold out and Billed.
- FR-22-6. Staff can open a piece and see pure gold, gross, stones, tag, hallmark, maker, parcel, days in stock, reorder count and edit history.
- FR-22-7. Every in-stock piece is sellable by any staff member; no operation reserves a piece for a customer or a lead.
- FR-22-8. When one staff member bills a piece, it disappears from other staff screens within about a second.
- FR-22-9. Two staff selling the same piece at once: one succeeds, the other gets "already taken".
- FR-22-10. A design with no piece in stock counts as Sold out and offers a reorder (G3).
- FR-22-11. The system shows pure gold on the floor from in-stock pieces.
- FR-22-12. The server rejects a sale of a piece with an open edit proposal only by the decided rule (A4).

## 8. Business rules

- BR-22-1. There are six states: Draft, With the owner, Stopped, In stock, Billed, Scrapped. [SCOPE-ANALYSIS App. A decision 1; mockup 01]
- BR-22-2. Billed is final and weights are frozen. [mockup 12; mockup 06]
- BR-22-3. "Sold out" is a catalogue fact about a design, not a piece state. [SCOPE-ANALYSIS App. A decision 1; mockup 03; gap G3]
- BR-22-4. No holds in v1: if the shop can sell a piece, nobody can hold it; in stock goes straight to billed or scrapped. The "Held for a customer" segment of mockup 12 is out of scope. [owner decision, gap G6 resolved]
- BR-22-5. Two staff cannot both sell a piece; the second gets a clear message. [PRODUCTION-SCOPE §5 Concurrency]
- BR-22-6. A piece stays sellable while an edit proposal is open, pending A4. [SCOPE-ANALYSIS App. A, A4]
- BR-22-7. A stopped piece cannot be sold. [src/store/transitions.ts raiseProblem; mockup 11]
- BR-22-8. Pure gold leads the card, with value joining later as a second line. [SCOPE-ANALYSIS App. G]
- BR-22-9. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Piece state fields: status, previous status, in-stock time, sold at, stock-out id. No held-for or hold-expiry field.
- StateTransition: piece id, from, to, actor, at, reason (feeds the audit log).
- Design (with EP-15): sold out is derived from pieces; demand count (G3).
- Weights on the piece (gross, stone): integer, units of 0.0001 g; net derived.
- Value on the piece: nullable value socket, unused until EP-42.
- Version number on each piece for optimistic locking.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Pieces | In-stock list with search, state filter and counts | Staff, Owner |
| Read | Piece | Detail with history | Staff, Owner |
| Update | Piece state | Internal transitions called by other epics, with a version check | System |
| Read | Stock totals | Pure gold on the floor, counts | Staff, Owner |
| List | Sold-out designs | Designs with no piece in stock (G3) | Staff, Owner |

## 11. Live events

- Emits (proposed, not in catalogue): "Parcel released into stock" — when pieces go in_stock (gap G26; consumers EP-31, EP-32).
- Consumes: "Piece billed by one staff member" — to remove the piece from the list.
- Consumes: "Edit applied" — to refresh weights on the card.
- Consumes: "Parcel stopped (mismatch or raised problem)" — to show With QC and freeze pieces.
- Consumes (proposed, not in catalogue): "Problem raised on a job or piece" and "Problem cleared" — to freeze and unfreeze a stopped piece (gap G26, emitted by EP-24).
- Consumes (proposed, not in catalogue): "Piece scrapped" — to remove the piece from the stock list (gap G26, emitted by EP-27).

## 12. Screens and UX references

- Route id: `stock` (ShowroomStock with PieceDrawer and the pool card).
- Mockups: `03-showroom-stock.svg` (search, chips, drawer, "Sold out · Order another from Vijay", "Add to a sale", "Edit tag", "Share"), `01-foundations.svg` (STATE WORDS v3), `12-state-lifecycles.svg` (piece rail; its "Held for a customer" segment is out of scope for v1), `15-value-ready.svg` (value socket).

## 13. Non-functional requirements

- Concurrency: sales use a row lock or version check; the losing request gets "already taken"; tested by a concurrency test in EP-40.
- Security: karigar role has no stock operation; all state changes check the role.
- Audit: every state transition writes an entry with before and after.
- Precision: gold totals are sums of integer weights.
- Performance: list loads under 2 seconds for 5,000 pieces; live removal within about 1 second.
- Time: days in stock counted from `inStockAt` in Asia/Kolkata days.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-21, EP-08
- Downstream: EP-25, EP-26, EP-27, EP-30, EP-31, EP-34, EP-35, EP-40, EP-41, EP-42.

## 15. Epic acceptance criteria

1. Given one in-stock piece, when two staff sell it at once, then one succeeds and the other sees "already taken".
2. Given a billed piece, when anyone changes its weight or state, then the server refuses.
3. Given a stopped piece, when staff try to sell it, then the server refuses.
4. Given staff A bills a piece, when staff B has the list open, then it disappears within about a second.
5. Given an in-stock piece suggested for a lead line (EP-30), when another staff member sells it to a walk-in, then the sale succeeds.
6. Given a design with no piece in stock, when staff open `stock`, then it shows under Sold out.

## 16. Risks

- Risk: state changes stay scattered, so a path skips a check. Mitigation: one transition table all epics call.
- Risk: staff expect to put a piece aside for a customer, as the prototype allowed. Mitigation: state on the convert screen that a linked piece is not reserved; holds are recorded as deferred.
- Risk: sellable-during-edit (A4) leads to a sale of a piece whose weight is about to change. Mitigation: void the proposal on sale or add a frozen state.
- Risk: the list slows with history. Mitigation: index state and paginate.

## 17. Open decisions and questions

- A4: does a piece stay sellable while an edit proposal is open, or does it need a seventh state?
- G3: what makes a design "Sold out" and how are requests counted?
- G5: what ageing threshold marks stock as sitting too long?
- D7 is decided: one shop, no branches ([decision record](../decisions/tenancy-and-branches.md)); stock belongs to the shop, and tag number and HUID are unique within it. Each piece carries a location ID ("Main shop" in v1, set by the server); moving a piece between locations is deferred.
- Which pieces count in "With QC": draft only, or with_owner too?

## 18. Candidate stories

1. EP-22-S1: System can store pieces with state, version and integer weights
2. EP-22-S2: System can enforce the six-state transition table
3. EP-22-S3: Staff can see the in-stock list with counts
4. EP-22-S4: Staff can search stock by tag, HUID, name or collection
5. EP-22-S5: Staff can open a piece and see its facts and history
6. EP-22-S6: System can refuse a second sale of the same piece with "already taken"
7. EP-22-S7: Staff can see a piece disappear live when billed elsewhere
8. EP-22-S8: System can freeze stopped and billed pieces
9. EP-22-S9: Staff can see sold-out designs with a reorder pointer (G3)
10. EP-22-S10: Owner can see pure gold on the floor
11. EP-22-S11: System can audit every state transition
