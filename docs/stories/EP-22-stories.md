# EP-22: Stock and piece lifecycle · stories

Epic document: [EP-22 Stock and piece lifecycle](../epics/EP-22-stock-and-piece-lifecycle.md)

Role note: stories where the server stores, checks, locks or pushes on its own use "System". The state machine here is called by other epics: release (EP-23), stop and clear (EP-24), edit apply (EP-25), sale (EP-26) and scrap (EP-27). Where those epics are not built yet, the stories here are tested by calling the transition service directly and with seeded stopped, billed and scrapped pieces. v1 has no holds, so no story here reserves a piece for a customer or a lead. No price or value is shown; the value socket stays empty until EP-42. Weights are shown to 4 decimals; mockup 03 prints 3 decimals, and the figures below are its numbers written to 4.

---

## EP-22-S1: System can store pieces with state, version and integer weights

- **Story ID:** EP-22-S1
- **Title:** System can store pieces with state, version and integer weights
- **As a:** System
- **I want:** the piece lifecycle fields on top of the EP-02 and EP-21 piece table: `status` limited to the six states, `prevStatus`, `inStockAt`, `soldAt`, `stockOutId`, `version`, gross and stone weights as integers in units of 0.0001 g, the nullable value socket, and a `piece_state_transitions` table, with no held-for or hold-expiry field
- **So that:** every piece's state and weights survive a reload and a redeploy, and the server has one place to read and lock a piece before changing it (BR-22-1, BR-22-4, BR-22-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when `pieces` is inspected, then `status` accepts only `draft`, `with_owner`, `stopped`, `in_stock`, `billed` and `scrapped`, and a write of `held` is rejected by the database check constraint.
  2. Given piece TAG-8841 with gross 48.6500 g and stones 7.0600 g, when it is saved and read back, then `pieces` stores `486500` and `70600`, the pure gold 41.5900 g is computed on read, and the value field is null.
  3. Given the migration has run, when `pieces` is inspected, then there is no `heldForLeadId` column and no hold-expiry column, and `piece_state_transitions` has piece id, from, to, actor, at and reason.
  4. Given the prototype seed is loaded into staging (EP-02-S13), when the migration runs, then every seeded piece with `heldForLeadId` set is stored as `in_stock` with no link to the lead, every other piece keeps its state, and the migration can be rolled back.
  5. Given a piece with `status` `stopped`, when it is saved with `prevStatus` empty, then the database rejects it, because a stopped piece must record the state it returns to.
  6. Given any piece in stock, when it is read, then it carries `location_id` "Main shop" (EP-02-S5); no state transition or operation changes the location in v1, because transfers between locations are deferred (D7).
- **Rules enforced on the server:** Status is one of six values (check constraint). `prevStatus` is required when status is `stopped` and empty otherwise. Gross is greater than 0 and stones are from 0 up to gross. Pure gold is never stored from client input. `version` increments on every write and backs the EP-02-S14 stale-write check. Indexes on `status`, (`status`, `inStockAt`), tag number, HUID and `design_id` so the stock list stays fast.
- **Live events emitted / consumed:** None. This story only stores data.
- **Audit entry written:** No. Schema changes are tracked by the migration history (EP-02-S1); state changes are audited by EP-22-S11.
- **Data changes:** Migration on `pieces` adds or confirms `status` (check constraint), `prevStatus`, `inStockAt`, `soldAt`, `stockOutId` (nullable), `valueINR` (nullable, unused until EP-42), `version`, and the indexes above; drops `heldForLeadId` if EP-02-S5 created it. Migration creates `piece_state_transitions` (id, piece id, from status, to status, actor id, at, reason, operation name). Uses `pieces.location_id` from EP-02-S5; no transition writes it after the piece is created.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: weights are integers in units of 0.0001 g, shown to 4 decimals with the EP-02-S2 helper. Time: `inStockAt`, `soldAt` and transition `at` stored in UTC. Performance: indexes sized for 5,000 pieces in stock and their history. D7 is decided: one shop, no branches; pieces carry the shop ID (EP-02-S3) and tag number and HUID are unique within the shop.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S5, EP-02-S13, EP-02-S14, EP-21-S1, EP-15-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S2: System can enforce the six-state transition table

- **Story ID:** EP-22-S2
- **Title:** System can enforce the six-state transition table
- **As a:** System
- **I want:** one server module, Update Piece state, that holds the transition table, locks or version-checks the piece, refuses any change not in the table, sets the state fields, writes the transition row and publishes events after commit, and that every other epic calls instead of setting `status` itself
- **So that:** no path can skip a check when a piece moves, and in stock goes only to billed, scrapped or stopped (FR-22-1, BR-22-1, BR-22-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the table, when it is inspected in the shared package, then it allows exactly: `draft` to `with_owner`, `in_stock` or `stopped`; `with_owner` to `in_stock`, `draft` or `scrapped`; `in_stock` to `billed`, `scrapped` or `stopped`; `stopped` back to its `prevStatus` only; and nothing out of `billed` or `scrapped` (proposed from the prototype transitions, to confirm with EP-23, EP-24 and EP-27).
  2. Given TAG-8841 is `in_stock`, when any caller asks to move it to `draft` or `with_owner`, then the server refuses with "TAG-8841 cannot go from In stock to Draft." (proposed wording) and nothing is stored.
  3. Given the 9 draft pieces of BATCH-2026-043 are released by EP-23, when the transition commits, then each piece is `in_stock` with `inStockAt` from the server clock, 9 transition rows exist, and "Parcel released into stock" is published once for the parcel after commit.
  4. Given a caller passes version 4 for TAG-8841 and the stored version is 5, when the transition runs, then it is refused with the EP-02-S14 conflict and the piece is unchanged.
  5. Given a code search of the server, when it is run in CI, then no module other than the transition module writes `pieces.status`.
- **Rules enforced on the server:** Update Piece state is internal and callable only by server operations of other epics, never directly by a browser (System in the API table). The calling operation's role check runs first (EP-05-S2). The piece row is locked or version-checked inside the caller's transaction (EP-03-S6). `inStockAt` is set on entering `in_stock`; `soldAt` and `stockOutId` on entering `billed`; `prevStatus` on entering `stopped` and cleared on leaving it. Refusals use the EP-03-S4 code and sentence format. Events publish only after commit (EP-07-S1).
- **Live events emitted / consumed:** Emitted after commit: "Parcel released into stock" (proposed, G26) when pieces enter `in_stock`; "Piece billed by one staff member" when a piece enters `billed` (see EP-22-S6). Consumed: none.
- **Audit entry written:** Yes, through EP-22-S11: actor, time, entity (piece tag number), action (`piece_state_changed`), before (status), after (status), reason.
- **Data changes:** Inserts `piece_state_transitions` rows; updates `pieces.status`, `prevStatus`, `inStockAt`, `soldAt`, `stockOutId`, `version`. Ports the status writes in `syncParcel`, `finishRelease`, `stockOut`, `ownerScrap`, `raiseProblem` and `clearProblem` from `src/store/transitions.ts` into one service function; `routeLeadItemToStock` and `releaseHold` are not ported.
- **UI reference:** No screen. State words and colours come from `docs/ux/mockups/01-foundations.svg` (STATE WORDS v3) and the piece rail on `docs/ux/mockups/12-state-lifecycles.svg` ("Draft", "Checked", "In stock", "Billed · locked"); its "Held for a customer" segment is out of scope for v1.
- **Non-functional checks:** Concurrency: two transitions on one piece are ordered by the row lock or version; the second is refused, not merged. Security: no browser operation can set a status by name. Audit: every accepted transition is audited. Open question: whether `with_owner` back to `draft` (owner asks for a re-check) is a piece transition or a parcel flag only; decided with EP-23.
- **Depends on:** EP-22-S1, EP-02-S14, EP-03-S4, EP-03-S6, EP-03-S12, EP-05-S2, EP-06-S2, EP-07-S1, EP-07-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S3: Staff can see the in-stock list with counts

- **Story ID:** EP-22-S3
- **Title:** Staff can see the in-stock list with counts
- **As a:** Staff
- **I want:** the "Showroom stock" screen (`stock`) to load piece cards from the server with name, tag, purity, style, "Pure gold", "Gross · stones" and a state word, the chips "Can sell", "With QC", "Sold out" and "Billed" with counts, and "Newest first" order
- **So that:** I see what I can sell right now, from the same data every other staff member sees (FR-22-5, FR-22-7, BR-22-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the server holds 42 `in_stock` pieces, 5 pieces counting as With QC, 9 sold-out designs and 23 `billed` pieces, when Rajesh Verma opens `stock`, then the chips read "Can sell · 42", "With QC · 5", "Sold out · 9" and "Billed · 23", and the counts come from the server, not from the loaded page.
  2. Given "Can sell" is selected, when the list loads, then it shows only `in_stock` pieces newest first by `inStockAt`, and the card for TAG-8841 reads "Antique Kundan Choker", "TAG-8841 · 22K · Kundan", "Pure gold 41.5900 g" and "Gross · stones 48.6500 g · 7.0600 g", with no price line.
  3. Given every `in_stock` piece, when its card shows, then it has the state word "In showcase" and no "Held" or "Reserved" word, because any staff member may sell it (BR-22-4).
  4. Given 5,000 `in_stock` pieces, when `stock` opens, then the first page shows in under 2 seconds and later pages load by cursor (EP-03-S9).
  5. Given Vijay Kumar (Karigar), when he calls List Pieces, then the server refuses with `forbidden`, and `stock` is not in his rail (EP-08-S13).
- **Rules enforced on the server:** List Pieces is Staff and Owner only (EP-05-S2). Filter values are `can_sell` (`in_stock`), `with_qc`, `sold_out` (designs, from EP-22-S9) and `billed`. Counts are computed on the server in the same read. Sort by `inStockAt` descending, then tag. Cursor paging. The value field is not returned while pricing is off.
- **Live events emitted / consumed:** Consumed: "Parcel released into stock" (proposed, G26) to add pieces and raise the Can sell count; "Parcel stopped (mismatch or raised problem)" to move counts to the With QC group. Removal on sale is EP-22-S7.
- **Audit entry written:** No. Reading the list changes nothing.
- **Data changes:** None in the product database. Adds List Pieces with filter, cursor and counts to the shared contract. Moves `ShowroomStock.tsx` from `useStore()` onto the EP-08 data layer and drops the held cards and `heldBackPieces`.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Showroom stock", "Can sell · 42", "With QC · 5", "Sold out · 9", "Billed · 23", "More filters", "Newest first", "In showcase", "Pure gold", "Gross · stones").
- **Non-functional checks:** Performance: first page under 2 seconds for 5,000 pieces (epic section 13). Precision: card weights from integer units, shown to 4 decimals. Security: karigars have no stock read. Open question: which pieces count in "With QC", `draft` only or `with_owner` too; the count is one server function so the answer changes one place. D7 is decided: one shop, so the list has no branch filter. "More filters" is not yet designed and is not part of this story.
- **Depends on:** EP-22-S1, EP-22-S2, EP-03-S9, EP-05-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S4: Staff can search stock by tag, HUID, name or collection

- **Story ID:** EP-22-S4
- **Title:** Staff can search stock by tag, HUID, name or collection
- **As a:** Staff
- **I want:** to type in "Search tag, HUID, name or collection" on `stock` and get matching pieces from the server within the selected chip
- **So that:** I find the piece a customer is asking about at the counter in a few keystrokes (FR-22-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `in_stock`, when Rajesh Verma types "8841", then TAG-8841 "Antique Kundan Choker" is in the results, and a search for "TAG-8841" returns the same piece.
  2. Given TAG-8841 has BIS hallmark 9X82K1, when Rajesh types "9x82k1", then TAG-8841 is returned, because HUID search ignores case.
  3. Given TAG-8841 is in the collection "Festive Bridal 2026", when Rajesh types "bridal" with "Can sell" selected, then every `in_stock` piece whose name or collection contains "bridal" is returned and no `billed` piece is.
  4. Given 5,000 `in_stock` pieces, when Rajesh types a term, then results show in under 2 seconds, and requests are sent only after he stops typing for 300 ms (proposed).
  5. Given a search with no match, when it returns, then the list shows "No piece matches "<term>"." (proposed wording) and the chip counts still show the totals.
- **Rules enforced on the server:** Search is part of List Pieces, Staff and Owner only. The term is trimmed, limited to 60 characters (proposed) and passed as a parameter, never joined into a query string. Tag and HUID match exactly or by suffix; name and collection match by contains, ignoring case. The state filter applies to the search.
- **Live events emitted / consumed:** Consumed: the same events as EP-22-S3, so a piece billed elsewhere leaves the search results too (EP-22-S7).
- **Audit entry written:** No. Searching changes nothing.
- **Data changes:** None in the product database beyond indexes. Migration adds a case-insensitive index on HUID and a text index on name and collection if EP-22-S1 did not.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Search tag, HUID, name or collection"). The empty result is not yet designed.
- **Non-functional checks:** Performance: under 2 seconds for 5,000 pieces. Security: parameterized query; karigars refused. Personal data: search returns no customer data.
- **Depends on:** EP-22-S3, EP-15-S8, EP-03-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S5: Staff can open a piece and see its facts and history

- **Story ID:** EP-22-S5
- **Title:** Staff can open a piece and see its facts and history
- **As a:** Staff
- **I want:** to open a card into the piece drawer and see "PURE GOLD IN THIS PIECE" as the lead figure, the gross and stones line, "THE FACTS" (Tag, BIS hallmark, Made by, Came in with, Days in stock, Reordered before), "Weight breakdown", "Edit history", "Description and photos" and the state history, all read from the server
- **So that:** I can answer a customer's question about the piece and trust the gold figure (FR-22-6, BR-22-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 with gross 48.6500 g and stones 7.0600 g, when Rajesh Verma opens it, then the drawer shows "PURE GOLD IN THIS PIECE 41.5900 g" and "48.6500 g on the scale, minus 7.0600 g of stones, pearls and lac", and no price line.
  2. Given TAG-8841 has HUID 9X82K1, maker Mahesh Soni (KG-02) and parcel BATCH-2026-041, and entered stock 13 days ago, when the drawer opens, then "THE FACTS" shows "BIS hallmark 9X82K1", "Made by Mahesh Soni (KG-02)", "Came in with BATCH-2026-041" and "Days in stock 13 days", and the header reads "In showcase · 13 days old".
  3. Given its design was reordered 3 times and the piece has 5 inclusions and 2 applied edits, when the drawer opens, then it shows "Reordered before 3 times", "Weight breakdown · 5 inclusions" and "Edit history · 2 entries", each edit with old and new value, who asked and when.
  4. Given `inStockAt` is 23:30 IST on 1 May and today is 2 May 00:10 IST, when the drawer opens, then "Days in stock" reads 1 day, counted in Asia/Kolkata days.
  5. Given a `billed` piece, when it is opened from the "Billed" chip, then the drawer shows "Billed · locked" with the sale date, and "Add to a sale" and "Edit tag" are not offered.
- **Rules enforced on the server:** Read Piece is Staff and Owner only; a karigar call is refused (EP-05-S2). Days in stock is computed on the server from `inStockAt` in Asia/Kolkata days. Reorder count comes from the design (EP-15-S10, EP-19); edit history from applied piece edits (EP-02-S5). Photos are returned as signed links (EP-09-S5). The value field is not returned while pricing is off.
- **Live events emitted / consumed:** Consumed: "Edit applied" to refresh weights and edit history in an open drawer; "Piece billed by one staff member" to show the drawer as billed (EP-22-S7).
- **Audit entry written:** No. Reading a piece changes nothing.
- **Data changes:** None in the product database. Adds Read Piece with facts, history and photo links to the shared contract. Moves `PieceDrawer.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock`, piece drawer ("In showcase", "13 days old", "Festive Bridal 2026 · 16 in adjustable dori", "PURE GOLD IN THIS PIECE", "Breakdown", "THE FACTS", "Tag", "BIS hallmark", "Made by", "Came in with", "Days in stock", "Reordered before", "Weight breakdown · 5 inclusions", "Edit history · 2 entries", "Description and photos", "Add to a sale", "Edit tag", "Share"). The value socket on `docs/ux/mockups/15-value-ready.svg` stays empty.
- **Non-functional checks:** Precision: all weights from integer units, shown to 4 decimals. Time: days in stock in Asia/Kolkata days (epic section 13). Security: photos only through signed links; karigars refused. Performance: the drawer opens in under 1 second. "Add to a sale", "Edit tag" and "Share" open flows built in EP-26, EP-25 and EP-34; until each ships, its button is not shown. The mockup's tag "TAG-2026-8841" and card tag "TAG-8841" differ; the shown format follows EP-15-S6.
- **Depends on:** EP-22-S3, EP-15-S10, EP-15-S6, EP-09-S5, EP-09-S7, EP-02-S5, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S6: System can refuse a second sale of the same piece with "already taken"

- **Story ID:** EP-22-S6
- **Title:** System can refuse a second sale of the same piece with "already taken"
- **As a:** System
- **I want:** the `in_stock` to `billed` transition to lock the piece row or check its version, let exactly one sale win, refuse every other with an "already taken" sentence, and publish "Piece billed by one staff member" after the winner commits
- **So that:** two staff can never sell the same piece, even at the same second on different devices (FR-22-9, FR-22-7, BR-22-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is `in_stock`, when Rajesh Verma and Deepak Rao each send a sale of it at the same moment, then exactly one commits with status `billed`, and the other is refused with "TAG-8841 is already taken. It was billed a moment ago." (proposed wording) (epic acceptance criterion 1).
  2. Given the losing sale, when the refusal returns, then no stock-out record, transition row or audit entry was written for it, and the winner's `soldAt` and `stockOutId` are unchanged.
  3. Given TAG-8841 was linked to a lead line for reference by EP-30, when Deepak sells it to a walk-in, then the sale succeeds, because a link does not reserve the piece (epic acceptance criterion 5).
  4. Given the winning sale commits, when the event is published, then "Piece billed by one staff member" carries the piece id, tag number, version and the seller's name, and no customer data.
  5. Given the concurrency test from EP-40 runs 20 parallel sales of one piece, when it finishes, then 1 sale succeeded and 19 got the "already taken" refusal.
- **Rules enforced on the server:** The sale operation (EP-26) calls Update Piece state with `in_stock` to `billed` inside its transaction. The piece row is locked (`SELECT … FOR UPDATE`) or the update is conditional on `status = in_stock` and the read version; zero rows updated means "already taken". A sale of a `stopped` piece is refused by EP-22-S8; of a `draft` or `with_owner` piece by the transition table. No operation in v1 reserves a piece (FR-22-7). The open-edit rule follows A4.
- **Live events emitted / consumed:** Emitted after commit: "Piece billed by one staff member". Consumed: none.
- **Audit entry written:** Yes, through EP-22-S11 for the winning sale: actor, time, entity (piece tag number), action (`piece_state_changed`), before (`in_stock`), after (`billed`, stock-out id). No entry for the refused sale, which stores nothing.
- **Data changes:** Updates `pieces.status`, `soldAt`, `stockOutId`, `version`; inserts one `piece_state_transitions` row. The stock-out record itself is EP-26.
- **UI reference:** No screen of its own. The refusal shows on the stock-out flow (EP-26) through EP-08-S5.
- **Non-functional checks:** Concurrency: row lock or version check; the losing request gets "already taken" (epic section 13, PRODUCTION-SCOPE §5). Performance: the losing seller sees the refusal within about 1 second. Open decision A4: whether a piece with an open edit proposal stays sellable (BR-22-6, current assumption) or needs a seventh state; until decided, the sale is allowed and the open proposal is left for EP-25 to void or keep. Until EP-26 exists, the test calls the transition directly.
- **Depends on:** EP-22-S2, EP-02-S14, EP-03-S4, EP-03-S6, EP-03-S8, EP-07-S1, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S7: Staff can see a piece disappear live when billed elsewhere

- **Story ID:** EP-22-S7
- **Title:** Staff can see a piece disappear live when billed elsewhere
- **As a:** Staff
- **I want:** a piece billed or scrapped by someone else to leave my "Can sell" list, search results and counts within about a second, and an open drawer for it to show it is gone
- **So that:** I do not offer a customer a piece that has just been sold at the next counter (FR-22-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma and Deepak Rao both have `stock` open on "Can sell · 42", when Deepak bills TAG-8841, then within about a second TAG-8841 leaves Rajesh's list, "Can sell" reads 41 and "Billed" reads 24, with no reload (epic acceptance criterion 4).
  2. Given Rajesh has TAG-8841 open in the drawer, when the event arrives, then the drawer shows "Billed · locked" with "Sold by Deepak Rao just now" (proposed wording), and "Add to a sale" is removed.
  3. Given the owner scraps TAG-8802, when "Piece scrapped" (proposed, G26) arrives, then TAG-8802 leaves "Can sell" and the pure gold on the floor drops by 57.4900 g.
  4. Given Rajesh's connection drops while two pieces are billed, when it returns, then "Reconnecting…" clears and both pieces are gone after catch-up (EP-07-S7, EP-08-S10).
  5. Given a late event with a lower piece version than the one shown, when it arrives, then it does not overwrite newer data (EP-07-S2).
- **Rules enforced on the server:** Events are published only after commit (EP-07-S1) and only to Staff and Owner (EP-07-S5); karigars never receive stock events. Each event carries the piece version so clients apply only newer data.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member"; "Piece scrapped" (proposed, G26, emitted by EP-27); "Parcel released into stock" (proposed, G26) to add pieces.
- **Audit entry written:** No. Pushing and showing an event changes nothing.
- **Data changes:** None in the product database. Maps the three events to the List Pieces, Read Piece and Stock totals reads in the EP-08-S8 event map.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` (chips and drawer). The "sold just now" drawer state is not yet designed.
- **Non-functional checks:** Performance: removal within about 1 second (epic section 13). Availability: catch-up after reconnect. Concurrency: the live removal only warns early; the server refusal in EP-22-S6 is the guard. Until EP-26 and EP-27 exist, the events are raised by calling the transition directly.
- **Depends on:** EP-22-S3, EP-22-S5, EP-22-S6, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S7, EP-07-S11, EP-07-S12, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S8: System can freeze stopped and billed pieces

- **Story ID:** EP-22-S8
- **Title:** System can freeze stopped and billed pieces
- **As a:** System
- **I want:** to refuse any sale of a `stopped` piece, any state or weight change to a `billed` piece, and any weight change to a `stopped` piece, and to show both as frozen on open stock screens when the state changes
- **So that:** a piece under a problem cannot leave the shop, and a sold piece's weights stay as billed for good (FR-22-2, FR-22-3, BR-22-2, BR-22-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8802 is `stopped` with `prevStatus` `in_stock`, when Rajesh Verma tries to sell it, then the server refuses with "TAG-8802 is stopped. Only the owner can clear it." (proposed wording) and nothing changes (epic acceptance criterion 3).
  2. Given TAG-7914 is `billed`, when any caller, the owner included, changes its gross, stones, status or tag, then the server refuses with "TAG-7914 is billed. Its weights are locked." (proposed wording) (epic acceptance criterion 2).
  3. Given a problem is raised on TAG-8802, when "Problem raised on a job or piece" (proposed, G26) arrives, then within about a second TAG-8802 leaves "Can sell", counts under "With QC" or stopped per the open question, and its drawer shows the stopped colour with no "Add to a sale".
  4. Given the problem is cleared, when "Problem cleared" (proposed, G26) arrives, then TAG-8802 returns to `in_stock` with its old `inStockAt`, and reappears under "Can sell".
  5. Given a parcel mismatch stops BATCH-2026-044, when "Parcel stopped (mismatch or raised problem)" arrives, then its pieces show as With QC and none appears under "Can sell".
- **Rules enforced on the server:** The checks run inside the transition module and the piece write path, against the locked row. `billed` and `scrapped` have no outgoing transitions and refuse weight writes, with no owner override (mockup 12). A `stopped` piece can only return to `prevStatus` through the clear operation of EP-24. Edit apply (EP-25) is refused on `billed` pieces by the same check.
- **Live events emitted / consumed:** Consumed: "Parcel stopped (mismatch or raised problem)"; "Problem raised on a job or piece" and "Problem cleared" (proposed, G26, emitted by EP-24); "Edit applied" to refresh weights on the card.
- **Audit entry written:** No for refused requests, which store nothing. The stop and clear transitions are audited by EP-22-S11.
- **Data changes:** None beyond EP-22-S1. Ports the stopped guard of `raiseProblem` and the billed guard of `stockOut` from `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/12-state-lifecycles.svg` (stopped colour "only the owner can clear it", "Billed · locked", "Billed is the end. The invoice number and sale date freeze the weights permanently"); `docs/ux/mockups/03-showroom-stock.svg`, route `stock`. The frozen card state is not yet designed.
- **Non-functional checks:** Concurrency: a sale that reaches the lock after a stop is refused; one committed before the stop stands. Security: no role can unlock a billed piece. Performance: freeze shows within about 1 second. Open question: which pieces count in "With QC". Until EP-24 exists, stops and clears are seeded for tests.
- **Depends on:** EP-22-S2, EP-22-S3, EP-22-S5, EP-22-S6, EP-07-S11, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S9: Staff can see sold-out designs with a reorder pointer (G3)

- **Story ID:** EP-22-S9
- **Title:** Staff can see sold-out designs with a reorder pointer (G3)
- **As a:** Staff
- **I want:** the "Sold out" chip on `stock` to list designs with no piece in stock, each card showing the design name, last tag, purity and style, "Asked for N times since <month>" and "Order another from <karigar>"
- **So that:** I can tell a customer a design is gone and reorder it from its maker in one tap (FR-22-10, BR-22-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the design "Peacock Ruby Pendant" has its only piece TAG-7914 `billed` and none `in_stock`, when Rajesh Verma selects "Sold out · 9", then a card shows "Peacock Ruby Pendant", "TAG-7914 · 22K · Antique", the word "Sold out", "Asked for 4 times since July" and "Order another from Vijay" (epic acceptance criterion 6).
  2. Given a new piece of that design is released into stock, when "Parcel released into stock" (proposed, G26) arrives, then the design leaves "Sold out" and the chip reads 8 within about a second.
  3. Given Rajesh presses "Order another from Vijay", when it opens, then `order-copy` opens with the design id through EP-19-S13, and no weight is filled in.
  4. Given the last `in_stock` piece of a design is billed, when "Piece billed by one staff member" arrives, then the design appears under "Sold out" without a reload.
  5. Given a design whose maker is no longer active, when its card shows, then the button reads "Order another" with no name, and the karigar is picked on the order copy.
- **Rules enforced on the server:** "Sold out" is derived from pieces by EP-15-S11; no piece or design stores a sold-out flag (BR-22-3). List Sold-out designs is Staff and Owner only. The reorder karigar is the maker of the most recent piece, named only if active (EP-16-S8). The asked-for count follows the G3 answer.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member", "Parcel released into stock" (proposed, G26) and "Piece scrapped" (proposed, G26) to refresh the list and count.
- **Audit entry written:** No. Reading sold-out designs changes nothing; the reorder is audited in EP-19.
- **Data changes:** None in the product database. Adds List Sold-out designs to the shared contract, reading EP-15-S11 counts.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Sold out · 9", "Sold out", "Peacock Ruby Pendant", "TAG-7914 · 22K · Antique", "Asked for 4 times since July", "Order another from Vijay"), opening route `order-copy`.
- **Non-functional checks:** Performance: the sold-out list loads under 2 seconds. Open question G3: what makes a design "Sold out" and how requests are counted; criteria 1 and 5 are written to fit either answer, and "Asked for…" is hidden until the count source is decided.
- **Depends on:** EP-22-S3, EP-15-S10, EP-15-S11, EP-16-S8, EP-19-S13, EP-07-S11, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S10: Owner can see pure gold on the floor

- **Story ID:** EP-22-S10
- **Title:** Owner can see pure gold on the floor
- **As a:** Owner
- **I want:** a Stock totals read that returns the count of `in_stock` pieces and the sum of their pure gold, shown in the `stock` header as "42 pieces you can sell · 1,847.2000 g pure gold on the floor" and available to the Decisions home
- **So that:** I know how much gold is on display at any moment, from exact integer sums (FR-22-11, BR-22-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given 42 `in_stock` pieces whose pure gold sums to `18472000` units, when Sanjay Seth opens `stock`, then the header reads "42 pieces you can sell · 1,847.2000 g pure gold on the floor".
  2. Given TAG-8841 with pure gold 41.5900 g is billed, when "Piece billed by one staff member" arrives, then the header reads "41 pieces you can sell · 1,805.6100 g pure gold on the floor" within about a second.
  3. Given pieces in `draft`, `with_owner`, `stopped`, `billed` or `scrapped`, when the total is computed, then none of them is counted.
  4. Given the total is computed, when it is checked against the sum of `gross − stones` over `in_stock` pieces in integer units, then it matches exactly with no rounding.
  5. Given Rajesh Verma (Staff), when he opens `stock`, then he sees the same header; given a karigar, the read is refused.
- **Rules enforced on the server:** Read Stock totals is Owner and Staff (API table). The sum is computed in the database over integer units and converted for display only at the edge (EP-02-S2). Only `in_stock` pieces count.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member", "Parcel released into stock" (proposed, G26), "Piece scrapped" (proposed, G26), "Edit applied" and "Problem raised on a job or piece" / "Problem cleared" (proposed, G26) to refresh the total.
- **Audit entry written:** No. Reading a total changes nothing.
- **Data changes:** None in the product database. Adds Read Stock totals to the shared contract. Replaces the `pureGoldOnFloor` selector in `src/store/selectors.ts`.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("42 pieces you can sell · 1,847.2 g pure gold on the floor"; the mockup prints 1 decimal, production shows 4). The Decisions card is built in EP-32.
- **Non-functional checks:** Precision: gold totals are sums of integer weights (epic section 13). Performance: the total answers in under 500 ms for 5,000 pieces (proposed). D7 is decided: the total is for the whole shop.
- **Depends on:** EP-22-S1, EP-22-S3, EP-02-S2, EP-05-S2, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-22-S11: System can audit every state transition

- **Story ID:** EP-22-S11
- **Title:** System can audit every state transition
- **As a:** System
- **I want:** every accepted call to Update Piece state to write one `piece_state_changed` audit entry and one `piece_state_transitions` row in the same transaction, with actor, time, from and to states, reason and the calling operation
- **So that:** the owner can trace every move of every piece, including who billed, stopped, cleared or scrapped it (epic section 13 Audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao bills TAG-8841, when it commits, then one entry exists with actor Deepak Rao, server time, entity TAG-8841, action `piece_state_changed`, before `in_stock`, after `billed` and the stock-out id.
  2. Given BATCH-2026-043 is released with 9 pieces, when it commits, then 9 entries exist, one per piece, each before `draft` and after `in_stock`, with operation `parcel_release`.
  3. Given the transition fails after the piece is written but before the audit insert, when the transaction rolls back, then the piece keeps its old state and no entry exists (EP-06-S2).
  4. Given Sanjay Seth filters the audit log by entity TAG-8802, when it loads, then he sees `in_stock` to `stopped`, then `stopped` to `in_stock`, each with actor, time and reason (EP-06-S10).
  5. Given Rajesh Verma (Staff), when he asks for the audit log, then the server refuses (EP-06-S12).
- **Rules enforced on the server:** The audit insert is inside the transition transaction (EP-06-S2). Before and after come from the locked row, not the request (EP-06-S3). Actions taken by the scheduler record the system actor (EP-06-S6). Entries cannot be edited or deleted (EP-06-S1).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (piece tag number), action (`piece_state_changed`), before (status, prevStatus), after (status, prevStatus, stock-out id where billed), reason, operation name.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11) and `piece_state_transitions` (EP-22-S1). Adds `piece_state_changed` to the audit kind list in the shared package.
- **UI reference:** No screen of its own. Entries are read on the EP-06 audit log screen.
- **Non-functional checks:** Audit: every state transition writes an entry with before and after (epic section 13). Time: entry time from the server clock in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-22-S2, EP-22-S6, EP-22-S8, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S6, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A4: does a piece stay sellable while an edit proposal is open, or does it need a seventh state? (EP-22-S6)
- G3: what makes a design "Sold out" and how are requests counted? (EP-22-S9)
- G5: what ageing threshold marks stock as sitting too long? (EP-22-S5)
- D7 is decided: one shop, no branches; stock belongs to the shop (EP-22-S1, S3, S10).
- Which pieces count in "With QC": draft only, or with_owner too? (EP-22-S3, S8)
