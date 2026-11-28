# EP-31: Staff Today home · stories

Epic document: [EP-31 Staff Today home](../epics/EP-31-staff-today-home.md)

Role note: stories where the server builds, ranks or computes on its own use "System". Staff land on `today`; the owner may open it to see the staff view but lands on `decisions` (EP-32); karigars never see it and every read here refuses them. This screen only reads, so no story here writes an audit entry or emits an event. v1 has no holds, so the mockup 02 card "Quotation QT-2026-0211 expires today" is out of scope and no story builds a quotation or hold card. No amount is read or shown. Weights are integers in units of 0.0001 g and shown to 4 decimals, so the mockup's "1,847.2 g" is shown as "1,847.2000 g" and "212.4 g" as "212.4000 g"; parcel gaps are shown in mg as on mockup 02 ("138 mg short"). The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff), and the karigars Mahesh Soni, Lakshmi Devi · KG-01 and Vijay Kumar. The worked examples are BATCH-2026-044 from Mahesh Soni, stopped 138 mg short with 12 pieces held back, and BATCH-2026-043 from Lakshmi Devi with 9 pieces still untagged.

---

## EP-31-S1: System can build the "needs you now" cards for a staff member

- **Story ID:** EP-31-S1
- **Status:** Not started
- **Title:** System can build the "needs you now" cards for a staff member
- **As a:** System
- **I want:** one Read Today cards operation that, for the signed-in user, collects every waiting item from the pipeline tables (stopped parcels, open problems on jobs and pieces, open parcels, leads near or past the SLA) and returns them as cards, each with a stable key, a kind, a tone (`stop`, `wait` or `gold`), a title, a detail line and one action (label, route id and parameters)
- **So that:** Today is built from the server in one call instead of from the whole state in the browser, and only cards the user may act on are returned (FR-31-2, FR-31-8, BR-31-1, BR-31-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is `stopped` with verdict `mismatch`, BATCH-2026-043 is `open` with 9 pieces untagged, and one lead has 1 hour left on its SLA, when Rajesh Verma calls Read Today cards, then one response holds exactly three cards with keys BATCH-2026-044, BATCH-2026-043 and the lead id.
  2. Given each card in the response, when it is inspected, then it has `key`, `kind` (one of `parcel_mismatch`, `parcel_problem`, `job_problem`, `piece_problem`, `parcel_unweighed`, `parcel_untagged`, `parcel_ready`, `lead_sla`, `more_leads`), `tone`, `title`, `detail` and an `action` with a `label` and a route id from `parcel-match`, `parcel-arrival`, `parcel-tag`, `lead-review`, `lead-convert`, `leads` or `stock`.
  3. Given the response for a staff caller, when any card is inspected, then no action points to an owner-only route such as `parcel-clear`, and the mismatch card's action opens the read view of `parcel-match` (BR-31-3).
  4. Given Sanjay Seth (Owner) calls Read Today cards, when it returns, then he gets the same card set a staff member would see; given Vijay Kumar (Karigar) calls it, then it is refused through EP-05-S2 and returns no card.
  5. Given the pipeline holds 40 parcels, 60 leads and 10 open problems on staging, when Read Today cards is called, then it answers in under 2 seconds on a shop connection.
- **Rules enforced on the server:** Read Today cards is Staff and Owner only (EP-05-S2). Cards are built on the server from `parcels`, `problems`, `leads` and `pieces`; the browser does not compute which items are waiting. Card text uses the karigar and customer names from the server, gaps from the EP-23 verdict and the SLA phase from EP-28-S8. Each card kind is built by its own story (EP-31-S4, S5, S6); this story owns the response shape and the single call. No value or price field is returned.
- **Live events emitted / consumed:** None. This story is the read; live refresh is EP-31-S11.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Today cards and the card shape to the shared contract. Ports the card building in `src/components/home/StaffToday.tsx` and `gapPhrase`, `plural` from `src/components/home/util.ts` to the server.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("NEEDS YOU NOW · 3"), route `today`.
- **Non-functional checks:** Performance: one aggregated query, under 2 seconds (epic section 13). Security: only cards the caller may act on; no owner-only action offered to staff. D7 is decided: one shop, no branches; the read covers the shop.
- **Depends on:** EP-03-S1, EP-03-S2, EP-03-S3, EP-05-S2, EP-21-S1, EP-21-S10, EP-23-S2, EP-24-S1, EP-28-S1, EP-28-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S2: System can rank the cards by the decided rule

- **Story ID:** EP-31-S2
- **Status:** Not started
- **Title:** System can rank the cards by the decided rule
- **As a:** System
- **I want:** one server ranking function that orders the cards from EP-31-S1 by an ordered list of card kinds, then by a tie-break within each kind, with the kind order held in one place in the shared package
- **So that:** the most urgent work is first and the order is the same on every screen, once the owner decides between leads first and stops first (FR-31-7, BR-31-4, epic acceptance criterion 6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the decided kind order, when Read Today cards returns, then cards appear in that order of kinds, and the browser does not re-sort them.
  2. Given the rule is "stops first" (prototype order), when BATCH-2026-044 is stopped and a lead is past its SLA, then the order is `parcel_mismatch` or `parcel_problem`, then `job_problem` and `piece_problem`, then `parcel_unweighed`, `parcel_untagged` and `parcel_ready`, then `lead_sla` and `more_leads`.
  3. Given the rule is "leads first" (SCOPE-ANALYSIS §3), when the same items are waiting, then the `lead_sla` and `more_leads` cards come before every parcel and problem card.
  4. Given two cards of the same kind, when they are ranked, then lead cards are ordered most overdue first by elapsed time, and parcel and problem cards oldest first by stopped or arrival time, with the key as the last tie-break so the order is stable between calls.
  5. Given the ranking tests run in CI, when both candidate rules are exercised, then the chosen rule passes and the order for a fixed seed matches a stored expected list.
- **Rules enforced on the server:** Ranking runs only on the server inside Read Today cards. The kind order is a constant in the shared package, not a setting, until the open question on the rule is answered. Ties never depend on database row order.
- **Live events emitted / consumed:** None. Ranking runs on each read; live refresh is EP-31-S11.
- **Audit entry written:** No. Ranking stores nothing.
- **Data changes:** None in the product database. Adds the ranking function and the kind order constant to the shared package.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("NEEDS YOU NOW · 3", card order), route `today`.
- **Non-functional checks:** Performance: ranking adds no extra query. Open question: the card ranking rule (leads first or stops first) must be decided before this story is done (epic acceptance criterion 6); the criteria above are written for either answer.
- **Depends on:** EP-31-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S3: Staff can land on Today after sign-in

- **Story ID:** EP-31-S3
- **Status:** Not started
- **Title:** Staff can land on Today after sign-in
- **As a:** Staff
- **I want:** to arrive on `today` straight after signing in, with the greeting "Good morning, Rajesh" (or afternoon or evening) and the date in Asia/Kolkata, and with the screen loaded from the EP-08 data layer
- **So that:** my day starts on a short list of what matters, not on a 42-row table (FR-31-1, BR-31-1, BR-31-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff) signs in, when the session is created, then the app opens route `today` (EP-04-S6), and Sanjay Seth (Owner) still lands on `decisions` and a karigar on `k-jobs`.
  2. Given it is 08:35 on 1 November 2026 in Asia/Kolkata, when `today` loads, then the heading reads "Good morning, Rajesh" and the line under it reads "Sunday, 1 November 2026", using the first name from the session.
  3. Given the server clock is 23:30 UTC on 31 October (05:00 on 1 November in Asia/Kolkata), when `today` loads, then the date reads "Sunday, 1 November 2026" and the greeting is "Good morning".
  4. Given Read Today cards has not answered, when the screen is shown, then a loading state appears (EP-08-S3); given the read fails, then the error and "Try again" appear (EP-08-S4).
  5. Given a karigar types the `today` route, when the app opens it, then the route is not offered and the karigar is sent to `k-jobs` (EP-08-S13).
- **Rules enforced on the server:** The landing route comes from the role in the session (EP-04-S6), not from the browser. The first name comes from Read Current session. "Today" and the greeting hour use Asia/Kolkata (EP-10-S10).
- **Live events emitted / consumed:** None. Landing reads only.
- **Audit entry written:** No. Sign-in is audited by EP-04-S14; opening a screen is not audited.
- **Data changes:** None in the product database. Moves `src/components/home/StaffToday.tsx` off `useStore()` onto the EP-08 data layer; `greetingFor` uses the Asia/Kolkata hour, not the browser's local hour.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("Good morning, Rajesh", "Sunday, 1 November 2026"), route `today`. The mockup's "Showroom staff · switch" is replaced by the account menu (EP-08-S14) and "counter opens in 25 minutes" is not built until shop hours exist (EP-13-S11).
- **Non-functional checks:** Performance: `today` loads under 2 seconds on a shop connection (BR-31-8). Time: greeting and date in Asia/Kolkata. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Security: the route is offered to Staff and Owner only.
- **Depends on:** EP-04-S6, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S12, EP-08-S13, EP-08-S17, EP-10-S10, EP-31-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S4: Staff can see stopped parcels, jobs and pieces as cards

- **Story ID:** EP-31-S4
- **Status:** Not started
- **Title:** Staff can see stopped parcels, jobs and pieces as cards
- **As a:** Staff
- **I want:** a `stop` card for each parcel stopped by a mismatch or a raised problem, and for each job or piece with an open problem, each saying who or what stopped it and that only the owner can start it again
- **So that:** I know which pieces are held back and why, and I do not try to release what only the owner can (FR-31-3, FR-31-4, FR-31-8, BR-31-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 from Mahesh Soni is `stopped` with verdict `mismatch`, a net gap of −1380 units and 12 tagged pieces, when Rajesh Verma opens `today`, then a card reads "Parcel from Mahesh Soni is 138 mg short" with detail "BATCH-2026-044 · 12 pieces held back from the showcase. Only the owner can release this. Sent to him 20 minutes ago." and the action "Open parcel" opens `parcel-match` for BATCH-2026-044 (epic acceptance criterion 1).
  2. Given a parcel is stopped by a raised problem rather than a mismatch, when `today` loads, then the card reads "Parcel BATCH-2026-045 from Lakshmi Devi is stopped" with detail "Someone raised a problem on it. Only the owner can start it again." and "Open parcel".
  3. Given Vijay Kumar raised "Two kemp stones cracked while setting. I need a replacement before I can finish." on MO-2026-118, when `today` loads, then a card reads "Vijay Kumar stopped job MO-2026-118" with that text followed by "Only the owner can start it again."
  4. Given Deepak Rao raised a problem on TAG-9012, when `today` loads, then a card reads "Deepak Rao stopped piece TAG-9012" and the action "Open piece" opens `stock` with `pieceId` TAG-9012.
  5. Given the owner has resolved BATCH-2026-044 (sent back, re-check or loss accepted), when `today` is read, then no card for it is returned.
- **Rules enforced on the server:** A parcel card is built only for `status = stopped` with no resolution. A parcel stopped by a problem is shown once, as a parcel card, not again as a problem card. Gap and piece count come from the server verdict (EP-23-S2). The detail never offers a release action to staff; the release controls stay owner-only (EP-23-S6). The job card action opens the job tracker only if the caller may read it; a karigar's job card is never returned to a karigar.
- **Live events emitted / consumed:** None in this story; EP-31-S11 consumes "Parcel stopped (mismatch or raised problem)" and "Problem raised on a job or piece" / "Problem cleared" (proposed, G26) to refresh these cards.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Builds the `parcel_mismatch`, `parcel_problem`, `job_problem` and `piece_problem` cards inside Read Today cards.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("Parcel from Mahesh Soni is 138 mg short", "BATCH-2026-044 · 12 pieces held back from the showcase", "Only the owner can release this. Request sent 09:12.", "Open parcel"), route `today`. Job and piece problem cards are not drawn; they reuse the same card.
- **Non-functional checks:** Precision: the gap is an integer in units of 0.0001 g, shown in mg ("138 mg short"). Security: no owner-only action offered to staff. Time: "Sent to him … ago" from the server `stoppedAt` in UTC.
- **Depends on:** EP-31-S1, EP-23-S2, EP-23-S6, EP-23-S7, EP-24-S1, EP-24-S3, EP-24-S4, EP-24-S5, EP-22-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S5: Staff can see parcels waiting to be weighed, tagged or matched

- **Story ID:** EP-31-S5
- **Status:** Not started
- **Title:** Staff can see parcels waiting to be weighed, tagged or matched
- **As a:** Staff
- **I want:** one card for each `open` parcel, saying whether it has not been weighed, how many pieces are still untagged, or that it is fully tagged and ready to match, with an action that opens the right intake step
- **So that:** parcels move through intake without someone having to check the parcels-in list (FR-31-5, FR-31-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-046 from Lakshmi Devi is `open` with no weighing, when Rajesh Verma opens `today`, then a `gold` card reads "BATCH-2026-046 from Lakshmi Devi has not been weighed" with detail "Weigh the whole parcel before anything is tagged." and the action "Weigh it" opens `parcel-arrival` for that parcel.
  2. Given BATCH-2026-043 is weighed, expects 21 pieces and has 12 tagged, when `today` loads, then a `wait` card reads "9 pieces still untagged in BATCH-2026-043" with detail "Lakshmi Devi's parcel · arrived 1 day ago. Tag them to finish reconciling the parcel weight." and "Tag pieces" opens `parcel-tag`.
  3. Given BATCH-2026-043 then has all 21 pieces tagged, when `today` is read, then the card reads "BATCH-2026-043 is fully tagged and ready to match" with detail "Lakshmi Devi's parcel · 21 pieces. Check it and release it to the showcase." and "Match and release" opens `parcel-match`.
  4. Given BATCH-2026-043 is released into stock, when `today` is read, then no card for it is returned.
  5. Given a parcel with 1 piece untagged, when the card is built, then it reads "1 piece still untagged", using the singular.
- **Rules enforced on the server:** One card per `open` parcel, never two. "Not weighed" means no weighing row (EP-21-S3). The expected and tagged counts come from the parcel manifest and saved tags (EP-21-S1). Stopped and released parcels are not open and get no card here. The action route follows the parcel's next step, as the prototype `parcelTarget` does.
- **Live events emitted / consumed:** None in this story; EP-31-S11 consumes "Parcel handed over by karigar", "Tag saved on a shared parcel" and "Parcel released into stock" (proposed, G26) to refresh these cards.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Builds the `parcel_unweighed`, `parcel_untagged` and `parcel_ready` cards inside Read Today cards; ports `parcelTarget` from `src/components/parcels/util.ts`.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("9 pieces still untagged in BATCH-2026-043", "Chettinad parcel from Lakshmi Devi · arrived yesterday", "Tag them to finish reconciling the parcel weight.", "Tag pieces"), route `today`. The "not weighed" and "ready to match" cards are not drawn; they reuse the same card.
- **Non-functional checks:** Time: "arrived … ago" from the server `arrivedAt` in UTC, shown relative to Asia/Kolkata now. Concurrency: counts come from committed tags only, so two staff tagging the same parcel see the same count.
- **Depends on:** EP-31-S1, EP-21-S1, EP-21-S2, EP-21-S3, EP-21-S6, EP-21-S10, EP-23-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S6: Staff can see leads near or past the SLA

- **Story ID:** EP-31-S6
- **Status:** Not started
- **Title:** Staff can see leads near or past the SLA
- **As a:** Staff
- **I want:** a card for each lead that is past its SLA or has 2 hours or less left, most overdue first, at most 3, and one "more leads" card for the rest
- **So that:** I open a lead before the owner is told, and the screen does not fill up with leads (FR-31-6, FR-31-8, BR-31-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the lead SLA is 8 hours and Ramesh Sharma's lead "Sharma wedding" has 1 hour left, when Rajesh Verma opens `today`, then a `wait` card reads "Ramesh Sharma's lead is close to the 8 h limit" with detail "Sharma wedding · arrived 7 hours ago. Open it before the owner is told." (epic acceptance criterion 2).
  2. Given a lead is past its SLA, when `today` loads, then a `stop` card reads "<customer>'s lead is past the 8 h limit" with detail ending "The owner has been told."
  3. Given a lead card for a lead in `needs_glance`, when it is shown, then the action is "Check it" and opens `lead-review`; for a lead in `opened` or `being_worked` the action is "Work it" and opens `lead-convert` with `leadId`.
  4. Given 5 leads are near or past the limit, when `today` loads, then the 3 with the longest elapsed time get cards and one more card reads "2 more leads are close to or past the limit" with detail "They are all in the inbox." and "See leads" opens `leads`.
  5. Given the owner changes the SLA from 8 to 6 hours (EP-13-S4), when `today` is read, then the window and the card text use 6 hours, and a lead with 3 hours left at 8 hours now shows as past the limit.
- **Rules enforced on the server:** The SLA phase and hours left come from EP-28-S8 on the server clock, with the SLA hours from settings (EP-13-S4). The warning window is 2 hours until A3 is decided. `converted` and `lost` leads are never shown. The cap of 3 and the "more leads" card are applied on the server. The customer name shown is the lead's own name, not erased personal data (EP-17-S13).
- **Live events emitted / consumed:** None in this story; EP-31-S11 consumes "Lead arrived / passed its SLA" and "Setting changed" (proposed, G26) to refresh these cards.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Builds the `lead_sla` and `more_leads` cards inside Read Today cards; ports the lead block of `StaffToday.tsx` and `slaState` from `src/domain/leads.ts` to the server.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg`, route `today`; `docs/ux/mockups/13-notifications-escalation.svg` (what staff see when a lead is late). The lead card is not drawn on mockup 02; it reuses the same card.
- **Non-functional checks:** Time: hours left from the server clock, in shop hours or clock hours as EP-28-S8 decides (A2). Open question A3: how long before the SLA staff see a lead card (prototype: 2 hours); the window is one constant so it can change without touching the card.
- **Depends on:** EP-31-S1, EP-31-S2, EP-28-S6, EP-28-S8, EP-28-S9, EP-28-S10, EP-29-S8, EP-30-S3, EP-13-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S7: Staff can start a sale, a parcel or a customer from the tiles

- **Story ID:** EP-31-S7
- **Status:** Not started
- **Title:** Staff can start a sale, a parcel or a customer from the tiles
- **As a:** Staff
- **I want:** three start tiles under "START SOMETHING": "Sell a piece" opening `stock-out`, "Receive a parcel" opening `parcel-arrival`, and "Add a customer" opening `customer-new`
- **So that:** the three most common jobs at the counter are one tap from the home screen (FR-31-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is on `today`, when he presses "Sell a piece", then `stock-out` opens with an empty sale.
  2. Given Rajesh is on `today`, when he presses "Receive a parcel", then `parcel-arrival` opens for a new parcel.
  3. Given Rajesh is on `today`, when he presses "Add a customer", then `customer-new` opens with an empty form.
  4. Given the tiles are shown, when they are read, then their hint lines are "Scan tags, record the bill.", "Weigh it before tagging." and "Name, phone and wishes.", with no mention of a quote or a price.
  5. Given the app is offline (EP-08-S11), when Rajesh presses a tile, then the route opens and its own offline state shows, and no action is sent.
- **Rules enforced on the server:** None of its own. The tiles only navigate; each target screen enforces its own rules (EP-26, EP-21, EP-17).
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Navigation is not audited.
- **Data changes:** None in the product database. Keeps the `Tile` component from `StaffToday.tsx`.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("START SOMETHING", "Sell a piece", "Receive a parcel", "Add a customer"), route `today`. The mockup hint "Scan tags, quote, bill." is replaced by "Scan tags, record the bill." because v1 has no quotes.
- **Non-functional checks:** Security: tiles are shown only to Staff and Owner, who may open all three routes (EP-08-S13).
- **Depends on:** EP-31-S3, EP-26-S4, EP-21-S2, EP-17-S3, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S8: Staff can see the showcase figures in grams and counts

- **Story ID:** EP-31-S8
- **Status:** Not started
- **Title:** Staff can see the showcase figures in grams and counts
- **As a:** Staff
- **I want:** one Read Showcase figures operation that returns pure gold on the floor, pieces I can sell today, pieces held back from the floor, pieces out today and gold out today, as integer sums and counts, shown under "THE SHOWCASE RIGHT NOW" and in "GOLD OUT TODAY"
- **So that:** I know how the showcase stands in grams and pieces without any money figure (FR-31-10, BR-31-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given 42 `in_stock` pieces whose pure gold sums to `18472000` units, when Rajesh Verma opens `today`, then "Pure gold on the floor" reads "1,847.2000 g" and "Pieces you can sell today" reads 42.
  2. Given 14 pieces are in `draft`, `with_owner` or `stopped`, when `today` loads, then "Held back from the floor" reads 14, and `billed` and `scrapped` pieces are not counted.
  3. Given 11 pieces carrying `2124000` units of pure gold were stocked out since midnight Asia/Kolkata, when `today` loads, then "Pieces out today" reads 11, "GOLD OUT TODAY" reads "212.4000 g", and the line under the figures reads "Pieces out today carry 212.4000 g of pure gold." (EP-26-S13).
  4. Given a stock-out at 23:50 on 31 October and one at 00:10 on 1 November, Asia/Kolkata, when `today` is read on 1 November, then only the 00:10 pieces are counted in pieces out today and gold out today.
  5. Given the response is inspected, when its fields are read, then it holds only counts and integer weights in units of 0.0001 g, and no field named or holding a rupee value.
- **Rules enforced on the server:** Read Showcase figures is Staff and Owner only (EP-05-S2). Sums are integer sums on the server over `pieces.status` and stock-outs (EP-22-S10, EP-26-S13); the browser does not add weights. "Today" starts at midnight Asia/Kolkata (EP-10-S10). No value field is returned.
- **Live events emitted / consumed:** None in this story; EP-31-S11 consumes "Piece billed by one staff member", "Edit applied" and "Parcel released into stock" (proposed, G26) to refresh these figures.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Showcase figures to the shared contract; replaces the browser selectors `pureGoldOnFloor`, `inStockPieces`, `heldBackPieces`, `piecesOutToday` and `goldOutToday` in `src/store/selectors.ts` with the server read.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("THE SHOWCASE RIGHT NOW", "Pure gold on the floor 1,847.2 g", "Pieces you can sell today 42", "Held back from the floor 14", "Pieces out today 11", "GOLD OUT TODAY 212.4 g"), route `today`. Weights show to 4 decimals in v1.
- **Non-functional checks:** Precision: every weight is an integer sum in units of 0.0001 g, formatted to 4 decimals only for display. Time: the day boundary is midnight Asia/Kolkata. Performance: the figures return in under 2 seconds. D7 is decided: the figures cover the shop.
- **Depends on:** EP-31-S3, EP-22-S1, EP-22-S10, EP-26-S13, EP-10-S10, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S9: Staff can see today's birthdays and anniversaries

- **Story ID:** EP-31-S9
- **Status:** Not started
- **Title:** Staff can see today's birthdays and anniversaries
- **As a:** Staff
- **I want:** a List Wishes due today read that returns customers whose `dob` or `anniversary` day and month fall on today in Asia/Kolkata and who have not been wished today, each with name, group, kind and "last bought" or purchase count, shown under "SAY HAPPY BIRTHDAY" with a "Message" action
- **So that:** no regular customer's birthday or anniversary passes unnoticed at the counter (FR-31-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra (VIP Bridal) has `dob` 1 November and last bought a Polki kada, when Rajesh Verma opens `today` on 1 November 2026, then a row reads "Priya Malhotra · birthday today" with "VIP Bridal · last bought Polki kada" and a "Message" button.
  2. Given Arjun & Kavya have `anniversary` 1 November and 4 purchases with no named last item, when `today` loads, then a row reads "Arjun & Kavya · anniversary today" with "High net worth · 4 purchases".
  3. Given two rows are due, when the section is shown, then its heading reads "SAY HAPPY BIRTHDAY · 2"; given none is due, then it reads "No birthdays or anniversaries are left to wish today."
  4. Given a customer has been wished today for that kind, when the list is read, then that customer is not returned for that kind.
  5. Given a customer is `erased` (EP-17-S13), when the list is read, then they are not returned; and each returned row holds only id, name, group, kind and last purchase name or count, with no phone.
- **Rules enforced on the server:** List Wishes due today is Staff and Owner only (EP-05-S2). Day and month are compared in Asia/Kolkata, ignoring the placeholder year in `dob` (EP-17-S1). Only `active` customers are listed. "Not yet wished" reads the wishes sent today once EP-33 stores them; until then every due customer is listed. The consent rule for sending is enforced at send time by EP-33, not here.
- **Live events emitted / consumed:** None. The list is read on load; a sent wish refreshes it through the sender's own action (EP-08-S7).
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds List Wishes due today to the shared contract; replaces `wishesDueToday` and the `lastBought` helper in `StaffToday.tsx` with the server read.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("SAY HAPPY BIRTHDAY · 2", "Priya Malhotra · today", "VIP Bridal · last bought Polki kada", "Arjun & Kavya · anniversary", "High net worth · 4 purchases", "Message"), route `today`. The "Message" action opens route `wishes`, delivered by EP-33; until that route exists the button is hidden.
- **Non-functional checks:** Personal data: rows show only name, group and last purchase; no phone, birth year or address (epic section 13). Time: "today" is the Asia/Kolkata date. Open question: the source of "last bought" depends on G13 (a stock-out records no customer); until it is answered the last purchase comes from the customer's piece history (EP-17-S9).
- **Depends on:** EP-31-S3, EP-17-S1, EP-17-S9, EP-17-S13, EP-10-S10, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S10: Staff can search a piece by tag, HUID or name

- **Story ID:** EP-31-S10
- **Status:** Not started
- **Title:** Staff can search a piece by tag, HUID or name
- **As a:** Staff
- **I want:** to type in "Search tag, HUID or name" on `today` and press "Find it", so the matching piece opens in the piece drawer on `stock`, or the screen says nothing was found
- **So that:** I can answer a customer's question about a piece from the home screen (FR-31-12)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 exists, when Rajesh Verma searches "TAG-8841" or "tag-8841", then `stock` opens with `pieceId` TAG-8841 and its drawer shows "Antique Kundan Choker".
  2. Given a piece with HUID "AB12CD", when Rajesh searches "AB12CD", then that piece opens.
  3. Given no exact tag or HUID match, when Rajesh searches "kundan", then the first piece whose name contains "kundan" opens, using the server search of EP-22-S4.
  4. Given nothing matches "zzz", when Rajesh presses "Find it", then the line "Nothing in the book matches that." appears under the box, and it clears as soon as he types again.
  5. Given the box is empty, when Rajesh presses "Find it", then `stock` opens with no piece selected.
- **Rules enforced on the server:** Piece search is Staff and Owner only (EP-05-S2) and runs on the server: exact tag, then exact HUID, then name contains, case-insensitive. It searches every status, so a billed piece can still be found. It returns tag, name, status and weights in integer units, no value field.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Reuses the stock search from EP-22-S4 with an exact-first ordering; replaces the in-browser `state.pieces.find` in `StaffToday.tsx`.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg` ("Search tag, HUID or name"), route `today`; the drawer is on route `stock` (EP-22-S5).
- **Non-functional checks:** Performance: search answers in under 2 seconds on a shop connection. Security: Staff and Owner only. Availability: when offline the button is disabled (EP-08-S11).
- **Depends on:** EP-31-S3, EP-22-S4, EP-22-S5, EP-05-S2, EP-08-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S11: Staff can see cards and figures update live

- **Story ID:** EP-31-S11
- **Status:** Not started
- **Title:** Staff can see cards and figures update live
- **As a:** Staff
- **I want:** the cards and showcase figures on `today` to refetch within about 1 second when a relevant live event arrives, without a reload, and to catch up after a dropped connection
- **So that:** what I see is what is true now, while other people sell, tag and raise problems (FR-31-13, BR-31-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is on `today`, when Deepak Rao stocks out a piece with 41.5900 g of pure gold, then within about 1 second "Pure gold on the floor" falls by 41.5900 g, "Pieces you can sell today" falls by 1, "Pieces out today" rises by 1 and "GOLD OUT TODAY" rises by 41.5900 g (epic acceptance criterion 3).
  2. Given a karigar hands over a parcel, when "Parcel handed over by karigar" arrives, then a "has not been weighed" card appears (epic acceptance criterion 4).
  3. Given Deepak saves a tag on BATCH-2026-043, when "Tag saved on a shared parcel" arrives, then the card changes from "9 pieces still untagged" to "8 pieces still untagged".
  4. Given a lead passes its SLA, when "Lead arrived / passed its SLA" arrives, then its card changes to "past the 8 h limit" and moves to its ranked place; given BATCH-2026-044 is stopped, when "Parcel stopped (mismatch or raised problem)" arrives, then its card appears.
  5. Given the connection drops for 2 minutes and a parcel is released meanwhile, when it returns, then "Reconnecting…" shows while down, and on return the cards and figures are refetched so the released parcel's card is gone (EP-08-S10, EP-07-S7).
- **Rules enforced on the server:** Events reach this user only through the EP-07-S5 permission filter. The client refetches Read Today cards and Read Showcase figures on each event; the card list and ranking always come from the server, never patched from the event payload alone.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member", "Parcel stopped (mismatch or raised problem)", "Edit applied", "Lead arrived / passed its SLA", "Karigar job status changed", "Parcel handed over by karigar", "Tag saved on a shared parcel"; proposed (G26): "Parcel released into stock", "Setting changed", "Problem raised on a job or piece", "Problem cleared", "Piece scrapped". Emitted: none.
- **Audit entry written:** No. This screen only reads.
- **Data changes:** None in the product database. Adds the `today` entries to the event-to-read map in the EP-08 data layer (EP-08-S8).
- **UI reference:** `docs/ux/mockups/02-staff-home.svg`, route `today`.
- **Non-functional checks:** Performance: changes appear within about 1 second of the event (BR-31-8); a burst of tag saves is coalesced into one refetch per short interval so the read is not repeated per event. Availability: "Reconnecting…" and catch-up from the last sequence number (EP-07-S7, EP-08-S10). Concurrency: two staff on `today` see the same cards after the same event.
- **Depends on:** EP-31-S1, EP-31-S8, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10, EP-26-S11, EP-21-S11, EP-28-S13, EP-24-S11, EP-24-S12, EP-13-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-31-S12: Staff can see an empty state when nothing is waiting

- **Story ID:** EP-31-S12
- **Status:** Not started
- **Title:** Staff can see an empty state when nothing is waiting
- **As a:** Staff
- **I want:** the "NEEDS YOU NOW" section to say plainly that nothing is waiting when Read Today cards returns no card
- **So that:** I know the list is empty because the work is done, not because the screen failed (FR-31-14, BR-31-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given no parcel is stopped or open, no problem is open and no lead is within 2 hours of its SLA, when Rajesh Verma opens `today`, then the heading reads "NEEDS YOU NOW · 0" and the card reads "Nothing is waiting on you. Parcels are tagged, leads are within time and nothing is stopped." (epic acceptance criterion 5).
  2. Given the empty state is shown, when the last card disappears through a live event, then the empty state appears in its place without a reload.
  3. Given Read Today cards fails, when the screen loads, then the error state with "Try again" is shown (EP-08-S4), not the empty state.
  4. Given the empty state, when it is measured, then its text is at least 14 px (BR-31-7), and the start tiles and showcase figures are still shown below it.
- **Rules enforced on the server:** None of its own. An empty card list is a valid response from Read Today cards and is distinct from an error.
- **Live events emitted / consumed:** None in this story; the refresh comes from EP-31-S11.
- **Audit entry written:** No. This screen only reads.
- **Data changes:** None in the product database. Keeps the empty-state text from `StaffToday.tsx`.
- **UI reference:** Not yet designed. The empty state is not drawn on `docs/ux/mockups/02-staff-home.svg`; it sits in the "NEEDS YOU NOW" section of route `today`.
- **Non-functional checks:** Availability: error and empty are never confused; loading shows first (EP-08-S3).
- **Depends on:** EP-31-S1, EP-31-S3, EP-31-S11, EP-08-S3, EP-08-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- What is the card ranking rule: leads first (SCOPE-ANALYSIS §3) or stops first (prototype)? (EP-31-S2)
- D7 is decided: one shop, no branches; Today shows the shop's work (EP-31-S1, S8).
- A3: how long before the SLA does staff see a lead card (prototype: 2 hours)? (EP-31-S6)
- Should staff be able to dismiss or snooze a card? (EP-31-S1, S4, S5, S6)
- G21: how does Today relate to a notification centre, which has no route id today? (EP-31-S1, S11)
