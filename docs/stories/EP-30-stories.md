# EP-30: Lead conversion · stories

Epic document: [EP-30 Lead conversion](../epics/EP-30-lead-conversion.md)

Role note: stories where the server stores, derives, refreshes or audits on its own use "System". Staff and the owner convert leads; karigars never see leads and every operation here refuses them (epic section 13). v1 has no holds: linking a line to a piece records the piece id for reference only, the piece stays `in_stock` and anyone can still sell it (BR-30-3). The mockup 18 button "Hold TAG-8841 for them", the "Hold it and go to sell" card and the line "It leaves the showcase and other quotes cannot see it" are out of scope; these stories replace them with a link action. No amount is read or shown. Weights are integers in units of 0.0001 g and shown to 4 decimals, so the mockup's "41.590 g" is shown as "41.5900 g". The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff) and Lakshmi Devi · KG-01 (Karigar). The worked example is the Sharma wedding lead LD-2026-208 from Ramesh Sharma (CU-004), after it has been kept under EP-29-S9, with two lines: "Temple Haram · Chettinad · ×2", around 80.0000 g each, and "Kundan Choker · ×1" with no weight given. TAG-8841 is the Antique Kundan Choker, 22K, gross 48.6500 g, pure gold 41.5900 g.

---

## EP-30-S1: System can store a route per lead line

- **Story ID:** EP-30-S1
- **Status:** Not started
- **Title:** System can store a route per lead line
- **As a:** System
- **I want:** `lead_items` to carry a route kind (`stock`, `make` or null), a piece id for a stock route, a job id for a make route, routed at and routed by, with database checks that keep these columns consistent
- **So that:** every line of a lead records how it will be met, and the piece id on a stock line is a reference that never touches the piece (FR-30-2, FR-30-6, BR-30-1, BR-30-3, BR-30-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when `lead_items` is inspected, then it has `routeKind` (nullable, accepting only `stock` and `make`), `routePieceId` (nullable, foreign key to `pieces`), `routeJobId` (nullable, foreign key to `karigar_jobs`), `routedAt` (UTC, nullable) and `routedBy` (nullable, foreign key to `users`).
  2. Given a line with `routeKind` `stock` and no `routePieceId`, or `routeKind` `make` and no `routeJobId`, or `routeKind` null with a piece id set, when it is written, then the database rejects it through a check constraint.
  3. Given the Kundan Choker line of LD-2026-208 is stored with `routeKind` `stock` and `routePieceId` TAG-8841, when `pieces` is read, then TAG-8841 has no column that points back to the lead, its `status` is still `in_stock` and its version is unchanged (BR-30-3).
  4. Given the prototype seed is loaded into staging (EP-02-S13), when the migration runs, then each seeded `LeadItem.route` of `{ kind: 'stock', pieceId }` or `{ kind: 'make', jobId }` is copied into the new columns, and no `heldForLeadId` value is carried over.
  5. Given a line approximate weight of 80 g, when it is read back, then `approxWeightG` is the integer `800000`, and the route columns do not change it.
- **Rules enforced on the server:** Check constraints on route kind and the matching id column. `routePieceId` references `pieces`, `routeJobId` references `karigar_jobs`, `routedBy` references `users`. A job id may route at most one lead line (unique partial index on `routeJobId`). Every update of a line goes through the parent lead's version check (EP-02-S14). No column on `pieces` refers to a lead.
- **Live events emitted / consumed:** None. Storing the columns publishes nothing.
- **Audit entry written:** No. Table rules only; each route change is audited by EP-30-S9.
- **Data changes:** Migration on `lead_items` (EP-02-S7, EP-28-S1) adds `routeKind`, `routePieceId`, `routeJobId`, `routedAt`, `routedBy`, the check constraints and the unique partial index on `routeJobId`. Seed migration copies prototype routes. Ports `LeadRoute` from `src/types/jewellery.ts` into the shared package without `Piece.heldForLeadId`.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: `approxWeightG` stays an integer in units of 0.0001 g. Time: `routedAt` stored in UTC, shown in Asia/Kolkata. Open question: if one line can link several pieces (for example a pair of bangles tagged separately), the single `routePieceId` column becomes a child table; this story stores one piece per line until that is decided.
- **Depends on:** EP-02-S1, EP-02-S7, EP-02-S13, EP-02-S14, EP-28-S1, EP-22-S1, EP-19-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S2: System can derive the lead state from its routed lines

- **Story ID:** EP-30-S2
- **Status:** Not started
- **Title:** System can derive the lead state from its routed lines
- **As a:** System
- **I want:** one server function, called inside every route, unroute and make transaction, that sets the lead state from its lines: `opened` to `being_worked` on the first routed line, `being_worked` to `converted` when at least one line exists and every line is routed, and `converted` back to `being_worked` when a line is unrouted
- **So that:** the lead state and its routes can never drift apart, and "converted" always means every item has a way to be met (FR-30-7, FR-30-8, BR-30-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 is `opened` with both lines unrouted, when the Kundan Choker line is routed, then in the same transaction the lead becomes `being_worked`, `takenBy` is set to the caller if it was empty, `takenAt` is the server time, and the pending SLA timer is cancelled (EP-10-S6).
  2. Given LD-2026-208 is `being_worked` with the choker routed, when the Temple Haram line is routed to make, then the lead becomes `converted` in the same transaction (epic acceptance criterion 3).
  3. Given LD-2026-208 is `converted`, when the choker line is unrouted, then the lead becomes `being_worked` in the same transaction (epic acceptance criterion 4).
  4. Given a lead with no lines, when the function runs, then the state does not become `converted`, matching `isFullyRouted` in `src/domain/leads.ts`.
  5. Given the line update succeeds but the lead version has changed since it was read, when the transaction commits, then the whole operation is rolled back with the EP-02-S14 conflict and neither the line nor the lead changes.
- **Rules enforced on the server:** The function is internal and never called from a browser. It runs under the lead row lock taken by the calling operation (EP-03-S6). A `lost` or `needs_glance` lead is never changed by it; the callers refuse first. Its only outputs are `being_worked` and `converted`. The SLA timer is cancelled only on the move out of `opened`. Ports `settleLeadState` from `src/store/transitions.ts` and `isFullyRouted` from `src/domain/leads.ts` into the shared package.
- **Live events emitted / consumed:** Emitted after commit, only when the state changes: "Lead arrived / passed its SLA" carrying the new state, through EP-28-S13, as for every other lead state change, so open inboxes move the row. EP-30 adds no event of its own (README gap G26 lists none for routing). Consumed: none.
- **Audit entry written:** Yes, as part of the line entry written by EP-30-S9: lead state before and after are recorded on the `line_linked_stock`, `line_routed_make` or `line_unlinked` entry. No separate lead entry.
- **Data changes:** Updates `leads.state`, `takenBy`, `takenAt` and `version`; cancels the pending SLA job row (EP-10-S6). No new tables.
- **UI reference:** No screen. The result is shown on `docs/ux/mockups/18-convert-lead.svg`, route `lead-convert`, by EP-30-S6, and on `docs/ux/mockups/12-state-lifecycles.svg` (lead fork, without its "Held for a customer" segment).
- **Non-functional checks:** Concurrency: the route and the lead state change share one transaction; two staff routing the last two lines at once both commit under the lock in turn and the lead ends `converted` once, never stuck in `being_worked` (epic section 13). Time: `takenAt` from the server clock in UTC. Open question: whether a line whose linked piece was sold still counts as routed; this function counts any line with a route kind, and changes only if that question is answered otherwise.
- **Depends on:** EP-30-S1, EP-28-S1, EP-28-S10, EP-28-S13, EP-10-S6, EP-02-S14, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S3: Staff can see matching in-stock pieces for a line

- **Story ID:** EP-30-S3
- **Status:** Not started
- **Title:** Staff can see matching in-stock pieces for a line
- **As a:** Staff
- **I want:** to open `lead-convert` for a lead and see, under each unrouted line, the in-stock pieces whose kind matches the line and whose pure gold or gross lies within 20% of the line's approximate weight when one is given
- **So that:** I can tell at a glance which items are already in the showcase and which are best made fresh (FR-30-1, FR-30-11, BR-30-1, BR-30-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 is `opened` and TAG-8841 (Antique Kundan Choker) is `in_stock`, when Rajesh Verma opens `lead-convert` with `leadId` LD-2026-208, then the heading reads "Sharma wedding · what happens to this lead?", the subtitle reads "Ramesh Sharma · 2 Temple Harams and 1 Kundan Choker · needed by 20 Nov", and the choker line reads "TAG-8841 matches what they described · 41.5900 g, in the showcase" with "already here — no need to make it".
  2. Given no in-stock piece has a kind that matches "Temple Haram", when the screen loads, then that line reads "around 80.0000 g each · nothing like it in stock right now" with "best made fresh", and "Make it — order to karigar" is the primary action.
  3. Given a line "Polki Choker" at 45.5000 g (`455000` units) and in-stock Polki chokers with pure gold 36.4000 g, 54.6000 g and 54.6001 g, when the matches are computed, then the first two are listed and the third is not, because the test is 5 × |weight − 455000| ≤ 455000 on integers, against either pure gold or gross.
  4. Given a piece is `billed`, `scrapped`, `stopped`, `draft` or `with_owner`, when matches are computed, then it is not listed; a piece already linked to another lead's line is still listed, because no line reserves a piece (FR-30-3).
  5. Given Vijay Kumar (Karigar) calls the matching pieces read for any line, when it reaches the server, then it is refused through EP-05-S2 and returns no piece or lead data.
- **Rules enforced on the server:** List matching pieces is Staff and Owner only (EP-05-S2). Suggestions are computed on the server from `pieces.status = in_stock`, using the prototype `stockMatches` kind rule (case-insensitive containment either way, or every word of the line name found in the piece kind) and the 20% window in integer units. A line with no approximate weight matches on kind alone. Matches are ordered by closeness to the approximate weight, then by tag. The read returns tag, kind, purity, gross and pure gold in integer units; no value or price field. Read lead routing returns lines, routes, the routed count and the lead state.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" and "Piece scrapped" (proposed, G26) to drop a gone piece from the suggestions; "Parcel released into stock" (proposed, G26) to refetch, so newly released pieces can appear. Emitted: none.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds List matching pieces and Read lead routing to the shared contract. Moves `src/components/leads/ConvertLead.tsx` off `useStore()` onto the EP-08 data layer and ports `stockMatches` to the server.
- **UI reference:** `docs/ux/mockups/18-convert-lead.svg` ("TWO WAYS TO MEET IT · PER ITEM, SO A LEAD CAN SPLIT BOTH WAYS", "around 80 g each · nothing like it in stock right now", "best made fresh", "TAG-8841 matches what they described · 41.590 g, in the showcase", "already here — no need to make it"), route `lead-convert`. Weights show to 4 decimals in v1.
- **Non-functional checks:** Performance: `lead-convert` with its suggestions loads under 2 seconds (epic section 13). Precision: the 20% window is computed on integers in units of 0.0001 g, never on floats. Security: Staff and Owner only; karigars never see leads. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Open question A4: whether a piece with an open edit proposal is listed and can be linked.
- **Depends on:** EP-30-S1, EP-22-S1, EP-22-S3, EP-22-S7, EP-28-S6, EP-05-S2, EP-08-S1, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S10, EP-08-S11, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S4: Staff can link a line to an in-stock piece without reserving it

- **Story ID:** EP-30-S4
- **Status:** Not started
- **Title:** Staff can link a line to an in-stock piece without reserving it
- **As a:** Staff
- **I want:** to pick one of the suggested pieces for an unrouted line and press "Link TAG-8841 to this line" (proposed wording, replacing "Hold TAG-8841 for them"), so the line is routed to stock with that piece id while the piece stays in the showcase
- **So that:** the lead records that this item will come from stock, and no sale anywhere in the shop is blocked by it (FR-30-2, FR-30-3, FR-30-4, FR-30-5, BR-30-3, BR-30-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 is `opened` and TAG-8841 is `in_stock`, when Rajesh Verma links TAG-8841 to the Kundan Choker line, then the line has `routeKind` `stock`, `routePieceId` TAG-8841 and `routedBy` Rajesh, the lead is `being_worked`, and TAG-8841 is still `in_stock` with an unchanged version on every staff screen (epic acceptance criterion 1).
  2. Given LD-2026-208 is still `needs_glance`, when Deepak Rao tries to link a piece, then the server refuses with "Check and keep this lead before converting it." and nothing changes (epic acceptance criterion 5).
  3. Given Rajesh has already linked the choker line, when Deepak links another piece to the same line from a screen loaded earlier, then the server refuses with "That line has already been routed." and the first link stays (epic acceptance criterion 6).
  4. Given the chosen piece was billed after the screen loaded, when Rajesh presses the link button, then the server refuses with "TAG-8841 is not in stock." and the line stays unrouted.
  5. Given the line has quantity 2, when a link is attempted, then the server refuses with "A link covers one piece. This line asks for 2, so make it." (adapted from the prototype) until the open question on splitting quantity is decided; and after a successful link the line shows "Not reserved. Anyone can still sell TAG-8841." (proposed wording).
- **Rules enforced on the server:** Route line to stock is Staff and Owner only (EP-05-S2). It refuses a `needs_glance` lead with the shared guard from EP-29-S9, a `lost` lead with "This lead is closed." (proposed), a routed line with "That line has already been routed.", and a piece not `in_stock` with "{id} is not in stock.". The piece row is read, not locked or written; there is no "already held" refusal and no `heldForLeadId`. The line update, the lead state from EP-30-S2 and the audit entry run in one transaction under the lead row lock (EP-03-S6). The line must belong to the lead in the request. Deduplicated by idempotency key (EP-03-S8).
- **Live events emitted / consumed:** Emitted after commit through EP-30-S2 when the lead state changes: "Lead arrived / passed its SLA" carrying `being_worked`. No piece event, because the piece does not change. Consumed: "Piece billed by one staff member" to disable the link button for a piece that has just been sold.
- **Audit entry written:** Yes, through EP-30-S9: actor, time, entity (lead id and line id), action `line_linked_stock`, after (piece id), lead state before and after.
- **Data changes:** Updates `lead_items` route columns and `leads.state`, `version`. Adds Route line to stock to the shared contract. Ports `routeLeadItemToStock` from `src/store/transitions.ts` without the hold part.
- **UI reference:** `docs/ux/mockups/18-convert-lead.svg` ("Kundan Choker · ×1", "Sell from stock"), route `lead-convert`. The mockup's "Hold TAG-8841 for them" and "Hold it and go to sell" are replaced by the link action and the not-reserved line; the replacement is not yet designed.
- **Non-functional checks:** Concurrency: two staff linking the same line at once, one succeeds and the other sees "That line has already been routed." (epic section 13); a link racing a sale of the same piece never blocks the sale. Security: Staff and Owner only. Audit: the link is appended with actor and time. Open questions: whether a quantity 2 line can be split one from stock and one made, and whether one line can link several pieces; A4, whether a piece with an open edit proposal can be linked.
- **Depends on:** EP-30-S1, EP-30-S2, EP-30-S3, EP-29-S9, EP-22-S1, EP-05-S2, EP-03-S4, EP-03-S6, EP-03-S8, EP-08-S5, EP-08-S6, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S5: Staff can send a line to make through an order copy

- **Story ID:** EP-30-S5
- **Status:** Not started
- **Title:** Staff can send a line to make through an order copy
- **As a:** Staff
- **I want:** to press "Make it — order to karigar" on an unrouted line, land on `order-copy` with `leadId` and `itemId`, see the line's quantity, target weight and the lead's reference images filled in, and when I press "Send the order copy" have the line routed to make with the new job in the same transaction
- **So that:** a made item becomes a karigar job with the lead attached, and the customer's request is tracked until the piece is ready (FR-30-6, BR-30-1, BR-30-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 is `being_worked` with the choker linked, when Rajesh Verma presses "Make it — order to karigar" on the Temple Haram line, then `order-copy` opens with the line "From the Sharma lead · 2 × Temple Haram, Chettinad · this becomes a job on the karigar's phone", "How many" 2, "Finished piece should weigh" "80.0000 g" and the lead's photos attached.
  2. Given Rajesh picks Lakshmi Devi · KG-01 and due date 17 Nov 2026 and presses "Send the order copy", when EP-19-S2 commits, then in the same transaction the order copy stores `leadId` LD-2026-208 and `leadItemId` of the haram line, the line has `routeKind` `make` and `routeJobId` the new MO- job, and the lead becomes `converted` (epic acceptance criterion 3).
  3. Given the send succeeds, when the screen returns to `lead-convert` with `sent` set to the job id, then it shows "Order copy sent. MO-2026-NNN is on Lakshmi Devi's phone, waiting to be accepted." and the line shows "Order copy sent as MO-2026-NNN to Lakshmi Devi".
  4. Given Deepak Rao routed the same line while Rajesh was filling the form, when Rajesh sends, then the server refuses with "That line has already been routed.", and no order copy, job or metal pool entry is created.
  5. Given the lead is `needs_glance`, when "Make it — order to karigar" is shown, then it is disabled, and a direct send with that `leadId` is refused with "Check and keep this lead before converting it."
- **Rules enforced on the server:** Route line to make runs only inside the EP-19-S2 create transaction, never on its own from a browser. The lead and line checks (not `needs_glance`, not `lost`, line belongs to lead, line not routed) run under the lead row lock before the pool lock; the lock order is lead, then pool, then karigar (extends EP-18-S5). If any check fails the whole create rolls back, so no gold is issued. The job payload sent to the karigar carries no lead id, customer name or phone (EP-19-S5). Prefilled values are suggestions; the server stores what is sent.
- **Live events emitted / consumed:** Emitted after commit through EP-19-S2: "Karigar job status changed" and "Metal pool changed"; through EP-30-S2 when the state changes: "Lead arrived / passed its SLA". Consumed: "Metal pool changed" on `order-copy`, so the gold available is current when the line is sent (epic section 11).
- **Audit entry written:** Yes: `order_copy_sent` through EP-19-S2 with the lead id, and `line_routed_make` through EP-30-S9 with actor, time, lead id, line id, job id and lead state before and after.
- **Data changes:** Updates `lead_items` route columns and `leads.state`, `version` inside the EP-19-S2 transaction; `order_copies.leadId` and `leadItemId` are set. Adds the lead and line fields to Create Order copy and job in the shared contract. Ports the lead branch of `createOrderCopyAndJob` from `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/18-convert-lead.svg` ("Make it — order to karigar", "Build the order copy"), route `lead-convert`; `docs/ux/mockups/19-order-copy-builder.svg` ("From the Sharma lead · 2 × Temple Haram, Chettinad", "Finished piece should weigh", "Send the order copy"), route `order-copy`. Weights show to 4 decimals in v1.
- **Non-functional checks:** Concurrency: routing the line and creating the job share one transaction; a line can be sent to make once only. Precision: the prefilled 80 g is `800000` units and shown as "80.0000 g". Security: the karigar never receives the customer or the lead. Open decision D8 and open question: whether the customer is told when the made piece is ready, by whom and through which channel; nothing is sent to the customer in this story.
- **Depends on:** EP-30-S1, EP-30-S2, EP-30-S3, EP-19-S2, EP-19-S3, EP-19-S4, EP-19-S5, EP-18-S5, EP-18-S10, EP-29-S9, EP-08-S5, EP-08-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S6: Staff can see the lead convert once every line is routed

- **Story ID:** EP-30-S6
- **Status:** Not started
- **Title:** Staff can see the lead convert once every line is routed
- **As a:** Staff
- **I want:** the foot of `lead-convert` to show how many lines are routed and the lead state, and to say the lead is converted when the last line is routed, with the inbox row moving the same way
- **So that:** I know when a customer's request is fully covered and nothing is left unplanned (FR-30-7, FR-30-11, BR-30-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 with only the choker linked, when `lead-convert` is shown, then the foot reads "1 of 2 lines routed" and "The lead is only converted once every item on it has been routed one way or the other.", and the state chip reads "being worked".
  2. Given the haram line is then sent to make, when Rajesh Verma returns to `lead-convert`, then the foot reads "2 of 2 lines routed" and "Every item has been routed one way or the other, so this lead is converted.", and the state chip reads "converted" (epic acceptance criterion 3).
  3. Given Deepak Rao has `leads` open on "Being worked", when LD-2026-208 becomes `converted`, then within about 1 second the row leaves "Being worked" and shows under "All" as converted, with no reload.
  4. Given the lead is `converted`, when the screen loads, then "Mark lost" is not shown, and a mark-lost call is refused with "A converted lead cannot be marked lost." (EP-28-S11).
  5. Given LD-2026-208 is `opened` with no line routed, when the screen loads, then the foot reads "0 of 2 lines routed" and "I am working on this" is offered (EP-28-S10).
- **Rules enforced on the server:** Read lead routing is Staff and Owner only (EP-05-S2) and returns the routed count, the line count and the state computed by EP-30-S2; the browser does not compute the state itself. Converted leads refuse further routing through the already-routed rule.
- **Live events emitted / consumed:** Consumed: "Lead arrived / passed its SLA" carrying the new state, on `leads` and on any other open `lead-convert` for the same lead. Emitted: none of its own; the state event comes from EP-30-S2.
- **Audit entry written:** No. This story only shows state; the change is audited by EP-30-S9.
- **Data changes:** None in the product database. The convert screen's foot and state chip read from Read lead routing.
- **UI reference:** `docs/ux/mockups/18-convert-lead.svg` ("This lead splits: the choker is held from stock, the two harams go to a karigar. One lead, two paths, both tracked against it.", "The lead is only "converted" once every item on it has been routed one way or the other."), route `lead-convert`; the v1 wording says "linked" instead of "held from stock". `docs/ux/mockups/16-lead-inbox.svg`, route `leads`.
- **Non-functional checks:** Performance: the state change shows on other staff screens within about 1 second. Availability: a dropped connection shows "Reconnecting…" and the state catches up on return (EP-08-S10). Audit: none here.
- **Depends on:** EP-30-S2, EP-30-S3, EP-30-S4, EP-30-S5, EP-28-S7, EP-28-S11, EP-28-S13, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S7: Staff can unlink a stock line

- **Story ID:** EP-30-S7
- **Status:** Not started
- **Title:** Staff can unlink a stock line
- **As a:** Staff
- **I want:** to press "Unlink" (proposed wording, replacing the prototype "Release the hold") on a line routed to stock, so the line is unrouted and I can pick another piece or send it to make
- **So that:** a line can be changed when the customer changes their mind or the piece is gone, and a converted lead goes back to being worked (FR-30-8, BR-30-2, BR-30-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 is `converted` with the choker linked to TAG-8841, when Rajesh Verma unlinks the choker line, then the line has `routeKind`, `routePieceId`, `routedAt` and `routedBy` null, the lead is `being_worked`, and the foot reads "1 of 2 lines routed" (epic acceptance criterion 4).
  2. Given that unlink, when TAG-8841 is read, then its status and version are unchanged, because nothing changes on the piece.
  3. Given the haram line is routed to make, when an unlink is called on it, then the server refuses with "Only a line linked to stock can be unlinked." (proposed wording) and the job is unchanged.
  4. Given the line is not routed, when an unlink is called, then the server refuses with "That line is not linked to stock." (adapted from the prototype "That line is not held from stock.").
  5. Given the lead is `lost`, when an unlink is called, then the server refuses with "This lead is closed." (proposed) and nothing changes.
- **Rules enforced on the server:** Delete line route is Staff and Owner only (EP-05-S2). Allowed only for a `stock` line on a `being_worked` or `converted` lead. The line update, the lead state from EP-30-S2 and the audit entry run in one transaction under the lead row lock (EP-03-S6). No piece row is read or written. A make line is unrouted only through a job change in EP-19, not here.
- **Live events emitted / consumed:** Emitted after commit through EP-30-S2 when the state changes: "Lead arrived / passed its SLA" carrying `being_worked`. Consumed: none.
- **Audit entry written:** Yes, through EP-30-S9: actor, time, entity (lead id and line id), action `line_unlinked`, before (piece id), after none, lead state before and after.
- **Data changes:** Clears the `lead_items` route columns; updates `leads.state`, `version`. Adds Delete line route to the shared contract. Replaces the prototype `releaseHold` with an unlink that has no hold part.
- **UI reference:** Not yet designed. The unlink control is not drawn on `docs/ux/mockups/18-convert-lead.svg`; it sits on the linked line of route `lead-convert`.
- **Non-functional checks:** Concurrency: an unlink and a link on the same line at once are serialised by the lead row lock; one sees the line in its new state. Audit: the unlink is appended with actor and time. Open question: whether cancelling a make line's job (EP-19-S11) should unroute the line; this story leaves make lines alone.
- **Depends on:** EP-30-S2, EP-30-S4, EP-05-S2, EP-03-S4, EP-03-S6, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S8: Staff can see when a linked piece is sold to someone else

- **Story ID:** EP-30-S8
- **Status:** Not started
- **Title:** Staff can see when a linked piece is sold to someone else
- **As a:** Staff
- **I want:** a line linked to a piece that is billed or scrapped to show the piece as gone within about a second, with other matches and "Make it — order to karigar" offered beside it
- **So that:** I learn at once that the piece I meant for this customer has left, and I can pick another or have it made before I promise anything (FR-30-9, BR-30-3, BR-30-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 is linked to the Sharma choker line and Rajesh Verma has `lead-convert` open, when Deepak Rao sells TAG-8841 to a walk-in customer, then the sale succeeds through EP-26, and within about 1 second Rajesh's line reads "TAG-8841 has been sold. Pick another piece or make it." (proposed wording) with no reload (epic acceptance criterion 2).
  2. Given that line, when it is shown, then "Unlink" and the other in-stock matches for "Kundan Choker" are offered, and pressing "Make it — order to karigar" is allowed only after the line is unlinked.
  3. Given the owner scraps a linked piece, when "Piece scrapped" (proposed, G26) arrives, then the line reads "<tag> has been scrapped. Pick another piece or make it." (proposed wording).
  4. Given Rajesh opens `lead-convert` later or after reconnecting, when the lines load, then a line whose piece is `billed` or `scrapped` shows as gone from the server read, not only from a missed event (EP-07-S7).
  5. Given the linked piece goes `stopped` under EP-24, when the line loads, then it reads "<tag> is stopped and cannot be sold right now." (proposed wording) and is not marked gone.
- **Rules enforced on the server:** Read lead routing returns, for each stock line, the linked piece's current status, so the gone mark is derived on the server. A linked line never stops a sale: EP-26 neither reads nor writes lead lines, and the double-sell rule stays in EP-22-S6 and EP-26-S3 (BR-30-6). Until the open question is decided, a line whose piece is gone keeps its route and still counts toward converted.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" and "Piece scrapped" (proposed, G26), filtered on the client to the piece ids linked on the open lead; "Problem raised on a job or piece" (proposed, G26) for the stopped line. Emitted: none.
- **Audit entry written:** No. The sale and the scrap are audited by EP-26-S12 and EP-27; the line itself does not change.
- **Data changes:** None in the product database. Adds the linked piece status to the Read lead routing response.
- **UI reference:** Not yet designed. The gone state of a linked line is not drawn on `docs/ux/mockups/18-convert-lead.svg`; it sits on route `lead-convert`.
- **Non-functional checks:** Performance: a sold linked piece shows as gone within about 1 second (epic section 13). Concurrency: two staff selling the linked piece at once, only one sale succeeds (EP-26-S3), and the line shows the winner's sale. Availability: "Reconnecting…" while the connection is down and catch-up on return (EP-08-S10). Open question: whether a line whose linked piece was sold stays routed or returns to unrouted.
- **Depends on:** EP-30-S3, EP-30-S4, EP-30-S7, EP-22-S6, EP-22-S7, EP-26-S2, EP-26-S3, EP-26-S11, EP-07-S7, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-30-S9: System can audit every link, unlink and route

- **Story ID:** EP-30-S9
- **Status:** Not started
- **Title:** System can audit every link, unlink and route
- **As a:** System
- **I want:** an append-only audit entry in the same transaction as each link (`line_linked_stock`), unlink (`line_unlinked`) and make route (`line_routed_make`), with actor, role, time, lead id, line id, piece or job id and the lead state before and after
- **So that:** the owner can see who decided how each item would be met, when, and which change converted or reopened a lead (FR-30-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma links TAG-8841 to the Sharma choker line, when it commits, then a `line_linked_stock` entry holds actor Rajesh, role Staff, time, LD-2026-208, the line id, after piece id TAG-8841, and lead state before `opened` and after `being_worked`.
  2. Given the haram line is sent to make, when the EP-19-S2 transaction commits, then a `line_routed_make` entry holds the line id, the new MO- job id and lead state after `converted`, beside the `order_copy_sent` entry.
  3. Given Rajesh unlinks the choker, when it commits, then a `line_unlinked` entry holds before piece id TAG-8841, after none, and lead state before `converted` and after `being_worked`.
  4. Given the operation rolls back, for example on "That line has already been routed.", when the log is read, then no line entry exists for it.
  5. Given Sanjay Seth filters the security log by kind group "Leads" and entity LD-2026-208, when the list loads, then these entries appear newest first; given a staff user reads the log, then it is refused (EP-06-S12).
- **Rules enforced on the server:** Entries are written through EP-06-S2 inside the operation's transaction and cannot be updated or deleted (EP-06-S1). Actor and time come from the session and the server clock (EP-03-S3). Entries hold the customer id through the lead, never the customer name or phone. The three new kinds join the "Leads" kind group from EP-28-S14.
- **Live events emitted / consumed:** None. Audit writes publish nothing.
- **Audit entry written:** Yes: actor, role, time, entity (lead id and line id), action (`line_linked_stock`, `line_unlinked`, `line_routed_make`), before, after (piece id or job id), lead state before and after.
- **Data changes:** Inserts into `audit_entries`. Adds the three kinds to the audit kind list in the shared package; migration widens the kind check constraint if it is a database enum.
- **UI reference:** The security log screen from EP-06-S9 to EP-06-S11. No new screen.
- **Non-functional checks:** Audit: every link, unlink and route is appended with actor and time (epic section 13). Personal data: entries store ids only, so an erasure (EP-17-S13) leaves no personal data in the log. Time: entry times in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-30-S4, EP-30-S5, EP-30-S7, EP-28-S14, EP-19-S14, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Is the customer told when a made piece is ready (mockup 18 "so the customer can be told"), by whom and through which channel (D8)? (EP-30-S5)
- Does a line whose linked piece was sold stay routed (counting toward converted), or return to unrouted? (EP-30-S2, S8)
- Can a line with quantity 2 be split, one from stock and one made? (EP-30-S4)
- Can one line link several pieces (for example a pair of bangles tagged separately)? (EP-30-S1, S4)
- A4: can a piece with an open edit proposal be linked to a line? (EP-30-S3, S4)
