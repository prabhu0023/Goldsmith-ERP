# JGD Enterprise Suite — UX redesign mockups

SVGs open in any browser or the Kiro artifact panel; the `.mmd` is a Mermaid diagram.
Reasoning lives in [`../UX-REDESIGN-SPEC.md`](../UX-REDESIGN-SPEC.md); every decision and open question
is tracked in [`../SCOPE-ANALYSIS.md`](../SCOPE-ANALYSIS.md).

## The two rules the whole system turns on

1. **Anyone can stop the line. Only the owner can start it again.**
2. **A parcel must match exactly.** Every listed item tagged, and gross, stone and net gold all
   agreeing with the sum of the tags. There is no tolerance to configure.

## Phase 1 — foundations (current)

Three roles: owner, staff, karigar. No QC manager.

| # | File | What it shows |
| --- | --- | --- |
| 01 | `01-foundations.svg` | Six decluttering rules, type scale, colour meanings, the six-state vocabulary, one row before/after |
| 11 | `11-roles-and-permissions.svg` | The three roles, what each may and may not do, and where the old QC manager's work went |
| 12 | `12-state-lifecycles.svg` | How a lead, a karigar job, a parcel, a piece and an edit each move, and who may move them |
| 13 | `13-notifications-escalation.svg` | Owner notification centre grouped by the kind of answer needed, the rules, and the staff "stop the line" composer |
| 04 | `04-parcel-match.svg` | The exact-match gate: the item list, the three-way weight comparison, and the only three answers the screen can give |
| 14 | `14-match-rule-any-parcel.svg` | How the match rule holds for any parcel — the scale-derived ceiling, shown on a 485 g, a 10 kg-whole, and a 10 kg-in-trays parcel |
| 15 | `15-value-ready.svg` | How prices drop in later: the same stock card, dashboard and customer shown pricing-off and pricing-on, with the ValueSlot socket and the one switch |

## Phase 2 — leads (in progress)

| # | File | What it shows |
| --- | --- | --- |
| 16 | `16-lead-inbox.svg` | Both sources in one list — auto-parsed POs and hand-typed leads; confidence, source and the 8-hour SLA per lead; an unreadable PO flagged, never dropped |
| 17 | `17-lead-create.svg` | The two ways in: parsed-PO review (original message beside extracted fields, low-confidence flagged) and the manual create-a-lead form |

| 18 | `18-convert-lead.svg` | The conversion fork, per item: hold a matching piece from stock, or send it to a karigar to be made — one lead can split both ways |
| 19 | `19-order-copy-builder.svg` | The work order sent to a karigar: reference images, the brief, target weights, who makes it, due date, and gold issued from the metal pool |

Phase 2 complete. ("carecard" was a transcription slip for "karigar" — no third entity; the order copy
is the work order to the karigar.)

## Phase 3/4 — parcel intake and the match gate

| # | File | What it shows |
| --- | --- | --- |
| 20 | `20-parcel-arrival.svg` | Step 1: weigh the whole parcel (gross, stone, derived pure gold) on a named scale, and list what is inside — mixed categories, counts that add up |
| 21 | `21-tag-one-item.svg` | Step 2: tag one piece, three weights read fresh off the bench balance, with the running n-of-12 tally in the rail |
| 04 | `04-parcel-match.svg` | Step 3: the exact-match gate — every item tagged and all three weights agreeing, released by staff |
| 22 | `22-owner-clear-mismatch.svg` | When it does not add up: the owner's three ways out — send back, re-check a tag, or accept the loss with a logged reason |

The intake flow now runs end to end: arrival (20) → tag each item (21) → match (04) → on a mismatch,
the owner clears it (22). The scale chosen on screen 20 drives the ceiling computed on screen 04.
| 10 | `10-navigation-map.mmd` | The whole pipeline from inbound PO to billed or scrapped, across three roles |

## Marketing — reaching customers (point 10)

| # | File | What it shows |
| --- | --- | --- |
| 26 | `26-wishes.svg` | Birthday and anniversary wishes: auto-send toggle, the day's queue, two sender identities, opted-in respected |
| 27 | `27-broadcast.svg` | A periodic WhatsApp broadcast: audience filter, templated message with {name}, attached pieces, phone preview; replies become leads |
| 28 | `28-catalogue-share.svg` | The product-file broadcast: pick in-stock pieces into a showcase and send by image and weight; price slot reserved |

## Onboarding — bringing people into the system (owner-level)

| # | File | What it shows |
| --- | --- | --- |
| 23 | `23-onboard-customer.svg` | Contact, group, and when to wish them; piece history by weight; budget and spend as dark sockets until pricing is on |
| 24 | `24-onboard-karigar.svg` | Identity, specialty and bench language; the wastage allowance (0.6–1.2%) that every parcel they make is judged against |
| 25 | `25-onboard-staff.svg` | Name and login; the role picker (staff / owner / karigar) that fixes the permission list; sales counted to them for gamification |

## Reworked to the settled model

These three were redrawn from the first pass to match the three-role, exact-match, money-deferred model.

| # | File | What it shows |
| --- | --- | --- |
| 05 | `05-edit-propose-apply.svg` | Staff propose a tag change with a reason; the owner reads it, gets a WhatsApp token, and applies it. Staff never touch the field |
| 06 | `06-stock-out.svg` | A piece leaves: seller, reference, invoice-number string, no money; a dark value column reserved for when pricing is on; product-out vs scrap |
| 07 | `07-qc-check.svg` | The three checks (scale, hallmark, deductions) as a staff task ending in "checked — on to the next", feeding the match step; no QC-manager role |

## Still from the first pass

Drawn against the written PRD; useful, with these caveats.

| # | File | What it shows | Status |
| --- | --- | --- | --- |
| 02 | `02-staff-home.svg` | Staff "Today" | Money stripped; could gain the lead row in "needs you now" |
| 03 | `03-showroom-stock.svg` | Stock cards + piece drawer | Money stripped; could gain a draft state and a scrap action |
| 08 | `08-owner-home.svg` | Owner decisions, then gold | Money stripped; partly superseded by 13 |
| 09 | `09-karigar-phone.svg` | Bench portal: jobs, job sheet, update | Could gain job acceptance and hand-over to the store |

Deleted along the way, each replaced by a screen built on the settled rules:
`04-parcel-reconciliation.svg` (100 mg tolerance → `04-parcel-match.svg`),
`05-edit-tag-otp.svg` (in-place staff edit → `05-edit-propose-apply.svg`),
`06-sell-flow.svg` (billing with GST → `06-stock-out.svg`),
`07-qc-review.svg` (QC-manager role → `07-qc-check.svg`).

## Design tokens

- **Gold** `#C9961F` the one action to take · **Green** `#1D7A4C` live and matched ·
  **Amber** `#B35309` waiting on a named person · **Red** `#B3261E` stopped ·
  **Dark** `#1C1917` closed and frozen. Everything else is ink on warm paper `#FAF9F7`.
- Text floor 14px (15px on the karigar phone); weights 20–26px tabular monospace, right-aligned,
  always three decimals; gaps under 1 g always expressed in milligrams.
- Numbers come from `src/data/mockData.ts` so they match what staff will really see.

Rendered at 1440px desktop width; 09 is a phone layout shown as three devices.
