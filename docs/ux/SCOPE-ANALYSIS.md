# JGD Suite — scope analysis of the owner's walkthrough

Input: the spoken walkthrough of 1 Nov 2026 (three roles, PO-to-sale lifecycle, ten numbered points).
Purpose: separate what the existing mockups already cover from what has to be designed, and list what
must be answered before design can proceed. UX only — no implementation decisions here.

Existing design assets this is measured against: `docs/ux/mockups/01`–`10` and `docs/ux/UX-REDESIGN-SPEC.md`.

---

## 1. The lifecycle as described

```
Customer sends PO (email / WhatsApp)
      │
      ▼
[AUTO-PARSE] read it, model it, create a LEAD      ← new
      │  staff and owner both see the lead
      │  unattended > 8 h (configurable) → notify owner
      ▼
[LEAD CONVERSION] one of two paths                 ← new
      ├── sell from existing inventory ──────────────────────┐
      └── order copy to karigar (images + content)           │
                │                                            │
                ▼                                            │
        [KARIGAR] accept, due date set                       │
                │  due date missed → tracker + escalation    │
                ▼                                            │
        ready → karigar informed → order dispatched          │
                │                                            │
                ▼                                            │
        [PARCEL ARRIVES AT STORE] bulk, many pieces, daily   │
                │                                            │
                ▼                                            │
        1. record parcel: gross, net gold, stone, other      │
                        + manifest of what is inside         │
        2. parcel ID → tag each item: gross, net, stone      │
        3. match items against the parcel                    │
        4. QC check; mismatch = "disturbance" → notify,      │
                        cannot promote to next stage         │
        5. everything staff enters is DRAFT                  │
                        owner justifies → IN STOCK           │
                │                                            │
                ▼                                            │
        [IN STOCK] ◄─────────────────────────────────────────┘
                │
                ├── product-out sale (seller, reference no., invoice no.)
                └── scrap / melt sale
                │
                ▼
        [REPORTS per section, owner]
```

Cross-cutting, from points 7–10: edit-by-proposal with owner token, onboarding of customer /
karigar / staff, sale attribution for later gamification, wishes and broadcast marketing.

## 2. Role model has changed

The walkthrough states **three roles: owner, staff, karigar**. The PRD and mockups 01–10 assume
**four**, with a separate QC manager (mockup 07 is built for that persona).

Consequence: QC stops being a role and becomes a *stage* — staff perform the checks, the owner is the
only verifier. Mockup 07 must be re-cast as a staff screen, and the owner gains a verification queue.
This is the single biggest structural change to the existing design.

Secondary consequence: the "any entity can notify the owner, only the owner can verify and justify"
rule from point 4 means escalation is a system-wide capability, not a role's menu item.

## 3. What changes in what is already designed

| Existing asset | Change required | Why |
| --- | --- | --- |
| `10-navigation-map.mmd` | Rebuild | Four role homes become three; leads, order copies, karigar tracker, scrap, reports and onboarding are missing branches. |
| `07-qc-review.svg` | Re-cast | QC manager role is gone. Same three checks, but run by staff, and the outcome is "submit for owner verification", not "put it on the floor". |
| `04-parcel-reconciliation.svg` | Rework | Designed for the PRD's narrow case (release unless over 100 mg). The walkthrough makes **every** parcel draft until the owner justifies it, and adds a parcel manifest step that comes *before* tagging. |
| `05-edit-tag-otp.svg` | Rework | Designed as "staff gets a code and edits in place". The walkthrough says staff submit a **proposal**, the owner verifies and applies it, with the token as the second factor. The actor at the keyboard changes. |
| `03-showroom-stock.svg` | Extend | Needs a draft/pending-verification state alongside in-stock, and a scrap disposition. |
| `06-sell-flow.svg` | Extend | Add the attributed seller and the manual reference number; add scrap as a second sale type. |
| `02-staff-home.svg` | Extend | Leads with their SLA countdown become the top item in "needs you now". |
| `08-owner-home.svg` | Extend | Add the verification queue (parcels, edits), unattended-lead alerts, and entry points to per-section reports. |
| `01-foundations.svg` | Extend | Add the draft → proposed → verified state vocabulary and the escalation/notification pattern. |

## 4. Coverage of the ten points

| # | Point | Status | Where it lands |
| --- | --- | --- | --- |
| — | PO auto-read from email/WhatsApp, modelled into a lead | **New** | Lead inbox, parsed-PO review |
| — | Staff and owner both see leads; 8 h configurable SLA; notify owner | **New** | Lead inbox, SLA settings, notification centre |
| — | Lead converts to sell-from-stock **or** karigar order copy with images | **New** | Conversion fork, order-copy builder |
| — | Karigar accepts, due date, overdue tracker, ready → dispatch | **Partly designed** | Mockup 09 covers job sheet and status; acceptance, due-date breach and dispatch are new |
| 1 | Parcel-level gross / net gold / stone / other + manifest | **New** | Parcel arrival screen (precedes mockup 04) |
| 2 | Parcel ID, then per-item gross / net / stone | **Partly designed** | Mockup 04 lists tagged items but the tagging form itself is undesigned |
| 3 | Match items against the parcel | **Designed** | Mockup 04 (gauge + arithmetic) |
| 4 | QC check; disturbance notified; no promotion until matched; owner verifies | **Needs rework** | Mockups 04 + 07, plus a new "raise a disturbance" action and owner verification queue |
| 5 | Staff entries are draft; owner justification promotes to in stock | **Needs rework** | New state model across 03, 04, 07, 08 |
| 6 | Product-out sale (seller, ref no., invoice no.) and scrap/melt sale | **Partly designed** | Mockup 06 extends; scrap flow is new |
| 7 | Owner report dashboard per section | **New** | Report hub plus a repeatable section-report layout |
| 8 | Edit as proposal, owner verifies, double verification by WhatsApp token | **Needs rework** | Mockup 05 re-cast, plus owner approval queue |
| 9 | Onboard customer / karigar / staff; sale assigned to staff for gamification | **Mostly new** | Three onboarding flows, staff directory, sale attribution |
| 10 | Birthday and anniversary wishes, periodic broadcast, product file broadcast | **Partly designed** | Mockup 02 nudges; wishes automation, broadcast composer and catalogue share are new |

Rough count: **4 screens designed and usable**, **5 needing rework**, **about 24 new**.

## 5. New screens to design

**A · Inbound and leads** — 5 screens
Lead inbox with SLA countdown · parsed-PO review (original beside extracted fields, low-confidence
fields flagged) · lead detail with activity timeline · conversion fork · SLA and notification settings.

**B · Order copy and karigar dispatch** — 4 screens
Order-copy builder (images and content) · karigar assignment with due date and metal issued ·
job tracker board with overdue lane · overdue escalation detail.

**C · Karigar app additions** — 2 screens
Accept the job and confirm the due date · mark ready and hand over to the store.

**D · Parcel intake** — 4 screens
Parcel arrival and bulk weights with manifest · tag one item (the data-entry form) ·
raise a disturbance · owner verification queue for parcels.

**E · Stock and QC gate** — 2 screens
Draft stock versus in-stock · QC checklist as a staff task ending in "submit for verification".

**F · Sales** — 3 screens
Scrap and melt disposition · seller attribution on a sale · staff performance view (gamification-ready,
read-only for now).

**G · Edits** — 2 screens
Propose an edit (staff) · owner edit-approval queue with the WhatsApp token step.

**H · Onboarding** — 3 screens
Onboard a customer · onboard a karigar · onboard a staff member with role and permissions.

**I · Marketing** — 3 screens
Wishes automation (birthday and anniversary) with its queue · broadcast composer with audience ·
product catalogue share.

**J · Reports** — 2 screens
Report hub by section · one reusable section-report layout.

**X · Cross-cutting** — 2 artefacts
Notification and escalation centre · the draft → proposed → verified state system added to the
foundations sheet.

## 6. Questions that block design

Ordered by how much design they hold up.

1. ~~**Does the QC manager role really disappear?**~~ **ANSWERED 1 Nov 2026: yes.** Three roles only —
   owner, staff, karigar. Checking is a stage inside the staff flow and ends in "submit for verifying";
   the owner is the sole verifier. Captured in mockups 11, 12 and 13.
2. **"Carecard" — what is it?** The walkthrough both sends an order copy "to the carecard" and asks to
   onboard "the career card" as an entity. Is this the karigar's job card, the karigar's workshop, or a
   third party between the store and the karigar? Groups B and H depend on the answer.
3. **Does the owner verify every parcel, or only mismatched ones?** Point 5 reads as every parcel. With
   a daily parcel of 12–20 pieces, the owner screen becomes a bulk approval queue rather than three
   decision cards. How many parcels and pieces arrive on a normal day?
4. **Who applies an approved edit?** "The editor submits; only the owner verifies and uploads" reads as
   the owner applying it. The existing mockup has staff applying it after receiving a code. Which?
5. **Does the 100 mg tolerance from the PRD still stand**, now that every parcel needs owner
   justification anyway? If it does, is it per parcel or per piece?
6. **What is a scrap sale?** Selling melted material to a refiner, converting unsold stock into scrap
   and then selling it, or taking old gold in from a customer? Who authorises melting?
7. **SLA details.** Is the 8 hours clock time or business hours? Does staff get a warning before the
   owner is notified, and by what channel — WhatsApp, in-app, both?
8. **Parsing confidence.** Is a lead created automatically from a parsed PO and then reviewed, or does
   a person confirm the parse before the lead exists? This changes whether the inbox shows leads or
   candidate messages.
9. **"Two major points of contact under the owner"** for wishes — two contacts per customer household,
   or two sender identities for outbound messages?
10. **Sale attribution** — one staff member per sale, or can a sale be split between two?

## 7. Deliberately out of UX scope for now

Parsing accuracy and the extraction model · WhatsApp Business API templates and approval · gamification
scoring rules (the walkthrough defers these) · the reporting data model · notification delivery
infrastructure. These shape the UI but are decided elsewhere; the screens only need to show states for
success, low confidence and failure.

## 8. Suggested order of UX work

| Phase | Delivers | Blocked by |
| --- | --- | --- |
| 1 | Revised foundations: three roles, the draft → proposed → verified state system, notification pattern, rebuilt navigation map | Q1, Q3 |
| 2 | Inbound and leads (group A) | Q7, Q8 |
| 3 | Order copy, karigar dispatch and tracker (groups B, C) | Q2 |
| 4 | Parcel intake reworked end to end, QC gate, owner verification queue (groups D, E) | Q3, Q5 |
| 5 | Sales including scrap, with seller attribution (group F) | Q6, Q10 |
| 6 | Edit proposals and the owner token flow (group G) | Q4 |
| 7 | Onboarding, marketing, reports (groups H, I, J) | Q2, Q9 |

Phase 1 is worth doing first regardless of the answers to the later questions, because every other
screen inherits its state vocabulary and its navigation.

---

Written 1 November 2026. Supersedes nothing; read alongside `UX-REDESIGN-SPEC.md`.

---

## Appendix A — Phase 1 delivered, 1 Nov 2026

Triggered by the confirmation that the QC manager role disappears.

| Artefact | State |
| --- | --- |
| `mockups/11-roles-and-permissions.svg` | New. Three roles, their powers and limits, and where the QC manager's work went. |
| `mockups/12-state-lifecycles.svg` | New. State rails for lead, karigar job, parcel, piece and edit, each transition labelled with who may pull it. |
| `mockups/13-notifications-escalation.svg` | New. Owner notification centre grouped by the kind of answer needed, the escalation rules panel, and the staff "stop the line" composer. |
| `mockups/10-navigation-map.mmd` | Rebuilt for three roles and the full pipeline, inbound PO through billed or scrapped. |
| `mockups/01-foundations.svg` | Updated to v3: the five PRD statuses replaced by the six real states. |
| `mockups/README.md` | Rewritten, with the first-pass screens marked where they are superseded. |

### Decisions taken in Phase 1

1. **Six states, not five.** Draft · With the owner · Stopped · In stock · Billed · Scrapped. The old
   `AVAILABLE / PENDING_APPROVAL / OUT_OF_STOCK / SOLD / RESERVED` vocabulary does not describe the
   draft-and-justify model, and "sold out" turned out to be a catalogue fact rather than a piece state.
2. **Colour now carries five meanings**, with dark ink added for closed and frozen things (billed,
   scrapped, refused). Previously four.
3. **Stopping the line is a system-wide capability**, not a menu item on any role. Staff and karigars
   both get the same composer, worded identically.
4. **The owner's notification centre is grouped by the kind of answer needed** — your signature,
   someone stopped the line, running late, and for information — rather than by module or by time.

### Assumptions made, pending confirmation

| # | Assumption | Where it shows | If wrong |
| --- | --- | --- | --- |
| A1 | The owner verifies **every** parcel, per point 5, not only mismatched ones | 12, 13 | The owner's queue shrinks back to exception cards and bulk verify disappears |
| A2 | The 8-hour lead timer counts **shop hours**, not clock hours | 13 | One setting flips; no layout change |
| A3 | Staff are warned about a late lead **before** the owner is | 13 | Removes one row from the rules panel |
| A4 | A piece **stays sellable** while an edit proposal is open, and the proposal voids itself if the piece sells | 12 | Needs a seventh state: "frozen pending edit" |
| A5 | Melting always needs the owner, and staff can only request it | 11, 12 | Changes who sees the scrap action in group F |

Assumption A1 is the one with real consequences, and it depends on your daily volume: how many parcels
arrive on a normal day, and how many pieces are in each?

---

## Appendix B — three more answers, 1 Nov 2026

### Q3 · Does the owner verify every parcel? — **only mismatched ones**

This **contradicts point 5 of the walkthrough**, which said staff enter everything in draft and nothing
reaches stock until the owner justifies it. The newer answer is taken as the rule:

> A parcel whose weights agree is released into stock by the staff member who tagged it. The owner is
> never shown it. He is pulled in only when the weights disagree, when a person raises a problem, when
> an edit is proposed, or when a piece is to be scrapped.

Consequences already applied to the Phase 1 screens:

- **Assumption A1 is dead.** The bulk verification queue is removed from screen 13 and replaced by a
  green "went through without you today" block with no buttons, so the owner can see the system working
  without him.
- **Staff gain a permission:** release a matched parcel into stock. Screen 11's staff card now lists it,
  and the "cannot" list narrows to releasing a *mismatched* parcel.
- **The owner's load panel is reframed** from "every arriving piece waits on one person" to why he is
  not a bottleneck.
- **Draft is now a short-lived state**, not a holding pen. It lasts from typing a tag to passing the
  checks, usually minutes.
- **A new single point of failure appears:** the tolerance number. It alone decides how much the owner
  ever sees. Screen 13 puts it beside the lead timer as an owner-editable setting, defaulted to the
  PRD's 100 mg, and adds a line telling the owner that an always-empty green block means the tolerance
  is too tight.

### Q4 · Who applies an approved edit? — **the owner**

Confirms the rail already drawn on screen 12. Staff describe the change and the reason but never touch
the field; the owner reads it, receives the token on WhatsApp, and presses apply. Two factors are his
login and his phone. `05-edit-tag-otp.svg` is therefore superseded in approach and will be redrawn in
Phase 6 as two screens: staff proposing, and the owner applying.

### Q6 · What is a scrap sale? — **mark an in-house piece as scrap and reuse the metal**

Not a sale to a refiner and not old gold taken in from a customer. The piece is taken out of stock,
marked scrap, and its material is reused. "Scrap" and "melted" are the same act.

The important consequence for design: **scrapping closes the piece but not the gold.** The metal goes
back into a pool that can be issued to a karigar again, which is a loop the earlier screens did not
have. Screen 12 and the navigation map now show `scrapped → gold back in the metal pool → issued again`.

Open sub-questions this raises, for Phase 5:

1. Does the metal pool already exist as a concept in your books, or is this a new ledger?
2. When a piece is scrapped, is its stone weight recovered and tracked separately, or written off?
3. Is scrap ever sold outward to a refiner as well, or only ever reused in-house?

### Still blocking

| # | Question | Blocks |
| --- | --- | --- |
| Q5 | **What counts as "the weights disagree"?** Is it one number (100 mg per parcel, as drawn) or the PRD's two bands of 20 mg routine and 100 mg cap? Per parcel or per piece? | Phase 4 — this number is now the hinge of the whole intake flow |
| Q2 | **What is the "carecard"?** | Phases 3 and 7 |
| Q7 | Is the 8 hours shop hours (as drawn) or clock hours, and does staff get warned before the owner? | Phase 2 |
| Q8 | Is a lead created automatically from a parsed PO and then reviewed, or confirmed before it exists? | Phase 2 |
| A4 | Does a piece stay sellable while an edit proposal is open? | Phase 6 |

---

## Appendix C — parcels are heterogeneous, 1 Nov 2026

Owner's clarification:

> A parcel can be anything. It can be any gram, any size. It is not a multiple of the same weight or
> the same amount.

So there is no standard parcel and no standard piece. One parcel may be 50 g, the next 2 kg. Inside a
single parcel the pieces differ from each other, and the PRD's example of one parcel holding 4 harams,
10 rings and 8 bangles is the normal case, not an edge case.

### What this invalidates

1. **The flat 100 mg tolerance drawn on screen 13.** The same absolute allowance is 0.2% of a 50 g
   parcel and 0.005% of a 2 kg one. It would hide every small-parcel problem and flag every large
   parcel. Marked as unsafe pending the choice below.
2. **Any pre-filled or templated weight in the tagging form.** Nothing can be defaulted from a design,
   a category or a sibling piece. Every gross, stone and net figure is typed fresh from the scale.
3. **Any "average piece weight" shortcut** in progress indicators or estimates. Progress through a
   parcel is counted in pieces, never inferred from weight.
4. **Fixed-length manifests.** The parcel screen takes an arbitrary list of mixed categories, with
   per-category counts derived from what is entered rather than asked for up front.

### Two different reconciliations, previously conflated

Drawing this out exposed that the existing data model carries two tolerance figures that measure
different things, and they are 36× apart:

| | What it compares | Source of the difference | Figure in the model today |
| --- | --- | --- | --- |
| **A · Inside the parcel** | the bulk weighing against the sum of the individual tags | scale precision and rounding, once per weighing | `toleranceAllowanceGrams` 0.020 g standard, 0.100 g cap |
| **B · Against the job** | gold issued to the karigar against gold returned in finished pieces | real manufacturing loss: filing, polishing, melting | `allowedWastagePct` 0.6%–1.2% per karigar |

0.8% of a 447 g parcel is 3.58 g — thirty-six times the 100 mg cap. Both numbers are defensible because
they are not measuring the same thing. **The intake gate in mockup 04 is reconciliation A.** Manufacturing
loss belongs to reconciliation B, which happens against the karigar's job and ledger, not at intake.

This matters for the tolerance model: if the difference at intake comes from weighing and rounding
rather than from lost metal, the allowance should grow with **how many pieces were weighed**, not with
how many grams the parcel holds.

### The choice, on the real parcel from `mockData.ts`

Parcel: 485.500 g gross, 38.200 g stone, 447.300 g net gold, 12 pieces. Observed difference 138 mg.

| Option | Rule | On this parcel | On a 50 g / 3-piece parcel | On a 2 kg / 40-piece parcel |
| --- | --- | --- | --- | --- |
| A · flat | 100 mg, any parcel | 100 mg → owner sees it | 100 mg (0.2%, far too loose) | 100 mg (0.005%, far too tight) |
| B · percentage of net gold | 0.02% of net | 89 mg → owner sees it | 10 mg | 400 mg |
| C · per piece weighed | 10 mg × pieces | 120 mg → owner sees it | 30 mg | 400 mg |
| D · hybrid | larger of B and C, with an absolute cap above which the owner always looks | 120 mg → owner sees it | 30 mg | 400 mg, capped |

The 138 mg scenario reaches the owner under all four, so the screens already drawn stay valid whichever
is chosen. The difference shows up on the parcels at the extremes of size.

**Recommendation: option C or D.** C matches the actual source of error at intake and is explainable to
staff in one sentence — "ten milligrams for every piece we weighed". D is C with a safety net for very
large parcels.

### Open

| # | Question | Blocks |
| --- | --- | --- |
| Q5a | Which tolerance model — A, B, C or D — and what figure? | Phase 4 |
| Q5b | Is the check only reconciliation A at intake, with karigar wastage handled separately against the job? | Phase 4 and the karigar ledger screens |
| Q5c | What is the largest and smallest parcel you realistically receive? Needed to sanity-check whichever figure is chosen. | Phase 4 |

---

## Appendix D — the intake gate is settled, 1 Nov 2026

Owner's answers: **same scale** for the parcel and for every piece, and the rule, reworded:

> In a parcel you have 1 kg. That includes net gold weight, stone or other items, and a list of
> elements. The items are listed there. When you feed the parcel information you give the list details.
> Once you start tagging each item you give the net weight, gross and everything. You sum all the items
> and match them with the parcel weight and the other items. Once it matches, only then pull up.

### The gate, as now designed

Two conditions, both hard, no allowance:

1. **The list** — every element listed when the parcel was fed in must be tagged. Twelve listed, twelve
   tagged. Not eleven, not thirteen.
2. **The three weights** — the sum of the tags must equal what the parcel said, on all three figures:
   gross on the scale, stone and other, and pure gold.

Only then can the parcel be pulled up into stock, and staff do that themselves. Anything else stops the
parcel and goes to the owner.

### What changed in the screens

- **`04-parcel-reconciliation.svg` deleted.** It compared net gold only, used the flat 100 mg cap, and
  drew the gauge one-sided. All three are now wrong.
- **`04-parcel-match.svg` drawn.** The item list sits beside the three-way weight comparison, the gauge
  is symmetric around zero with "short" to the left and "over" to the right, and the verdict band
  carries the release button that staff press.
- **The tolerance setting is gone from the owner's rules panel** in screen 13. There is nothing to
  configure, so it reads as a stated rule rather than an editable number. The footer line that warned
  about setting the tolerance too tight is replaced.
- **"Weighs up" became "matches"** everywhere in screens 11, 12 and 13; the navigation map's decision
  node now asks whether every item is tagged and all three weights match; the owner's card header on
  screen 08 became "parcel does not match".

### Why the gauge had to become symmetric

A parcel can come back **heavier** than its tags account for, which is as much a problem as short: a
piece tagged twice, a stone deduction understated, or metal that should not be there. The old gauge ran
from 0 to 100 mg short and could not express it.

### The one question the exact-match rule leaves open

Both weighings happen on the same scale, reading to 1 mg. Each weighing rounds by up to half a
milligram, and a 12-piece parcel involves thirteen weighings — twelve pieces plus the parcel itself. So
a parcel with no gold missing at all can still sum 1–6 mg apart. Per-piece stones recorded in carats and
converted to grams add a little more.

Screen `04-parcel-match.svg` therefore shows three verdicts, and the middle one is **marked on the
screen as needing your decision**:

| Gap | Verdict drawn | Who acts |
| --- | --- | --- |
| 0 mg | Matches exactly | Staff release it |
| 1–6 mg | Off by the last digit only — all that rounding across 13 weighings could explain | **Undecided** |
| 138 mg | Gold unaccounted for, 21× what rounding explains | Owner only |

**Q5d — for the 1–6 mg case, which behaviour do you want?**

1. Treat it as a match. Staff release it, and the screen says "matches to the scale's last digit —
   3 mg over 13 weighings" rather than claiming a false exactness. The allowance is derived from the
   number of weighings (±0.5 mg each), not chosen, so it cannot be tuned upward.
2. Treat it as a mismatch. Truly exact or nothing. Expect most parcels to reach you most days, which
   puts the owner back in the path of every parcel.

Option 1 is recommended. Option 2 reverses the decision recorded in Appendix B.

### Consequential detail now fixed in the design

- No weight field anywhere is ever pre-filled from a design, a category or a sibling piece.
- Progress through a parcel is counted in pieces, never estimated from weight.
- The parcel manifest accepts an arbitrary mixed list; category counts are derived from what is
  entered, not asked for up front.
- Because gross = net + subtracted inclusions on both sides, only two of the three weight comparisons
  can drift independently. All three are still displayed, because showing which one breaks tells staff
  where the typing error is.

---

## Appendix E — the match rule, solved for any parcel, 1 Nov 2026

The owner cannot predict parcel size or piece count, and a 4-decimal balance cannot take a 10 kg load.
The rule must therefore not assume any of them. Decision:

### The system records the scale, and derives the ceiling from it

1. **Every scale used in the shop is registered once.** Each has a name and a readability (its smallest
   step): e.g. "Bench balance, 0.0001 g" and "Platform scale, 0.01 g". A one-time setup, owner-level.
2. **Every weighing records which scale it was taken on.** Picked once per session and remembered; staff
   do not retype it.
3. **The match ceiling is computed, never configured:**

   > ceiling = Σ (½ × readability of the scale used for that weighing), over every weighing in the reconciliation

   Each weighing can be wrong by at most half the scale's smallest step, and the worst case is all of
   them erring the same way. This is the largest gap that instruments alone can produce.
4. **The verdict is the gap against that ceiling**, at full precision, three outcomes only:
   - gap = 0 → **Matches exactly**
   - 0 < gap ≤ ceiling → **Matches within the scales' last digit** (released, and logged; see 1b)
   - gap > ceiling → **Unaccounted for** (stopped, owner only)

Nothing about parcel size, piece count or value appears in the rule. A 12-piece 500 g parcel and a
500-piece 10 kg parcel are judged by the same formula; only the ceiling differs, and it differs for a
reason the staff member can see.

### Why this needs no prediction

The three things the owner cannot predict all drop out:

- **Piece count** — the ceiling sums over however many weighings happened. 12 or 500, same formula.
- **Parcel weight** — absent from the formula entirely. Weight does not set the ceiling; the instruments do.
- **Which scale** — recorded per weighing, so a parcel split across a fine balance and a coarse platform
  scale is handled without anyone choosing a policy.

### Trays fall out naturally, not as a special case

If a parcel is too heavy for the fine balance, staff weigh it in trays on whatever scale fits. Each tray
is a weighing with its own recorded scale; the reconciliation sums them. A 10 kg parcel done in trays on
the 0.0001 g balance keeps a tight ceiling; the same parcel as one reading on a 0.01 g platform scale
gets a looser ceiling — and the screen shows which, so the staff member understands why a big single
weighing is a blunter check. Trays are encouraged by making the ceiling visibly better, not mandated.

### Worked, at ₹7,240/g

| Parcel | How weighed | Ceiling | A 138 mg gap is… |
| --- | --- | --- | --- |
| 500 g, 12 pieces | all on 0.0001 g balance | 0.0007 g (₹5) | 197× over — clearly gold |
| 10 kg, 300 pieces | one reading on 0.01 g platform + 300 pieces on 0.0001 g balance | 0.0200 g (₹145) | 6.9× over — still clearly gold |
| 10 kg, 300 pieces | 20 trays on 0.0001 g + 300 pieces on 0.0001 g | 0.0160 g (₹116) | 8.6× over, and traceable to one tray |

The platform-scale row shows the point plainly: one coarse reading (0.01 g → 5 mg of its own) dominates
300 fine ones. The screen states the ceiling so this is never hidden.

### What this fixes in the build

- The parcel screen stops assuming a single bulk weight. It accepts one reading or many (trays), each
  tagged with its scale.
- The ceiling and the plain-English verdict are computed on screen; there is no tolerance field anywhere.
- New data the model needs: a registry of scales (name, readability), and a scale reference on every
  stored weighing. This is the one schema addition the decision forces.

### Still genuinely open (do not block the build)

- **Q5d** — the middle case (within ceiling): release-and-log (1b, recommended) or treat as mismatch (2).
- Exact readabilities of the real scales in the shop, to seed the registry. The formula does not change;
  only the seed numbers do.

---

## Appendix F — no money anywhere, 1 Nov 2026

Owner's instruction:

> In this application, we are not even talking about or going to talk about any prices or any cost.

This is a **weight, custody and quality** system, not a sales or pricing system. Everything monetary
comes out. The unit of account is grams of gold and counts of pieces, never rupees.

### What this removes

| Removed | Was in |
| --- | --- |
| Gold rate per gram (`DAILY_GOLD_RATE_22K`, the "22K today" top-bar chip) | 02, 03, 06, mockData |
| Price / estimated value per piece (`estimatedValueINR`) | 03 drawer, 08 |
| The entire quote-and-bill flow: gold value, stone value, making charges, GST, grand total, payment mode | 06 |
| "Billed today ₹7.1 L", "₹1.84 Cr this month", capital-ageing in rupees, "₹18.4 L standing still" | 02, 08, 13 |
| Rupee worth of a weight gap at ₹7,240/g | 04, 13, 14 |
| PAN / ₹2 lakh compliance rule (a tax-on-sale concern) | 06, scope groups |

### What a "sale" becomes without money

Point 6 still stands, but as a **stock-out**, not a billing:

- **Product-out** — the piece physically leaves. Recorded: which staff member released it, a reference
  number, and an invoice number typed in from whatever external billing system issues it. No amount.
  The invoice number is a reference string, not a total. It still locks the piece.
- **Scrap** — the piece is melted and its gold returns to the metal pool. No money, as before.

So the system records **that** a piece left and **under which reference**, never for how much. Billing,
GST and pricing live in a separate system the owner already has; this one tracks the gold.

### What stays, and becomes the whole point

- Gross / net gold / stone weights, to four decimals
- The exact-match gate and the scale-derived ceiling (Appendix E) — untouched, it was always grams
- Custody: who holds which gold — karigar, parcel, stock, scrapped, gone
- Metal loss as a **percentage and in grams** against each karigar (wastage), never as a cost
- Piece counts, ageing in days, item lists

### Screens to strip

| # | Change |
| --- | --- |
| 02 | Remove the 22K-rate chip and "billed today ₹". Replace the money stat with grams out / pieces out today |
| 03 | Drawer: drop "price at today's rate" and "₹3,85,000"; keep pure-gold, ageing, reorder count |
| 06 | **Redraw as a stock-out, not a sale.** Pieces leaving + who released + reference + invoice-number string. No price discovery, no GST, no total, no payment mode |
| 08 | Owner dashboard in grams and counts: gold on the floor, gold with karigars, metal loss %, ageing. No turnover, no rupees |
| 13 | "₹18.4 L standing still" → "1,284 g held off the floor"; "11 pieces billed ₹7.1 L" → "11 pieces went out" |
| 14 | Drop the rupee column; the ceiling stands on its own in grams |
| 04 | Already grams-only; remove the single "₹998 of gold" aside if present |

The weight rule, the roles, the states and the custody chain are all unaffected. This is a subtraction,
not a redesign — it makes the product narrower and sharper.

### One question

The PRD and the first-pass screens leaned on sales value (dead-capital ageing, turnover, VIP tiers by
spend). With money gone, **does the owner still want a customer directory at all**, and if so, for what
— wishes and contact only, no purchase history in rupees? This reshapes scope groups F, H and I but
blocks nothing in the core weight pipeline.

---

## Appendix G — money is deferred, not excluded, 1 Nov 2026

Owner's refinement of Appendix F:

> We are going to have prices later. Customer history, customer budget, everything. Everything will tie
> up with the pieces and weight. For now, if in future we involve prices we will do it, but make a
> facility. We are not going to do it now.

So Appendix F was half right. **Hide money now; design so it drops in later without a rebuild.** This is
a build-posture decision, not a visual one, and it changes how the stripping in Appendix F is treated.

### The rule for the build

Treat value as a **capability that is switched off**, not a feature that is absent.

1. **The data model keeps the money fields from day one** — `pricePerGram`, `pieceValue`,
   `customer.budget`, `customer.purchaseHistory[]`, invoice `amount`. They are nullable and simply
   unused now. Adding a column later is a migration; adding it now while it is free is not.
2. **One switch, `pricingEnabled`, defaults off.** Every money element in the UI is rendered behind it.
   Off, the element is not shown and its space collapses. The owner flips it on the day pricing starts;
   no screen is redesigned.
3. **Layouts leave the socket.** Where a value will live — a third line on the stock card, a column in
   the stock-out, a band on the owner dashboard, a budget line on the customer — the composition already
   accommodates it, so turning it on rearranges nothing. The socket is invisible when empty.
4. **Weight stays the spine.** Everything ties to the piece and its grams; value, when it arrives, hangs
   off the piece, never replaces the weight. A card leads with pure gold now and will still lead with
   pure gold after pricing is on; value joins as a secondary line.

### What this changes versus Appendix F

Appendix F said "remove". The correct verb is **"hide behind the switch, keep the socket."**

| Place | Now (pricing off) | Later (pricing on) — no redesign |
| --- | --- | --- |
| Stock card (03) | two lines: pure gold, gross · stones | a third line appears: value at the day's rate |
| Piece drawer (03) | facts grid in grams and days | a value row joins the grid |
| Stock-out (06) | pieces, who released, reference, invoice-number string | a value column and totals appear on the same layout |
| Owner dashboard (08) | gold on floor, with karigars, metal loss %, pieces out | a value band joins the four-stat row |
| Customer (H) | name, phone, DOB, anniversary, piece history by weight | budget line and spend history light up |
| Top bar (02) | gold out today, in grams | the day's rate chip returns |

Nothing is deleted from the model. The visible screens stay money-free, which is what the mockups now
show, and each carries a quiet socket where value will land.

### The one new primitive

A `ValueSlot` component: given `pricingEnabled` off it renders nothing and takes no space; on, it renders
the amount. Every money figure across every screen goes through it, so the whole system turns on with one
flag. This is the facility the owner asked for, expressed in one place.

### Customer directory — resolved

Appendix F asked whether customers belong in the system at all without money. Answer from this note:
**yes, fully.** Customer history, budget and spend are explicitly coming. The directory is built now with
name, phone, DOB, anniversary and a piece-history list keyed by weight and tag; budget and rupee history
are `ValueSlot` fields, dark until pricing is on. Groups F, H and I keep their customer scope.

### Net effect on the mockups

No visible change from the Appendix F state — the screens stay money-free today. The change is in the
spec and the eventual data model: fields present, one switch, sockets reserved. `06-sell-flow` will be
redrawn as a stock-out whose layout already has the dark value column, so switching pricing on later adds
numbers to an existing column rather than forcing a new one.

---

## Appendix H — how leads are born, 1 Nov 2026

Answers Q8, and adds a path.

### Two sources, one lead

1. **Automatic from a PO.** A purchase order arrives by email or WhatsApp, is parsed, and becomes a
   lead on its own. No one types it from scratch.
2. **Manual.** Staff create a lead directly — walk-in or phone enquiry — with no incoming document.
   (Owner's "we also create a preorder manually.")

Both converge on the same lead object and the same pipeline from there.

### The parse is reviewed, never blindly trusted

A PO is free-form: a WhatsApp line, a photographed note, a typed email. Parsing is usually right,
sometimes wrong. So an automatic lead is **created in a "needs a glance" state**: the original message
is shown beside the extracted fields, low-confidence fields are flagged, and a staff member confirms or
corrects in seconds. Confirmed → ordinary lead. The manual path has no parse, so no glance.

### Unreadable POs — decision: option A

> When a PO cannot be parsed confidently, **always create the lead anyway**, flagged "please check".

Nothing from a customer is ever silently dropped. The lead list carries some messy entries; the 8-hour
unattended timer (Appendix B) backstops any that sit unglanced. Rejected option B (a separate
"couldn't read" tray) because a held message can be ignored into oblivion, and a jeweller never wants a
real order to vanish because the reader choked.

### Lead states, refined

Draft rail from mockup 12 gains a front segment for the automatic source:

```
Parsed, needs a glance  →  Opened  →  Being worked  →  Converted  →  (Lost / expired)
     (auto only)                                        │
manual leads enter here ─────────────┘ at "Opened"
```

- "Parsed, needs a glance" carries a confidence marker; an unreadable PO lands here flagged, not skipped.
- The 8-hour timer runs from arrival regardless of source.

### Phase 2 screens, now specified

| Screen | Purpose | Blocked? |
| --- | --- | --- |
| Lead inbox | both sources in one list; source and confidence shown; SLA countdown per lead | no |
| Parsed-PO review | original message beside extracted fields; flagged fields; confirm or fix | no |
| Create a lead (manual) | staff type a walk-in / phone enquiry straight in | no |
| Conversion fork | sell-from-stock **or** order copy to a karigar | **yes — needs the carecard answer** |

First three can be drawn now. The fork, and the order-copy builder behind it, wait on the carecard.

### Still the one blocker

**What is the "carecard"?** The order copy goes "to the carecard." Until it is one of {the karigar's job
card, the karigar's workshop as an entity, a third party between store and karigar}, the conversion fork
and groups B and H cannot be drawn correctly.

---

## Appendix I — "carecard" resolved, 1 Nov 2026

"Carecard" was a speech-to-text slip for **karigar**. There is no third party and no new entity. The
order copy is the work order sent to the karigar — the path already drawn in the lifecycle (mockup 12)
and the navigation map (mockup 10). Every earlier mention of "carecard" in this document should be read
as "karigar".

This unblocks the last two Phase 2 screens:

- **Conversion fork** — from a worked lead, choose: sell from stock, or raise an order copy to a karigar.
- **Order-copy builder** — the work order itself: images and content, target weights, the chosen
  karigar, due date and gold to be issued. On confirm it becomes the karigar job that starts the
  manufacturing rail (accepted → bench → ready → handed over).

No open blockers remain for Phase 2. Groups B and H (order copy, karigar dispatch, onboarding) are
drawable in full.
