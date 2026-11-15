# JGD Enterprise Suite — UX redesign spec v2

Companion to the mockup set (screens 01–10). The PRD decides *what* the system does; this decides *how little of it is on screen at once*.

---

## 1. What is wrong with v1

Measured against the current code, not impressions.

| Problem | Evidence in v1 |
| --- | --- |
| Two navigation bars stacked | `Header.tsx` renders a black role-simulation strip plus a 16px-tall brand/nav row. 10 `AppTab` values, up to 6 visible at once, and the nav markup is duplicated four times, once per role. |
| The page starts with chrome, not content | `InventoryView` puts title, subtitle, view toggle, primary button, 3 stat cards, 5 status tabs, 2 dropdowns and a search box above the first row of data. 14 controls before any jewellery. |
| Text below the readable floor | `text-[10px]` and `text-[11px]` appear throughout for tag numbers, HUIDs, weights and totals — the numbers staff are legally accountable for. |
| Six accent colours, no shared meaning | amber (brand *and* warning), purple (QC), blue (customers *and* reserved), emerald (ok *and* WhatsApp), rose (discrepancy), stone (neutral). A row can carry four at once. |
| Schema language on screen | "Net Au Wt", "Deductible Inclusions", "DISCREPANCY_PENDING_OWNER", "LOCKED_IN_STOCK", "Intake Scale Gross Weight". |
| Views rendered as modals | `activeTab === 'batches'` and `'customers'` render `BatchReconciliationModal` / `CustomerDirectoryModal` with `isOpen={true}` inline, so a full page masquerades as a dialog and the close button navigates. |
| Competing actions per row | Reorder, Edit, View, Mark Sold all at equal weight, 10px, before the user has read the piece. |

## 2. The six rules (screen 01)

1. **One job per screen.** Everything else is a drawer, a step, or a second click.
2. **14px floor.** No 10/11px text. Weights at 20px, tabular mono, right-aligned so decimals stack.
3. **Colour only means status.** Gold = the action you are meant to take. Green = settled. Amber = needs a person. Red = blocked. Nothing else is coloured.
4. **Counter language.** "Pure gold in this piece", not "Net Au Wt". Codes (TAG, HUID, BATCH) sit on a quiet second line.
5. **Long forms become short steps.** Intake, tagging and billing are 3-step flows, one decision per step, always reversible.
6. **Numbers are drawn.** Tolerance, ageing and wastage appear as a gauge first, a figure second.

## 3. Information architecture (screen 10)

Ten flat tabs behind a role filter become **four role homes with a short rail**.

| Role | Home | Rail (max 5) |
| --- | --- | --- |
| Showroom staff | **Today** — a list of what needs them, then three ways to start work | Today · Showroom stock · Sell · Parcels in · Customers (+ Showcase) |
| QC manager | **To check** — piece 3 of 5, one at a time | To check · Parcels · Showroom stock · Quotes |
| Karigar | **My jobs** on a phone | Jobs · Gold · Me |
| Owner | **Decisions** — only things nobody else may do | Decisions · Money and stock · Karigars · Security log (+ shopfloor group) |

Two structural moves:

- **Role switching leaves the chrome.** The simulation strip becomes the avatar chip at the bottom of the rail. It is a dev/demo affordance, not a permanent banner.
- **The OTP switch moves to the owner's own screen.** It is the owner's rule, so it lives under "Your rule" in the owner rail — not in a global header where every role stares at it.

## 4. Screen by screen

**02 · Staff home.** Replaces landing on a 42-row table. "Needs you now" is a ranked list of at most 3–5 cards, each one sentence of plain English plus one button. Red card = blocked (parcel over 100 mg), amber = waiting (untagged pieces, expiring quote). Below it: three large starters (sell, receive a parcel, add a customer), the showcase in four figures, and today's birthdays.

**03 · Showroom stock.** One search, four count chips, one overflow "More filters", one sort. Cards carry four facts: name, pure gold, state, one action. Everything else — value, ageing, HUID, batch, inclusions, edit history — lives in the right-hand drawer, where the pure-gold figure is the hero and the breakdown is collapsed until asked for. A sold-out card shows a single recovery action ("Order another from Vijay") instead of four buttons.

**04 · Parcel reconciliation.** The 3-step frame (weigh → tag → release) is permanent. The verdict is a sentence — "138 mg of gold is missing" — then a gauge with the 20 mg normal band, the 100 mg limit and a marker at the real variance. The arithmetic is a quiet four-line panel to the right. When over the limit, the only action band on the screen says who must decide and why, and the staff-facing release button is absent rather than disabled-with-a-tooltip.

**05 · Edit a tag.** Three panels, one decision each: pick the reason → read the code the owner received on WhatsApp → change the weight. The WhatsApp payload is shown to staff so they can read it out, and the live diff ("was 48.650 g · you are taking off 40 mg") appears next to the field, not after saving. A billed piece gets no form at all: a single locked card naming the invoice, the date, and the one legitimate remedy (credit note).

**06 · Sell.** Three steps: pick pieces → customer and PAN → bill and clear stock. Price discovery is itemised per piece (gold / stones / making) so a customer can be shown the screen. The ₹2 lakh PAN rule surfaces as a green "PAN on file" chip with the reason underneath, so compliance is visible before billing, not blocking at the end. The final button says what it actually does: *Bill it and clear stock*.

**07 · QC manager.** A queue is a reading list, not a table. One piece fills the screen as "piece 3 of 5": the intake photo at full size, then exactly three checks — does the scale agree, is the hallmark on the piece, do the deductions look honest. The third check carries a soft benchmark ("rings this size usually carry 0.6–0.9 g of lac") so judgement has a reference. Two ways out, both plain, both landing on piece 4.

**08 · Owner home.** The first screen is only decisions that cannot be delegated: a parcel over the limit, a pending code request, capital sitting still. Each states the money at stake and the history behind it ("his last 6 parcels averaged 31 mg; this is four times that"). Business figures come after the decisions. The karigar scorecard is ranked worst-first and explicitly says when the rest need no attention.

**09 · Karigar phone.** Bench conditions: 56px targets, 15px floor, no prices, no customers, no other karigar's jobs. Three screens — what is on my bench (with "gold with me" as the hero), what I have to make (reference photo first, then target weight, gold after stones, allowed variance), what I have done (four tappable states, optional photo, voice note). A Hindi toggle sits in the header.

## 5. Component inventory

New or reshaped primitives the implementation needs:

- `AttentionCard` — coloured left edge, one sentence, one action. The unit of every home screen.
- `WeightReadout` — tabular mono, three decimals, unit label, optional "was X" diff.
- `ToleranceGauge` — bands at 20 mg and 100 mg, marker at actual variance, colour from the band it lands in.
- `StatusChip` — five states only, plain words, dot + label, no enum.
- `DetailDrawer` — right-side, hero figure, facts grid, collapsed sections, sticky action bar.
- `StepFrame` — 3-step header with completed/current/upcoming, used by intake, tagging and billing.
- `OtpPanel` — reason picker, WhatsApp preview, 6-box code entry, countdown.
- `QueueReview` — n-of-m focus view with skip/back and a fixed decision bar.
- `RoleChip` — avatar + role + switcher, bottom of rail.

## 6. Cross-cutting rules

- **Responsive.** Rail collapses to icons at 1024px and to a bottom bar at 768px. Drawers become full-screen sheets below 768px. The karigar portal is phone-first and never shown in a desktop frame.
- **Numbers.** Grams always three decimals; variance under 1 g always shown in mg; rupees in Indian grouping; gold rate stamped once in the top bar so no screen repeats it.
- **Empty states.** Every list says what to do next, never "No records found".
- **Accessibility.** Status is never colour alone — every chip has a word. Hit targets 44px desktop, 56px on the karigar phone. Text contrast at least 4.5:1 against its own background (the amber-on-amber-100 combinations in v1 fail this).
- **Irreversible actions** name their consequence in the button label ("Bill it and clear stock", "Send it back"), never a bare "Confirm".

## 7. Open questions for the client

1. Does the 22K rate come from a feed, or does a manager set it each morning? Screen 02 and 06 assume one rate stamped once per day.
2. Who may release a parcel inside the 20–100 mg band — staff, or QC only? Screen 04 currently lets either, per PRD 4.1.
3. Should the quote hold a piece (reserve it) as screen 06 assumes, or leave it sellable until billed?
4. Is the Hindi toggle on the karigar phone wanted, and are there other languages at the bench?
5. Does the owner want code requests pushed as WhatsApp replies (approve from the phone), or only from this screen?

---

Mockups: screens 01–10 in this session's artifact panel. Produced 1 November 2026.
