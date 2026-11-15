# EP-35: Reports · stories

Epic document: [EP-35 Reports](../epics/EP-35-reports.md)

Role note: stories where the server computes figures or checks access on its own use "System". Stories on the report screens use "Owner", because "Read every section's report" is an owner permission (mockup 11, BR-35-1). Staff and karigars are refused every report operation unless a later decision grants staff a report. No report screen, route id or mockup exists yet; "Not yet designed" in a UI reference means the screen comes from the design approved in EP-35-S1, and the route id `reports` used below is proposed. Every figure is grams or counts, never money (BR-35-3), and reports create no business records. The seed owner is Sanjay Seth; seed karigars include Mahesh Soni (KG-02), Lakshmi Devi and Vijay Kumar, as in mockup 08.

---

## EP-35-S1: Owner can review and approve the UX design of the report hub and section layout

- **Story ID:** EP-35-S1
- **Title:** Owner can review and approve the UX design of the report hub and section layout
- **As a:** Owner
- **I want:** a design for the report hub, one reusable section-report layout, the period picker, the branch picker (if D7 says multi-branch) and export (if decided), drawn as mockups in `docs/ux/mockups/` and shown to me for approval before any report is built
- **So that:** reports answer the questions I actually ask, in grams and counts, and nobody builds screens I did not want (FR-35-1, BR-35-6, BR-35-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given no report is designed (MOCKUP-COVERAGE §3 "Everything (never designed)"), when the design pass ends, then mockups exist for the hub with the five sections stock, karigars, leads, intake and outreach, and for one section layout reused by all five.
  2. Given the design is shown to Sanjay Seth, when he reads each section, then every figure on it is in grams (4 decimals), milligrams, a percentage or a count, and none shows a value, price or "₹" (BR-35-3, BR-35-5).
  3. Given the design, when it is reviewed, then it names the route id for the hub, where the owner reaches it from the owner rail next to `decisions` (the "Reports" item in mockup 13), the default period and the periods offered.
  4. Given the open questions in section 17 (D7, periods, export, staff access, G4, G5), when the design is approved, then each one is either answered by the owner and written into the design notes or marked as still open with the stories it holds back.
  5. Given Sanjay Seth approves the design, when the approval is recorded, then EP-35-S4 to EP-35-S13 may start, and no report story starts before it.
- **Rules enforced on the server:** None in the product. This is a design and approval step; the gate is that no report operation is merged before the approval is recorded in the design notes.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A design approval is not a product action; it is recorded in the design notes with the owner's name and date.
- **Data changes:** None in the product database. Adds new mockups under `docs/ux/mockups/` and design notes for the hub, section layout, period picker, branch picker and export.
- **UI reference:** Not yet designed. Entry points to keep consistent: `docs/ux/mockups/13-notifications-escalation.svg` (owner rail "Reports"), `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Money and stock", "Gold on the floor", "Gold with karigars", "Metal lost this month", "Pieces that went out in October"), `docs/ux/mockups/11-roles-and-permissions.svg` ("Read every section's report"), `docs/ux/mockups/10-navigation-map.mmd` (node "Reports, section by section").
- **Non-functional checks:** Precision: the design shows weights to 4 decimals and loss gaps optionally in mg. Security: the design shows reports in the owner rail only. Open decision D7: whether a branch picker with "All branches" is drawn. Open decision G24: whether this work is planned before the EP-41 launch or after it as M8.
- **Depends on:** EP-32-S2, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S2: System can compute period totals from integer weight units

- **Story ID:** EP-35-S2
- **Title:** System can compute period totals from integer weight units
- **As a:** System
- **I want:** one set of shared report functions on the server that take a period (start and end dates in Asia/Kolkata) and a branch scope, convert them to UTC bounds, and return sums of integer weights in units of 0.0001 g, counts, and percentages computed from integers, using the same functions the Decisions home and the pool page already use for the same figures
- **So that:** every report total is exact, matches the source rows, and never disagrees with `decisions` or `metal-pool` (FR-35-10, FR-35-11, BR-35-5, BR-35-8, BR-35-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given 42 `in_stock` pieces whose pure gold sums to 18,470,000 units, when the floor total is computed, then it returns 18,470,000 and 42, and the display function shows "1,847.0000 g" (epic acceptance criterion 2).
  2. Given settled jobs for KG-02 with gold issued 4,473,000 and 1,600,000 units and loss 63,000 and 23,000 units, when loss for the period is computed, then it returns 86,000 units (8.6000 g, 8,600 mg) and 142 basis points, shown as "1.42%", the same figure as EP-16-S10.
  3. Given the period "1 October 2026 to 31 October 2026" in Asia/Kolkata, when it is converted, then the query bounds are 30 September 2026 18:30 UTC to 31 October 2026 18:30 UTC, and a piece sold at 1 November 2026 00:10 IST is not counted.
  4. Given a period whose end is before its start, or longer than the agreed maximum, when a report function is called, then it is refused as a validation error (EP-03-S5).
  5. Given the same day and branch, when "Gold on the floor" is read from `decisions` (EP-32-S9) and from the stock report, then both return the same integer.
- **Rules enforced on the server:** All sums run in the database or the server on integer columns; no float arithmetic before display. Percentages are integer basis points, rounded half up. Period bounds are computed with the EP-10-S10 day-boundary function (midnight Asia/Kolkata). Branch scope is applied in every query when D7 is multi-branch. Value sockets on pieces, customers and stock-outs are never read.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Computing figures changes nothing.
- **Data changes:** None in the product database. Adds indexes on the time columns the reports filter on (`pool_entries` time, `pieces` `inStockAt`, `soldAt` and scrapped time, `parcels` arrival time, `leads` `arrivedAt`, broadcast and wish sent at) if query plans need them. Adds the report period type and the shared report functions to the shared package, reusing the gram conversion from EP-02-S2 and the logic behind `pureGoldOnFloor`, `daysInStock`, `goldWithKarigar` and `jobOverdueDays` in `src/store/selectors.ts`.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: integer sums in units of 0.0001 g, converted only for display, percentages from integer units (epic section 13). Time: periods chosen in Asia/Kolkata and queried in UTC; a day boundary is midnight Asia/Kolkata. Performance: each function for a one-month period returns in under 1 second on staging data, so a section report can load under 2 seconds. Open decision D7: branch scope is a single fixed branch until D7 is decided.
- **Depends on:** EP-02-S2, EP-10-S10, EP-03-S5, EP-16-S10, EP-18-S1, EP-22-S1, EP-22-S10, EP-32-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S3: System can refuse report requests from anyone but the owner

- **Story ID:** EP-35-S3
- **Title:** System can refuse report requests from anyone but the owner
- **As a:** System
- **I want:** every report operation (List Report sections, Read Stock, Karigar, Leads, Intake and Outreach report, Create Report export) to check on the server that the caller holds the owner permission "Read every section's report", and to refuse everyone else
- **So that:** report figures, including other karigars' loss and lateness, reach only the owner, whatever the browser hides or shows (FR-35-12, BR-35-1, BR-35-2, epic acceptance criterion 3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is signed in as Staff, when he calls Read Stock report, then the server refuses it with a permission error (EP-05-S2) and returns no figures (epic acceptance criterion 3).
  2. Given Mahesh Soni is signed in as Karigar, when he calls Read Karigar report, then the server refuses it and returns no data about himself or any other karigar (BR-35-2).
  3. Given Sanjay Seth is signed in as Owner, when he calls any of the seven report operations, then the permission check passes.
  4. Given a request with no session or an ended session, when it reaches any report operation, then it is refused as unauthenticated and the client returns to sign-in (EP-08-S15).
  5. Given a staff user types the proposed hub route `reports` into the address bar, when the screen loads, then the route is not offered to the Staff role (EP-08-S13) and any data call it makes is refused by the server.
- **Rules enforced on the server:** Permission "Read every section's report" is added to the Owner role only in the fixed permission list (EP-05-S1) and checked on every report operation (EP-05-S2). If a later decision grants staff a report, that grant is a separate permission per section, not a change to this check.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused read writes no audit entry unless EP-06 decides reads are audited; refusals are logged as security events by the API layer.
- **Data changes:** None in the product database. Adds the "Read every section's report" permission to the shared permission list.
- **UI reference:** `docs/ux/mockups/11-roles-and-permissions.svg` ("Read every section's report" under the owner; "Any other karigar's work or scorecard" under what a karigar never sees).
- **Non-functional checks:** Security: the role is checked on the server for every operation; a hidden rail item is not a control (epic section 13). Open question: whether any staff member sees any report; until answered, all seven operations are owner-only.
- **Depends on:** EP-05-S1, EP-05-S2, EP-03-S3, EP-08-S13, EP-08-S15
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S4: Owner can open the report hub with the five sections

- **Story ID:** EP-35-S4
- **Title:** Owner can open the report hub with the five sections
- **As a:** Owner
- **I want:** a "Reports" item in the owner rail that opens the report hub, where List Report sections returns the five sections, stock, karigars, leads, intake and outreach, each with one headline figure in grams or counts for the default period
- **So that:** I see the whole business at a glance and can open the section I need (FR-35-2, BR-35-6, epic acceptance criterion 1)
- **Acceptance criteria (Given / When / Then):**
  1. Given an approved design (EP-35-S1), when Sanjay Seth opens the hub from the owner rail "Reports", then five section cards appear in the order stock, karigars, leads, intake, outreach, each with one headline figure (epic acceptance criterion 1).
  2. Given 42 pieces in stock with 18,470,000 units of pure gold, when the hub loads, then the stock card's headline reads "1,847.0000 g" with "42 pieces" (proposed headline per the design).
  3. Given the hub is open, when Sanjay presses the karigars card, then the karigar report opens for the same period.
  4. Given List Report sections has not answered or fails, when the hub is shown, then each card shows the loading state (EP-08-S3) or the error with "Try again" (EP-08-S4), not a zero.
  5. Given the connection drops while the hub is open, when it returns, then the hub refetches; it does not update by itself between visits because reports have no live events.
- **Rules enforced on the server:** List Report sections is owner-only (EP-35-S3). Each headline comes from the shared functions of EP-35-S2 for the default period chosen in the design. No value or currency field is returned.
- **Live events emitted / consumed:** None. Reports read stored history on request (epic section 11).
- **Audit entry written:** No. Reads are not audited unless EP-06 decides otherwise.
- **Data changes:** None in the product database. Adds List Report sections to the shared contract (EP-03-S1), a route entry in `src/nav.ts` and `src/components/registry.tsx`, and the owner rail item.
- **UI reference:** Not yet designed (hub from EP-35-S1, proposed route `reports`). Rail entry point: `docs/ux/mockups/13-notifications-escalation.svg` ("Reports").
- **Non-functional checks:** Performance: the hub loads in under 2 seconds on a shop connection. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Security: owner check on the server (EP-35-S3).
- **Depends on:** EP-35-S1, EP-35-S2, EP-35-S3, EP-03-S1, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S5: Owner can choose a period for a section report

- **Story ID:** EP-35-S5
- **Title:** Owner can choose a period for a section report
- **As a:** Owner
- **I want:** a period picker on the hub and on every section report, with the periods and the default agreed in the design, so that every figure on the screen is recomputed for the period I pick and the period stays the same when I move between sections
- **So that:** I can compare this month with last month, or look at one festive week, without asking anyone for numbers (FR-35-3, BR-35-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth opens the stock report, when no period has been picked, then the default period from the design is shown in the picker and used for every figure.
  2. Given Sanjay picks "October 2026", when the report reloads, then the request carries 1 October 2026 to 31 October 2026 and the header reads the same dates in Asia/Kolkata.
  3. Given Sanjay picks a custom range with the end before the start, when he applies it, then the server refuses with "The period must end after it starts." (proposed wording) and the previous figures stay.
  4. Given October is picked on the stock report, when Sanjay goes back to the hub and opens the leads report, then the leads report also shows October.
  5. Given a period that includes today, when the report is read, then figures run up to the server time of the request, and the header says "up to <time>" (proposed wording).
- **Rules enforced on the server:** The period is validated on the server (EP-35-S2): start and end are dates in Asia/Kolkata, end on or after start, length within the agreed maximum. The server converts to UTC; the client never sends UTC bounds. Only the periods offered by the design are accepted if custom ranges are not decided.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Choosing a period is a read.
- **Data changes:** None in the product database. Adds the period parameter to every report read in the shared contract; keeps the chosen period in the route's query string.
- **UI reference:** Not yet designed (period picker from EP-35-S1, proposed route `reports`).
- **Non-functional checks:** Time: periods chosen in Asia/Kolkata, converted to UTC, day boundary at midnight Asia/Kolkata (epic section 13). Performance: a one-month period loads in under 2 seconds. Open question: which periods are offered (day, week, month, custom) and the default; the acceptance criteria use "October 2026" as an example only.
- **Depends on:** EP-35-S1, EP-35-S2, EP-35-S4, EP-10-S10, EP-03-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S6: Owner can read the stock report

- **Story ID:** EP-35-S6
- **Title:** Owner can read the stock report
- **As a:** Owner
- **I want:** the stock section, through Read Stock report, to show pure gold on the floor and its piece count at the end of the period, pieces held back from the floor (`draft`, `with_owner`, `stopped`) with their pure gold, pieces and pure gold that went out in the period, and pieces scrapped with the gold returned to the pool
- **So that:** I know how much gold is ready to sell, how much is stuck, and how much moved (FR-35-4, FR-35-10, FR-35-11, epic acceptance criteria 2 and 5)
- **Acceptance criteria (Given / When / Then):**
  1. Given 42 pieces were `in_stock` at the end of October with pure gold summing to 18,470,000 units, when Sanjay Seth opens the stock report for October, then it shows "1,847.0000 g" and "42 pieces", matching the sum of the stored integer weights (epic acceptance criterion 2).
  2. Given 12 pieces of BATCH-2026-044 were `with_owner` and 1 piece was `stopped` at the end of the period, when the report loads, then "Held back from the floor" shows 13 pieces split by state with each state's pure gold to 4 decimals.
  3. Given 184 pieces were billed in October (stock-out records, EP-26), when the report loads, then "Pieces that went out" shows 184 and their pure gold summed from integer units.
  4. Given 2 pieces were scrapped in October and their recovery entries in the pool ledger total 254,000 units, when the report loads, then "Scrapped" shows 2 pieces and "25.4000 g returned to the pool", equal to the `recovered` entries of EP-18-S6.
  5. Given pricing is switched on (EP-13-S9), when the stock report loads, then no value, rate or "₹" appears anywhere on it (epic acceptance criterion 5).
- **Rules enforced on the server:** Owner-only (EP-35-S3). "On the floor at the end of the period" is computed from `piece_state_transitions` (EP-22-S1), not from the current status, so a past period shows its own figure. Pure gold is read from each piece as an integer; gross and stone weights are not re-derived. Gold returned to the pool is read from `pool_entries` of kind `recovered`, not recomputed. No value socket is read.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited unless EP-06 decides otherwise.
- **Data changes:** None in the product database. Adds Read Stock report to the shared contract. May add an index on `piece_state_transitions` time if the end-of-period query needs it.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`). Figures follow `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Gold on the floor", "1,847 g", "42 pieces, ready to sell", "Pieces that went out in October", "184").
- **Non-functional checks:** Precision: integer sums shown to 4 decimals. Performance: a one-month report loads in under 2 seconds. Security: owner check on the server.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-35-S5, EP-22-S1, EP-22-S2, EP-22-S11, EP-26-S1, EP-27-S6, EP-18-S6, EP-13-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S7: Owner can read stock ageing by days in stock

- **Story ID:** EP-35-S7
- **Title:** Owner can read stock ageing by days in stock
- **As a:** Owner
- **I want:** the stock section to show the pieces on the floor at the end of the period grouped by days in stock, with the piece count and pure gold of each group, and the oldest piece's age
- **So that:** I can see how much gold has not moved and decide what to push or remake (FR-35-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given 6 `in_stock` pieces have been in stock for more than 90 days with pure gold summing to 1,964,000 units, and the oldest went in 108 days ago, when Sanjay Seth reads the ageing part of the stock report, then the oldest group shows 6 pieces, "196.4000 g" and "oldest is 108 days".
  2. Given a piece went `in_stock` at 23:50 IST on 1 October and the period ends on 31 October, when days in stock are counted, then it counts 30 days, using midnight Asia/Kolkata as the day boundary.
  3. Given a piece was `stopped` and returned to `in_stock`, when its age is computed, then it is counted from its first `inStockAt`, the same as `daysInStock` on `decisions` (proposed, to confirm with EP-32).
  4. Given the group boundaries come from the ageing threshold setting (EP-13-S8), when the owner changes the threshold from 90 to 60 days, then the next read of the report groups by the new threshold.
  5. Given the ageing groups are summed, when they are added together, then their piece count and pure gold equal the floor figures of EP-35-S6 for the same period.
- **Rules enforced on the server:** Owner-only (EP-35-S3). Days in stock are computed on the server from `inStockAt` and the period end with the EP-10-S10 day function, using the same shared function as the ageing alert on `decisions` (EP-32-S11). Group boundaries are read from shop settings on the server.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds the ageing groups to Read Stock report in the shared contract.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`). Figures follow `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("GOLD SITTING TOO LONG", "196.4 g of gold has not moved in 90 days", "oldest is 108 days").
- **Non-functional checks:** Precision: group totals are integer sums shown to 4 decimals. Time: days counted across midnight Asia/Kolkata. Open decision G5: the ageing threshold and so the group boundaries; until it is decided the report shows a single 90-day boundary as in mockup 08.
- **Depends on:** EP-35-S6, EP-13-S8, EP-32-S11, EP-10-S10, EP-22-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S8: Owner can read the karigar report

- **Story ID:** EP-35-S8
- **Title:** Owner can read the karigar report
- **As a:** Owner
- **I want:** the karigar section, through Read Karigar report, to show one row per karigar with gold with them now, gold issued and returned in the period, metal loss in grams and as a percentage, open jobs, overdue jobs, days late and parcel gaps, worst first
- **So that:** I can see which karigars lose metal or run late and act on facts (FR-35-6, BR-35-2, BR-35-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Mahesh Soni (KG-02) had settled jobs in the period with gold issued 6,073,000 units and loss 86,000 units, when Sanjay Seth opens the karigar report, then his row shows "8.6000 g" (or "8,600 mg") and "1.42%", the same figures as his scorecard (EP-16-S10).
  2. Given KG-02 has 3 open jobs, one of them past its agreed date by 3 days, when the report loads, then his row shows 3 open jobs, 1 overdue and the days-late figure computed as in EP-16-S10.
  3. Given gold with karigars is 6,120,000 units across 7 open jobs, when the report loads, then the total row shows "612.0000 g" and 7 open jobs, equal to the custody summary of EP-18-S11.
  4. Given Lakshmi Devi and Vijay Kumar are inside their allowance and KG-02 is above it, when the rows are sorted, then KG-02 comes first, ordered as on `decisions` "KARIGARS, WORST FIRST" (EP-32-S10).
  5. Given the report is open, when any figure is shown, then loss is never shown as a cost or with "₹" (BR-35-4).
- **Rules enforced on the server:** Owner-only (EP-35-S3); a karigar never receives this report, so no karigar sees another karigar's work (BR-35-2). Loss and days late are read from the EP-16-S10 computation and gold issued and returned from `pool_entries` (EP-18), not recomputed differently here. Percentages are integer basis points. The rating is not shown until G4 defines it.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Karigar report to the shared contract.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`). Figures follow `docs/ux/mockups/08-owner-home.svg`, route `decisions` ("Gold with karigars", "612 g", "7 open jobs · 2 past their date", "Metal lost this month", "0.71%", "KARIGARS, WORST FIRST", "Mahesh Soni · KG-02", "Metal loss", "1.42%", "Delivers", "+3.2 days late", "Rating").
- **Non-functional checks:** Precision: loss from integer units, shown to 4 decimals or in mg, percentage from integers. Personal data: karigar names only; no phone numbers on the report. Open decision G4: whether the rating is shown and how it is computed; the "Rating" column stays empty until it is decided.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-35-S5, EP-16-S10, EP-18-S1, EP-18-S11, EP-19-S1, EP-19-S9, EP-23-S8, EP-32-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S9: Owner can read the leads report

- **Story ID:** EP-35-S9
- **Title:** Owner can read the leads report
- **As a:** Owner
- **I want:** the leads section, through Read Leads report, to show leads that arrived in the period by source (counter, email, WhatsApp) and by current state, how many met the SLA and how many went late, item lines routed to stock and to make, and leads lost with their reasons
- **So that:** I can see where orders come from, whether the shop answers within the 8-hour clock, and why leads are lost (FR-35-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given 40 leads arrived in October, 12 `counter`, 10 `email` and 18 `whatsapp`, when Sanjay Seth opens the leads report for October, then the source counts read 12, 10 and 18 and add up to 40.
  2. Given 34 of those leads were started within their SLA and 6 had SLA breached at set (EP-28-S9), when the report loads, then it shows "34 met" and "6 late", using the stored breach time, not a recomputation.
  3. Given the October leads have 55 item lines with 30 routed `stock` and 20 routed `make` and 5 not yet routed, when the report loads, then it shows 30, 20 and 5.
  4. Given 4 leads were marked `lost` in October with reasons, when the report loads, then it shows 4 lost and each reason with its count.
  5. Given a lead arrived at 23:30 IST on 31 October, when the October report is read, then it is counted in October, not November.
- **Rules enforced on the server:** Owner-only (EP-35-S3). Leads are selected by `arrivedAt` in the period with the EP-35-S2 bounds. Source and state values come from the `leads` table (EP-28-S1); routes from `lead_items` `routeKind` (EP-30-S1). The SLA outcome is read from the stored SLA breached at, computed in shop hours by EP-28-S8.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Leads report to the shared contract. May add an index on `leads` `arrivedAt` and source.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`).
- **Non-functional checks:** Personal data: counts only; customer names are not listed unless the design asks for them. Time: periods in Asia/Kolkata. Performance: a one-month report loads in under 2 seconds. Open question: which figures this section shows beyond FR-35-7.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-35-S5, EP-28-S1, EP-28-S8, EP-28-S9, EP-28-S11, EP-29-S2, EP-29-S3, EP-30-S1, EP-30-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S10: Owner can read the intake report

- **Story ID:** EP-35-S10
- **Title:** Owner can read the intake report
- **As a:** Owner
- **I want:** the intake section, through Read Intake report, to show parcels received in the period, verdict counts (`exact`, `last_digit`, `mismatch`), owner clearances by kind (`sent_back`, `rechecking`, `loss_accepted`), the total grams of accepted loss with each reason, and stop-the-line problems raised and cleared
- **So that:** I can see how often parcels match, how much loss I accepted and why, and how many problems stopped the line (FR-35-8, epic acceptance criterion 4)
- **Acceptance criteria (Given / When / Then):**
  1. Given 20 parcels arrived in October with verdicts 15 `exact`, 3 `last_digit` and 2 `mismatch`, when Sanjay Seth opens the intake report for October, then it shows 20 received and the counts 15, 3 and 2 (epic acceptance criterion 4).
  2. Given one October mismatch BATCH-2026-044 was released with `resolution` `loss_accepted`, loss 1,380 units and reason "kemp stones lost in setting", and the other was `sent_back`, when the report loads, then clearances show 1 loss accepted and 1 sent back, and accepted loss shows "0.1380 g" (138 mg) with that reason (epic acceptance criterion 4).
  3. Given 5 problems were raised in October and 4 were cleared, when the report loads, then it shows 5 raised and 4 cleared, split by target (parcel, job, piece).
  4. Given a parcel arrived on 31 October and was still `incomplete` at the period end, when the report loads, then it counts as received and appears under "Not yet decided" (proposed wording), not under any verdict.
  5. Given the accepted loss figures, when they are added up, then the total equals the sum of `loss` on `loss_accepted` parcels released in the period, as stored integers.
- **Rules enforced on the server:** Owner-only (EP-35-S3). The verdict is read from the stored result of Evaluate Parcel (EP-23-S2) at release or stop, not re-evaluated with today's scale ceiling. Clearance kinds and loss reasons are read from `parcels` (EP-23-S9 to EP-23-S11). Problems are read from the problems table (EP-24-S1) by raised and cleared time.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Intake report to the shared contract. If the verdict is not stored on the parcel at release, a migration adds it so past verdicts do not change when the scale registry changes.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`). Wording for verdicts and clearances follows `docs/ux/mockups/04-parcel-match.svg` and `docs/ux/mockups/22-owner-clear-mismatch.svg`.
- **Non-functional checks:** Precision: accepted loss summed from integer units, shown to 4 decimals and in mg. Performance: a one-month report loads in under 2 seconds. Open decision G15: if a tray can stop while the rest releases, verdicts may be counted per tray; until decided they are counted per parcel.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-35-S5, EP-21-S1, EP-21-S2, EP-23-S2, EP-23-S9, EP-23-S10, EP-23-S11, EP-24-S1, EP-24-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S11: Owner can read the outreach report

- **Story ID:** EP-35-S11
- **Title:** Owner can read the outreach report
- **As a:** Owner
- **I want:** the outreach section, through Read Outreach report, to show wishes sent in the period, broadcasts sent with their audience and recipient counts, replies, and leads created from replies
- **So that:** I can see what wishes and broadcasts brought back, in counts (FR-35-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given 25 wishes were sent in October (delivery status `sent` or `delivered`) and 2 `failed`, when Sanjay Seth opens the outreach report for October, then it shows 25 wishes sent and 2 failed.
  2. Given the Deepavali VIP Bridal broadcast went to 86 recipients with 4 skipped, when the report loads, then it lists that broadcast with audience "VIP Bridal", 86 recipients and 4 skipped.
  3. Given 16 recipients of that broadcast replied and 14 of those replies became leads, when the report loads, then it shows 16 replies and 14 leads for that broadcast, read from replied at and lead id on `broadcast_recipients` (EP-34-S9).
  4. Given delivered and opened are not tracked (G17), when the report loads, then those columns are not shown rather than shown as zero.
  5. Given the report is open, when any row is shown, then no message body or customer phone number appears on it.
- **Rules enforced on the server:** Owner-only (EP-35-S3). Wishes are read from `wishes` by sent at (EP-33-S1); broadcasts from `broadcasts` by sent at with their stored recipient and skipped counts (EP-34-S1); replies and leads from `broadcast_recipients`. Showcases are counted only if they are tracked separately (EP-34-S9).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds Read Outreach report to the shared contract.
- **UI reference:** Not yet designed (section layout from EP-35-S1, proposed route `reports`). Broadcast figures follow `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("AFTER YOU SEND").
- **Non-functional checks:** Personal data: counts only; no recipient list, phone or message text (epic section 13). Open decision G17: delivered, opened and replied tracking per recipient; delivered and opened appear only if G17 is decided.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-35-S5, EP-33-S1, EP-33-S4, EP-33-S12, EP-34-S1, EP-34-S7, EP-34-S9, EP-34-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S12: Owner can choose one branch or all branches (if D7 says multi-branch)

- **Story ID:** EP-35-S12
- **Title:** Owner can choose one branch or all branches (if D7 says multi-branch)
- **As a:** Owner
- **I want:** a branch picker on the hub and every section report with each open branch and "All branches", so every figure is computed for the branch I pick
- **So that:** I can compare branches or see the whole business in one place (FR-35-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given D7 is multi-branch and two branches exist, when Sanjay Seth opens the hub, then the picker shows both branch names and "All branches", with "All branches" selected by default (proposed, as in the header of mockup 08).
  2. Given branch A holds 30 in-stock pieces and branch B holds 12, when Sanjay picks branch B on the stock report, then it shows 12 pieces and only branch B's pure gold.
  3. Given "All branches" is picked, when any section loads, then each figure equals the sum of the same figure for each branch.
  4. Given a request names a branch id that does not exist or is closed with no records in the period, when it reaches the server, then an unknown id is refused as not-found (EP-03-S5) and a closed branch returns its historical figures.
  5. Given D7 says single branch, when the hub loads, then no branch picker is shown and every figure covers the one branch.
- **Rules enforced on the server:** Owner-only (EP-35-S3). The branch scope is applied in every report query through EP-35-S2; the client cannot widen it. Branch ids come from the branches table (EP-02-S3, EP-13-S12).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds the branch parameter to every report read in the shared contract. Relies on the branch key on each source table from the earlier epics if D7 is multi-branch.
- **UI reference:** Not yet designed (branch picker from EP-35-S1, proposed route `reports`). Header pattern: `docs/ux/mockups/08-owner-home.svg` ("All branches").
- **Non-functional checks:** Security: branch scope enforced on the server. Performance: "All branches" for one month loads in under 2 seconds. Open decision D7: whether reports are per branch, for all branches, or both; this story is built only if D7 says multi-branch.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S4, EP-02-S3, EP-13-S12, EP-03-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-35-S13: Owner can export a section report (if export is decided)

- **Story ID:** EP-35-S13
- **Title:** Owner can export a section report (if export is decided)
- **As a:** Owner
- **I want:** an export action on each section report that, through Create Report export, produces a file of that section for the chosen period and branch in the decided format, which I can download through a signed, expiring link
- **So that:** I can keep the figures or share them with my accountant without retyping (FR-35-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is on the intake report for October, when he presses export, then a file is produced in the decided format with the same figures as the screen, weights to 4 decimals, and a header naming the section, period, branch and time of export in Asia/Kolkata.
  2. Given the file is ready, when Sanjay downloads it, then it is served through a signed link that expires (EP-09-S5), and a staff user opening the link after expiry or without the owner session is refused.
  3. Given an export is made, when it completes, then a ReportExport record and an audit entry are written with requested by, section, period, branch and time.
  4. Given a staff user calls Create Report export, when it reaches the server, then it is refused (EP-35-S3).
  5. Given pricing is switched on, when an export is produced, then the file contains no value, rate or currency column.
- **Rules enforced on the server:** Owner-only (EP-35-S3). The file is built on the server from the same functions as the screen (EP-35-S2), in a background job if it takes longer than the request allows (EP-10-S1). The file is stored through EP-09-S1 with the retention rule of EP-09-S12. The audit entry is written in the same transaction as the ReportExport record (EP-06-S2).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (owner), time, entity (ReportExport id), action `report_exported`, section, period, branch, file id.
- **Data changes:** Migration creates `report_exports` (id, requested by, section, period start, period end, branch id, file id, created at) and adds the audit kind `report_exported` to the `audit_entries` kind list. Stores the export file in object storage (EP-09-S1). Adds Create Report export to the shared contract.
- **UI reference:** Not yet designed (export from EP-35-S1, proposed route `reports`).
- **Non-functional checks:** Personal data: an export that lists customer names is personal data under the DPDP Act 2023 and follows the retention and erasure rules (EP-17-S13, EP-09-S12); EP-39 rules apply when written. Security: signed, expiring download links. Audit: every export recorded. Open question: whether export is needed and in which format; this story is built only if export is decided.
- **Depends on:** EP-35-S2, EP-35-S3, EP-35-S6, EP-35-S8, EP-35-S9, EP-35-S10, EP-35-S11, EP-09-S1, EP-09-S5, EP-09-S6, EP-09-S12, EP-10-S1, EP-06-S2, EP-17-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D7: are reports per branch, for all branches, or both? (EP-35-S1, S2, S12)
- Which figures does each section show, beyond those listed in SCOPE-ANALYSIS App. F and mockup 08? (EP-35-S1, S6, S8, S9, S10, S11)
- What periods are offered (day, week, month, custom), and what is the default? (EP-35-S1, S4, S5)
- Is export needed, and in which format? (EP-35-S1, S13)
- Does any staff member see any report, or is every report owner-only? (EP-35-S1, S3)
- G4: how is the karigar rating computed, and does the karigar report show it? (EP-35-S8)
- G5: what ageing threshold groups the stock ageing figures? (EP-35-S7)
- G24: is EP-35 part of the EP-41 launch ("All above") or delivered after launch as M8 says? (EP-35-S1)
- Are report reads written to the audit log (EP-06)? (EP-35-S3, S4, S6, S7, S8, S9, S10, S11, S12)
