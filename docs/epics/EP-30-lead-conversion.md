# EP-30: Lead conversion

## 1. Summary

Converting a lead means deciding, item by item, how each request will be met. A line can be met from stock by linking
it to a matching in-stock piece, or it can be made by sending an order copy to a karigar. One lead can split both ways:
in the Sharma wedding lead the choker is matched to a piece in stock and the two harams go to a karigar. v1 has no hold
mechanism: the link from a line to a piece is a reference for staff, the piece is not reserved, and anyone can still
sell it. The lead counts as converted only once every line has been routed one way or the other. The business needs
this so a customer's wish turns into tracked work.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M5 Front door
- Prototype status: Partial. Routing through `routeLeadItemToStock`, the make route through `createOrderCopyAndJob`, `settleLeadState` and the `lead-convert` screen with matching suggestions work on mock data; audit and live updates are absent. The prototype's stock route also holds the piece (`heldForLeadId`), which production v1 drops.

## 3. Roles involved

- Staff: sees matching in-stock pieces per line, links one to the line, sends a line to make, unlinks a line, follows the lead to converted.
- Owner: can do the same; sees converted and lost leads in reports.
- Karigar: receives the job for a "make" line through EP-19 and EP-20; never sees the customer.
- System: suggests matching pieces, records the link without reserving the piece, sets the lead state from its lines, and refreshes suggestions when a linked piece is sold.

## 4. In scope

- Per-item routing on an opened or being-worked lead: stock (with a piece id, for reference) or make (with a job id).
- Suggestions: in-stock pieces whose kind matches the line, within 20% of the approximate weight when one is given (prototype rule `stockMatches`).
- Link a line to a piece ("sell from stock"): the line records the piece id; the piece stays in stock, visible and sellable to anyone.
- Route a line to make: opens the order copy builder (EP-19) with lead and line ids; sending the order copy routes the line.
- Lead state from its lines: opened to being worked when the first line is routed; converted when every line is routed; back to being worked if a line is unlinked.
- Unlink a stock line: the line is unrouted; nothing changes on the piece.
- A linked piece that is sold to someone else or leaves stock: the line shows the piece as gone so staff can pick another piece or send the line to make.
- Refusal to route a line twice and to convert a lead that still needs a glance.
- Telling the customer when a made piece is ready: listed as open; channel undecided.

## 5. Out of scope

- Holding or reserving a piece for a lead, "Hold TAG-8841 for them", and hold expiry: deferred, not in v1 (PRODUCTION-SCOPE §6 Layer F notes). The mockup 18 hold button and its line "It leaves the showcase and other quotes cannot see it" are out of scope for v1.
- The order copy content, gold issue and the karigar job (EP-19).
- The piece state machine (EP-22).
- The stock-out of a linked piece (EP-26), which works as for any in-stock piece.
- Lead creation, inbox and SLA (EP-28, EP-29).
- Messaging the customer (EP-11, EP-12), if decided.

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `LeadRoute = { kind: 'stock'; pieceId } | { kind: 'make'; jobId }`; `LeadItem.route`; `Piece.heldForLeadId` (prototype only; dropped in v1); `OrderCopy.leadId`, `OrderCopy.leadItemId`.
- `src/store/transitions.ts`:
  - `routeLeadItemToStock` refuses a lead in needs_glance ("Check and keep this lead before converting it."), a routed line ("That line has already been routed."), a piece not in stock ("{id} is not in stock.") or held ("{id} is already held for another customer."); sets the route and `heldForLeadId`. The hold part is dropped in v1.
  - `releaseHold` refuses a line not held from stock ("That line is not held from stock."), clears the route and the hold. Dropped in v1.
  - `createOrderCopyAndJob` routes the line as `make` when `leadId` and `leadItemId` are given.
  - `settleLeadState` moves opened to being_worked on the first route, to converted when `isFullyRouted`, and back from converted to being_worked if a line is unrouted.
  - `markLeadLost` clears holds (dropped in v1). None of these are audited.
- `src/domain/leads.ts`: `isFullyRouted` (at least one line and every line routed).
- `src/components/leads/ConvertLead.tsx` (route `lead-convert`, params `leadId`, optional `sent`): `stockMatches` suggests pieces, "Hold {tag} for them" (dropped in v1), "Make it — order to karigar", release, "Mark lost"; `OrderCopyBuilder.tsx` (route `order-copy`, params `leadId`, `itemId`).
- Production v1 drops the hold part of the prototype: `heldForLeadId`, the "already held" refusal, `releaseHold` and the hold clearing in `markLeadLost` are not carried over. The route to stock keeps only the piece id.
- Reusable: the routing model, state settling, the needs-glance and already-routed sentences, the convert screen and suggestion rule (the hold button is dropped in v1 and becomes a link).
- Must be rebuilt server-side: routing and lead state derived in the same transaction, audit, and the "linked piece gone" refresh.

## 7. Functional requirements

- FR-30-1. A staff member sees, for each unrouted line, the in-stock pieces that match its kind and lie within 20% of its approximate weight when one is given.
- FR-30-2. A staff member can link one in-stock piece to one line; the server records the link and routes the line in one transaction and does not change the piece.
- FR-30-3. A linked piece stays in stock, appears on every staff screen and can be sold by anyone; no lead line reserves it.
- FR-30-4. The server refuses to route a line that is already routed.
- FR-30-5. The server refuses any routing on a lead that still needs a glance.
- FR-30-6. A staff member can send a line to make; the line is routed when EP-19 sends the order copy.
- FR-30-7. The lead becomes being worked when its first line is routed and converted when every line is routed.
- FR-30-8. A staff member can unlink a stock line; the line is unrouted and a converted lead returns to being worked.
- FR-30-9. When a linked piece is billed or leaves stock, the convert screen marks the line's piece as gone within about 1 second and offers other matches or the make route.
- FR-30-10. Every link, unlink and routing writes an audit entry with the lead, line, piece or job and actor.
- FR-30-11. The convert screen shows how many lines are routed and the lead state.

## 8. Business rules

- BR-30-1. Routing is per item, so a lead can split both ways. [mockup 18 "PER ITEM, SO A LEAD CAN SPLIT BOTH WAYS"]
- BR-30-2. The lead is only converted once every item has been routed one way or the other. [mockup 18; src/domain/leads.ts isFullyRouted]
- BR-30-3. No holds in v1: linking a line to a piece does not reserve it; if the shop can sell the piece, it stays sellable to anyone. [owner decision, gap G6 resolved]
- BR-30-4. A lead must be glanced before conversion. [src/store/transitions.ts routeLeadItemToStock]
- BR-30-5. A "make" line becomes an order copy and a karigar job, with the lead attached so the customer can be told when it is ready. [mockup 18; mockup 19]
- BR-30-6. Two staff selling the same piece must not both succeed; that rule lives in EP-22 and EP-26 and also covers linked pieces. [PRODUCTION-SCOPE §5 Concurrency]
- BR-30-7. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- LeadItem: route kind (`stock`, `make`, null), piece id (for stock, a reference only), job id (for make), routed at, routed by.
- Piece (owned by EP-22): unchanged by routing; no held-for field.
- Lead (owned by EP-28): state recomputed here.
- Suggestion inputs: line kind and approximate weight (nullable integer, units of 0.0001 g); piece net and gross (integers, units of 0.0001 g).
- Audit entries: `line_linked_stock`, `line_unlinked`, `line_routed_make` (new kinds).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Matching pieces for a line | In-stock suggestions | Staff, Owner |
| Update | Route line to stock | Link a line to a piece for reference | Staff, Owner |
| Delete | Line route | Unlink a stock line | Staff, Owner |
| Update | Route line to make | Link a line to the job sent by EP-19 | Staff, Owner (through EP-19) |
| Read | Lead routing | Lines, routes and state | Staff, Owner |

## 11. Live events

- Consumes: "Piece billed by one staff member" — to drop a sold piece from the suggestions and mark a linked line's piece as gone.
- Consumes: "Metal pool changed" — through the order copy builder, so the gold available is current when a line is sent to make.
- Emits: none of its own. Routing changes refresh other screens through API reads.

## 12. Screens and UX references

- Route ids: `lead-convert` (ConvertLead, params leadId and optional sent), `order-copy` (OrderCopyBuilder, params leadId and itemId).
- Mockups: `18-convert-lead.svg` (Sharma: 2 Temple Harams "best made fresh", Kundan Choker "TAG-8841 matches what they described · 41.590 g", "converted once every item ... routed"; the "Hold TAG-8841 for them" button and "It leaves the showcase and other quotes cannot see it" are out of scope for v1), `19-order-copy-builder.svg` (the make path), `12-state-lifecycles.svg` (lead fork; its "Held for a customer" segment is out of scope for v1).

## 13. Non-functional requirements

- Concurrency: routing a line and the lead state change in one transaction; two staff routing the same line at once, one succeeds and the other sees "That line has already been routed."
- Performance: the convert screen with its suggestions loads under 2 seconds; a sold linked piece shows as gone within about 1 second.
- Audit: every link, unlink and route is appended with actor and time.
- Precision: the 20% weight window is computed on integers in units of 0.0001 g.
- Security: staff and owner only; karigars never see leads.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-28, EP-22, EP-19, EP-08
- Downstream: EP-31, EP-32, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given the Sharma lead is opened with a Kundan Choker line, when Rajesh links TAG-8841 to it, then the line is routed, the lead is being worked, and TAG-8841 stays in stock on every staff screen.
2. Given TAG-8841 is linked to the Sharma line, when Deepak sells it to a walk-in customer, then the sale succeeds and the Sharma line shows the piece as gone within about 1 second.
3. Given the two harams are sent to make and the choker is linked, when the last line is routed, then the lead is converted.
4. Given a converted lead, when staff unlink the choker line, then the lead is being worked.
5. Given a lead in needs_glance, when staff try to link a piece, then the server refuses.
6. Given a routed line, when another staff member routes it again, then the server refuses with "That line has already been routed."

## 16. Risks

- Risk: staff promise a linked piece to a customer and it is sold to someone else. Mitigation: the convert screen says the piece is not reserved, and a sold linked piece is flagged at once.
- Risk: the prototype's 20% weight window suggests poor matches or misses good ones. Mitigation: treat the window as a tunable rule and review with staff.
- Risk: lead state and routes drift apart. Mitigation: change both in one transaction.

## 17. Open decisions and questions

- Is the customer told when a made piece is ready (mockup 18 "so the customer can be told"), by whom and through which channel (D8)?
- Does a line whose linked piece was sold stay routed (counting toward converted), or return to unrouted?
- Can a line with quantity 2 be split, one from stock and one made?
- Can one line link several pieces (for example a pair of bangles tagged separately)?
- A4: can a piece with an open edit proposal be linked to a line?

## 18. Candidate stories

1. EP-30-S1: System can store a route per lead line
2. EP-30-S2: System can derive the lead state from its routed lines
3. EP-30-S3: Staff can see matching in-stock pieces for a line
4. EP-30-S4: Staff can link a line to an in-stock piece without reserving it
5. EP-30-S5: Staff can send a line to make through an order copy
6. EP-30-S6: Staff can see the lead convert once every line is routed
7. EP-30-S7: Staff can unlink a stock line
8. EP-30-S8: Staff can see when a linked piece is sold to someone else
9. EP-30-S9: System can audit every link, unlink and route
