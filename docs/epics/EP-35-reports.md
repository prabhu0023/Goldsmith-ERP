# EP-35: Reports

## 1. Summary

Reports give the owner one read-only page per section of the business: stock, karigars, leads, intake and outreach.
Every figure is in grams and counts, never money. The owner already sees today's exceptions on the Decisions home
(EP-32). Reports answer slower questions over a chosen period: how much gold sits on the floor and for how long,
which karigars lose metal or run late, how many leads arrived and met the 8-hour clock, how many parcels matched
exactly, and what wishes and broadcasts brought back. No report was ever designed, so this epic starts with a UX
design pass for a report hub and one reusable section layout, then builds the five section reports on the
production data.

## 2. Layer, milestone, status

- Layer: D · Experience
- Milestone: M8 Insight
- Prototype status: Not built. No report screen, route id or mockup exists; `docs/EPICS.md` E13 lists reports as "Not built (never designed)", and only a few live figures exist as selectors behind the home screens.

## 3. Roles involved

- Owner: opens the report hub, picks a section and a period, reads the figures, and exports if export is decided.
- Staff: not involved by default. Mockup 11 lists "Read every section's report" only under the owner; whether staff see any report is an open question.
- Karigar: not involved. Mockup 11 says a karigar never sees "any other karigar's work or scorecard".
- System: computes each figure from the stored ledgers, pieces, parcels, leads, jobs and outreach records, in integer weight units, for the chosen period, scoped to the one shop.

## 4. In scope

- UX design of the report hub and one reusable section-report layout, before any build (SCOPE-ANALYSIS §5 group J, "Report hub by section · one reusable section-report layout").
- Stock report: gold on the floor (pure gold and piece count), pieces held back from the floor (draft, with the owner or stopped), ageing in days, pieces and grams out per period, pieces scrapped and gold returned to the pool.
- Karigar report: gold with each karigar, metal loss as a percentage and in grams per karigar, open and overdue jobs, days late, parcel gaps (App. F "Metal loss as a percentage and in grams against each karigar").
- Leads report: leads by source (counter, email, WhatsApp), by state, SLA met versus late, items routed to stock versus make, lost leads.
- Intake report: parcels received, verdicts (exact, last digit, mismatch), owner clearances (send back, re-check, accept loss) and grams of accepted loss with reasons, stop-the-line problems raised and cleared.
- Outreach report: wishes sent, broadcasts sent, audience sizes, replies, and leads created from replies.
- A period picker (date range). No branch picker: one shop, no branches (D7).
- Export of a section report, if decided.
- Owner-only access enforced on the server.

## 5. Out of scope

- Today's exception desk, running-late list and the four-stat row on the owner home (EP-32).
- The figures' source records and their rules: pool ledger (EP-18), jobs and overdue tracking (EP-19), parcels and verdicts (EP-21, EP-23), stock (EP-22), stop-the-line problems (EP-24), stock-outs (EP-26), scrap (EP-27), leads (EP-28, EP-29, EP-30), wishes and broadcasts (EP-33, EP-34).
- The karigar scorecard and rating on the karigar record (EP-16, gap G4).
- The ageing alert and its threshold (EP-32, EP-13, gap G5).
- Any value, turnover or rupee figure (EP-42).
- Staff performance and leaderboards (EP-43).
- The audit log screen (EP-06).

## 6. Current state in the prototype

- No route id in `src/nav.ts` and no entry in `src/components/registry.tsx` for reports.
- `docs/EPICS.md` E13 "Reports · Not built (never designed)": "First: design the report hub and one reusable section layout (UX), in grams and counts."
- Figures that exist as selectors in `src/store/selectors.ts` and feed the home screens only:
  - `pureGoldOnFloor`, `inStockPieces`, `heldBackPieces` (stock on and off the floor).
  - `piecesOutToday`, `goldOutToday` (today only, no period).
  - `daysInStock` (ageing per piece).
  - `goldWithKarigar`, `jobsForKarigar`, `openJobsForKarigar`, `jobOverdueDays`, `overdueJobs` (karigar custody and lateness).
  - `lateLeads`, `leadsNeedingGlance` (current leads only).
  - `ownerQueues`, `railBadges` (current queues).
- `src/components/home/OwnerDecisions.tsx` shows a four-stat row and a karigar list worst-first; `src/components/stock/MetalPool.tsx` shows the pool ledger.
- Seed history that a report could read: `StockOutRecord` rows in `src/data/seed.ts`, `Karigar.gapsMg`, `Parcel.verdict`, `Parcel.lossG`, `Broadcast`, `WishRecord`.
- Mockup entry points only: owner rail "Reports" in `13-notifications-escalation.svg`, "Money and stock" rail item in `08-owner-home.svg`, "Read every section's report" in `11-roles-and-permissions.svg`, node `REPORTS["Reports, section by section"]` in `10-navigation-map.mmd`.
- Reusable: the selector logic (sum of pure gold, ageing in days, overdue days, SLA state from `src/domain/leads.ts`), `fmtG` and `fmtMg` formatting in `src/domain/weights.ts`, the `ui` component library for cards and tables.
- Must be rebuilt server-side: every figure as a query over stored history for a period (the selectors only read the current in-memory state), owner-only access, shop scoping, export.

## 7. Functional requirements

- FR-35-1. A UX design of the report hub and the reusable section layout is approved before any report story is built.
- FR-35-2. The owner can open a report hub that lists the five sections: stock, karigars, leads, intake and outreach.
- FR-35-3. The owner can choose a period for any section report; the default period is part of the UX design.
- FR-35-4. The stock report shows pure gold on the floor and its piece count at the end of the period, pieces held back from the floor, pieces and pure gold that went out in the period, and pieces scrapped with the gold returned to the pool.
- FR-35-5. The stock report shows ageing: pieces and pure gold grouped by days in stock.
- FR-35-6. The karigar report shows, per karigar, gold currently with them, gold issued and returned in the period, metal loss in grams and as a percentage, open jobs, overdue jobs and days late.
- FR-35-7. The leads report shows counts by source and state, SLA met and late, items routed to stock and to make, and leads lost in the period.
- FR-35-8. The intake report shows parcels received, verdict counts (exact, last digit, mismatch), owner clearances by kind, total grams of accepted loss with each reason, and problems raised and cleared.
- FR-35-9. The outreach report shows wishes sent, broadcasts sent, recipients, replies and leads created from replies.
- FR-35-10. Every figure is in grams or counts; no report shows a value, price or currency.
- FR-35-11. Weight totals are computed from integer units and shown to four decimals of a gram; loss gaps may also be shown in milligrams.
- FR-35-12. The server refuses a report request from anyone other than the owner, unless a decision grants staff a report.
- FR-35-13. Deferred: no branches in v1 (D7). Was: the owner can choose one branch or all branches. Every figure covers the one shop.
- FR-35-14. The owner can export a section report, if export is decided, in the format decided.

## 8. Business rules

- BR-35-1. Reports are owner-only: "Read every section's report" is an owner permission. [mockup 11]
- BR-35-2. A karigar never sees any other karigar's work or scorecard. [mockup 11]
- BR-35-3. Figures are grams and counts only, no turnover and no rupees. [SCOPE-ANALYSIS App. F]
- BR-35-4. Metal loss is shown as a percentage and in grams against each karigar, never as a cost. [SCOPE-ANALYSIS App. F]
- BR-35-5. Goods weights show four decimals; milligram gaps and percentages are the only other weight forms. [.agents/tasks/jgd-redesign/review.md]
- BR-35-6. Reports are one hub plus one reusable section layout. [SCOPE-ANALYSIS §5 group J]
- BR-35-7. The epic needs UX design first. [PRODUCTION-SCOPE §6 EP-35]
- BR-35-8. Weights are stored and summed as integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]
- BR-35-9. Times are stored in UTC and periods are chosen and shown in Asia/Kolkata. [PRODUCTION-SCOPE §5 Time]

## 9. Data

- This epic creates no business records. It reads records owned by EP-18 to EP-34.
- Read from the pool ledger (EP-18): entries with kind, grams (integer, units of 0.0001 g), job or scrap reference, time.
- Read from jobs (EP-19): karigar, gold issued (integer, units of 0.0001 g), agreed date, handed-over time, state.
- Read from parcels (EP-21, EP-23): arrival time, verdict, net gap and accepted loss (integer, units of 0.0001 g), loss reason, clearance kind.
- Read from pieces (EP-22, EP-26, EP-27): status, gross and stone weight (integer, units of 0.0001 g), tagged time, sold time, scrapped time.
- Read from leads (EP-28 to EP-30): source, state, arrived time, SLA outcome, item routes.
- Read from outreach (EP-33, EP-34): wish records, broadcasts, recipients, replies.
- Optional ReportExport record if export is audited: requested by, section, period, time.
- Value sockets on pieces, customers and stock-outs are not read by any report; they stay nullable and unused until EP-42.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Report sections | The five sections with a headline figure each | Owner |
| Read | Stock report | Floor, held back, out, scrapped and ageing figures for a period | Owner |
| Read | Karigar report | Custody, loss and lateness per karigar for a period | Owner |
| Read | Leads report | Source, state, SLA and routing counts for a period | Owner |
| Read | Intake report | Parcels, verdicts, clearances and losses for a period | Owner |
| Read | Outreach report | Wishes, broadcasts, replies and leads from replies | Owner |
| Create | Report export | Export one section for a period, if export is decided | Owner |

## 11. Live events

- None. Reports read stored history on request and do not need a push. Live exceptions belong to the Decisions home (EP-32), which consumes the catalogue events.

## 12. Screens and UX references

- Route ids: none exist. The report hub needs a new route id; the owner reaches it from the owner rail next to `decisions`.
- Mockups: entry points only. `13-notifications-escalation.svg` (owner rail item "Reports"), `08-owner-home.svg` (rail item "Money and stock"; figures "Gold on the floor", "Gold with karigars", "Metal loss", "Pieces that went out in October", karigar "Rating"), `11-roles-and-permissions.svg` ("Read every section's report"), `10-navigation-map.mmd` (node "Reports, section by section").
- Not yet designed (MOCKUP-COVERAGE §3: "Everything (never designed)"): report hub, section-report layout, period picker, export. This epic needs UX design first.

## 13. Non-functional requirements

- Precision: every total is an integer sum in units of 0.0001 g, converted to grams only for display; percentages are computed from integer units.
- Security: every report operation checks the owner role on the server; a hidden rail item is not a control.
- Personal data: reports show customer and karigar names only where needed; an export file containing customer names is personal data under the DPDP Act 2023 and follows EP-39 rules.
- Performance: a section report for a one-month period loads in under 2 seconds on a shop connection.
- Time: periods are chosen in Asia/Kolkata and converted to UTC for queries; a day boundary is midnight Asia/Kolkata.
- Audit: exports are recorded if export is decided; plain reads are not audited unless EP-06 decides reads are audited.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-18 to EP-34, EP-08
- Upstream, expanded: EP-08, EP-18, EP-19, EP-20, EP-21, EP-22, EP-23, EP-24, EP-25, EP-26, EP-27, EP-28, EP-29, EP-30, EP-31, EP-32, EP-33, EP-34.
- Downstream: EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given an approved UX design for the hub and section layout, when the owner opens Reports, then the five sections appear with one headline figure each in grams or counts.
2. Given 42 pieces in stock with 1,847 g of pure gold at the end of the period, when the owner opens the stock report, then it shows 1,847.0000 g and 42 pieces, matching the sum of the stored integer weights.
3. Given a staff member signed in, when they request any report operation, then the server refuses it.
4. Given parcels with verdicts exact, last digit and mismatch in October, when the owner opens the intake report for October, then each verdict count and the grams of accepted loss with their reasons are shown.
5. Given pricing is switched on, when the owner opens any report, then no value or currency appears, because reports stay in grams and counts.
6. Done when every section report's figures are checked against the source records by tests in EP-40.

## 16. Risks

- Risk: building reports before they are designed produces screens nobody asked for. Mitigation: FR-35-1 makes UX approval the first story.
- Risk: figures disagree with the Decisions home or the pool page. Mitigation: compute shared figures with the same shared functions in one place.
- Risk: report queries over long periods slow down the live screens. Mitigation: run them on a read replica or pre-aggregated tables if load tests show a need.
- Risk: the karigar report and the karigar scorecard (G4) show different loss figures. Mitigation: define loss once, in EP-16 and EP-18, and read it here.
- Risk: M8 comes after the M7 launch, but EP-41 "All above" includes EP-35 (G24). Mitigation: settle the launch order before planning M7.

## 17. Open decisions and questions

- D7 is decided: one shop, no branches; reports cover the shop ([decision record](../decisions/tenancy-and-branches.md)).
- Which figures does each section show, beyond those listed in SCOPE-ANALYSIS App. F and mockup 08?
- What periods are offered (day, week, month, custom), and what is the default?
- Is export needed, and in which format?
- Does any staff member see any report, or is every report owner-only?
- G4: how is the karigar rating computed, and does the karigar report show it?
- G5: what ageing threshold groups the stock ageing figures?
- G24: is EP-35 part of the EP-41 launch ("All above") or delivered after launch as M8 says?
- Are report reads written to the audit log (EP-06)?

## 18. Candidate stories

1. EP-35-S1: Owner can review and approve the UX design of the report hub and section layout
2. EP-35-S2: System can compute period totals from integer weight units
3. EP-35-S3: System can refuse report requests from anyone but the owner
4. EP-35-S4: Owner can open the report hub with the five sections
5. EP-35-S5: Owner can choose a period for a section report
6. EP-35-S6: Owner can read the stock report
7. EP-35-S7: Owner can read stock ageing by days in stock
8. EP-35-S8: Owner can read the karigar report
9. EP-35-S9: Owner can read the leads report
10. EP-35-S10: Owner can read the intake report
11. EP-35-S11: Owner can read the outreach report
12. EP-35-S12: Owner can choose one branch or all branches (Deferred: no branches in v1, D7)
13. EP-35-S13: Owner can export a section report (if export is decided)
