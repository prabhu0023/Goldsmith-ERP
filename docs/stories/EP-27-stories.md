# EP-27: Scrap · stories

Epic document: [EP-27 Scrap](../epics/EP-27-scrap.md)

Role note: stories where the server stores, checks, locks, credits or audits on its own use "System". Staff request scrap; only the owner marks a piece scrapped or declines (BR-27-3). The owner may also request. Karigars are not involved, and every scrap operation refuses them. Scrap here means melting an in-house piece and reusing its gold; it is not a sale to a refiner and not old gold from a customer (BR-27-1). v1 has no holds, so the prototype's "held for a customer" refusal is not carried over (BR-27-4). No amount is stored or shown. Weights are integers in units of 0.0001 g and shown to 4 decimals; mockup 13 prints "78.400 g", which these stories show as 78.4000 g. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff). The seed piece is TAG-7701 Temple Nakshi Haram (22K, HUID K7N2Q4, gross 84.5000 g, stones 6.1000 g, net 78.4000 g, 108 days in stock) with request SR-101, and the pool stands at 812.5800 g before the scrap.

---

## EP-27-S1: System can store scrap requests with their states

- **Story ID:** EP-27-S1
- **Status:** Not started
- **Title:** System can store scrap requests with their states
- **As a:** System
- **I want:** the `scrap_requests` table from EP-02-S10 to hold one row per request with id (`SR-` prefix), piece id, reason, requested by (user id), requested at (UTC), status (`pending`, `scrapped`, `declined`), decided by (user id) and decided at, with at most one `pending` request per piece
- **So that:** each request to melt a piece is kept with who asked, why, and who decided, and a piece cannot carry two open requests (FR-27-1, FR-27-8, BR-27-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when SR-101 for TAG-7701 with reason "108 days unsold. Melt and remake in a lighter style." is stored by Rajesh Verma, then the row has status `pending`, `requestedBy` set to Rajesh's user id, `requestedAt` from the server clock in UTC, and empty `decidedBy` and `decidedAt`.
  2. Given SR-101 is `pending`, when a second `pending` row for TAG-7701 is written, then the database rejects it through a unique partial index on `pieceId` where `status = 'pending'`.
  3. Given SR-101 was `declined`, when a new `pending` request for TAG-7701 is written later, then it is accepted, because only one open request per piece is limited.
  4. Given a row with status `approved`, an empty reason or a `pieceId` that does not exist, when it is written, then the database rejects it.
  5. Given a row with status `scrapped` or `declined` but no `decidedBy` or `decidedAt`, when it is written, then the database rejects it through a check constraint.
- **Rules enforced on the server:** Status accepts only `pending`, `scrapped`, `declined`. `pieceId`, `requestedBy` and `decidedBy` reference `pieces` and `users`. Reason is non-empty text after trimming; the 3-character minimum is checked by the service (EP-27-S2). Decided fields are set together with a final status and never before. A decided row is never changed again (EP-27-S6, EP-27-S7).
- **Live events emitted / consumed:** None. Storing the table publishes nothing; events come from EP-27-S10.
- **Audit entry written:** No. Table rules only; each request and decision is audited by EP-27-S11.
- **Data changes:** Migration on `scrap_requests` (EP-02-S10): changes `requestedBy` from a name to a user id, adds `decidedBy`, adds the unique partial index on `pieceId` for `pending`, the decided-fields check, and an index on (`status`, `requestedAt`) for the owner's queue. Ports `ScrapRequest` from `src/types/jewellery.ts` into the shared package with `requestedBy` as a user id. The seed loader (EP-02-S13) maps SR-101's "Rajesh Verma" to his user id.
- **UI reference:** No screen.
- **Non-functional checks:** Time: `requestedAt` and `decidedAt` stored in UTC, shown in Asia/Kolkata. Concurrency: the unique partial index stops two pending requests on one piece even if the service check is bypassed. Open question: whether staff can withdraw a pending request; no `withdrawn` status is added until it is answered.
- **Depends on:** EP-02-S10, EP-02-S3, EP-02-S13, EP-22-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S2: Staff can request scrap for an in-stock piece with a reason

- **Story ID:** EP-27-S2
- **Status:** Not started
- **Title:** Staff can request scrap for an in-stock piece with a reason
- **As a:** Staff
- **I want:** to press "Ask to scrap" in the piece drawer on `stock`, read that the piece comes off the floor while the owner decides and that its pure gold goes back to the metal pool, type why under "Why scrap it", and press "Send to the owner"
- **So that:** dead stock reaches the owner with a reason, and I never melt a piece myself (FR-27-1, BR-27-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7701 is `in_stock`, when Rajesh Verma opens it in the drawer and presses "Ask to scrap", then the "Ask to scrap this piece" dialog shows "Temple Nakshi Haram TAG-7701 comes off the floor while the owner decides." and the pure gold "78.4000 g".
  2. Given Rajesh types "108 days unsold" and presses "Send to the owner", when the request commits, then a `pending` request with an `SR-` id exists, the dialog closes, and the drawer shows "Rajesh Verma asked to scrap this piece. Waiting for the owner. It cannot be sold meanwhile." (epic acceptance criterion 1).
  3. Given Rajesh types "ok" or only spaces, when he presses "Send to the owner", then the server refuses with "Say why it should be scrapped." and no request is stored.
  4. Given " 108 days unsold " with spaces, when the request is stored, then the reason is "108 days unsold".
  5. Given Sanjay Seth (Owner) opens an `in_stock` piece, when he presses "Ask to scrap" and sends a reason, then the request is stored with Sanjay as requester, because the owner may also request.
- **Rules enforced on the server:** Create Scrap request is Staff and Owner only; a Karigar is refused with `forbidden` (EP-05-S2). The reason is trimmed and must be at least 3 characters. The requester and time come from the session and server clock (EP-03-S3). The piece checks are EP-27-S3 and the parking is EP-27-S4, all in one transaction (EP-03-S6). The request carries an idempotency key so a retried send returns the first result (EP-03-S8). The prototype refusal "{id} is held for a customer." is not ported.
- **Live events emitted / consumed:** Emitted after commit through EP-27-S10: "Scrap requested" (proposed, G26). Consumed: none.
- **Audit entry written:** Yes, through EP-27-S11: actor, time, entity (request id and tag number), action `scrap_requested`, reason, pure gold.
- **Data changes:** Inserts into `scrap_requests`. Adds Create Scrap request to the shared contract. Ports `requestScrap` from `src/store/transitions.ts` without the held-piece check, and moves the `AskToScrap` dialog of `src/components/stock/PieceDrawer.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg` ("Scrap · owner only", "Staff can request it; only the owner marks it scrap"), route `stock` (piece drawer "Ask to scrap", dialog "Ask to scrap this piece", "Send to the owner"). The drawer and dialog themselves are not drawn in a mockup.
- **Non-functional checks:** Precision: the pure gold in the dialog is the server's net, gross 845 000 units minus stones 61 000 units, shown as 78.4000 g. Performance: the drawer shows the waiting notice within about 1 second of sending. Security: the reason is stored as plain text and rendered escaped. Open decision A5: confirms that staff can only request and the owner melts.
- **Depends on:** EP-27-S1, EP-22-S5, EP-05-S2, EP-03-S3, EP-03-S6, EP-03-S7, EP-03-S8, EP-08-S5, EP-08-S6, EP-08-S7, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S3: System can refuse a scrap request for a non-stock piece

- **Story ID:** EP-27-S3
- **Status:** Not started
- **Title:** System can refuse a scrap request for a non-stock piece
- **As a:** System
- **I want:** Create Scrap request to lock the piece row and refuse, as a whole, any piece whose state is not `in_stock`, with "{tag} is not in stock."
- **So that:** a sold, stopped, draft, already parked or already scrapped piece can never be sent to be melted (FR-27-2, BR-27-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7914 is `billed`, when Rajesh Verma requests scrap for it, then the server refuses with "TAG-7914 is not in stock." and no request is stored (epic acceptance criterion 5).
  2. Given TAG-7701 is already `with_owner` under SR-101, when Deepak Rao requests scrap for it, then the server refuses with "TAG-7701 is not in stock." and SR-101 is unchanged.
  3. Given TAG-8802 is `stopped`, `draft` or `scrapped`, when a request is sent for it, then the server refuses with "TAG-8802 is not in stock." and nothing changes.
  4. Given TAG-9040 is `in_stock`, when Rajesh's stock-out of TAG-9040 and Deepak's scrap request for TAG-9040 arrive at the same moment, then exactly one commits; if the sale wins, the request is refused with "TAG-9040 is not in stock.", and if the request wins, the sale is refused with "TAG-9040 is not in stock.".
  5. Given the piece drawer on `stock`, when the piece is not `in_stock`, then "Ask to scrap" is not offered.
- **Rules enforced on the server:** The piece row is locked (`SELECT … FOR UPDATE`) inside the request transaction before the state check, the same lock the stock-out takes (EP-26-S2), so a sale and a request on one piece are serialised. Only `in_stock` passes. A piece linked to a lead line is still `in_stock` and may be requested, because v1 has no holds. Refusals use the EP-03-S4 code and sentence format. The unique pending index (EP-27-S1) is the last guard against a second request.
- **Live events emitted / consumed:** None for a refused request, which stores nothing. Consumed: none.
- **Audit entry written:** No. A refused request changes nothing.
- **Data changes:** None beyond EP-27-S1. Adds the not-in-stock refusal to the shared error list if EP-26 has not.
- **UI reference:** Route `stock` (piece drawer, "Ask to scrap" hidden; refusal shown in the dialog through EP-08-S5). No mockup draws the refusal.
- **Non-functional checks:** Concurrency: the request locks the piece row, so a sale or second request cannot succeed at the same time (epic section 13). Test: the EP-40 concurrency suite runs a sale and a request on one piece in parallel 20 times and finds exactly one winner each time.
- **Depends on:** EP-27-S2, EP-22-S2, EP-22-S8, EP-26-S2, EP-03-S4, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S4: System can park a requested piece with the owner

- **Story ID:** EP-27-S4
- **Status:** Not started
- **Title:** System can park a requested piece with the owner
- **As a:** System
- **I want:** Create Scrap request to move the piece from `in_stock` to `with_owner` through Update Piece state, keeping `prevStatus` `in_stock`, in the same transaction as the request row
- **So that:** while the owner decides, the piece cannot be sold, edited or requested again, and it is out of the "Can sell" list (FR-27-3, BR-27-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7701 is `in_stock`, when Rajesh Verma's request commits, then TAG-7701 is `with_owner` with `prevStatus` `in_stock`, its version is raised by 1, and a `piece_state_transitions` row records `in_stock` to `with_owner` with reason `scrap_requested`.
  2. Given TAG-7701 is `with_owner`, when Deepak Rao adds it to a stock-out, then the server refuses with "TAG-7701 is not in stock." (epic acceptance criterion 1).
  3. Given TAG-7701 is `with_owner`, when Deepak proposes an edit to its `grossG`, then the server refuses, because edits are only proposed on `in_stock` pieces (EP-25-S2).
  4. Given the request insert fails after the piece was moved (forced in a test), when the transaction rolls back, then TAG-7701 is `in_stock` and no request exists.
  5. Given the "Can sell" list on `stock`, when the request commits, then TAG-7701 is no longer counted there and the pure gold on the floor drops by 78.4000 g.
- **Rules enforced on the server:** The move goes through Update Piece state (EP-22-S2); no scrap code writes `pieces.status` itself. This needs `in_stock` to `with_owner` (reason `scrap_requested`) added to the EP-22-S2 transition table, which EP-22-S2 marks as to be confirmed with EP-27; until it is added, EP-22-S2's criterion 2 refuses this move. `prevStatus` is set to `in_stock` so a decline returns the piece there (EP-27-S7). Request row and piece move commit together or not at all (EP-03-S6).
- **Live events emitted / consumed:** Emitted after commit through EP-27-S10: "Scrap requested" (proposed, G26), which stock screens also use to drop the piece from the Can sell list. Consumed: none.
- **Audit entry written:** Yes, through EP-22-S11: actor, time, entity (tag number), action `piece_state_changed`, before `in_stock`, after `with_owner`, reason `scrap_requested`.
- **Data changes:** Updates `pieces.status`, `prevStatus`, `version`; inserts a `piece_state_transitions` row. Adds `scrap_requested` to the transition reason list in the shared package and the `in_stock` to `with_owner` row to the transition table.
- **UI reference:** `docs/ux/mockups/12-state-lifecycles.svg` (piece rail, "the piece waits with the owner"), route `stock` (drawer notice "It cannot be sold meanwhile.").
- **Non-functional checks:** Concurrency: the piece move and the request row share one transaction and one row lock. Open question (EP-22): whether `with_owner` pieces count under "With QC" on `stock`; the count is one server function.
- **Depends on:** EP-27-S2, EP-27-S3, EP-22-S2, EP-22-S3, EP-22-S11, EP-25-S2, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S5: Owner can see pending scrap requests with days in stock and pure gold

- **Story ID:** EP-27-S5
- **Status:** Not started
- **Title:** Owner can see pending scrap requests with days in stock and pure gold
- **As a:** Owner
- **I want:** a List Pending scrap requests read, shown as the card "1 piece to be marked as scrap" on `decisions` and as the list and detail on `scrap-decision`, with piece name, tag, purity, days in stock, gross on the scale, stones, pure gold, requester, how long ago they asked and the reason
- **So that:** I can judge each request on its facts and see what the pool will hold if I say yes (FR-27-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given SR-101 is pending, when Sanjay Seth opens `decisions`, then a card reads "1 piece to be marked as scrap" with "Temple Nakshi Haram · 108 days unsold · 78.4000 g pure gold · asked by Rajesh" and a "Decide" button that opens `scrap-decision` with `requestId` SR-101.
  2. Given Sanjay opens `scrap-decision` for SR-101, when it loads, then it shows "TAG-7701 · 22K · 108 days in stock", "On the scale 84.5000 g", "Stones, pearls, lac 6.1000 g", "Pure gold in this piece 78.4000 g", "Why Rajesh asked" with the reason, and "If you mark it scrap" stating the pool then holds 890.9800 g (now 812.5800 g).
  3. Given `scrap-decision` opens with no `requestId`, when there are no pending requests, then it reads "Nothing is waiting. No scrap request is open."; when there are some, it lists each with tag, name, "asked by" and "Open", oldest first.
  4. Given Rajesh Verma opens `scrap-decision` for his own SR-101, when it loads, then he sees the details with "Only the owner can mark a piece as scrap." and no decision buttons; given Deepak Rao opens it, then the read is refused with `forbidden`.
  5. Given a karigar user calls List Pending scrap requests, when it reaches the server, then it is refused with `forbidden`.
- **Rules enforced on the server:** List Pending scrap requests is Owner only. Read Scrap request is Owner or the requester (EP-05-S2). Days in stock is computed on the server from `inStockAt` and the server clock in Asia/Kolkata. Pure gold is gross units minus stone units, computed on the server (FR-27-13). The pool figures come from the EP-18 balance read. Several pending requests count as one card on `decisions`, as in `ownerQueues.pendingScrap`.
- **Live events emitted / consumed:** Consumed: "Scrap requested" and "Piece scrapped" (proposed, G26) through EP-27-S10 to add and remove requests; "Metal pool changed" to refresh the pool figures. Emitted: none.
- **Audit entry written:** No. Reading requests changes nothing.
- **Data changes:** None in the product database. Adds List Pending scrap requests and Read Scrap request to the shared contract. Moves `src/components/stock/ScrapDecision.tsx` (route `scrap-decision`, param `requestId`) and the pending-scrap selector onto the EP-08 data layer. The `decisions` card layout belongs to EP-32; this story supplies its data and the "Decide" link.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("1 piece to be marked as scrap", "Temple Nakshi Haram · 108 days unsold · 78.400 g pure gold · asked by Rajesh", "Decide"), routes `decisions` and `scrap-decision`. The `scrap-decision` screen itself is not drawn in a mockup.
- **Non-functional checks:** Precision: gross, stones, pure gold and pool figures from integer units, shown to 4 decimals. Performance: `scrap-decision` loads under 2 seconds. Time: "asked 3 hours ago" computed from UTC against the server clock. Security: staff other than the requester cannot read a request.
- **Depends on:** EP-27-S1, EP-27-S4, EP-18-S1, EP-18-S10, EP-22-S5, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S6: Owner can mark a piece scrapped and credit its gold to the pool

- **Story ID:** EP-27-S6
- **Status:** Not started
- **Title:** Owner can mark a piece scrapped and credit its gold to the pool
- **As a:** Owner
- **I want:** to press "Mark it scrapped" on `scrap-decision`, after which the server, in one transaction, locks the request and piece, sets the request to `scrapped`, moves the piece from `with_owner` to `scrapped`, and calls EP-18's Post Recovery to credit the piece's net gold to the pool as a `recovered` entry referencing the piece and the request
- **So that:** the piece closes for good but its gold goes back into the pool to be issued to a karigar again, without a single gram lost (FR-27-5, FR-27-7, FR-27-8, FR-27-10, FR-27-13, BR-27-2, BR-27-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the pool is 812.5800 g and SR-101 is pending, when Sanjay Seth presses "Mark it scrapped", then TAG-7701 is `scrapped`, SR-101 is `scrapped` with `decidedBy` Sanjay and `decidedAt` set, and the pool is 890.9800 g with a `recovered` entry of delta `784000`, note "Scrap Temple Nakshi Haram" and references TAG-7701 and SR-101 (epic acceptance criterion 2).
  2. Given Rajesh Verma (Staff) calls Mark scrapped for SR-101 directly, when it reaches the server, then it is refused with "Only the owner can mark a piece as scrap." and the pool and piece are unchanged (epic acceptance criterion 4).
  3. Given SR-101 is already `scrapped` or `declined`, when Mark scrapped is called again, then the server refuses with "This request is already decided." and posts no second ledger entry.
  4. Given Post Recovery fails inside the transaction (forced in a test), when the owner marks scrap, then TAG-7701 stays `with_owner`, SR-101 stays `pending`, the pool is 812.5800 g and no event is published (epic acceptance criterion 6).
  5. Given TAG-7701 is `scrapped`, when any caller, the owner included, asks to move it to any other state or change its weights, then the server refuses and the piece is unchanged; the drawer shows "This piece is closed. Its weights are frozen.".
- **Rules enforced on the server:** Mark scrapped is Owner only (EP-05-S2). The request row is locked and must be `pending`; then the piece row is locked and must be `with_owner` with this request pending. The piece moves through Update Piece state (EP-22-S2), `with_owner` to `scrapped`, with `prevStatus` cleared; `scrapped` has no outgoing transitions (EP-22-S8). The credit is the stored net read on the server, never a client figure, posted through Post Recovery (EP-18-S6) under the pool lock (EP-18-S5), and one piece is recovered once. The void of open edits (EP-27-S8) and the audit entry (EP-27-S11) run in the same transaction. The request carries an idempotency key (EP-03-S8). Stones are recorded on the scrapped piece and do not join the pool, pending App. B sub-question 2.
- **Live events emitted / consumed:** Emitted after commit: "Metal pool changed" through EP-18-S12; "Piece scrapped" (proposed, G26) with outcome `scrapped` through EP-27-S10. Consumed: none.
- **Audit entry written:** Yes, through EP-27-S11 (`scrap_marked`) and one `piece_state_changed` entry through EP-22-S11.
- **Data changes:** Updates `scrap_requests.status`, `decidedBy`, `decidedAt`; updates `pieces.status`, `prevStatus`, `version`; inserts a `piece_state_transitions` row; inserts into `pool_entries` and updates `metal_pools.balanceG` through EP-18-S6, adding the scrap request id as a second reference on the entry if EP-18-S1 has only one. Adds Mark scrapped to the shared contract. Ports `ownerScrap` from `src/store/transitions.ts`.
- **UI reference:** Route `scrap-decision` ("If you mark it scrap", "Mark it scrapped"); `docs/ux/mockups/12-state-lifecycles.svg` ("Second way out: scrap. The owner marks the piece as scrap, the piece closes, and its gold goes back into the metal pool to be issued again."); `docs/ux/mockups/06-stock-out.svg` ("Scrap · owner only").
- **Non-functional checks:** Precision: 8 125 800 + 784 000 = 8 909 800 units, shown as 890.9800 g (epic section 13). Concurrency: scrap and pool credit commit together or not at all; two owners pressing at once give one `scrapped` and one "already decided". Security: owner-only on the server. Open decision App. B sub-question 2: stone weight recovered or written off. Open question: tag net or re-weighed figure after melting, and who records melting loss; this story credits the tag net. Open question: what purity the recovered gold carries in the pool, decided with EP-18.
- **Depends on:** EP-27-S1, EP-27-S4, EP-27-S5, EP-18-S5, EP-18-S6, EP-18-S12, EP-22-S2, EP-22-S8, EP-05-S2, EP-03-S6, EP-03-S8, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S7: Owner can decline a scrap request and return the piece to stock

- **Story ID:** EP-27-S7
- **Status:** Not started
- **Title:** Owner can decline a scrap request and return the piece to stock
- **As a:** Owner
- **I want:** to press "Decline, keep it in stock" on `scrap-decision`, after which the server sets the request to `declined` and moves the piece from `with_owner` back to its `prevStatus` `in_stock`
- **So that:** a piece I want to keep goes back on the floor and can be sold, and the pool is not touched (FR-27-6, FR-27-7, FR-27-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given SR-101 is pending, when Sanjay Seth presses "Decline, keep it in stock", then SR-101 is `declined` with `decidedBy` Sanjay and `decidedAt` set, TAG-7701 is `in_stock`, and an audit entry records the decline (epic acceptance criterion 3).
  2. Given the decline commits, when the pool is read, then it is still 812.5800 g and no ledger entry was added.
  3. Given TAG-7701 had `inStockAt` 108 days ago, when it returns to `in_stock`, then `inStockAt` is unchanged, so days in stock still read 108 and the ageing count is not reset.
  4. Given Deepak Rao (Staff) calls Decline for SR-101 directly, when it reaches the server, then it is refused with "Only the owner can decline a scrap request." (proposed wording, from the prototype "decline a scrap request" check) and nothing changes.
  5. Given SR-101 is already decided, when Decline is called, then the server refuses with "This request is already decided.".
- **Rules enforced on the server:** Decline is Owner only (EP-05-S2). The request row is locked and must be `pending`; the piece is moved through Update Piece state (EP-22-S2), `with_owner` to `in_stock`, and `prevStatus` is cleared. `inStockAt` is kept, not reset. No reason is required, pending the section 17 question. The request carries an idempotency key (EP-03-S8). Edit proposals are not voided on decline.
- **Live events emitted / consumed:** Emitted after commit: "Piece scrapped" (proposed, G26) with outcome `declined` through EP-27-S10, so stock screens show the piece again. Consumed: none.
- **Audit entry written:** Yes, through EP-27-S11 (`scrap_declined`) and one `piece_state_changed` entry through EP-22-S11 (before `with_owner`, after `in_stock`, reason `scrap_declined`).
- **Data changes:** Updates `scrap_requests.status`, `decidedBy`, `decidedAt`; updates `pieces.status`, `prevStatus`, `version`; inserts a `piece_state_transitions` row. Adds Decline scrap to the shared contract. Ports `ownerDeclineScrap` from `src/store/transitions.ts`.
- **UI reference:** Route `scrap-decision` ("If you decline", "The piece goes back on the floor and can be sold.", "Decline, keep it in stock"). No mockup draws the screen.
- **Non-functional checks:** Concurrency: a decline and a mark-scrapped on one request at the same moment give exactly one decision; the other is refused with "This request is already decided.". Security: owner-only on the server. Open question: must the owner give a reason when declining; this story asks for none.
- **Depends on:** EP-27-S4, EP-27-S5, EP-22-S2, EP-22-S11, EP-05-S2, EP-03-S6, EP-03-S8, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S8: System can void open edits on a scrapped piece

- **Story ID:** EP-27-S8
- **Status:** Not started
- **Title:** System can void open edits on a scrapped piece
- **As a:** System
- **I want:** the mark-scrapped transaction to call the EP-25-S11 Void open edits function for the piece, with void reason `scrapped`, after the piece moves to `scrapped`
- **So that:** no open proposal can later change a closed piece, and the owner's "STAFF WANTS A CODE" card for it goes away (FR-27-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a proposal on TAG-7701's `stoneG` was opened while it was `in_stock` and is still `proposed`, when Sanjay Seth marks TAG-7701 scrapped, then in the same transaction the proposal is `void` with void reason `scrapped`.
  2. Given that proposal was `token_sent`, when Sanjay enters its token after the scrap, then the server refuses with "This proposal has already been decided." and TAG-7701's weights are unchanged.
  3. Given the scrap rolls back, when the proposal is read, then it is still open, because the void ran inside the rolled-back transaction.
  4. Given the owner declines the request instead, when the proposal is read, then it is still open.
  5. Given TAG-7701 has no open proposal, when it is scrapped, then no proposal row changes and no `edit_voided` entry is written.
- **Rules enforced on the server:** The function is internal and runs after the piece row is locked and moved to `scrapped`. Only `proposed` and `token_sent` rows are voided, and their tokens are used up (EP-25-S11). Voiding runs on scrap only, not on request or decline.
- **Live events emitted / consumed:** Emitted after commit through EP-25-S11: "Edit proposed / token sent" with status `void` for each voided proposal. Consumed: none.
- **Audit entry written:** Yes, through EP-25-S14: actor (the owner who scrapped), time, entity (edit id and tag number), action `edit_voided`, before (status), after (`void`, `scrapped`).
- **Data changes:** Updates `piece_edits` and `edit_tokens` through EP-25-S11. No new tables.
- **UI reference:** No screen of its own. The "STAFF WANTS A CODE" card leaves `docs/ux/mockups/08-owner-home.svg`, route `decisions`.
- **Non-functional checks:** Concurrency: the piece row lock serialises a scrap and an edit apply on the same piece; whichever commits first wins.
- **Depends on:** EP-27-S6, EP-25-S11, EP-25-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S9: Owner can start a scrap from the "Melt and remake" action on the ageing alert

- **Story ID:** EP-27-S9
- **Status:** Not started
- **Title:** Owner can start a scrap from the "Melt and remake" action on the ageing alert
- **As a:** Owner
- **I want:** "Melt and remake" on the "GOLD SITTING TOO LONG" alert to open a list of the aged `in_stock` pieces, oldest first, where I pick one or more, give one reason, and land on `scrap-decision` for each new request so I can mark it scrapped at once
- **So that:** I turn dead stock back into working gold from the alert that told me about it, without waiting for staff to ask (FR-27-1, BR-27-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given `ageingThresholdDays` is 90 and 6 pieces have been `in_stock` longer, when Sanjay Seth presses "Melt and remake", then a list shows the 6 pieces oldest first with tag, name, days in stock and pure gold, starting with the oldest at 108 days.
  2. Given Sanjay picks 2 pieces and enters "Melt and remake in a lighter style", when he confirms, then 2 `pending` requests are created with Sanjay as requester, both pieces are `with_owner`, and `scrap-decision` opens on the first request.
  3. Given one of the picked pieces was sold by Rajesh Verma a moment before, when Sanjay confirms, then that piece is refused with "{tag} is not in stock.", the other request is still created, and the list says which one failed.
  4. Given Sanjay is on `scrap-decision` for a request he created here, when he presses "Mark it scrapped", then the same EP-27-S6 rules apply and the pool rises by that piece's net.
  5. Given `ageingThresholdDays` is empty, when Sanjay opens `decisions`, then no ageing alert is shown and so no "Melt and remake" is offered.
- **Rules enforced on the server:** List Aged pieces is Owner only and returns `in_stock` pieces whose days in stock exceed `ageingThresholdDays` (EP-13-S8), computed on the server. Each picked piece is a separate Create Scrap request (EP-27-S2 to EP-27-S4), so one refusal does not undo the others. The owner still decides each request through EP-27-S6 or EP-27-S7. The alert card and its figures ("196.4 g of gold has not moved in 90 days") are built in EP-32; this story supplies the aged-pieces read, the pick list and the hand-off to `scrap-decision`, and EP-32 wires the button to it.
- **Live events emitted / consumed:** Emitted after each commit through EP-27-S10: "Scrap requested" (proposed, G26). Consumed: "Piece billed by one staff member" to drop a piece sold while the list is open.
- **Audit entry written:** Yes, one `scrap_requested` entry per request through EP-27-S11, with the owner as actor.
- **Data changes:** None beyond EP-27-S1 and EP-27-S4. Adds List Aged pieces to the shared contract. Builds the pick list, which the prototype does not have.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("GOLD SITTING TOO LONG", "196.4 g of gold has not moved in 90 days", "6 pieces, mostly Temple style · tied up on the floor · oldest is 108 days", "Melt and remake"); then route `scrap-decision`. The pick list is not yet designed.
- **Non-functional checks:** Precision: pure gold per piece from integer units, shown to 4 decimals; mockup 08 prints "196.4 g", which is shown as 196.4000 g. Time: days in stock counted in Asia/Kolkata from `inStockAt`. Concurrency: each request locks its own piece row (EP-27-S3). Open decision G5: the ageing alert and its threshold are owned by EP-32 and EP-13; this story cannot be demoed end to end until the EP-32 alert exists, and is tested by calling the pick list directly.
- **Depends on:** EP-27-S2, EP-27-S3, EP-27-S4, EP-27-S5, EP-27-S6, EP-13-S8, EP-22-S3, EP-05-S2, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S10: System can push scrap requests and decisions live

- **Story ID:** EP-27-S10
- **Status:** Not started
- **Title:** System can push scrap requests and decisions live
- **As a:** System
- **I want:** to publish "Scrap requested" after a request commits and "Piece scrapped" (with outcome `scrapped` or `declined`) after a decision commits, each with request id, piece id, tag number, piece version and outcome, to Owner and Staff connections only
- **So that:** the owner sees a new request within about 1 second and stock screens update within about 1 second of a decision (FR-27-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has `decisions` open, when Rajesh Verma's request for TAG-7701 commits, then the card "1 piece to be marked as scrap" appears within about 1 second without a reload.
  2. Given Deepak Rao has `stock` open, when the request commits, then TAG-7701 leaves "Can sell" within about 1 second; when the owner marks it scrapped it stays gone, and when he declines it reappears under "Can sell".
  3. Given Rajesh has TAG-7701 open in the drawer, when the owner decides, then the waiting notice is replaced by the closed state or the in-stock actions within about 1 second.
  4. Given the decision transaction rolls back, when it ends, then neither "Piece scrapped" nor "Metal pool changed" is sent (EP-07-S1).
  5. Given a karigar is connected on the portal, when any scrap event is published, then they receive nothing.
- **Rules enforced on the server:** Events publish only after commit (EP-07-S1), stamped with sequence number, entity id and version (EP-07-S2). The audience is Owner and Staff; karigars are excluded by the permission filter (EP-07-S5). The payload carries no reason text and no requester name, which screens read through the normal reads. Both events are proposed in G26 and are added to the EP-07 registry by this story.
- **Live events emitted / consumed:** Emitted: "Scrap requested" (proposed, G26; consumers EP-32, EP-22); "Piece scrapped" (proposed, G26; consumers EP-22, EP-32). "Metal pool changed" is emitted by EP-18-S12, not here. Consumed: none on the server.
- **Audit entry written:** No. Each request and decision writes its own entry.
- **Data changes:** None in the product database. Adds both events to the EP-07 registry and to the client event-to-read map for the pending scrap list, the scrap request, the stock list, the piece and the floor total (EP-08-S8).
- **UI reference:** No screen of its own. Effects show on routes `decisions`, `scrap-decision` and `stock`.
- **Non-functional checks:** Performance: the owner sees a request within about 1 second (epic section 13). Concurrency: screens keep the update with the higher piece version. Availability: a client that was disconnected catches up from its last sequence number (EP-07-S7, EP-08-S10). Open decision G26: whether "Scrap requested" and "Piece scrapped" join the live event catalogue.
- **Depends on:** EP-27-S2, EP-27-S6, EP-27-S7, EP-07-S1, EP-07-S2, EP-07-S4, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10, EP-22-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-27-S11: System can audit every request and decision

- **Story ID:** EP-27-S11
- **Status:** Not started
- **Title:** System can audit every request and decision
- **As a:** System
- **I want:** to write an append-only audit entry in the same transaction as each scrap request (`scrap_requested`, a new kind), each mark-scrapped (`scrap_marked`) and each decline (`scrap_declined`), with actor, role, time, request id, piece tag, reason and pure gold
- **So that:** the owner can trace every piece that left the floor to be melted, who asked, who decided, and how much gold went back (FR-27-11, BR-27-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma requests scrap for TAG-7701, when it commits, then a `scrap_requested` entry holds actor Rajesh, role Staff, time, SR id, TAG-7701, reason "108 days unsold" and pure gold `784000` units.
  2. Given Sanjay Seth marks SR-101 scrapped, when it commits, then a `scrap_marked` entry reads "TAG-7701 marked as scrap · 78.4000 g back in the pool" with detail "Asked by Rajesh Verma: 108 days unsold. Melt and remake in a lighter style.", before (`with_owner`, pool 812.5800 g) and after (`scrapped`, pool 890.9800 g), and the ledger entry id.
  3. Given Sanjay declines SR-101, when it commits, then a `scrap_declined` entry reads "Scrap request for TAG-7701 declined" with the request reason, before `with_owner` and after `in_stock`.
  4. Given the decision transaction rolls back, when the log is read, then no scrap entry exists for it.
  5. Given the owner filters the security log by kind group "Scrap" and entity TAG-7701, when the list loads, then all three kinds appear newest first; given a staff user reads the log, then it is refused (EP-06-S12).
- **Rules enforced on the server:** Entries are written through EP-06-S2 inside the operation's transaction and cannot be updated or deleted (EP-06-S1). Weights in entries are integers in units of 0.0001 g (EP-06-S5). Actor and time come from the session and server clock. `scrap_requested` is added to the audit kind list, which the prototype lacks.
- **Live events emitted / consumed:** None. Audit writes publish nothing.
- **Audit entry written:** Yes: actor, role, time, entity (request id and tag number), action (`scrap_requested`, `scrap_marked`, `scrap_declined`), before, after, reason, pure gold, ledger entry reference for `scrap_marked`.
- **Data changes:** Inserts into `audit_entries`. Adds `scrap_requested` to the audit kind enum and the "Scrap" kind group in the shared package; migration widens the kind check constraint if it is a database enum.
- **UI reference:** The security log screen from EP-06-S9 to EP-06-S11. No new screen.
- **Non-functional checks:** Audit: request, scrap and decline write append-only entries, and the pool entry carries the scrap request reference (epic section 13). Precision: pure gold stored as integer units. Personal data: no customer data is involved.
- **Depends on:** EP-27-S2, EP-27-S6, EP-27-S7, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S5, EP-06-S7, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A5: is it confirmed that melting always needs the owner and staff can only request it? (EP-27-S2, S6, S7)
- App. B sub-question 2: when a piece is scrapped, is its stone weight recovered and tracked separately, or written off? (EP-27-S6)
- App. B sub-question 3: is scrap ever sold outward to a refiner, or only reused in-house? (EP-27-S6)
- What purity does recovered gold carry in the pool (for example 22K and 18K pieces melted together)? (EP-27-S6)
- Is the credited figure the tag net, or a re-weighed figure after melting, and who records any melting loss? (EP-27-S6)
- Can a staff member withdraw a pending request? (EP-27-S1, S2)
- Must the owner give a reason when declining? (EP-27-S7)
- G26: should "Scrap requested" and "Piece scrapped" be added to the live event catalogue? (EP-27-S10)
