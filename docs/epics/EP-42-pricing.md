# EP-42: Pricing

## 1. Summary

The app tracks gold by weight and deliberately shows no money today. The owner has said prices will come later:
piece value, customer budget and spend, and invoice amounts, all tied to the same pieces and grams. The prototype
already carries the facility for this: nullable money fields on pieces, customers and stock-outs, one owner-level
switch `pricingEnabled` that defaults off, and one `ValueSlot` component through which every rupee figure must pass.
This epic turns that facility on. It adds a gold rate source, computes each piece's value at the day's rate, fills
customer budget and spend, records the invoice amount on a stock-out, and shows a value band on the owner dashboard.
Weight stays the main figure on every screen; value is a second line.

## 2. Layer, milestone, status

- Layer: F · Later
- Milestone: None (Layer F, later; not in a PRODUCTION-SCOPE §7 milestone)
- Prototype status: Partial. The facility exists (`pricingEnabled` false, `ValueSlot` as the only currency formatter, nullable `valueINR`, `budgetINR`, `spentINR`, `amountINR`), but there is no gold rate, no value computation, and every money field is null.

## 3. Roles involved

- Owner: turns pricing on or off; sets or confirms the day's gold rate if the rate is entered by hand; sees the value band on the Decisions home; sets or approves a customer budget.
- Staff: see piece values on stock cards and the piece drawer, see the value column and total on a stock-out, and record the invoice amount if decided.
- Karigar: never sees a price (mockup 11).
- System: fetches or stores the gold rate, computes piece values and totals, updates customer spend after a stock-out, and renders every figure through `ValueSlot`.

## 4. In scope

- The owner-level pricing switch `pricingEnabled`, owner-only and audited on the server (gap G12).
- A gold rate source: per day, per purity if decided, from a provider or entered by the owner (UX-SPEC §7 Q1).
- The day's rate chip in the top bar (SCOPE-ANALYSIS App. G, top bar 02).
- Piece value at the day's rate on the stock card and as a row in the piece drawer.
- Stock-out value column and total value, and the invoice amount stored on the stock-out record.
- Owner dashboard value band: "Worth at today's rate" for gold on the floor.
- Customer budget line and spend history on the customer record.
- Value in the catalogue share piece card, if decided (mockup 28 "price added here once pricing is on").
- Money fields stored without floating point.
- Turning pricing off again hides every value without deleting stored amounts.

## 5. Out of scope

- The pricing setting's storage (EP-13); this epic decides what it reveals.
- Piece weights, the match gate and the ceiling, which never depend on pricing (EP-21, EP-23).
- The stock-out record's seller, reference and invoice number (EP-26).
- Customer records, groups and consent (EP-17).
- Billing, GST and payment, which live in the owner's separate billing system (SCOPE-ANALYSIS App. F); no epic owns them.
- Sales scoring by value (EP-43).
- Reports in rupees; reports stay in grams and counts (EP-35).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `Piece.valueINR: number | null`, `Customer.budgetINR` and `Customer.spentINR: number | null`, `StockOutRecord.amountINR: number | null`, `Settings.pricingEnabled: boolean`. The file header says nothing reads the money fields while pricing is off.
- `src/data/seed.ts`: every money field is `null`; `pricingEnabled: false`.
- `src/store/transitions.ts`: `saveTag` sets `valueINR: null`, `stockOut` sets `amountINR: null`, `onboardCustomer` sets `budgetINR` and `spentINR` to `null`; `setSetting` has no owner check and returns early for `pricingEnabled`, so the switch is not audited (G12).
- `src/components/ui/ValueSlot.tsx`: renders nothing while `pricingEnabled` is false; when on, prints the value with `Intl.NumberFormat('en-IN', currency INR)` or "not set". The comment says nothing else in the app may print a currency symbol.
- `ValueSlot` is placed in `src/components/stock/ShowroomStock.tsx` (stock card "Value"), `src/components/stock/PieceDrawer.tsx` ("Value"), `src/components/stock/StockOut.tsx` (per piece and "Total value", passed `null`), `src/components/people/Customers.tsx` ("Budget", "Spend so far", "Spend"), `src/components/people/OnboardCustomer.tsx` ("Budget", "Spend so far", passed `null`) and `src/components/marketing/CatalogueShare.tsx` ("Value at today's rate"). There is no socket yet for the owner dashboard value band or the top-bar rate chip.
- `src/components/shell/AppShell.tsx` `PricingToggle`: a dev switch in the rail that flips `pricingEnabled` for any role.
- `.agents/tasks/jgd-redesign/review.md`: 2,430 rendered combinations with pricing off contain no `₹`, `INR`, `Rs` or `rupee`; `Intl.NumberFormat` with INR appears once, inside `ValueSlot`.
- Reusable: `ValueSlot` and every socket placement, the nullable fields, the switch.
- Must be rebuilt server-side: the owner-only switch with audit, the gold rate store and source, value computation, customer spend updates, invoice amount validation; the dev `PricingToggle` is removed.

## 7. Functional requirements

- FR-42-1. Only the owner can change `pricingEnabled`; the server refuses anyone else (G12).
- FR-42-2. Every change of `pricingEnabled` writes an audit entry with before and after.
- FR-42-3. With pricing off, no screen shows a currency figure and no API response to staff or karigar carries a computed value.
- FR-42-4. The system stores a gold rate per day, with its source, time and, if decided, purity.
- FR-42-5. The owner can enter or confirm the day's rate if the rate is not fetched automatically.
- FR-42-6. The top bar shows the day's rate chip while pricing is on.
- FR-42-7. The system computes each in-stock piece's value at the day's rate using the formula the owner decides.
- FR-42-8. The stock card shows value as a third line below pure gold and gross · stones, and the piece drawer shows a value row.
- FR-42-9. The stock-out screen shows a value per piece and a total value, and the stock-out record stores the invoice amount as decided.
- FR-42-10. The Decisions home shows "Worth at today's rate" next to gold on the floor.
- FR-42-11. The customer record shows budget and spent; spent updates when a stock-out linked to that customer is recorded (needs G13).
- FR-42-12. Every currency figure renders through `ValueSlot`; a test fails if any other component formats currency.
- FR-42-13. A karigar never receives a value, rate or budget in any screen or API response.
- FR-42-14. Turning pricing off hides every value again and keeps stored amounts.
- FR-42-15. Money amounts are stored as integers in the unit decided, never as floating point.

## 8. Business rules

- BR-42-1. Hide money now; design so it drops in later without a rebuild. [SCOPE-ANALYSIS App. G]
- BR-42-2. The data model keeps the money fields from day one, nullable and unused. [SCOPE-ANALYSIS App. G rule 1]
- BR-42-3. One switch, `pricingEnabled`, owner-level, defaults off. [SCOPE-ANALYSIS App. G rule 2; mockup 15]
- BR-42-4. Layouts leave the socket; turning pricing on rearranges nothing. [SCOPE-ANALYSIS App. G rule 3; mockup 15]
- BR-42-5. Weight stays the spine; value is a secondary line and never replaces the grams. [SCOPE-ANALYSIS App. G rule 4; mockup 15]
- BR-42-6. Every rupee on every screen renders through one `ValueSlot`. [SCOPE-ANALYSIS App. G; src/components/ui/ValueSlot.tsx]
- BR-42-7. Turning pricing on only reveals value; it changes no layout and touches no gram. [mockup 15]
- BR-42-8. A karigar sees no prices. [mockup 11; mockup 25]
- BR-42-9. Billing, GST and pricing of sales live in a separate system the owner already has; the invoice number is a reference string. [SCOPE-ANALYSIS App. F]
- BR-42-10. Every state change is audited. [PRODUCTION-SCOPE §5 Audit]

## 9. Data

- GoldRate: date, purity (if decided), rate per gram (integer in the decided money unit), source (provider or owner), entered or fetched at, entered by.
- Piece: `valueINR` (nullable value socket, unused until this epic; computed or stored per the decision), alongside gross and stone (integer, units of 0.0001 g).
- Customer: `budgetINR`, `spentINR` (nullable value sockets, filled by this epic); spend history entries linked to stock-out records.
- StockOutRecord: `amountINR` (nullable value socket, filled by this epic), linked customer id (needs G13).
- Settings: `pricingEnabled` (boolean, default false), changed by owner only, audited.
- Audit entry kinds: `setting_changed` for the switch, a new kind for rate changes.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Update | Pricing switch | Turn pricing on or off | Owner |
| Read | Today's gold rate | Rate chip and value computation | Owner, Staff (pricing on) |
| Create | Gold rate | Enter or confirm the day's rate | Owner, System (provider fetch) |
| List | Gold rate history | Past rates with source | Owner |
| Read | Piece value | Value at today's rate for one piece | Owner, Staff (pricing on) |
| Read | Floor value | "Worth at today's rate" for the dashboard | Owner |
| Update | Customer budget | Set a customer's budget | Owner, Staff as decided |
| Read | Customer spend | Budget and spent with history | Owner, Staff (pricing on) |
| Update | Stock-out amount | Record the invoice amount | Staff, Owner as decided |

## 11. Live events

- Consumes: "Piece billed by one staff member" — to add the stock-out amount to the customer's spend and drop the piece from the floor value.
- Consumes (proposed, not in catalogue): "Setting changed" — so every open screen shows or hides the value sockets when the owner flips `pricingEnabled` (gap G26).
- Emits (proposed, not in catalogue): "Gold rate changed" — when a new day's rate is stored, so rate chips, piece values and the floor value refresh on open screens (gap G26).

## 12. Screens and UX references

- Route ids: `stock` (stock card third line, piece drawer value row), `stock-out` (value column and total), `decisions` (value band), `today` (rate chip in the top bar), `customers` and `customer-new` (budget and spend), `catalogue` (piece card value, if decided).
- Mockups: `15-value-ready.svg` (main: "ONE SWITCH, OWNER-LEVEL, DEFAULTS OFF"; with pricing on: "Value at today's rate ₹3,85,000" for TAG-8841 with 41.590 g pure gold, "Worth at today's rate ₹1.34 Cr" for 1,847 g, "Budget ₹8,00,000 · spent ₹5,37,145" for Meera Iyer), `06-stock-out.svg` ("value · when on", "total value fills here later"), `03-showroom-stock.svg`, `08-owner-home.svg`, `23-onboard-customer.svg` (budget and spend), `02-staff-home.svg` (rate chip, per App. G), `28-catalogue-share.svg` ("price added here once pricing is on").
- Not yet designed: gold rate entry and history for the owner.

## 13. Non-functional requirements

- Precision: money is stored as integers in the decided unit; value computation from weights reads integer units of 0.0001 g and rounds once, at the end, by a decided rule.
- Security: the switch and rate entry are owner-only on the server; values are filtered out of karigar responses on the server, not only hidden in the UI.
- Audit: switch changes, rate entries and budget changes are appended with before and after.
- Concurrency: a stock-out records the amount in the same transaction that marks the pieces billed.
- Personal data: customer budget and spend are personal data and follow EP-39 deletion rules.
- Performance: turning the switch on shows values on open screens within about 1 second.
- Time: the "day" of a rate is the Asia/Kolkata day.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-22, EP-26, EP-08
- Downstream: None.

## 15. Epic acceptance criteria

1. Given pricing is off, when any screen is rendered for any role, then no currency figure appears.
2. Given a staff member, when they try to turn pricing on through the API, then the server refuses it.
3. Given the owner turns pricing on and a day's rate exists, when Rajesh opens TAG-8841, then the card shows pure gold first, gross · stones second, and value at today's rate as a third line, with no layout change.
4. Given pricing is on, when Lakshmi Devi opens her jobs on the karigar portal, then no value, rate or budget appears and none is in the API response.
5. Given pricing is on and a stock-out with an invoice amount is linked to Meera Iyer, when it is recorded, then her spent figure increases by that amount.
6. Given pricing is turned off again, when screens refresh, then every value hides and stored amounts remain.

## 16. Risks

- Risk: a component prints currency outside `ValueSlot` and money appears while pricing is off. Mitigation: a test fails on any other currency formatter (EP-40).
- Risk: the value formula is guessed instead of decided. Mitigation: no story builds the formula until the owner signs it off.
- Risk: the rate provider is down and values go stale. Mitigation: show the rate's date and source next to the chip, and let the owner enter it by hand.
- Risk: customer spend cannot be computed because stock-outs carry no customer (G13). Mitigation: settle G13 in EP-26 before building spend.
- Risk: floating point money creeps in through the formatter. Mitigation: integers in storage and computation, conversion only for display.

## 17. Open decisions and questions

- UX-SPEC §7 Q1: where does the gold rate come from: a provider, the owner each morning, or both?
- Is the rate per purity (22K, 18K) or one rate converted by purity?
- What is the piece value formula: pure gold × rate only, or also making charges, stone value and tax?
- Is a piece's value fixed at tagging, or recomputed at each day's rate?
- In which unit is money stored (paise or rupees), and how is it rounded?
- Is the invoice amount typed from the external billing book or computed by the app?
- G12: is the pricing switch audited, and does the dev `PricingToggle` go?
- G13: does a stock-out record the customer, so spend can be computed?
- Who sees values: owner only, or staff too?
- Does the catalogue share ever show a price to customers?
- G26: are "Setting changed" and "Gold rate changed" accepted into the live event catalogue?

## 18. Candidate stories

1. EP-42-S1: System can store money as integers in the decided unit
2. EP-42-S2: System can refuse a pricing switch change from anyone but the owner (G12)
3. EP-42-S3: System can audit every change of the pricing switch
4. EP-42-S4: Owner can enter or confirm the day's gold rate
5. EP-42-S5: System can fetch the day's gold rate from the chosen source
6. EP-42-S6: Owner can turn pricing on and off
7. EP-42-S7: Staff can see the day's rate chip in the top bar
8. EP-42-S8: System can compute a piece's value at the day's rate by the agreed formula
9. EP-42-S9: Staff can see piece value on the stock card and piece drawer
10. EP-42-S10: Staff can see the value column and total on a stock-out
11. EP-42-S11: Staff can record the invoice amount on a stock-out
12. EP-42-S12: Owner can see the value band on the Decisions home
13. EP-42-S13: Owner can set a customer budget and see spend history
14. EP-42-S14: System can keep all values out of karigar responses
15. EP-42-S15: System can refresh open screens when pricing or the rate changes
