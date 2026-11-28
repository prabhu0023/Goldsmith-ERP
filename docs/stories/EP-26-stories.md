# EP-26: Stock-out · stories

Epic document: [EP-26 Stock-out](../epics/EP-26-stock-out.md)

Role note: stories where the server stores, checks, locks, counts or audits on its own use "System". Staff take pieces out themselves with no owner step (BR-26-5); the owner can do the same. Karigars are not involved and every stock-out operation refuses them. v1 has no holds, so any `in_stock` piece can be sold, including one linked to a lead line, and the only guard is double-sell prevention. No amount is stored or shown; the invoice number is a reference only (BR-26-1). Weights are integers in units of 0.0001 g and shown to 4 decimals; mockup 06 shows pure gold to 3 decimals ("41.590 g"), which these stories show as 41.5900 g. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff). The seed pieces from mockup 06 are TAG-8841 (Antique Kundan Choker, 22K, HUID 9X82K1, 41.5900 g pure gold) and TAG-9040 (Jadau Emerald Ring, 18K, HUID 8H33Z9, 12.6000 g pure gold).

---

## EP-26-S1: System can store a stock-out with its pieces, seller, reference and invoice number

- **Story ID:** EP-26-S1
- **Status:** Not started
- **Title:** System can store a stock-out with its pieces, seller, reference and invoice number
- **As a:** System
- **I want:** the `stock_outs` and `stock_out_pieces` tables from EP-02-S10 to hold one record per stock-out with id (`SO-` prefix), seller id, actor id, reference (text), invoice number (text), at (UTC), the shop ID, a nullable customer id and a nullable amount socket, and one child row per piece
- **So that:** every piece that left the floor is linked to one record that says who sold it, who recorded it and which billing-book entry it matches, with no amount held (FR-26-7, FR-26-13, BR-26-1, BR-26-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when a stock-out of TAG-8841 and TAG-9040 with reference "REF-2026-1182" and invoice number "INV-2026-0855" is stored, then `stock_outs` has one row with seller id and actor id set, `at` from the server clock in UTC, and `stock_out_pieces` has two rows, one per piece.
  2. Given the stored record, when it is read, then the amount column is empty with no default, the customer id is empty and the shop ID is the shop's (epic acceptance criterion 5).
  3. Given a second stock-out row that lists TAG-8841, when it is written while TAG-8841 is already on a stock-out, then the database rejects it through the unique key on piece id in `stock_out_pieces`.
  4. Given a row with an empty seller id, an empty reference or an empty invoice number, when it is written, then the database rejects it.
  5. Given the stock-outs in the prototype seed (EP-02-S13), when the table is read, then each seeded billed piece points to its `SO-` record through `pieces.stockOutId`, and new ids continue after them.
- **Rules enforced on the server:** Reference and invoice number are non-empty text after trimming (check constraints). Seller id and actor id reference users. `pieces.stockOutId` references `stock_outs`. The unique key on `stock_out_pieces.piece_id` is the last line of double-sell prevention below the service check (EP-02-S10). The amount column is never written until EP-42 and pricing are on. The customer id column stays empty and unused until G13 is decided. The shop ID is set by the server from the session (D7).
- **Live events emitted / consumed:** None. Storing the tables publishes nothing; the event comes from EP-26-S2.
- **Audit entry written:** No. Table rules only; each stock-out is audited by EP-26-S12.
- **Data changes:** Migration on `stock_outs` (EP-02-S10): adds or confirms `actorId`, `sellerId`, `ref`, `invoiceNo`, `at`, the shop ID (EP-02-S3), nullable `customerId`, nullable `amountINR` with no default, the non-empty checks, and an index on `at` for the today list. Confirms `stock_out_pieces` with its unique piece key. Ports `StockOutRecord` from `src/types/jewellery.ts` into the shared package, dropping `sellerName` (read from the user) and the prototype `heldForLeadId` clearing.
- **UI reference:** No screen. The record is shown under "THE RECORD" on `docs/ux/mockups/06-stock-out.svg`, route `stock-out`.
- **Non-functional checks:** Time: `at` stored in UTC, shown in Asia/Kolkata. Concurrency: the unique piece key refuses a second stock-out of the same piece even if the service check is bypassed. Open decision G13: the customer id column is a socket only. D7 is decided: one shop, so any series is per shop. Open question: whether reference or invoice numbers must be unique; no unique key is added until that is answered.
- **Depends on:** EP-02-S10, EP-02-S13, EP-02-S3, EP-22-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S2: System can take pieces out of stock in one locked transaction

- **Story ID:** EP-26-S2
- **Status:** Not started
- **Title:** System can take pieces out of stock in one locked transaction
- **As a:** System
- **I want:** a Create Stock-out operation that, in one transaction, de-duplicates the piece ids, locks every piece row in a fixed order, checks each is `in_stock`, inserts the stock-out and its child rows, and moves each piece to `billed` with sold time and stock-out id through Update Piece state
- **So that:** either every piece in the sale leaves stock or none does, and a half-recorded sale never exists (FR-26-1, FR-26-5, FR-26-7, BR-26-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 and TAG-9040 are `in_stock`, when Rajesh Verma's stock-out with "REF-2026-1182" and "INV-2026-0855" commits, then both pieces are `billed` with the same `soldAt` and `stockOutId`, and the operation returns the new `SO-` id (epic acceptance criterion 1).
  2. Given the request lists TAG-8841 twice and TAG-9040 once, when it commits, then the record has two child rows and the count used for the seller is 2.
  3. Given TAG-9040 is `stopped`, when a stock-out of TAG-8841 and TAG-9040 is sent, then the server refuses with the EP-22-S8 stopped sentence naming TAG-9040, TAG-8841 stays `in_stock`, and no stock-out row exists.
  4. Given TAG-7914 is `draft` or `with_owner`, when it is in a stock-out, then the server refuses with "TAG-7914 is not in stock." and nothing changes.
  5. Given the transaction fails after the pieces were updated (forced in a test), when it rolls back, then every piece is still `in_stock`, no record exists and no event was published.
- **Rules enforced on the server:** Create Stock-out is Staff and Owner only; a Karigar is refused with `forbidden` (EP-05-S2). Piece rows are locked in ascending id order to avoid deadlocks between two multi-piece sales. Every piece must be `in_stock` (EP-22-S2 transition table; `stopped` refused by EP-22-S8). Actor and time come from the session and server clock (EP-03-S3). The request carries an idempotency key so a retried submit returns the first result (EP-03-S8). The void of open edits (EP-26-S8), the seller count (EP-26-S9) and the audit entry (EP-26-S12) run inside this same transaction.
- **Live events emitted / consumed:** Emitted after commit: "Piece billed by one staff member", one per piece, with piece id, tag number, version, stock-out id and seller name, to Staff and Owner (EP-07-S1, EP-07-S11). Consumed: none.
- **Audit entry written:** Yes, through EP-26-S12 (`stock_out`) and one `piece_state_changed` entry per piece through EP-22-S11.
- **Data changes:** Inserts into `stock_outs` and `stock_out_pieces`; updates `pieces.status`, `soldAt`, `stockOutId`, `version`; inserts `piece_state_transitions` rows. Adds Create Stock-out to the shared contract. Ports `stockOut` from `src/store/transitions.ts`, dropping the `heldForLeadId: null` step because v1 has no holds.
- **UI reference:** No screen of its own. Called by "Take them out of stock" on `docs/ux/mockups/06-stock-out.svg`, route `stock-out` (EP-26-S7).
- **Non-functional checks:** Concurrency: all rows locked inside one transaction; the whole stock-out fails if any piece is not `in_stock` (epic section 13). Precision: weights are read, never written. Time: `soldAt` in UTC from the server clock. Open decision A4: if a "frozen pending edit" state is added, whether such a piece is refused here.
- **Depends on:** EP-26-S1, EP-22-S2, EP-22-S6, EP-22-S8, EP-05-S2, EP-03-S3, EP-03-S6, EP-03-S7, EP-03-S8, EP-07-S1, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S3: System can refuse the second seller with "already taken"

- **Story ID:** EP-26-S3
- **Status:** Not started
- **Title:** System can refuse the second seller with "already taken"
- **As a:** System
- **I want:** the stock-out transaction to refuse, as a whole, any sale that reaches a piece row after another stock-out has billed it, with "{tag} is already taken." naming the first such piece
- **So that:** two staff selling the same piece at the same moment never both succeed, even when each sale has several pieces (FR-26-6, BR-26-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `in_stock`, when Rajesh Verma and Deepak Rao each submit a stock-out containing TAG-8841 at the same moment, then exactly one commits and the other is refused with "TAG-8841 is already taken." (epic acceptance criterion 2).
  2. Given Deepak's losing stock-out also contained TAG-9040, when it is refused, then TAG-9040 is still `in_stock`, no stock-out row, child row, audit entry or seller count change exists for Deepak's request, and he can submit TAG-9040 alone.
  3. Given the losing request, when its refusal returns, then the stock-out screen shows the sentence through EP-08-S5 and removes TAG-8841 from the sale list, keeping the reference and invoice number already typed.
  4. Given the EP-40 concurrency test sends 20 parallel stock-outs of TAG-8841 from different sessions, when it finishes, then 1 succeeded and 19 got "TAG-8841 is already taken.".
  5. Given TAG-8841 was linked to a lead line by EP-30, when Deepak sells it to a walk-in first, then his sale succeeds and the later sale for the lead is refused with "already taken", because a link does not reserve a piece.
- **Rules enforced on the server:** The check runs against the locked row (EP-26-S2): a piece already `billed` at lock time gives "already taken"; a piece in any other non-`in_stock` state gives the not-in-stock or stopped sentence. The unique key on `stock_out_pieces.piece_id` (EP-26-S1) turns any race that slips past the service into the same refusal. This story extends the single-sale guard of EP-22-S6 to multi-piece stock-outs. Refusals use the EP-03-S4 code `already_taken` and sentence format.
- **Live events emitted / consumed:** Emitted: "Piece billed by one staff member" for the winner only, through EP-26-S2. Consumed: none on the server.
- **Audit entry written:** No for the refused sale, which stores nothing. The winning sale is audited by EP-26-S12.
- **Data changes:** None beyond EP-26-S1 and EP-26-S2. Adds the `already_taken` refusal code to the shared error list if EP-22-S6 has not.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out`. The refusal line on the sale list is not yet designed.
- **Non-functional checks:** Concurrency: row locks or version checks on every piece; the loser sees "already taken" (PRODUCTION-SCOPE §5). Performance: the losing seller sees the refusal within about 1 second of submitting.
- **Depends on:** EP-26-S1, EP-26-S2, EP-22-S6, EP-03-S4, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S4: Staff can add pieces to a sale by tag

- **Story ID:** EP-26-S4
- **Status:** Not started
- **Title:** Staff can add pieces to a sale by tag
- **As a:** Staff
- **I want:** to type a tag number or scan it into "Scan another tag" on `stock-out`, or arrive from "Add to a sale" in the piece drawer on `stock`, and see each piece added under "WHAT IS LEAVING THE SHOWCASE" with its name, tag, purity, HUID and pure gold
- **So that:** I build the list of pieces leaving with the customer from what is in my hand, without searching the stock list (FR-26-1, FR-26-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `in_stock`, when Rajesh Verma types "TAG-8841" into "Scan another tag", then the row "Antique Kundan Choker · TAG-8841 · 22K · 9X82K1 · 41.5900 g" appears under "WHAT IS LEAVING THE SHOWCASE".
  2. Given TAG-8841 is already on the list, when it is scanned again, then the list still has one TAG-8841 row and the field clears without an error.
  3. Given TAG-7914 is `billed`, when Rajesh types it, then it is not added and the line reads "TAG-7914 is not in stock."; given "TAG-0000" does not exist, then the line reads "No piece with that tag." (proposed wording).
  4. Given Rajesh opens TAG-9040 in the drawer on `stock` and presses "Add to a sale", when `stock-out` opens with param `pieceId`, then TAG-9040 is already on the list.
  5. Given Rajesh removes TAG-9040 from the list before confirming, when the list redraws, then only TAG-8841 remains and nothing was written on the server.
- **Rules enforced on the server:** Read Piece by tag is Staff and Owner only; a Karigar is refused with `forbidden` (EP-05-S2). The tag is trimmed and matched case-insensitively. The read returns state, so the screen can refuse non-`in_stock` pieces early, but the list is only a draft: the server re-checks every piece at confirm (EP-26-S2), and the list is not stored or reserved anywhere.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member", handled by EP-26-S11 to drop a listed piece sold elsewhere. Emitted: none.
- **Audit entry written:** No. Looking up a tag and building a draft list change nothing.
- **Data changes:** None in the product database. Adds Read Piece by tag to the shared contract if EP-22-S4 has not. Moves the add and remove part of `StockOut.tsx` (route `stock-out`, param `pieceId`) onto the EP-08 data layer; the drawer button text follows mockup 03 ("Add to a sale").
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("WHAT IS LEAVING THE SHOWCASE", "Scan another tag"); `docs/ux/mockups/03-showroom-stock.svg`, route `stock` (drawer "Add to a sale"). The not-found line and remove control are not yet designed.
- **Non-functional checks:** Performance: the stock-out screen loads under 2 seconds and a typed tag resolves within about 1 second (epic section 13). Precision: pure gold shown from integer units to 4 decimals. Scanner hardware input is EP-36; here a scanner acting as a keyboard works through the same field.
- **Depends on:** EP-22-S4, EP-22-S5, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S5: Staff can see the pure gold leaving the floor before confirming

- **Story ID:** EP-26-S5
- **Status:** Not started
- **Title:** Staff can see the pure gold leaving the floor before confirming
- **As a:** Staff
- **I want:** a "LEAVING THE FLOOR" total under the sale list showing the summed pure gold and the piece count, and the footer line "{n} pieces · {g} pure gold · sold by {seller} · {invoice}", with the value column present but empty while pricing is off
- **So that:** I check the gold leaving against the bill before I lock the pieces for good (FR-26-2, FR-26-13, BR-26-1, BR-26-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 (415 900 units) and TAG-9040 (126 000 units) are on the list, when the total redraws, then "LEAVING THE FLOOR" reads "54.1900 g" with "pure gold · 2 pieces".
  2. Given seller Rajesh Verma and invoice "INV-2026-0855", when the footer redraws, then it reads "2 pieces · 54.1900 g pure gold · sold by Rajesh · INV-2026-0855".
  3. Given pricing is off, when the stock-out screen loads, then the "value · when on" column and "total value fills here later" render nothing, no amount field is shown, and the Create Stock-out request carries no amount (epic acceptance criterion 5).
  4. Given a request that includes an amount while pricing is off, when it reaches the server, then the amount is refused as an unknown field by contract validation and nothing is stored.
  5. Given TAG-9040 is removed from the list, when the total redraws, then it reads "41.5900 g" with "pure gold · 1 piece".
- **Rules enforced on the server:** The Create Stock-out contract has no amount field in v1 (EP-03-S2 refuses unknown fields). The pure gold per piece is the server's net value read with the piece; the screen sums integers and never parses displayed grams. The value column renders through the shared ValueSlot, gated by the pricing flag (EP-13-S9); EP-42 fills it later.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" through EP-26-S11, which drops a sold piece and so changes the total. Emitted: none.
- **Audit entry written:** No. Showing a total changes nothing.
- **Data changes:** None in the product database. Uses the integer sum helper from EP-02-S2. Moves the total and footer of `StockOut.tsx` and `ValueSlot.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("LEAVING THE FLOOR 54.190 g", "pure gold · 2 pieces", "total value fills here later", footer "2 pieces · 54.190 g pure gold · sold by Rajesh · INV-2026-0855"); `docs/ux/mockups/15-value-ready.svg` for where the value column fills later.
- **Non-functional checks:** Precision: the total is the integer sum of piece nets in units of 0.0001 g, shown to 4 decimals (epic section 13). Security: no amount crosses the trust boundary while pricing is off.
- **Depends on:** EP-26-S4, EP-02-S2, EP-03-S2, EP-13-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S6: Staff can confirm or change the seller

- **Story ID:** EP-26-S6
- **Status:** Not started
- **Title:** Staff can confirm or change the seller
- **As a:** Staff
- **I want:** "Who sold it" on `stock-out` to show me as the seller by default, with a picker filled from a List Active sellers read so I can pick the staff member who actually made the sale
- **So that:** the sale is counted to the person who sold it, even when someone else records it at the counter (FR-26-3, BR-26-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is signed in, when `stock-out` opens, then "Who sold it" shows "RV · Rajesh Verma" with the line "goes to their count, for later gamification".
  2. Given Rajesh picks Deepak Rao in the picker, when he takes the pieces out, then the stored seller id is Deepak's, the actor id is Rajesh's, and the footer reads "sold by Deepak".
  3. Given a staff user was deactivated (EP-05-S7), when the picker loads, then that user is not listed; given a request names that user as seller, then the server refuses with "Pick an active staff member as the seller." (proposed wording) and nothing is stored.
  4. Given a request names a karigar user or an unknown id as seller, when it reaches the server, then it is refused with the same sentence.
  5. Given Sanjay Seth (Owner) records a stock-out, when he leaves the seller unchanged, then the seller is Sanjay, because the owner may also sell.
- **Rules enforced on the server:** List Active sellers is Staff and Owner only and returns users with role Staff or Owner and status active. On Create Stock-out the seller id must be such a user; an absent seller means the actor. The prototype's silent fall-back to the actor when the seller is unknown is not carried over. Exactly one seller per stock-out until Q10 is decided.
- **Live events emitted / consumed:** Consumed: none specific; a user deactivated mid-session is handled by EP-05-S10 and the server check. Emitted: none.
- **Audit entry written:** No by itself. The seller and actor are written in the `stock_out` entry by EP-26-S12.
- **Data changes:** None beyond `stock_outs.sellerId` (EP-26-S1). Adds List Active sellers to the shared contract. Moves the seller picker of `StockOut.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("Who sold it", "RV Rajesh Verma", "goes to their count, for later gamification"). The picker list itself is not yet designed.
- **Non-functional checks:** Security: the server checks the actor is active staff or owner and the seller is an active staff member or owner (epic section 13). Open question Q10: whether one sale can be split between two sellers.
- **Depends on:** EP-26-S1, EP-05-S2, EP-05-S7, EP-05-S11, EP-08-S2, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S7: Staff can enter the reference and invoice number and take the pieces out

- **Story ID:** EP-26-S7
- **Status:** Not started
- **Title:** Staff can enter the reference and invoice number and take the pieces out
- **As a:** Staff
- **I want:** to fill "Reference number" and "Tax invoice number · from your billing book", read "This locks the pieces for good · Once out, their weights freeze. No edit, not even by the owner.", and press "Take them out of stock"
- **So that:** each sale in the app points to the matching entry in the paper billing book, and the pieces leave stock in one step without the owner (FR-26-4, BR-26-1, BR-26-3, BR-26-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 and TAG-9040 are listed and Rajesh is the seller, when Rajesh enters "REF-2026-1182" and "INV-2026-0855" and presses "Take them out of stock", then the stock-out is created, both pieces are billed, and the screen shows the new record at the top of the recent list (epic acceptance criterion 1).
  2. Given an empty list, when "Take them out of stock" is pressed, then the server refuses with "Add the pieces that are leaving." and nothing is stored.
  3. Given the reference is blank or only spaces, when the request is sent, then the server refuses with "Enter the reference number."; given the invoice number is blank, then it refuses with "Enter the tax invoice number from your billing book.".
  4. Given " INV-2026-0855 " with spaces, when the record is stored, then the invoice number is "INV-2026-0855".
  5. Given the network drops after Rajesh presses the button, when he presses it again, then the same idempotency key returns the first result, and only one stock-out exists (EP-08-S6).
- **Rules enforced on the server:** Refusals in the prototype order: empty list, blank reference, blank invoice number, then the piece checks of EP-26-S2. Reference and invoice number are trimmed text; no format or uniqueness check until the section 17 question is answered. No owner approval is asked (BR-26-5). No amount is accepted (EP-26-S5).
- **Live events emitted / consumed:** Emitted after commit through EP-26-S2: "Piece billed by one staff member" per piece. Consumed: none.
- **Audit entry written:** Yes, through EP-26-S12: actor, seller, time, stock-out id, pieces, reference, invoice number, before and after status.
- **Data changes:** Inserts through EP-26-S2. Moves the form and confirm button of `StockOut.tsx` onto the EP-08 data layer with its idempotency key.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("Reference number REF-2026-1182", "Tax invoice number · from your billing book INV-2026-0855", "a reference only — this app does not hold the amount", "This locks the pieces for good", "Ready to clear from the floor", "Take them out of stock").
- **Non-functional checks:** Performance: the result shows within about 1 second of pressing. Concurrency: a retried press never creates a second stock-out (EP-03-S8). Open question: uniqueness and format of reference and invoice numbers. Open question: whether a mistaken stock-out is ever reversible; this story gives no undo. Open decision G13: no customer field on the form.
- **Depends on:** EP-26-S2, EP-26-S4, EP-26-S5, EP-26-S6, EP-03-S8, EP-08-S5, EP-08-S6, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S8: System can void open edits on sold pieces

- **Story ID:** EP-26-S8
- **Status:** Not started
- **Title:** System can void open edits on sold pieces
- **As a:** System
- **I want:** the stock-out transaction to call the EP-25-S11 Void open edits function for each piece, with void reason `sold`, after the piece moves to `billed`
- **So that:** no open proposal can later change a sold piece, and the owner's card for it goes away (FR-26-8, BR-26-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given ED-102 is open on TAG-8841, when TAG-8841 is stocked out, then in the same transaction ED-102 becomes `void` with void reason `sold` (epic acceptance criterion 4).
  2. Given ED-102 was `token_sent`, when Sanjay Seth enters its token after the sale, then the server refuses with "This proposal has already been decided." and TAG-8841's weights are unchanged.
  3. Given the stock-out is refused because TAG-9040 was already taken, when ED-102 on TAG-8841 is read, then it is still open, because the void ran inside the rolled-back transaction.
  4. Given a stock-out of TAG-9040 with no open proposal, when it commits, then no proposal row changes and no `edit_voided` entry is written.
- **Rules enforced on the server:** The function is internal and runs after the piece rows are locked and moved to `billed`. Only `proposed` and `token_sent` rows are voided, and their tokens are used up (EP-25-S11). A sale is not refused because an edit is open, under assumption A4.
- **Live events emitted / consumed:** Emitted after commit through EP-25-S11: "Edit proposed / token sent" with status `void` for each voided proposal. Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor (the recorder of the stock-out), time, entity (edit id and tag number), action `edit_voided`, before (status), after (`void`, `sold`).
- **Data changes:** Updates `piece_edits` and `edit_tokens` through EP-25-S11. No new tables.
- **UI reference:** No screen of its own. The "STAFF WANTS A CODE" card leaves `docs/ux/mockups/08-owner-home.svg`, route `decisions`.
- **Non-functional checks:** Concurrency: the piece row lock serialises a stock-out and an edit apply on the same piece; whichever commits first wins (EP-25 section 13). Open decision A4: if a "frozen pending edit" state is added, this story changes to refusing the sale.
- **Depends on:** EP-26-S2, EP-25-S11, EP-25-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S9: System can count the sale to the seller

- **Story ID:** EP-26-S9
- **Status:** Not started
- **Title:** System can count the sale to the seller
- **As a:** System
- **I want:** the stock-out transaction to add the number of distinct pieces to the seller's sale count on their staff record
- **So that:** every sale is counted to one seller, ready for gamification later without back-filling (FR-26-9, BR-26-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's sale count is 18, when his stock-out of TAG-8841 and TAG-9040 commits, then his count is 20 (epic acceptance criterion 1).
  2. Given Rajesh records the sale with Deepak Rao as seller, when it commits, then Deepak's count rises by 2 and Rajesh's is unchanged.
  3. Given the stock-out is refused with "already taken", when the counts are read, then neither seller's count changed.
  4. Given two stock-outs with the same seller commit at the same moment with 1 and 3 pieces, when both finish, then the seller's count rose by exactly 4.
- **Rules enforced on the server:** The count is updated with an atomic increment (`count = count + n`) inside the stock-out transaction, never a read-then-write from the client. n is the number of distinct pieces after de-duplication. The count is never shown as a score in v1; leaderboards and split attribution are EP-43.
- **Live events emitted / consumed:** None. The count is read later by EP-43 and EP-35.
- **Audit entry written:** No separate entry. The seller and piece count are in the `stock_out` entry (EP-26-S12), from which the count can be rebuilt.
- **Data changes:** Updates `salesCount` on the staff record (EP-02-S4); a migration adds it as a non-null integer default 0 if EP-02-S4 did not. Ports the `salesCount` step of `stockOut`.
- **UI reference:** No screen. "goes to their count, for later gamification" on `docs/ux/mockups/06-stock-out.svg`, route `stock-out`.
- **Non-functional checks:** Concurrency: atomic increment so parallel sales by one seller do not lose counts. Open question Q10: whether one sale can be split between two sellers and how the count is divided; until decided, the whole count goes to the one seller.
- **Depends on:** EP-26-S2, EP-26-S6, EP-02-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S10: System can freeze a billed piece's weights against every role

- **Story ID:** EP-26-S10
- **Status:** Not started
- **Title:** System can freeze a billed piece's weights against every role
- **As a:** System
- **I want:** every write path that touches piece weights, purity, HUID, stone count, name or state (edit propose, edit apply, tag save, problem raise, scrap request) to refuse a `billed` piece, with no override for the owner
- **So that:** a sold piece's record stays exactly as it was billed, for good (FR-26-10, BR-26-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `billed`, when Sanjay Seth (Owner) proposes or applies an edit to its `grossG`, then the server refuses with "TAG-8841 is billed. Its weights are frozen." and the piece is unchanged (epic acceptance criterion 3).
  2. Given TAG-8841 is `billed`, when Rajesh Verma opens it in the drawer on `stock`, then "Edit tag" and "Add to a sale" are not offered and the drawer shows "Billed · locked" with its invoice number "INV-2026-0855".
  3. Given TAG-8841 is `billed`, when a scrap request or a problem is raised on it, then the server refuses with the EP-24-S7 sentence for problems and the same frozen sentence for scrap.
  4. Given a direct database write test that bypasses the service, when it changes a billed piece's `grossG`, then the database trigger or check refuses it.
- **Rules enforced on the server:** The check sits in the shared piece write path used by EP-21, EP-24, EP-25 and EP-27 (EP-22-S8), and runs against the locked row. `billed` has no outgoing transition in the EP-22-S2 table. A database trigger refuses weight, purity, HUID, stone count, name and status updates where the old status is `billed`, as a second line. No role, Owner included, can lift it. Whether an owner-only reversal is ever added is the section 17 question; none exists in v1.
- **Live events emitted / consumed:** None. Refused writes publish nothing.
- **Audit entry written:** No. Refused requests store nothing.
- **Data changes:** Migration adds the frozen-billed trigger on `pieces`. No new columns.
- **UI reference:** `docs/ux/mockups/12-state-lifecycles.svg` ("Billed · locked", "Billed is the end"); `docs/ux/mockups/06-stock-out.svg` ("No edit, not even by the owner."); `docs/ux/mockups/03-showroom-stock.svg`, route `stock` (drawer).
- **Non-functional checks:** Security: no role override; enforced on the server and in the database. Concurrency: an edit apply that reaches the piece lock after the stock-out committed is refused. Open question: whether a mistaken stock-out is ever reversible, and by whom.
- **Depends on:** EP-26-S2, EP-22-S2, EP-22-S5, EP-22-S8, EP-24-S7, EP-25-S2, EP-25-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S11: Staff can see sold pieces disappear from other screens live

- **Story ID:** EP-26-S11
- **Status:** Not started
- **Title:** Staff can see sold pieces disappear from other screens live
- **As a:** Staff
- **I want:** pieces sold at another counter to leave my stock list, my open drawer and my own draft sale list on `stock-out` within about a second, with a line telling me who sold them
- **So that:** I do not show or start billing a piece that has just been sold elsewhere (FR-26-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao has `stock` open, when Rajesh Verma's stock-out of TAG-8841 and TAG-9040 commits, then within about 1 second both leave Deepak's "Can sell" list and the count drops by 2, with no reload (epic acceptance criterion 6).
  2. Given Deepak has TAG-8841 on his own draft list on `stock-out`, when the event arrives, then TAG-8841 is removed from his list, "LEAVING THE FLOOR" is recalculated, and a line reads "TAG-8841 was sold by Rajesh Verma just now." (proposed wording).
  3. Given Deepak's connection drops while the sale commits, when it returns, then "Reconnecting…" clears and TAG-8841 is gone from both screens after catch-up.
  4. Given a karigar is signed in, when the stock-out commits, then the karigar receives no event about it.
- **Rules enforced on the server:** Events go out only after commit (EP-07-S1) and only to Staff and Owner (EP-07-S5). Each event carries the piece version so an older event never overwrites newer data (EP-07-S2). The live removal is a warning only; the server refusal in EP-26-S3 is the guard.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member". Emitted: none here (emitted by EP-26-S2).
- **Audit entry written:** No. Showing an event changes nothing.
- **Data changes:** None in the product database. Maps "Piece billed by one staff member" to the stock-out draft list in the EP-08-S8 event map, alongside the stock reads mapped by EP-22-S7.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out`; `docs/ux/mockups/03-showroom-stock.svg`, route `stock`. The "sold just now" line is not yet designed.
- **Non-functional checks:** Performance: other screens drop the sold pieces within about 1 second (epic section 13). Availability: catch-up after reconnect (EP-07-S7). Security: karigars never receive stock events.
- **Depends on:** EP-26-S2, EP-26-S4, EP-22-S7, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S7, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S12: System can audit every stock-out

- **Story ID:** EP-26-S12
- **Status:** Not started
- **Title:** System can audit every stock-out
- **As a:** System
- **I want:** an append-only `stock_out` audit entry written in the stock-out transaction with actor, seller, stock-out id, piece tags, reference, invoice number, and each piece's status before and after
- **So that:** the owner can always see who recorded and who sold each piece that left, and match it to the billing book (FR-26-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma's stock-out of TAG-8841 and TAG-9040 commits, when the log is read, then a `stock_out` entry shows summary "2 pieces out · INV-2026-0855", actor Rajesh, seller Rajesh, reference "REF-2026-1182", pieces TAG-8841 and TAG-9040, before `in_stock` and after `billed` for each.
  2. Given Rajesh records a sale with Deepak Rao as seller, when the entry is read, then actor is Rajesh and seller is Deepak.
  3. Given the audit insert fails (forced in a test), when the transaction rolls back, then no piece is billed and no stock-out exists.
  4. Given a refused stock-out, when the log is read, then no `stock_out` entry exists for it.
  5. Given a staff user calls the audit list, when the server answers, then it is refused (EP-06-S12); Sanjay Seth sees the entry under its kind group.
- **Rules enforced on the server:** The entry is written by the shared audit writer inside the same transaction (EP-06-S2), with before and after values (EP-06-S3). Entries cannot be updated or deleted (EP-06-S1). No amount appears in the entry. Per-piece `piece_state_changed` entries come from EP-22-S11.
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, role, time, entity (stock-out id), action `stock_out`, seller, pieces, reference, invoice number, before (each piece `in_stock`), after (each piece `billed`, stock-out id).
- **Data changes:** Inserts into `audit_entries`. Adds `stock_out` to the shared audit kind list if EP-06 has not. Ports the audit step of `stockOut`.
- **UI reference:** No screen of its own. Read on the security log (EP-06-S9 to EP-06-S11).
- **Non-functional checks:** Audit: append-only entry in the same transaction (epic section 13). Time: entry time in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-26-S2, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S12, EP-22-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-26-S13: Staff can see today's stock-outs and gold out today

- **Story ID:** EP-26-S13
- **Status:** Not started
- **Title:** Staff can see today's stock-outs and gold out today
- **As a:** Staff
- **I want:** List Stock-outs and Read Stock-out reads, and a today summary giving the pieces out today and the pure gold out today, feeding "GOLD OUT TODAY" and "Pieces out today" on `today`, the owner's home, and the recent list on `stock-out`
- **So that:** I see at a glance how much gold left the floor today and can open any sale to check its pieces and invoice number (FR-26-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given 11 pieces totalling 2 124 000 units were stocked out since midnight Asia/Kolkata, when Rajesh Verma opens `today`, then "GOLD OUT TODAY" reads "212.4000 g" and "Pieces out today" reads 11.
  2. Given Rajesh's stock-out of TAG-8841 and TAG-9040 commits, when the event arrives, then "GOLD OUT TODAY" rises by 54.1900 g and "Pieces out today" by 2 within about 1 second, with no reload (epic acceptance criterion 1).
  3. Given a stock-out at 23:50 Asia/Kolkata on 31 October and one at 00:10 on 1 November, when `today` is read on 1 November, then only the 00:10 one is counted.
  4. Given Rajesh opens a stock-out from the recent list on `stock-out`, when Read Stock-out returns, then it shows the time, seller, actor, reference, invoice number, and each piece's tag, name and pure gold, and no amount.
  5. Given a karigar calls List Stock-outs, when the server answers, then it is refused with `forbidden`.
- **Rules enforced on the server:** List Stock-outs, Read Stock-out and the today summary are Staff and Owner only (EP-05-S2). "Today" is computed on the server from Asia/Kolkata day boundaries. The gold out is the integer sum of the billed pieces' nets. Lists page with a cursor, newest first (EP-03-S9). Reads are scoped to the shop (D7).
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" to refetch the summary and lists (EP-08-S9). Emitted: none.
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds List Stock-outs, Read Stock-out and the today summary to the shared contract. Moves the `piecesOutToday` and `goldOutToday` selectors used by `StaffToday.tsx` and `OwnerDecisions.tsx`, and the recent list of `StockOut.tsx`, onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg`, route `today` ("GOLD OUT TODAY 212.4 g", "Pieces out today 11", "Sell a piece"); `docs/ux/mockups/06-stock-out.svg`, route `stock-out`. The recent list and stock-out detail view are not yet designed.
- **Non-functional checks:** Precision: gold out summed as integers, shown to 4 decimals. Time: "today" in Asia/Kolkata, sold time stored in UTC (epic section 13). Performance: the home figures update within about 1 second of a sale. D7 is decided: today's figures are for the shop.
- **Depends on:** EP-26-S1, EP-26-S2, EP-05-S2, EP-03-S9, EP-08-S2, EP-08-S3, EP-08-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Q10: can one sale be split between two sellers, and how is the count divided? (EP-26-S6, S9)
- G13: should a stock-out record the customer, so that Customer.history (EP-17) has a live source? (EP-26-S1, S7)
- Must reference numbers and invoice numbers be unique, and in what format? (EP-26-S1, S7)
- Is a mistaken stock-out ever reversible, and by whom? Mockup 06 says no edit at all. (EP-26-S7, S10)
- A4: if a seventh state "frozen pending edit" is introduced, can such a piece be sold? (EP-26-S2, S8)
- D7 is decided: one shop, no branches; any reference or invoice series is per shop (EP-26-S1, S13).
