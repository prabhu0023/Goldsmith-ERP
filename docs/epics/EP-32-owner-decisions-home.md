# EP-32: Owner Decisions home

## 1. Summary

Decisions is the owner's home. It shows only what nobody else may do. The first block, "Nothing moves until you
answer", holds mismatched parcels, raised problems, edit proposals and scrap requests. The second, "Running late",
holds leads past their SLA and karigar jobs past their agreed date: the clock told him, not a person. The third, "Went
through without you today", has no buttons and shows the parcels that matched and were released by staff, so the owner
can see the system working without him. Below sit the rules behind these alerts, where the gold is right now, and the
karigars worst first. The business needs this so the owner is pulled in only for exceptions and can answer each one in
a tap.

## 2. Layer, milestone, status

- Layer: D · Experience
- Milestone: M6 Homes and outreach
- Prototype status: Partial. `OwnerDecisions` at route `decisions` builds its blocks from `ownerQueues` and selectors on mock data, with the rules panel and karigars worst first; the server query, live badge, the ageing alert (G5) and a defined karigar rating (G4) are absent.

## 3. Roles involved

- Owner: lands here after sign-in; opens each card to clear, apply, decide or chase; changes the rules in the panel.
- Staff: never sees this screen; their actions create the cards.
- Karigar: never sees this screen; his job status and gaps appear here.
- System: assembles the exception queue, counts the badge, computes the "went through" figures and the gold locations, raises the ageing alert, and pushes changes live.

## 4. In scope

- Header with the count of things waiting and the note "A parcel that matches never appears as a card here."
- "Nothing moves until you answer" block:
  - one card per mismatched parcel without a raised problem (gap in mg, tags vs expected, karigar's average of his last parcels);
  - one card per open raised problem;
  - one card for all open edit proposals;
  - one card for all pending scrap requests.
- "Running late" block: one card for late leads (SLA passed), one card for karigar jobs past their agreed date.
- "Went through without you today" block with no buttons: parcels released today without a loss, their pieces and pure gold; pieces out today and wishes sent today.
- Rules panel: lead SLA hours and the shop-hours rule (A2), who hears about a late lead, notification channels, "A parcel comes to me when it does not match exactly · Nothing for you to set", the edit-token rule (G18). Settings stored in EP-13.
- "Where the gold is right now": gold on the floor, gold with karigars with open and late job counts, metal pool balance, pieces out today; metal lost this month once defined.
- "Karigars, worst first": karigars over their allowance first, with metal loss, days late and rating; inside-allowance karigars in one line (G4 scorecard display).
- Ageing alert: "196.4 g of gold has not moved in 90 days" with "Push on WhatsApp" and "Melt and remake" actions (G5; threshold setting in EP-13).
- Rail badge with the total number of cards, updated live.
- Every card action deep-links to the screen where the owner acts.
- Branch selector "All branches" once D7 is decided.

## 5. Out of scope

- The rules behind each card: mismatch clearance (EP-23), problem clearance (EP-24), edit apply (EP-25), scrap decision (EP-27), late leads (EP-28), overdue jobs (EP-19).
- Storing and validating settings (EP-13).
- Delivery of owner alerts by WhatsApp, in-app or email (EP-11, EP-12).
- The karigar scorecard figures and rating formula (EP-16, with figures from EP-18 and EP-19, G4).
- The ageing threshold value (EP-13, G5).
- Broadcasting aged pieces ("Push on WhatsApp") (EP-34).
- Reports and month-on-month figures such as "Pieces that went out in October · 184 · up 12%" (EP-35).
- Any money figure (EP-42).

## 6. Current state in the prototype

- `src/store/selectors.ts` `ownerQueues(s, now)`: `mismatchedParcels` (stopped, no resolution, verdict mismatch, no open parcel problem), `raisedProblems`, `pendingEdits`, `pendingScrap`, `lateLeads`, `overdueJobs`; `blocking` counts each parcel and problem plus one for edits and one for scrap; `late` counts one for leads and one for jobs; `railBadges` shows the total for the owner.
- `src/components/home/OwnerDecisions.tsx` (route `decisions`, `landingRoute.owner`):
  - header "{N} things are waiting on you" or "Nothing needs you";
  - mismatch card "{id} will not weigh up · {gap}" with "His last {n} parcels averaged {avg} mg" from `Karigar.gapsMg`, action to `parcel-clear`;
  - `ProblemCard` with "Clear it and start again" calling `clearProblem`;
  - edits card to `edit-apply`; scrap card to `scrap-decision`;
  - late leads card to `leads`; overdue jobs card "See tracker" to `karigars`;
  - "Went through without you today" from parcels released today with `lossG === null`, plus pieces out and wishes sent;
  - `RulesPanel` writing `leadSlaHours`, `lateLeadAudience`, `notifyChannels` and `requireEditToken` through `setSetting`, which has no owner check (G12);
  - gold on the floor (`pureGoldOnFloor`), gold with karigars, metal pool balance, pieces out today;
  - karigars worst first: `metalLossPct > wastagePct` are "over"; `rating` and `lateDays` are seed numbers with no formula (G4).
- No ageing alert (mockup 08 "GOLD SITTING TOO LONG", G5). No "Metal lost this month" figure. No branch selector.
- Reusable: the queue rules, block structure, wording, cards and rules panel.
- Must be rebuilt server-side: one exception-queue query for the owner, the badge count, the "went through" aggregates, the ageing query, the owner check on the rules panel, and live subscription.

## 7. Functional requirements

- FR-32-1. The owner lands on Decisions after sign-in.
- FR-32-2. The server returns the owner's exception queue in one call: mismatched parcels, open problems, open edit proposals, pending scrap requests, late leads and overdue jobs.
- FR-32-3. A parcel with an open raised problem appears as a problem card, not as a mismatch card.
- FR-32-4. A mismatch card shows the parcel, karigar, gap in mg, tags and expected pure gold, the stop time and the karigar's average gap over his recent parcels.
- FR-32-5. Edit proposals appear as one card listing up to 3 proposals; scrap requests as one card.
- FR-32-6. Late leads appear as one card with each customer and hours waiting; overdue jobs as one card with karigar and days over.
- FR-32-7. Each card's action opens the screen where the owner can act.
- FR-32-8. The "Went through without you today" block lists parcels released today without a loss, their piece count and pure gold, pieces out today and wishes sent today, with no actions.
- FR-32-9. The rules panel shows and changes the lead SLA hours, the late-lead audience, the notification channels and the edit-token rule through EP-13; the server refuses a change from any role but owner.
- FR-32-10. "Where the gold is right now" shows gold on the floor, gold with karigars with open and past-date job counts, the metal pool balance and pieces out today, as grams from integers in units of 0.0001 g.
- FR-32-11. Karigars over their wastage allowance are listed first with metal loss, days late and rating; the others are summarised in one line (G4).
- FR-32-12. The system raises an ageing alert when in-stock pieces have not moved for the decided threshold, with total pure gold, piece count and the oldest age (G5).
- FR-32-13. The ageing alert offers "Push on WhatsApp" (opens EP-34 with those pieces) and "Melt and remake" (opens a scrap request, EP-27).
- FR-32-14. The rail badge shows the total number of cards and updates within about 1 second of a change.
- FR-32-15. With nothing waiting, each block shows its empty state ("Nothing is stopped. Every parcel, job and tag is moving.").
- FR-32-16. The server returns this screen only to the owner.

## 8. Business rules

- BR-32-1. The owner sees only exceptions; a parcel whose weights agree is released by staff and never shown to him as a card. [SCOPE-ANALYSIS App. B Q3; mockup 13]
- BR-32-2. Cards are grouped by the kind of answer needed. [SCOPE-ANALYSIS App. A decision 4; mockup 13]
- BR-32-3. "Running late" is raised by the clock, not a person. [mockup 13 "THE CLOCK TOLD ME, NOT A PERSON"]
- BR-32-4. "Went through without you today" has no buttons, and should be the long block. [mockup 13]
- BR-32-5. The match rule has nothing for the owner to set. [mockup 13 "Nothing for you to set"; SCOPE-ANALYSIS App. E]
- BR-32-6. A lead is late after the SLA hours, in shop hours (assumption). [SCOPE-ANALYSIS App. A A2; mockup 13]
- BR-32-7. Staff are told about a late lead first, then the owner (assumption). [SCOPE-ANALYSIS App. A A3; mockup 13]
- BR-32-8. A job is late past its agreed date: the confirmed date, else the due date. [src/store/selectors.ts agreedDate; mockup 12]
- BR-32-9. Every permission is checked on the server, including the rules panel. [PRODUCTION-SCOPE §5 Security; gap G12]
- BR-32-10. Grams and counts only; no money. [SCOPE-ANALYSIS App. F]
- BR-32-11. Gold sitting too long is flagged with a push or melt choice. [mockup 08 "GOLD SITTING TOO LONG"; gap G5]

## 9. Data

- No new stored entities, except an optional per-owner "seen" marker if decided. This epic reads:
  - Parcels with verdict, gap (integer, units of 0.0001 g), stop time and resolution (EP-23); karigar recent gaps (EP-16, EP-23).
  - Open problems (EP-24), open edit proposals (EP-25), pending scrap requests (EP-27).
  - Late leads (EP-28, EP-29) and overdue jobs with agreed dates (EP-19).
  - Released parcels and pieces today, stock-outs today, wishes sent today (EP-23, EP-26, EP-33).
  - Pool balance, gold issued on open jobs (integers, units of 0.0001 g) (EP-18, EP-19).
  - Karigar metal loss %, days late, rating, wastage allowance (EP-16, G4).
  - Piece in-stock time for ageing (EP-22) and the ageing threshold (EP-13, G5).
  - Settings: SLA hours, audience, channels, edit-token rule (EP-13).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Read | Owner exception queue | Blocking and running-late cards | Owner |
| Read | Went through today | Released parcels, pieces out, wishes sent | Owner |
| Read | Gold locations | Floor, with karigars, pool, out today | Owner |
| List | Karigars worst first | Ranked by allowance, loss, lateness | Owner |
| Read | Ageing alert | Pieces past the ageing threshold | Owner |
| Read | Badge count | Total cards for the rail | Owner |
| Subscribe | Decisions updates | Live changes to cards and badge | Owner |

## 11. Live events

- Consumes: "Parcel stopped (mismatch or raised problem)" — to add a mismatch or problem card.
- Consumes: "Edit proposed / token sent" — to add or update the edits card.
- Consumes: "Lead arrived / passed its SLA" — to add a lead to the late card.
- Consumes: "Karigar job status changed" — to update overdue jobs and gold with karigars.
- Consumes: "Metal pool changed" — to update the pool figure.
- Consumes: "Piece billed by one staff member" — to update pieces out today and gold on the floor.
- Consumes (proposed, not in catalogue): "Problem raised on a job or piece" and "Problem cleared" — to add and remove problem cards (gap G26).
- Consumes (proposed, not in catalogue): "Scrap requested" and "Piece scrapped" — to add and remove the scrap card (gap G26).
- Consumes (proposed, not in catalogue): "Parcel released into stock" — to fill "Went through without you today" (gap G26).
- Consumes (proposed, not in catalogue): "Job passed its agreed date" — to add an overdue job (gap G26).
- Consumes (proposed, not in catalogue): "Setting changed" — to refresh the rules panel (gap G26).
- Emits: none. Actions taken from the cards emit through their own epics.

## 12. Screens and UX references

- Route ids: `decisions` (OwnerDecisions). Card actions open `parcel-clear`, `edit-apply`, `scrap-decision`, `leads`, `karigars`, `stock`, `broadcast`.
- Mockups: `08-owner-home.svg` ("Three things need you, Sanjay", "PARCEL DOES NOT MATCH", "STAFF WANTS A CODE", "GOLD SITTING TOO LONG · 196.4 g of gold has not moved in 90 days · Push on WhatsApp · Melt and remake" (G5), "WHERE THE GOLD IS RIGHT NOW", "Gold with karigars 612 g · 7 open jobs · 2 past their date", "Metal lost this month 0.71%", "KARIGARS, WORST FIRST" (G4), "YOUR RULE · Code before a tag edit · On"), `13-notifications-escalation.svg` ("NOTHING MOVES UNTIL YOU ANSWER · 4", "RUNNING LATE · 2", "WENT THROUGH WITHOUT YOU TODAY · NO BUTTONS HERE", "THE RULES BEHIND THESE ALERTS").

## 13. Non-functional requirements

- Performance: the Decisions read returns in under 2 seconds; a new exception appears within about 1 second.
- Security: the queue and the rules panel are owner-only on the server; staff calls are refused.
- Precision: all gold figures are integer sums in units of 0.0001 g; the ageing total is computed the same way.
- Audit: rule changes made from the panel are audited by EP-13; reading the queue is not audited.
- Time: "today", job lateness and ageing days use Asia/Kolkata calendar days.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-23 to EP-30, EP-08
- Upstream, expanded: EP-08, EP-23, EP-24, EP-25, EP-26, EP-27, EP-28, EP-29, EP-30.
- Downstream: EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given BATCH-2026-044 is stopped 138 mg short with no raised problem, when the owner opens Decisions, then a mismatch card links to `parcel-clear` and the badge counts it.
2. Given BATCH-2026-046 matched and was released by staff today, when the owner opens Decisions, then it appears only under "Went through without you today" with no button.
3. Given Rajesh proposes an edit, when the owner has Decisions open, then the edits card appears within about 1 second.
4. Given a staff user calls the rules-panel update for the SLA hours, when it reaches the server, then it is refused.
5. Given 6 in-stock pieces with 196.4 g pure gold have not moved for the decided threshold, when the owner opens Decisions, then the ageing alert shows them with "Push on WhatsApp" and "Melt and remake".
6. Given nothing is waiting, when the owner opens Decisions, then each block shows its empty state and the badge is 0.

## 16. Risks

- Risk: the owner becomes a bottleneck again if cards grow. Mitigation: group edits and scrap into one card each, keep matched parcels off the cards, review counts in EP-35.
- Risk: the rating in "worst first" has no formula and misleads the owner. Mitigation: decide G4 before showing a rating.
- Risk: the rules panel lets staff change rules (G12). Mitigation: owner check on the server in EP-13.
- Risk: a short green block hides a problem upstream. Mitigation: keep the mockup 13 note and show counts for both blocks.
- Risk: the ageing alert fires on new collections. Mitigation: decide the threshold and any exclusions (G5).

## 17. Open decisions and questions

- G5: what ageing threshold marks gold as sitting too long (mockup 08 shows 90 days), and is it per style or global?
- G4: how is a karigar's rating computed, and what period do loss and lateness cover?
- D7: what does "All branches" show, and can the owner filter by branch?
- A2: is the lead SLA in shop hours or clock hours?
- A3: who hears about a late lead first, and how long before the owner?
- G18: does the rules panel keep a switch for the edit token?
- G21: where is the owner's notification centre, and is Decisions it?
- How is "Metal lost this month" defined (mockup 08 0.71%, 4.3 g across all jobs)?

## 18. Candidate stories

1. EP-32-S1: System can build the owner's exception queue on the server
2. EP-32-S2: Owner can land on Decisions after sign-in
3. EP-32-S3: Owner can see mismatched parcels with the karigar's recent average
4. EP-32-S4: Owner can see raised problems and clear them from the card
5. EP-32-S5: Owner can see open edit proposals and scrap requests as one card each
6. EP-32-S6: Owner can see late leads and overdue jobs under Running late
7. EP-32-S7: Owner can see what went through without him today
8. EP-32-S8: Owner can change the alert rules from the rules panel
9. EP-32-S9: Owner can see where the gold is right now
10. EP-32-S10: Owner can see karigars worst first (G4)
11. EP-32-S11: Owner can see gold sitting too long and act on it (G5)
12. EP-32-S12: Owner can see the badge and cards update live
13. EP-32-S13: System can refuse the Decisions queue to any role but owner
