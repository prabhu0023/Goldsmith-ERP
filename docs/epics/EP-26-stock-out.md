# EP-26: Stock-out

## 1. Summary

Stock-out records that one or more pieces have physically left the showroom because they were sold. Staff scan or type
the tags, the seller defaults to the signed-in staff member, and they enter the reference number and the tax invoice
number from the billing book. The app holds no amount: the invoice number is a reference only. Once out, a piece is
billed and its weights are frozen for good, with no edit, not even by the owner. The business needs this to know
exactly which gold left the floor, who sold it, and to stop two staff members selling the same piece at the same time.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M4 Exceptions
- Prototype status: Built. `stockOut` and the `stock-out` screen record many pieces, seller, reference and invoice number, lock the pieces as billed, void open edits and count the sale to the seller on mock data; the server transaction, row locks and live removal from other screens are absent.

## 3. Roles involved

- Staff: adds pieces by tag, confirms or changes the seller, enters reference and invoice number, takes the pieces out of stock.
- Owner: can do the same as staff; reads stock-outs in reports and the "went through without you" block.
- Karigar: not involved.
- System: checks every piece is in_stock in one transaction, locks the rows, refuses the second seller with "already taken", marks pieces billed, voids open edit proposals, counts the sale to the seller, writes the audit entry, and pushes the change to every staff screen.

## 4. In scope

- A stock-out record with one or more pieces.
- Adding a piece by typing or scanning its tag (scanner hardware in EP-36).
- Seller: defaults to the signed-in staff member; can be changed to another active staff member.
- Reference number (required string) and tax invoice number (required string), both from the billing book.
- Pure gold total of the pieces leaving, shown before confirming.
- One transaction: all pieces in_stock, then all billed with sold time and stock-out id.
- Second concurrent stock-out on the same piece refused with "already taken" (double-sell prevention).
- Open edit proposals voided (EP-25 rule).
- Seller sales count incremented by the number of pieces, for later gamification (EP-43).
- Audit entry `stock_out`.
- Live removal of the pieces from every other staff screen.
- The value column socket: hidden while pricing is off.
- The question of recording a customer on the stock-out (G13): recorded, not decided.

## 5. Out of scope

- Any amount, rate or total value (EP-42).
- Barcode scanner and label printer hardware (EP-36).
- Scrap as the other way a piece leaves stock (EP-27).
- Piece states and the stock list (EP-22).
- Holding or reserving a piece for a lead or customer: deferred, not in v1. Any in-stock piece can be sold, including one linked to a lead line in EP-30.
- Staff scoring, leaderboards and split attribution logic (EP-43).
- Sales reports (EP-35).
- Customer purchase history display (EP-17; feed depends on G13).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `StockOutRecord { id, pieceIds, sellerId, sellerName, ref, invoiceNo, at, amountINR: number | null }` ("The app never holds the amount."); `Piece.soldAt`, `Piece.stockOutId`, `Piece.heldForLeadId`; `StaffMember.salesCount`.
- `src/store/transitions.ts` `stockOut`:
  - refuses an empty list ("Add the pieces that are leaving."), a blank ref ("Enter the reference number."), a blank invoice ("Enter the tax invoice number from your billing book.");
  - de-duplicates ids and refuses any piece not in_stock ("{id} is not in stock.");
  - creates `SO-` id, sets each piece `billed` with `soldAt`, `stockOutId`, `heldForLeadId: null` (the hold clearing is dropped in v1);
  - voids open edits (`proposed`, `token_sent`);
  - adds the piece count to the seller's `salesCount`;
  - audits `stock_out` with "{n} pieces out · {invoiceNo}" and the ids.
- A piece held for one lead can be stocked out by anyone; the hold is simply cleared. Production v1 has no holds, so `heldForLeadId` and the clearing step are not carried over.
- `amountINR` is always null. No customer is recorded, so `Customer.history` has no live source (G13).
- Selectors: `piecesOutToday`, `goldOutToday` (mockup 02 "GOLD OUT TODAY").
- Components: `src/components/stock/StockOut.tsx` (route `stock-out`, optional param `pieceId` from the drawer button "Take out of stock", which mockup 03 calls "Add to a sale"), `src/components/ui/ValueSlot.tsx` for the hidden value column, `StaffToday.tsx` tile "Sell a piece".
- Reusable: the rule order and sentences, the screen, the record shape.
- Must be rebuilt server-side: one database transaction with row locks or version checks on every piece, "already taken" for the loser, uniqueness rules for references if decided, seller validation, the live push, and audit with before and after state.

## 7. Functional requirements

- FR-26-1. A staff member can add pieces to a stock-out by typing or scanning a tag; the same tag twice counts once.
- FR-26-2. The screen shows each piece's tag, purity, HUID and pure gold, and the total pure gold leaving, as integers in units of 0.0001 g shown in grams.
- FR-26-3. The seller defaults to the signed-in staff member and can be changed to another active staff member.
- FR-26-4. The server refuses a stock-out with no pieces, a blank reference or a blank invoice number, with the prototype sentences.
- FR-26-5. The server checks in one transaction that every piece is in_stock; if any is not, nothing changes and the message names the piece.
- FR-26-6. If another stock-out has taken a piece first, the server refuses the second with "{tag} is already taken."
- FR-26-7. On success every piece becomes billed with sold time and stock-out id.
- FR-26-8. On success every open edit proposal on those pieces becomes void.
- FR-26-9. On success the seller's sale count increases by the number of pieces.
- FR-26-10. The server refuses any later change to a billed piece's weights, by any role.
- FR-26-11. The server writes an audit entry with seller, actor, pieces, reference and invoice number.
- FR-26-12. Every other staff screen removes the pieces within about 1 second.
- FR-26-13. No amount is stored or shown while pricing is off; the value column renders nothing.
- FR-26-14. The system lists today's stock-outs and the pure gold out today for the homes.

## 8. Business rules

- BR-26-1. The app holds no amount; the invoice number is a reference only. [SCOPE-ANALYSIS App. F; mockup 06 "a reference only — this app does not hold the amount"]
- BR-26-2. Every sale is attributed to one seller, whose count is kept for later gamification. [SCOPE-ANALYSIS §6 Q10 (split still open); mockup 06 "goes to their count, for later gamification"]
- BR-26-3. Once out, weights freeze. No edit, not even by the owner. [mockup 06; mockup 12]
- BR-26-4. Two staff selling the same piece must not both succeed; the second gets "already taken". [PRODUCTION-SCOPE §5 Concurrency]
- BR-26-5. Staff do stock-out themselves; no owner needed. [mockup 06 "Product out · here"]
- BR-26-6. Scrap is the other way out and is owner only. [mockup 06 "Scrap · owner only"]
- BR-26-7. A sale voids open edit proposals on the piece. [SCOPE-ANALYSIS App. A A4; src/store/transitions.ts stockOut]
- BR-26-8. Only an in_stock piece can go out. [src/store/transitions.ts stockOut]
- BR-26-9. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]
- BR-26-10. Money is deferred, with nullable value sockets. [SCOPE-ANALYSIS App. G]

## 9. Data

- StockOut: id, piece ids (via a line table), seller id, actor id, reference (string), invoice number (string), at (UTC), branch id if D7, customer id (nullable, only if G13 is decided), amount (nullable value socket, unused until EP-42).
- Piece: status `billed`, sold at, stock-out id. Weights unchanged and frozen; integers, units of 0.0001 g.
- StaffMember: sale count (integer).
- PieceEdit: status `void` for open proposals.
- Audit entry `stock_out`.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Piece by tag | Look up a scanned or typed tag for the sale list | Staff, Owner |
| Create | Stock-out | Take pieces out of stock with seller, reference and invoice number | Staff, Owner |
| List | Stock-outs | Today's and past stock-outs | Staff, Owner |
| Read | Stock-out | One record with its pieces | Staff, Owner |
| List | Active sellers | Choices for the seller field | Staff, Owner |

## 11. Live events

- Emits: "Piece billed by one staff member" — when a stock-out succeeds, so every other staff screen drops the pieces at once.
- Consumes: "Piece billed by one staff member" — to remove a piece from this screen's list if another staff member sold it first.

## 12. Screens and UX references

- Route ids: `stock-out` (StockOut), `stock` (PieceDrawer "Take out of stock"), `today` (tile "Sell a piece", "Pieces out today").
- Mockups: `06-stock-out.svg` (TAG-8841 41.590 g and TAG-9040 12.600 g, "LEAVING THE FLOOR 54.190 g", REF-2026-1182, INV-2026-0855, "This locks the pieces for good", "Scan another tag", two ways a piece leaves stock, dark value column), `02-staff-home.svg` ("GOLD OUT TODAY 212.4 g", "Sell a piece"), `15-value-ready.svg` (where the value column fills later).

## 13. Non-functional requirements

- Concurrency: row locks or version checks on every piece in the stock-out; the whole stock-out fails if any piece is taken; the loser sees "already taken".
- Precision: the pure gold total is the integer sum of piece nets in units of 0.0001 g.
- Security: the server checks the actor is active staff or owner and the seller is an active staff member.
- Audit: append-only `stock_out` entry with actor, seller, pieces, reference, invoice and before and after status.
- Performance: the stock-out screen loads under 2 seconds; other screens drop the sold pieces within about 1 second.
- Time: sold time stored in UTC; "today" computed in Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-22, EP-08
- Downstream: EP-31, EP-32, EP-35, EP-36, EP-40, EP-41, EP-42, EP-43.

## 15. Epic acceptance criteria

1. Given TAG-8841 and TAG-9040 are in_stock, when Rajesh enters REF-2026-1182 and INV-2026-0855 and takes them out, then both are billed, 54.190 g is recorded as out today and Rajesh's count rises by 2.
2. Given two staff members submit stock-outs containing TAG-8841 at the same moment, when both reach the server, then exactly one succeeds and the other is told "TAG-8841 is already taken."
3. Given a billed piece, when the owner proposes or applies an edit, then the server refuses.
4. Given an open edit proposal on TAG-8841, when TAG-8841 is stocked out, then the proposal is void.
5. Given pricing is off, when the stock-out screen loads, then no amount field or value is shown and none is stored.
6. Given another staff member has the stock screen open, when the stock-out succeeds, then the pieces disappear from that screen within about 1 second.

## 16. Risks

- Risk: staff sell a piece another staff member had in mind for a lead customer, because v1 has no holds. Mitigation: EP-30 shows the linked line's piece as gone at once, so staff can offer another piece or a made one.
- Risk: a mistaken stock-out cannot be reversed because billed is final. Mitigation: decide whether a reversal path exists, owner only and audited, or whether the paper bill is cancelled outside the app.
- Risk: duplicate or mistyped invoice numbers break the link to the billing book. Mitigation: decide uniqueness and format rules.
- Risk: without a customer on the stock-out, customer history stays empty (G13). Mitigation: decide G13 with EP-17.
- Risk: the scanner adds a tag twice. Mitigation: de-duplicate ids on the server.

## 17. Open decisions and questions

- Q10: can one sale be split between two sellers, and how is the count divided?
- G13: should a stock-out record the customer, so that Customer.history (EP-17) has a live source?
- Must reference numbers and invoice numbers be unique, and in what format?
- Is a mistaken stock-out ever reversible, and by whom? Mockup 06 says no edit at all.
- A4: if a seventh state "frozen pending edit" is introduced, can such a piece be sold?
- D7: does the reference or invoice number series depend on the branch?

## 18. Candidate stories

1. EP-26-S1: System can store a stock-out with its pieces, seller, reference and invoice number
2. EP-26-S2: System can take pieces out of stock in one locked transaction
3. EP-26-S3: System can refuse the second seller with "already taken"
4. EP-26-S4: Staff can add pieces to a sale by tag
5. EP-26-S5: Staff can see the pure gold leaving the floor before confirming
6. EP-26-S6: Staff can confirm or change the seller
7. EP-26-S7: Staff can enter the reference and invoice number and take the pieces out
8. EP-26-S8: System can void open edits on sold pieces
9. EP-26-S9: System can count the sale to the seller
10. EP-26-S10: System can freeze a billed piece's weights against every role
11. EP-26-S11: Staff can see sold pieces disappear from other screens live
12. EP-26-S12: System can audit every stock-out
13. EP-26-S13: Staff can see today's stock-outs and gold out today
