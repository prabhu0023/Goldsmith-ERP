# EP-27: Scrap

## 1. Summary

Scrap means taking an in-house piece out of stock, melting it, and reusing its gold. It is not a sale to a refiner and
not old gold taken from a customer. Staff can request scrap for a piece with a reason, for example a Temple Nakshi Haram
unsold for 108 days. While the request waits, the piece is parked with the owner and cannot be sold. Only the owner
marks it scrapped, and when he does, the piece closes and its pure gold goes back into the metal pool to be issued to
a karigar again. The business needs this to turn dead stock back into working gold without losing track of a single
gram.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M4 Exceptions
- Prototype status: Partial. `requestScrap`, `ownerScrap` and `ownerDeclineScrap`, the `scrap-decision` screen and the request button in the piece drawer work on mock data, crediting the pool; the server transaction with the pool ledger, audit of the request and live push are absent. The "Melt and remake" entry point from the ageing alert (G5) is not built, because the prototype has no ageing alert.

## 3. Roles involved

- Staff: requests scrap for an in-stock piece with a reason; sees the piece parked with the owner.
- Owner: reads the request and marks the piece scrapped or declines it; may also request.
- Karigar: not involved here; receives recovered gold later through a new job (EP-19).
- System: parks the piece with the owner, credits the piece's pure gold to the metal pool in the same transaction as the scrap (via EP-18), voids open edit proposals, writes audit entries, and alerts the owner.

## 4. In scope

- Scrap request on one in-stock piece with a reason of at least 3 characters.
- Piece status `with_owner` while the request is pending, previous status kept.
- Owner decision: scrap or decline.
- Scrap: piece status `scrapped` (final), net gold credited to the pool as a `recovered` ledger entry with the piece as reference, in one transaction.
- Decline: piece back to in_stock.
- Open edit proposals on the piece voided on scrap.
- Audit entries for request, scrap and decline.
- Live alert to the owner on a new request and to stock screens on the decision.
- The owner's "Melt and remake" action from an ageing alert opening a scrap decision (alert itself in EP-32, G5).

## 5. Out of scope

- The metal pool ledger, balance and its view (EP-18).
- Issuing recovered gold to a karigar (EP-19).
- The ageing alert that suggests scrap and its threshold (EP-32, EP-13, G5).
- Sale of a piece (EP-26).
- Piece states and the stock list (EP-22).
- The Decisions card layout (EP-32).
- Selling scrap to a refiner, if it is ever decided (App. B sub-question 3; no epic yet, would extend EP-18 and this epic).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `ScrapRequest { id, pieceId, reason, requestedBy, requestedAt, status: 'pending' | 'scrapped' | 'declined', decidedAt }`; `PoolEntry.kind` includes `recovered`.
- `src/store/transitions.ts`:
  - `requestScrap` refuses a piece not in_stock ("{id} is not in stock."), a held piece ("{id} is held for a customer.", dropped in production v1 because v1 has no holds), a short reason ("Say why it should be scrapped."); creates `SR-` id; sets the piece `with_owner` with `prevStatus: 'in_stock'`. Not audited.
  - `ownerScrap` (owner only, "Only the owner can mark a piece as scrap.") refuses a decided request, sets the piece `scrapped`, voids open edits, adds the piece's `netOf` to `pool.balanceG` with a `recovered` entry "Scrap {name}", audits `scrap_marked` with "{tag} marked as scrap · {net} g back in the pool".
  - `ownerDeclineScrap` (owner only) sets the piece back to in_stock and audits `scrap_declined`.
- Selectors: `ownerQueues.pendingScrap`, counted as one blocking card; `heldBackPieces` includes `with_owner`.
- Components: `src/components/stock/ScrapDecision.tsx` (route `scrap-decision`, param `requestId`), the "Ask to scrap" button (hidden for a held piece in the prototype; v1 has no holds, so it is not hidden for that reason) and the owner's "Decide on the scrap request" button in `src/components/stock/PieceDrawer.tsx`, the card in `OwnerDecisions.tsx`.
- Seed: SR-101 for TAG-7701 Temple Haram, 78.4000 g net; pool 812.5800 g before and 890.9800 g after scrapping (`.agents/tasks/jgd-redesign/review.md`).
- Reusable: the request and decision rules, sentences, the decision screen and drawer button.
- Not built: the owner's "Melt and remake" action on the ageing alert (mockup 08). `OwnerDecisions.tsx` has no ageing alert, so there is no entry point to reuse.
- Must be rebuilt server-side: one transaction for piece status, pool ledger entry and edit voids; owner check; audit of the request; row lock so a piece cannot be sold while the request is created.

## 7. Functional requirements

- FR-27-1. A staff member can request scrap for an in-stock piece with a reason of at least 3 characters.
- FR-27-2. The server refuses a request for a piece that is not in_stock, with the prototype sentence.
- FR-27-3. A pending request moves the piece to `with_owner`, so it cannot be sold or edited.
- FR-27-4. The owner sees each pending request with piece name, tag, days in stock, pure gold, requester and reason.
- FR-27-5. The owner can mark the piece scrapped; the server sets the piece to scrapped and credits its pure gold to the pool as a recovered entry in one transaction.
- FR-27-6. The owner can decline; the piece returns to in_stock.
- FR-27-7. The server refuses scrap and decline from any role other than owner.
- FR-27-8. The server refuses a decision on a request that is already decided.
- FR-27-9. Scrapping voids every open edit proposal on the piece.
- FR-27-10. A scrapped piece is final: no transition leaves `scrapped`.
- FR-27-11. Request, scrap and decline each write an audit entry with actor, piece, reason and pure gold.
- FR-27-12. The owner sees a new request within about 1 second; stock screens update within about 1 second of a decision.
- FR-27-13. The pool credit uses the piece's net (gross minus stones) as an integer in units of 0.0001 g.

## 8. Business rules

- BR-27-1. Scrap means mark an in-house piece as scrap and reuse the metal; scrap and melted are the same act. [SCOPE-ANALYSIS App. B Q6]
- BR-27-2. Scrapping closes the piece but not the gold; the metal goes back into a pool that can be issued again. [SCOPE-ANALYSIS App. B Q6; mockup 13 "puts its gold back in the metal pool to issue again"]
- BR-27-3. Melting always needs the owner; staff can only request it. [SCOPE-ANALYSIS App. A A5; mockup 06 "Scrap · owner only"; mockup 11]
- BR-27-4. Only an in_stock piece can be asked to scrap; v1 has no holds, so the prototype's held-piece refusal is out of scope. [src/store/transitions.ts requestScrap; owner decision, gap G6 resolved]
- BR-27-5. The piece waits with the owner while the request is pending. [src/store/transitions.ts requestScrap; mockup 12]
- BR-27-6. Scrapped is a closed state. [SCOPE-ANALYSIS App. A decision 1; mockup 01]
- BR-27-7. Every state change and every pool movement is audited. [PRODUCTION-SCOPE §5 Audit]
- BR-27-8. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- ScrapRequest: id, piece id, reason, requested by (user id), requested at, status (`pending`, `scrapped`, `declined`), decided by, decided at.
- Piece: status `with_owner` then `scrapped` or back to `in_stock`; previous status.
- Pool ledger entry (owned by EP-18): kind `recovered`, delta (integer, units of 0.0001 g, the piece's net), note, reference to the piece and the scrap request.
- PieceEdit: status `void` for open proposals.
- Audit entries: `scrap_requested` (new kind), `scrap_marked`, `scrap_declined`.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Scrap request | Ask the owner to scrap a piece | Staff, Owner |
| List | Pending scrap requests | Owner's queue | Owner |
| Read | Scrap request | Details and the piece | Owner, the requester |
| Update | Mark scrapped | Close the piece and credit the pool | Owner |
| Update | Decline scrap | Return the piece to stock | Owner |

## 11. Live events

- Emits: "Metal pool changed" — through EP-18 when the scrap credits the pool, so the order-copy screen shows the new balance.
- Emits (proposed, not in catalogue): "Scrap requested" — when staff request scrap, for the owner's Decisions card (gap G26; consumer EP-32).
- Emits (proposed, not in catalogue): "Piece scrapped" — when the owner scraps or declines, so stock screens update (gap G26; consumers EP-22, EP-32).
- Consumes: none from the catalogue.

## 12. Screens and UX references

- Route ids: `scrap-decision` (ScrapDecision, param requestId), `stock` (PieceDrawer "Ask to scrap"), `decisions` (pending scrap card).
- Mockups: `06-stock-out.svg` ("Scrap · owner only · The piece is melted, its gold back to the pool"), `12-state-lifecycles.svg` (piece rail to scrapped, gold back to the pool), `13-notifications-escalation.svg` ("1 piece to be marked as scrap · Temple Nakshi Haram · 108 days unsold · 78.400 g pure gold · asked by Rajesh"), `08-owner-home.svg` ("Melt and remake" on the ageing alert).

## 13. Non-functional requirements

- Precision: the pool credit equals the piece's net as integers in units of 0.0001 g; seed check 812.5800 g + 78.4000 g = 890.9800 g.
- Concurrency: the request locks the piece row, so a sale or second request cannot succeed at the same time; scrap and pool credit commit together or not at all.
- Security: scrap and decline are owner-only on the server.
- Audit: request, scrap and decline write append-only entries; the pool entry carries the scrap request reference.
- Performance: the owner sees a request within about 1 second.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-22, EP-18, EP-08
- Downstream: EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given TAG-7701 is in_stock, when Rajesh requests scrap with "108 days unsold", then the piece is with the owner and cannot be sold.
2. Given the pool is 812.5800 g and the request is pending, when the owner marks TAG-7701 scrapped, then the piece is scrapped and the pool is 890.9800 g with a recovered entry referencing TAG-7701.
3. Given a pending request, when the owner declines it, then the piece is in_stock again and an audit entry records the decline.
4. Given a staff user, when they call mark-scrapped directly, then the server refuses and the pool is unchanged.
5. Given a billed piece, when staff request scrap, then the server refuses with "{tag} is not in stock."
6. Given the pool credit fails, when the owner marks scrap, then the piece stays with the owner and no partial change is saved.

## 16. Risks

- Risk: the pool credit and the piece close are not atomic and gold appears or disappears. Mitigation: one transaction through EP-18's ledger operation.
- Risk: stone weight is lost or counted as gold. Mitigation: credit net only; decide App. B sub-question 2.
- Risk: recovered gold of one purity is mixed with another in the pool. Mitigation: decide pool purity with EP-18.
- Risk: requests sit with the owner and pieces vanish from the floor for weeks. Mitigation: show request age on Decisions and in reports.

## 17. Open decisions and questions

- A5: is it confirmed that melting always needs the owner and staff can only request it?
- App. B sub-question 2: when a piece is scrapped, is its stone weight recovered and tracked separately, or written off?
- App. B sub-question 3: is scrap ever sold outward to a refiner, or only reused in-house?
- What purity does recovered gold carry in the pool (for example 22K and 18K pieces melted together)?
- Is the credited figure the tag net, or a re-weighed figure after melting, and who records any melting loss?
- Can a staff member withdraw a pending request?
- Must the owner give a reason when declining?
- G26: should "Scrap requested" and "Piece scrapped" be added to the live event catalogue?

## 18. Candidate stories

1. EP-27-S1: System can store scrap requests with their states
2. EP-27-S2: Staff can request scrap for an in-stock piece with a reason
3. EP-27-S3: System can refuse a scrap request for a non-stock piece
4. EP-27-S4: System can park a requested piece with the owner
5. EP-27-S5: Owner can see pending scrap requests with days in stock and pure gold
6. EP-27-S6: Owner can mark a piece scrapped and credit its gold to the pool
7. EP-27-S7: Owner can decline a scrap request and return the piece to stock
8. EP-27-S8: System can void open edits on a scrapped piece
9. EP-27-S9: Owner can start a scrap from the "Melt and remake" action on the ageing alert
10. EP-27-S10: System can push scrap requests and decisions live
11. EP-27-S11: System can audit every request and decision
