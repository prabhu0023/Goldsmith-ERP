# EP-31: Staff Today home

## 1. Summary

Today is the first screen a staff member sees after signing in. Instead of a 42-row table, the day is a short list:
"Needs you now" cards for the things that are waiting on staff (a stopped parcel, a parcel still untagged, a lead
close to its 8-hour limit), three start tiles for the most common jobs (sell a piece, receive a parcel, add a
customer), the showcase figures in grams and counts, and today's birthdays and anniversaries. The cards update live as
other people work. The business needs this so staff stop guessing what matters and the urgent work is done first.

## 2. Layer, milestone, status

- Layer: D · Experience
- Milestone: M6 Homes and outreach
- Prototype status: Partial. `StaffToday` at route `today` shows needs-you-now cards, start tiles, showcase stats and birthdays from selectors on mock data; the server query, live updates and a decided ranking rule are absent.

## 3. Roles involved

- Staff: lands here after sign-in; opens a card to act; uses the start tiles and search; messages a customer on a birthday.
- Owner: does not land here (lands on Decisions, EP-32); may open it to see the staff view.
- Karigar: not involved (lands on `k-jobs`).
- System: builds the card list from every pipeline epic, ranks it, computes the showcase figures, and pushes changes live.

## 4. In scope

- Greeting with the staff member's first name and the date in Asia/Kolkata.
- Search by tag, HUID or name, opening the piece drawer.
- "Needs you now" cards, each with a title, a plain detail line and one action:
  - parcel stopped by a mismatch ("Parcel from Mahesh Soni is 138 mg short ... Only the owner can release this.");
  - parcel stopped by a raised problem;
  - job or piece stopped by a raised problem;
  - parcel not yet weighed; pieces still untagged; parcel fully tagged and ready to match;
  - leads past or within 2 hours of the SLA, up to 3 cards and a "more leads" card.
- A decided ranking rule for the cards (SCOPE-ANALYSIS §3 says the leads row should top the list; the prototype puts stops first).
- Start tiles: "Sell a piece" (`stock-out`), "Receive a parcel" (`parcel-arrival`), "Add a customer" (`customer-new`).
- Showcase figures: pure gold on the floor, pieces you can sell today, held back from the floor (draft, with the owner or stopped), pieces out today, gold out today.
- Birthdays and anniversaries due today and not yet wished, with "last bought" and a message action.
- Empty state when nothing needs staff.
- Live updates from the pipeline events.
- Branch scope of every figure once D7 is decided.

## 5. Out of scope

- The rules behind each card: parcels (EP-21, EP-23), problems (EP-24), leads and SLA (EP-28, EP-29), stock-out (EP-26).
- The "Quotation QT-2026-0211 expires today" card on mockup 02: v1 has no holds, so there is no hold or quotation expiry to show (gap G6 resolved).
- Sending a wish (EP-33).
- The owner's home (EP-32).
- The karigar's home (EP-20).
- The live transport (EP-07).
- Notification centre and push alerts (EP-11, G21).
- Any value or price figure (EP-42).

## 6. Current state in the prototype

- `src/components/home/StaffToday.tsx` (route `today`, `landingRoute.staff` in `src/nav.ts`):
  - stopped parcels first (mismatch with `gapPhrase`, or raised problem), then job and piece problems, then open parcels (not weighed, untagged count, ready to match), then leads where `slaState` is late or has 2 hours or less left, sorted by elapsed time, capped at 3 plus a "more leads" card;
  - tiles "Sell a piece", "Receive a parcel", "Add a customer";
  - stats "Pure gold on the floor" (`pureGoldOnFloor`, seed 1,847.2 g), "Pieces you can sell today" (`inStockPieces`), "Held back from the floor" (`heldBackPieces`), "Pieces out today" (`piecesOutToday`);
  - birthdays from `wishesDueToday` minus those already sent today, with `lastBought` from `Customer.history`.
- `src/components/home/util.ts`: `gapPhrase`, `plural`, `greetingFor`, `firstName`.
- `src/components/ui/AttentionCard.tsx` for the cards.
- "Gold out today" is shown as a hero weight from `goldOutToday`; the empty state reads "Nothing is waiting on you. Parcels are tagged, leads are within time and nothing is stopped."
- No card for a quotation or hold that expires (mockup 02 "Quotation QT-2026-0211 expires today"); production v1 does not add one, because v1 has no holds.
- Everything is computed in the browser from the whole state on every render.
- Reusable: the card set, wording, tiles, stats and the screen layout.
- Must be rebuilt server-side: one aggregated "needs you now" query scoped to the user and branch, the ranking rule, the showcase figures as server reads, and live subscription to the pipeline events.

## 7. Functional requirements

- FR-31-1. A staff member lands on Today after sign-in.
- FR-31-2. The server returns the "Needs you now" cards for the signed-in staff member in one call.
- FR-31-3. A mismatched parcel card shows the karigar, the gap in mg, the piece count held back and "Only the owner can release this."
- FR-31-4. A raised-problem card shows who stopped what and the problem text.
- FR-31-5. Open parcel cards show "not weighed", the untagged count, or "ready to match", each linking to the right intake step.
- FR-31-6. Lead cards show leads past or within 2 hours of the SLA, most overdue first, at most 3, with a "more leads" card for the rest.
- FR-31-7. Cards are ordered by the decided ranking rule.
- FR-31-8. Each card's action opens the screen where the staff member can act.
- FR-31-9. The start tiles open `stock-out`, `parcel-arrival` and `customer-new`.
- FR-31-10. The showcase figures show pure gold on the floor, sellable pieces, pieces held back from the floor, pieces out today and gold out today, in grams from integers in units of 0.0001 g.
- FR-31-11. Birthdays and anniversaries due today and not yet wished are listed with a message action.
- FR-31-12. Search by tag, HUID or name opens the matching piece or says nothing was found.
- FR-31-13. Cards and figures update within about 1 second of a relevant live event, without a reload.
- FR-31-14. With nothing waiting, the screen shows an empty state that says so.

## 8. Business rules

- BR-31-1. The day is a list, not a 42-row table. [mockup 02 "WHY THIS SCREEN EXISTS"]
- BR-31-2. Staff land on Today; the owner lands on Decisions; karigars on their jobs. [src/nav.ts landingRoute; mockup 10]
- BR-31-3. Only the owner can release a mismatched parcel, and the card says so. [mockup 02; mockup 11]
- BR-31-4. The leads row should top the list. [SCOPE-ANALYSIS §3]
- BR-31-5. A lead close to its limit is shown before the owner is told. [mockup 13 "Staff first, then me"; SCOPE-ANALYSIS App. A A3]
- BR-31-6. Figures are grams and counts only; no money. [SCOPE-ANALYSIS App. F]
- BR-31-7. Text at least 14 px; empty states say what is happening. [UX-SPEC §6]
- BR-31-8. Screens load under 2 seconds; live events arrive within about 1 second. [PRODUCTION-SCOPE §5 Performance]

## 9. Data

- No new stored entities. This epic reads:
  - Parcel status, verdict, gap (integer, units of 0.0001 g), weighings, manifest, tagged count (EP-21, EP-23).
  - Open problems (EP-24).
  - Lead state, arrival time, SLA phase (EP-28, EP-29).
  - Piece status and net weight (integer, units of 0.0001 g) (EP-22).
  - Stock-outs today (EP-26).
  - Customer birthdays, anniversaries, consent, last purchase (EP-17) and wishes sent today (EP-33).
- Optional per-user card dismissal or snooze, only if decided.
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Today cards | Ranked "needs you now" cards for this user | Staff, Owner |
| Read | Showcase figures | Floor gold, sellable, held back, out today | Staff, Owner |
| List | Wishes due today | Birthdays and anniversaries not yet wished | Staff, Owner |
| Read | Piece search | Find by tag, HUID or name | Staff, Owner |
| Subscribe | Today updates | Live changes to cards and figures | Staff, Owner |

## 11. Live events

- Consumes: "Piece billed by one staff member" — to update floor gold, pieces out today and gold out today.
- Consumes: "Parcel stopped (mismatch or raised problem)" — to add the stopped-parcel card.
- Consumes: "Edit applied" — to update floor gold when a weight changes.
- Consumes: "Lead arrived / passed its SLA" — to add or promote a lead card.
- Consumes: "Karigar job status changed" — to refresh job-related cards and stopped jobs.
- Consumes: "Parcel handed over by karigar" — to add a "not weighed" parcel card.
- Consumes: "Tag saved on a shared parcel" — to update the untagged count.
- Consumes (proposed, not in catalogue): "Parcel released into stock" — to remove the parcel card and add pieces to the floor (gap G26).
- Consumes (proposed, not in catalogue): "Setting changed" — when the SLA hours change (gap G26).
- Emits: none. This screen only reads.

## 12. Screens and UX references

- Route ids: `today` (StaffToday). Card actions open `parcel-match`, `parcel-arrival`, `parcel-tag`, `lead-review`, `lead-convert`, `leads`, `stock`; tiles open `stock-out`, `parcel-arrival`, `customer-new`.
- Mockups: `02-staff-home.svg` ("NEEDS YOU NOW · 3", "Parcel from Mahesh Soni is 138 mg short", "9 pieces still untagged in BATCH-2026-043", start tiles, "Pure gold on the floor 1,847.2 g · 42 · 14 · 11", "GOLD OUT TODAY 212.4 g", "SAY HAPPY BIRTHDAY · 2"), `13-notifications-escalation.svg` (what staff see when a lead is late). The mockup 02 card "Quotation QT-2026-0211 expires today" is out of scope for v1 (no holds).

## 13. Non-functional requirements

- Performance: the Today read returns in under 2 seconds on a shop connection; live changes appear within about 1 second.
- Precision: floor and out-today gold are integer sums in units of 0.0001 g, shown in grams.
- Security: only cards the user may act on are returned; no owner-only action is offered to staff.
- Personal data: birthday rows show only what the staff member needs (name, group, last purchase).
- Time: "today" and the greeting use Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-18 to EP-30, EP-08
- Upstream, expanded: EP-08, EP-18, EP-19, EP-20, EP-21, EP-22, EP-23, EP-24, EP-25, EP-26, EP-27, EP-28, EP-29, EP-30.
- Downstream: EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given BATCH-2026-044 is stopped 138 mg short, when Rajesh opens Today, then a card says so and its action opens the parcel.
2. Given a lead with 1 hour left on its SLA, when Rajesh opens Today, then a lead card appears with "Open it before the owner is told."
3. Given Rajesh is on Today, when Deepak stocks out a 41.590 g piece, then floor gold falls by 41.590 g and pieces out today rises by 1 within about 1 second.
4. Given a karigar hands over a parcel, when the event arrives, then a "has not been weighed" card appears.
5. Given nothing is waiting, when staff open Today, then an empty state says nothing needs them.
6. Done when the card ranking rule is decided and implemented on the server.

## 16. Risks

- Risk: too many cards and the screen becomes the old table. Mitigation: decided ranking and caps per kind (3 leads today).
- Risk: one heavy query per screen load. Mitigation: aggregate on the server and update from live events.
- Risk: the ranking disagrees with SCOPE-ANALYSIS §3 (leads first) and staff miss leads. Mitigation: decide the rule before build.
- Risk: branch mixing shows another branch's parcels. Mitigation: decide D7 and scope every read.

## 17. Open decisions and questions

- What is the card ranking rule: leads first (SCOPE-ANALYSIS §3) or stops first (prototype)?
- D7: does Today show only the staff member's branch?
- A3: how long before the SLA does staff see a lead card (prototype: 2 hours)?
- Should staff be able to dismiss or snooze a card?
- G21: how does Today relate to a notification centre, which has no route id today?

## 18. Candidate stories

1. EP-31-S1: System can build the "needs you now" cards for a staff member
2. EP-31-S2: System can rank the cards by the decided rule
3. EP-31-S3: Staff can land on Today after sign-in
4. EP-31-S4: Staff can see stopped parcels, jobs and pieces as cards
5. EP-31-S5: Staff can see parcels waiting to be weighed, tagged or matched
6. EP-31-S6: Staff can see leads near or past the SLA
7. EP-31-S7: Staff can start a sale, a parcel or a customer from the tiles
8. EP-31-S8: Staff can see the showcase figures in grams and counts
9. EP-31-S9: Staff can see today's birthdays and anniversaries
10. EP-31-S10: Staff can search a piece by tag, HUID or name
11. EP-31-S11: Staff can see cards and figures update live
12. EP-31-S12: Staff can see an empty state when nothing is waiting
