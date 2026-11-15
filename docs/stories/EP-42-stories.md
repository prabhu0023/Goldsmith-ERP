# EP-42: Pricing · stories

Epic document: [EP-42 Pricing](../epics/EP-42-pricing.md)

Role note: this is a layer F (Later) epic and the only epic with price logic. Stories use "System" for the server storing money, fetching the rate, computing values and filtering responses on its own. Most rules here wait on open decisions in section 17 (rate source, per-purity rates, value formula, fixed or daily value, money unit and rounding, typed or computed invoice amount, G13 customer on stock-out, who sees values). Where a decision is open, the criteria are written neutrally and the story flags it. Worked examples assume money in paise and the formula "pure gold × rate" only to show the arithmetic; neither is decided. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff), Lakshmi Devi (Karigar) and the customer Meera Iyer. Weights are integers in units of 0.0001 g and shown to 4 decimals; TAG-8841 has pure gold 41.5900 g, gross 48.6500 g and stones 7.0600 g (mockup 15 prints 3 decimals). Weight stays the first figure on every screen and value is a second line (BR-42-5).

---

## EP-42-S1: System can store money as integers in the decided unit

- **Story ID:** EP-42-S1
- **Title:** System can store money as integers in the decided unit
- **As a:** System
- **I want:** every money column (`pieces.valueINR`, `customers.budgetINR`, `customers.spentINR`, `stock_outs.amountINR` and the new gold rate per gram) to be an integer column in one decided money unit, with shared helpers that convert to and from the display string and one rounding rule applied once at the end of a computation
- **So that:** no rupee amount is ever stored or summed as floating point, and every figure on every screen agrees to the last unit (FR-42-15, BR-42-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when the schema is inspected, then `valueINR`, `budgetINR`, `spentINR` and `amountINR` are nullable integer columns with no default, in the decided unit, and no money column anywhere has a floating point or decimal-fraction type.
  2. Given the decided unit is paise (example), when the helper converts the display string "₹8,00,000" to storage, then it returns the integer 80000000, and converting 80000000 back returns "₹8,00,000".
  3. Given an exact intermediate result of 38499863.0 paise from integer inputs, when the shared rounding helper is applied, then it returns one integer by the decided rule, and no step before it rounds.
  4. Given a request that sends a money amount as a fractional number such as 385000.5 where the unit is paise, when the contract check runs, then it is refused as a validation error and nothing is stored.
  5. Given existing rows from v1, when the migration runs, then every money column stays null and no weight column changes.
- **Rules enforced on the server:** Money fields in the shared contract are integers only (EP-03-S2). Conversion to a currency string happens only at display, inside `ValueSlot` (BR-42-6). Values are computed from integer weights in units of 0.0001 g with integer arithmetic and rounded once by the decided rule. No column is written in this story.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No. Schema change only; no state changes.
- **Data changes:** Migration confirming or converting `pieces.valueINR`, `customers.budgetINR`, `customers.spentINR`, `stock_outs.amountINR` to nullable integers in the decided unit (EP-02-S4, EP-02-S5, EP-02-S10). Adds the money conversion and rounding helpers to the shared package beside the weight helpers (EP-02-S2).
- **UI reference:** No screen.
- **Non-functional checks:** Precision: money in integers in the decided unit; value computation reads integer units of 0.0001 g and rounds once, at the end (epic section 13). Open question: whether money is stored in paise or rupees and how it is rounded. The column names keep the `INR` suffix from the prototype; renaming is not part of this story.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S4, EP-02-S5, EP-02-S10, EP-03-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S2: System can refuse a pricing switch change from anyone but the owner (G12)

Cross-reference: the owner-only check on `pricingEnabled` is built in EP-13-S9 and tested in EP-39-S11; this story confirms it holds for the pricing switch and extends the same check to the gold rate operations.

- **Story ID:** EP-42-S2
- **Title:** System can refuse a pricing switch change from anyone but the owner (G12)
- **As a:** System
- **I want:** Update Pricing switch and Create Gold rate (by hand) to be refused on the server for every caller who is not the owner, and the AppShell `PricingToggle` dev switch to be gone from every build
- **So that:** only the owner decides when money appears, and no staff member or karigar can reveal values through the API (FR-42-1, BR-42-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff) is signed in, when he calls Update Pricing switch with `pricingEnabled: true`, then the server refuses with "Only the owner can change the shop rules." and the value stays false (epic acceptance criterion 2).
  2. Given Lakshmi Devi (Karigar) is signed in, when she calls Update Pricing switch or Create Gold rate, then the server refuses with `forbidden` and nothing is stored.
  3. Given Deepak Rao (Staff), when he calls Create Gold rate with a rate for today, then it is refused and no gold rate row is written.
  4. Given a refused call, when the audit log is read, then no `setting_changed` or rate entry exists for it.
  5. Given a staging or production build, when any role opens the app shell, then no `PricingToggle` is present in the rail.
- **Rules enforced on the server:** Update Pricing switch is Owner only, through the settings role check (EP-13-S2, EP-13-S9). Create Gold rate is Owner, or System for the provider fetch; no user role other than Owner may call it (EP-05-S2). The check runs on the server; hiding the control is not the control.
- **Live events emitted / consumed:** None. A refused call publishes nothing (EP-07-S1).
- **Audit entry written:** No. Refused calls change nothing.
- **Data changes:** None in the product database. Adds Create Gold rate to the owner-only list in the permission matrix (EP-05-S1).
- **UI reference:** No screen. The switch's place is the shop settings page (EP-13-S13); `docs/ux/mockups/15-value-ready.svg` ("ONE SWITCH, OWNER-LEVEL, DEFAULTS OFF").
- **Non-functional checks:** Security: owner-only on the server for the switch and for rate entry (epic section 13). Open decision G12: whether the pricing switch is audited and whether `PricingToggle` goes; this story assumes both, as EP-13-S9 already does.
- **Depends on:** EP-05-S1, EP-05-S2, EP-13-S2, EP-13-S9, EP-08-S19, EP-39-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S3: System can audit every change of the pricing switch

Cross-reference: implemented together with EP-06-S8 and EP-13-S9, which write the `setting_changed` entry for `pricingEnabled`; this story adds the pricing-specific checks.

- **Story ID:** EP-42-S3
- **Title:** System can audit every change of the pricing switch
- **As a:** System
- **I want:** every accepted change of `pricingEnabled` to write one `setting_changed` entry with ref `pricingEnabled`, before and after, in the same transaction as the change
- **So that:** the owner can later see exactly when money was shown and who turned it on or off (FR-42-2, BR-42-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given `pricingEnabled` is false, when Sanjay Seth turns Pricing on, then one audit entry is written with actor Sanjay Seth, action `setting_changed`, ref `pricingEnabled`, before `{pricingEnabled: false}` and after `{pricingEnabled: true}`.
  2. Given Pricing is on, when Sanjay turns it off, then a second entry is written with before true and after false, and the first entry is unchanged.
  3. Given Sanjay sends `pricingEnabled: true` while it is already true, when the server handles it, then no change and no entry are written.
  4. Given the change transaction fails after the update, when it rolls back, then neither the new value nor an entry is stored.
  5. Given Sanjay opens the Rules filter on the Security log, when entries load, then both pricing changes are listed newest first.
- **Rules enforced on the server:** The setting change and its entry share one transaction (EP-06-S2). The prototype skip `if (a.key === 'pricingEnabled') return st;` in `setSetting` is not carried over (EP-06-S8). A no-op change writes nothing.
- **Live events emitted / consumed:** None in this story. The change emits "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: actor, time, entity (settings), entity id `pricingEnabled`, action (`setting_changed`), before, after.
- **Data changes:** Inserts into `audit_entries`. No schema change.
- **UI reference:** Rules filter on the `security` route (EP-06-S10). No new screen.
- **Non-functional checks:** Audit: switch changes are appended with before and after (epic section 13). Time: entry times from the server clock, shown in Asia/Kolkata. Open decision G12: whether the pricing switch is audited; this story assumes yes.
- **Depends on:** EP-06-S2, EP-06-S3, EP-06-S8, EP-06-S10, EP-13-S3, EP-13-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S4: Owner can enter or confirm the day's gold rate

- **Story ID:** EP-42-S4
- **Title:** Owner can enter or confirm the day's gold rate
- **As a:** Owner
- **I want:** a gold rate page where I type today's rate per gram (per purity if decided), or confirm a fetched rate, and see past rates with their date, source and who entered them
- **So that:** values are computed from a rate I stand behind, even when no provider is used or the provider is down (FR-42-4, FR-42-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given no rate exists for today in Asia/Kolkata, when Sanjay Seth enters a 22K rate per gram and saves, then a gold rate row is stored with today's date, purity 22K (if per purity is decided), the rate as an integer in the decided unit, source `owner`, entered by Sanjay and entered at from the server clock.
  2. Given a fetched rate for today with source `provider` (EP-42-S5), when Sanjay confirms it, then the row records him as confirmer and the confirm time, and the rate value is unchanged.
  3. Given a rate for today already exists, when Sanjay enters a different rate, then the new rate becomes today's rate, the old row stays in the history, and an audit entry records before and after.
  4. Given a rate of 0, a negative rate or a non-integer amount in the decided unit, when Sanjay saves, then the server refuses it with a sentence naming the rule and nothing is stored.
  5. Given Sanjay opens the history, when List Gold rate history returns, then each past day shows the date, purity, rate, source and who entered or confirmed it, newest first, one page at a time.
- **Rules enforced on the server:** Create Gold rate and List Gold rate history are Owner only (EP-42-S2, EP-05-S2). The date is the Asia/Kolkata day of the server time (EP-10-S10); the client sends no date. Rate is a positive integer in the decided unit (EP-42-S1). Rows are never edited or deleted; a correction is a new row. Idempotency key on create (EP-03-S8). Long history pages with a cursor (EP-03-S9).
- **Live events emitted / consumed:** emitted: "Gold rate changed" (proposed, G26) through EP-42-S15.
- **Audit entry written:** Yes: actor, time, entity (gold rate), action (new kind, for example `gold_rate_set` or `gold_rate_confirmed`), before (previous rate for the day, if any), after (date, purity, rate, source).
- **Data changes:** New table `gold_rates` with date, nullable purity, rate per gram (integer), source (`owner` or `provider`), entered or fetched at, entered by, confirmed by, confirmed at; migration. New audit entry kind for rate changes (epic section 9). Adds Create Gold rate and List Gold rate history to the shared contract.
- **UI reference:** Not yet designed (gold rate entry and history for the owner, epic section 12).
- **Non-functional checks:** Precision: rate stored as an integer in the decided unit. Audit: rate entries are appended with before and after. Time: the rate's day is the Asia/Kolkata day. Open question UX-SPEC §7 Q1: whether the rate comes from a provider, the owner each morning, or both. Open question: whether the rate is per purity (22K, 18K) or one rate converted by purity.
- **Depends on:** EP-42-S1, EP-42-S2, EP-03-S8, EP-03-S9, EP-06-S2, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S5: System can fetch the day's gold rate from the chosen source

- **Story ID:** EP-42-S5
- **Title:** System can fetch the day's gold rate from the chosen source
- **As a:** System
- **I want:** a scheduled job that, if a provider is chosen, fetches the day's rate each morning in Asia/Kolkata, stores it with source `provider`, and retries with backoff when the provider fails
- **So that:** the day's rate is in place before the shop opens without the owner typing it, and a stale rate is never shown as today's (FR-42-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given a provider is chosen and no rate exists for today, when the morning job runs at the decided time in Asia/Kolkata, then one gold rate row is stored with today's date, source `provider`, the fetched at time and actor System.
  2. Given the provider returns an error or times out, when the job runs, then it retries with backoff, and after the last attempt the run is marked failed and visible in recent job runs (EP-10-S13), and no row is written.
  3. Given the job fails and no rate exists for today, when the rate chip or a value is read, then it shows the last stored rate's date and source instead of presenting it as today's.
  4. Given the job runs twice for the same day, when the second run finishes, then still only one provider row exists for that day (idempotency key per day and purity).
  5. Given the owner already entered today's rate by hand, when the job runs, then the fetched rate is stored for the history but does not replace the owner's rate unless the decided rule says so.
- **Rules enforced on the server:** Runs on the server clock through the job runner (EP-10-S1, EP-10-S3, EP-10-S4). The fetched amount is converted to an integer in the decided unit before storage (EP-42-S1). Provider credentials sit in the secret store, never in code or logs. The actor is System (EP-10-S12, EP-06-S6).
- **Live events emitted / consumed:** emitted: "Gold rate changed" (proposed, G26) through EP-42-S15 when a new rate becomes today's rate.
- **Audit entry written:** Yes: actor (System), time, entity (gold rate), action (rate kind, for example `gold_rate_fetched`), after (date, purity, rate, source `provider`).
- **Data changes:** Inserts into `gold_rates`; job run history rows (EP-10-S2). Registers the morning rate job.
- **UI reference:** No screen. Failures show on the owner's recent job runs (EP-10-S13).
- **Non-functional checks:** Availability: a provider outage leaves the last rate in place with its date and source shown, and the owner can enter it by hand (epic section 16). Time: "morning" and "today" are Asia/Kolkata (EP-10-S10). Security: provider key held as a secret. Open question UX-SPEC §7 Q1: if the rate is owner-only, this story is not built. Open question: which provider, and whether the owner's hand-entered rate or the fetched rate wins.
- **Depends on:** EP-42-S4, EP-10-S1, EP-10-S2, EP-10-S3, EP-10-S4, EP-10-S10, EP-10-S12, EP-10-S13, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S6: Owner can turn pricing on and off

- **Story ID:** EP-42-S6
- **Title:** Owner can turn pricing on and off
- **As a:** Owner
- **I want:** the Pricing switch on the settings page to reveal every value socket when I turn it on, and hide them all again when I turn it off, keeping every stored amount
- **So that:** I choose when money appears, and switching back never loses an invoice amount, budget or spend (FR-42-3, FR-42-14, BR-42-4, BR-42-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is off, when any screen is rendered for Owner, Staff or Karigar, then no currency figure appears and no staff or karigar response carries a computed value (epic acceptance criterion 1).
  2. Given a rate exists for today, when Sanjay Seth turns Pricing on, then the TAG-8841 stock card shows pure gold 41.5900 g first, gross · stones 48.6500 g · 7.0600 g second, and value at today's rate as a third line, with no other layout change (epic acceptance criterion 3).
  3. Given Pricing is on and no rate exists for any day, when a value socket renders, then it shows "not set" instead of a figure.
  4. Given stock-out SO-0042 has a stored invoice amount and Meera Iyer has a stored budget, when Sanjay turns Pricing off, then every value hides on the next render and `amountINR` and `budgetINR` keep their stored integers (epic acceptance criterion 6).
  5. Given Pricing is turned on again, when the stock-out and customer screens render, then the same stored amounts show again unchanged.
- **Rules enforced on the server:** Owner only (EP-42-S2) and audited (EP-42-S3). With Pricing off, every read that can carry a value returns it as null for every role; the server filters, the UI does not decide. Turning off never writes to a money column. Weights and the match gate never read the flag (BR-42-7).
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14; consumed by open screens through EP-42-S15.
- **Audit entry written:** Yes: through EP-42-S3: actor, time, entity (settings), action (`setting_changed`), before, after.
- **Data changes:** Updates `settings.pricingEnabled` (EP-13-S9). No money column is written or cleared.
- **UI reference:** `docs/ux/mockups/15-value-ready.svg` ("Pricing · Off today", "THE SAME SCREENS LATER · PRICING ON · NOTHING MOVED"); switch placement on the settings page is EP-13-S13.
- **Non-functional checks:** Performance: values show on open screens within about 1 second of the switch (epic section 13). Security: values are null in responses while off, not only hidden. Open question: who sees values, owner only or staff too; criteria above assume staff see them, as the API table says.
- **Depends on:** EP-42-S2, EP-42-S3, EP-13-S9, EP-13-S13, EP-13-S14, EP-40-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S7: Staff can see the day's rate chip in the top bar

- **Story ID:** EP-42-S7
- **Title:** Staff can see the day's rate chip in the top bar
- **As a:** Staff
- **I want:** a rate chip in the top bar, such as "22K today ₹X/g", while Pricing is on, with the rate's date and source when it is not today's
- **So that:** I know the rate the shown values use before I talk to a customer (FR-42-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on and today's 22K rate exists, when Rajesh Verma opens `today`, then the top bar shows the rate chip with the purity and the rate per gram rendered through `ValueSlot`, next to the gold out today figure.
  2. Given Pricing is off, when Rajesh opens any route, then no rate chip appears and the top bar shows gold out today in grams as it does in v1.
  3. Given Pricing is on and the newest rate is from yesterday, when the chip renders, then it shows that rate with its date and source, for example "provider · 14 Mar", so it is not read as today's.
  4. Given Lakshmi Devi (Karigar), when she calls Read Today's gold rate, then the server refuses it, and the karigar portal shows no chip.
  5. Given Pricing is on and no rate exists at all, when the chip renders, then it shows "not set".
- **Rules enforced on the server:** Read Today's gold rate is Owner and Staff, and only while Pricing is on; otherwise it returns no rate (API table). Karigars are refused (EP-42-S14). "Today" is the Asia/Kolkata day (EP-10-S10).
- **Live events emitted / consumed:** consumed: "Gold rate changed" and "Setting changed" (both proposed, G26) through EP-42-S15.
- **Audit entry written:** No. Reading the rate changes nothing.
- **Data changes:** None in the product database. Adds Read Today's gold rate to the shared contract. Adds a `ValueSlot` socket for the chip in the top bar, which has none today.
- **UI reference:** `docs/ux/mockups/02-staff-home.svg`, route `today` (top bar). SCOPE-ANALYSIS App. G: "the day's rate chip returns" in top bar 02. The chip itself is not drawn in any mockup.
- **Non-functional checks:** Security: the rate is withheld by the server while Pricing is off and from karigars. Time: Asia/Kolkata day. Open question UX-SPEC §7 Q1: the source label depends on where the rate comes from. Open question: whether the chip shows one rate or one per purity. Open question: who sees values, owner only or staff too.
- **Depends on:** EP-42-S4, EP-42-S6, EP-31-S3, EP-08-S12, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S8: System can compute a piece's value at the day's rate by the agreed formula

- **Story ID:** EP-42-S8
- **Title:** System can compute a piece's value at the day's rate by the agreed formula
- **As a:** System
- **I want:** one shared function that takes a piece's integer weights in units of 0.0001 g, its purity, and the day's rate, and returns the piece value as an integer in the decided unit by the formula the owner signs off, rounding once at the end
- **So that:** every screen and total uses the same value, computed without floating point, and no formula is guessed (FR-42-7, BR-42-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the owner has signed off the formula, when the function is unit tested, then it returns the integer the signed-off worked examples give, and the tests run in the shared package suite (EP-40-S1).
  2. Given the example formula "pure gold × rate", TAG-8841 with pure gold 415900 units (41.5900 g) and a rate of 925700 paise per gram, when the function runs, then the exact product 38499863 paise is computed in integers and rounded once to the decided unit.
  3. Given a piece in `in_stock`, when Read Piece value is called by Owner or Staff with Pricing on, then it returns the value at today's rate together with the rate's date and source.
  4. Given a piece in `billed` or `scrapped`, when its value is read, then the value is not recomputed at today's rate (the stored amount or nothing is returned, per the decision on fixed or daily value).
  5. Given no rate exists for the piece's purity, when the value is read, then it returns null and the screen shows "not set".
- **Rules enforced on the server:** Values are computed on the server only; the browser never computes a value. Inputs are integer weights and an integer rate; the result is rounded once by the decided rule (EP-42-S1). Read Piece value is Owner and Staff with Pricing on; karigars refused (EP-42-S14). Weights are never changed by this computation.
- **Live events emitted / consumed:** None in this story. Recompute on rate change is in EP-42-S15.
- **Audit entry written:** No if values are computed on read. If the decision is to store the value at tagging, then yes: actor (System), time, entity (piece), action (value set), after (value, rate id).
- **Data changes:** None in the product database if computed on read. If fixed at tagging, writes `pieces.valueINR` and a rate reference column (migration). Adds the value function to the shared package and Read Piece value to the shared contract.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: reads integer units of 0.0001 g and rounds once at the end (epic section 13). Open question: the value formula (pure gold × rate only, or also making charges, stone value and tax); this story is not built until the owner signs it off (epic section 16). Open question: whether value is fixed at tagging or recomputed daily. Open question: per-purity rate or one rate converted by purity. Open question: money unit and rounding rule.
- **Depends on:** EP-42-S1, EP-42-S4, EP-22-S1, EP-02-S2, EP-40-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S9: Staff can see piece value on the stock card and piece drawer

- **Story ID:** EP-42-S9
- **Title:** Staff can see piece value on the stock card and piece drawer
- **As a:** Staff
- **I want:** the "Value at today's rate" line below pure gold and gross · stones on each stock card, and a "Value" row in the piece drawer, both filled from the server through `ValueSlot` while Pricing is on
- **So that:** I can tell a customer the value of a piece while the grams stay the first thing I read (FR-42-8, BR-42-4, BR-42-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on and today's rate exists, when Rajesh Verma opens `stock`, then the TAG-8841 card shows "Pure gold 41.5900 g", then "Gross · stones 48.6500 g · 7.0600 g", then "Value at today's rate" with the server value, and the card height and order are otherwise unchanged (epic acceptance criterion 3).
  2. Given Rajesh opens the TAG-8841 piece drawer, when it loads, then a "Value" row shows the same figure as the card, with the rate's date.
  3. Given Pricing is off, when the same card and drawer render, then the value line and row draw nothing and take no space.
  4. Given the stock list response with Pricing on, when it is inspected, then each piece carries a value field from the server, and the browser formats it only in `ValueSlot`.
  5. Given a piece with no rate for its purity, when the card renders, then the value line shows "not set".
- **Rules enforced on the server:** List Stock and Read Piece include a value field only for Owner and Staff with Pricing on; otherwise null (EP-42-S6, EP-42-S14). The value comes from EP-42-S8. Only `ValueSlot` formats currency (BR-42-6).
- **Live events emitted / consumed:** consumed: "Gold rate changed" and "Setting changed" (proposed, G26) through EP-42-S15; "Piece billed by one staff member" removes the card as in EP-22-S7.
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds the value field to List Stock and Read Piece responses. Fills the existing `ValueSlot` sockets in `ShowroomStock.tsx` ("Value") and `PieceDrawer.tsx` ("Value").
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock`; `docs/ux/mockups/15-value-ready.svg` ("Value at today's rate ₹3,85,000" for TAG-8841, "value socket · empty, takes no space when live").
- **Non-functional checks:** Performance: values arrive with the stock list, no extra request per card. Precision: grams to 4 decimals stay the first line. Open question: who sees values, owner only or staff too. Open question: fixed or daily value.
- **Depends on:** EP-42-S6, EP-42-S8, EP-22-S3, EP-22-S5, EP-08-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S10: Staff can see the value column and total on a stock-out

- **Story ID:** EP-42-S10
- **Title:** Staff can see the value column and total on a stock-out
- **As a:** Staff
- **I want:** the "value · when on" column on `stock-out` to show each piece's value at today's rate, and "total value" under the sale list to show their sum, next to the pure gold total
- **So that:** I see what the pieces leaving the floor are worth while I still record them by grams (FR-42-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on and Rajesh Verma adds TAG-8841 and TAG-9040 to a sale, when the list updates, then each row shows its value from the server in the value column and the total value equals the server's total for the two pieces.
  2. Given the total, when it is checked, then it is the integer sum of the piece values from EP-42-S8, computed on the server, and the pure gold total "54.1900 g pure gold · 2 pieces" is unchanged.
  3. Given Pricing is off, when `stock-out` renders, then the value column and "total value fills here later" draw nothing, as in EP-26-S5.
  4. Given Rajesh removes TAG-9040 from the list, when the total refreshes, then it equals TAG-8841's value alone.
  5. Given a piece in the list has no rate, when the total is shown, then it shows "not set" and does not show a partial sum as complete.
- **Rules enforced on the server:** Piece values and the total come from the server (EP-42-S8); the browser does not add values. Owner and Staff only, with Pricing on. Only `ValueSlot` formats the figures.
- **Live events emitted / consumed:** consumed: "Gold rate changed" (proposed, G26) refreshes the column; "Piece billed by one staff member" removes a piece sold elsewhere (EP-26-S11).
- **Audit entry written:** No. Showing values changes nothing; recording the amount is EP-42-S11.
- **Data changes:** None in the product database. Adds values and a total value to the stock-out preview read. Fills the `ValueSlot` sockets in `StockOut.tsx` (per piece and "Total value"), which are passed `null` today.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("value · when on", "total value fills here later", "2 pieces · 54.190 g pure gold · sold by Rajesh · INV-2026-0855").
- **Non-functional checks:** Precision: the total is an integer sum in the decided unit; the pure gold total stays an integer sum of 0.0001 g units. Open question: whether the total is the sum of rounded piece values or rounded once from the exact sum; follows the rounding decision.
- **Depends on:** EP-42-S8, EP-42-S9, EP-26-S4, EP-26-S5, EP-26-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S11: Staff can record the invoice amount on a stock-out

- **Story ID:** EP-42-S11
- **Title:** Staff can record the invoice amount on a stock-out
- **As a:** Staff
- **I want:** an invoice amount on the stock-out form while Pricing is on, stored in `amountINR` in the same transaction that marks the pieces billed
- **So that:** the stock-out record carries the amount from the billing book next to the invoice number, and customer spend has a source (FR-42-9, BR-42-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on, when Rajesh Verma enters reference, invoice number INV-2026-0855 and the invoice amount and takes the pieces out, then the stock-out record stores `amountINR` as an integer in the decided unit, and the pieces become `billed` in the same transaction.
  2. Given the amount is missing, zero, negative or not an integer in the decided unit, when Rajesh presses take out, then the server refuses with a sentence naming the rule and no piece is billed.
  3. Given Deepak Rao sells TAG-8841 first, when Rajesh's stock-out with an amount reaches the server, then it is refused with "already taken" and no amount is stored for Rajesh (EP-26-S3).
  4. Given Pricing is off, when a Create Stock-out request carries an amount, then it is refused as an unknown field and nothing is stored, as in v1.
  5. Given a retried press with the same idempotency key, when it reaches the server, then only one stock-out with one amount exists.
- **Rules enforced on the server:** The amount field exists in the contract only while Pricing is on. Amount and billed state share one locked transaction (EP-26-S2, epic section 13). Positive integer in the decided unit (EP-42-S1). Who may record it follows the decision in the API table (Staff, Owner as decided). Billing, GST and payment stay in the owner's separate system; the invoice number stays a reference string (BR-42-9).
- **Live events emitted / consumed:** emitted: "Piece billed by one staff member" (catalogue) from EP-26, unchanged; the event carries no amount to staff screens that do not need it.
- **Audit entry written:** Yes: the stock-out entry from EP-26-S12 adds the amount to after: actor, time, entity (stock-out), action (stock-out), after (pieces, seller, reference, invoice number, amount).
- **Data changes:** Writes `stock_outs.amountINR` (column exists from EP-26-S1). Contract change to Create Stock-out adding an optional amount gated by Pricing.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("Tax invoice number · from your billing book"). The amount field itself is not yet designed.
- **Non-functional checks:** Concurrency: the amount is recorded in the same transaction that marks the pieces billed (epic section 13). Precision: integer money. Audit: the amount is in the stock-out entry. Open question: whether the invoice amount is typed from the external billing book or computed by the app; criteria assume typed. Open question: whether staff or only the owner may record it.
- **Depends on:** EP-42-S1, EP-42-S6, EP-42-S10, EP-26-S1, EP-26-S2, EP-26-S3, EP-26-S7, EP-26-S12, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S12: Owner can see the value band on the Decisions home

- **Story ID:** EP-42-S12
- **Title:** Owner can see the value band on the Decisions home
- **As a:** Owner
- **I want:** "Worth at today's rate" under "Gold on the floor" in the WHERE THE GOLD IS RIGHT NOW block, computed on the server from the in-stock pieces and today's rate
- **So that:** I see what the gold on display is worth today without leaving the Decisions home (FR-42-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on, 42 `in_stock` pieces with pure gold summing to 18472000 units and today's rate, when Sanjay Seth opens `decisions`, then "Gold on the floor" reads "1,847.2000 g · 42 pieces, ready to sell" and "Worth at today's rate" shows the server's floor value below it.
  2. Given the example formula "pure gold × rate" and a single rate of 925700 paise per gram, when the floor value is computed, then it is 1709953040 paise from integer arithmetic, rounded once (mockup 15's "₹1.34 Cr" is illustrative).
  3. Given TAG-8841 is billed, when "Piece billed by one staff member" arrives, then the band drops by TAG-8841's value within about 1 second.
  4. Given Pricing is off, when `decisions` renders, then the band draws nothing and takes no space.
  5. Given Rajesh Verma (Staff) calls Read Floor value, when the server checks the permission, then it is refused.
- **Rules enforced on the server:** Read Floor value is Owner only (API table, EP-32-S13). Only `in_stock` pieces count (EP-22-S10). Computed on the server from integer weights and the rate, rounded once.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" (catalogue), "Parcel released into stock", "Piece scrapped", "Gold rate changed" and "Setting changed" (proposed, G26).
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds Read Floor value to the shared contract, or a value field on Read Gold locations (EP-32-S9). Adds a `ValueSlot` socket for the band, which has none today.
- **UI reference:** `docs/ux/mockups/08-owner-home.svg`, route `decisions`; `docs/ux/mockups/15-value-ready.svg` ("Worth at today's rate ₹1.34 Cr", "value band · hidden").
- **Non-functional checks:** Precision: integer sums of 0.0001 g units and integer money, rounded once. Performance: band refreshes within about 1 second of a sale. Open question: per-purity rates change the floor value to a sum per purity. Open decision D7: whole shop or per branch.
- **Depends on:** EP-42-S6, EP-42-S8, EP-22-S10, EP-32-S2, EP-32-S9, EP-32-S12, EP-32-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S13: Owner can set a customer budget and see spend history

- **Story ID:** EP-42-S13
- **Title:** Owner can set a customer budget and see spend history
- **As a:** Owner
- **I want:** to set a budget on a customer record and see "Budget · spent" with a spend history built from stock-outs linked to that customer, each by tag, grams, invoice number and amount
- **So that:** I know how much a customer meant to spend and has spent, tied to the same pieces and grams (FR-42-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on, when Sanjay Seth sets Meera Iyer's budget to ₹8,00,000, then `budgetINR` stores the integer in the decided unit, an audit entry records before (null) and after, and her record shows "Budget ₹8,00,000".
  2. Given Meera's spent is ₹5,37,145 and a stock-out linked to her with an invoice amount is recorded, when it commits, then her `spentINR` increases by exactly that amount in the same transaction and the history lists the stock-out (epic acceptance criterion 5).
  3. Given Meera's spend history, when it is shown, then each entry shows the tag, pure gold to 4 decimals, the date in Asia/Kolkata, the invoice number and the amount.
  4. Given Pricing is off, when `customers` or `customer-new` renders, then budget and spend draw nothing, and the stored values stay (EP-17-S11).
  5. Given Meera's deletion request is approved, when the erasure runs, then her budget and spend are erased with her other personal data (EP-39-S9).
- **Rules enforced on the server:** Update Customer budget is Owner, and Staff only if decided (API table). Budget is a non-negative integer in the decided unit. Spend is never typed; it is the sum of linked stock-out amounts, updated in the stock-out transaction. Karigars refused (EP-17-S12). The EP-17-S11 refusal of amount fields is lifted only while Pricing is on.
- **Live events emitted / consumed:** consumed: "Piece billed by one staff member" (catalogue) to refresh spend on an open customer record.
- **Audit entry written:** Yes: actor, time, entity (customer), action (budget changed), before, after; spend updates are covered by the stock-out audit entry (EP-42-S11).
- **Data changes:** Writes `customers.budgetINR` and `customers.spentINR`. Spend history read from `stock_outs` by customer id; needs the customer id on `stock_outs` (EP-26-S1 socket).
- **UI reference:** `docs/ux/mockups/23-onboard-customer.svg`, routes `customer-new` and `customers` ("COMES LATER · WITH PRICING", "Budget", "Spend so far"); `docs/ux/mockups/15-value-ready.svg` ("Budget ₹8,00,000 · spent ₹5,37,145" for Meera Iyer).
- **Non-functional checks:** Personal data: budget and spend are personal data and follow EP-39 deletion rules (epic section 13). Audit: budget changes with before and after. Concurrency: spend updates in the stock-out transaction. Open decision G13: a stock-out must record the customer before spend can be computed; this story is not built until G13 is settled in EP-26. Open question: who sees values and who may set a budget.
- **Depends on:** EP-42-S1, EP-42-S6, EP-42-S11, EP-17-S5, EP-17-S9, EP-17-S11, EP-17-S12, EP-17-S14, EP-26-S1, EP-39-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S14: System can keep all values out of karigar responses

- **Story ID:** EP-42-S14
- **Title:** System can keep all values out of karigar responses
- **As a:** System
- **I want:** every response and live event sent to a karigar to carry no value, rate, budget, spend or invoice amount field, whatever the Pricing switch says, and an automated test that checks every karigar-readable operation
- **So that:** a karigar never sees a price, through the portal or the API (FR-42-13, BR-42-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Pricing is on, when Lakshmi Devi opens her jobs on the karigar portal, then no value, rate or budget appears on screen and none is in the API response (epic acceptance criterion 4).
  2. Given Pricing is on, when the test calls every operation the karigar role may read with a karigar session, then no response body contains a money field or a currency string.
  3. Given Lakshmi calls Read Today's gold rate, Read Piece value or Read Floor value, when the server checks the permission, then each is refused with `forbidden`.
  4. Given a "Gold rate changed" or "Setting changed" event, when events are routed, then Lakshmi's connection does not receive it.
  5. Given a new operation is added to the karigar permission list, when the test runs, then it is covered without editing the test.
- **Rules enforced on the server:** Money fields are removed from karigar responses on the server, not hidden in the UI (epic section 13). Karigar reads are limited to their own jobs (EP-05-S3, EP-20-S1). Event filtering by receiver permissions (EP-07-S5, EP-07-S6).
- **Live events emitted / consumed:** None emitted. Filters "Gold rate changed" and "Setting changed" (proposed, G26) away from karigar connections.
- **Audit entry written:** No. Filtering and tests change no state.
- **Data changes:** None in the product database. Adds the karigar response check to the permission test suite (EP-40-S6).
- **UI reference:** Karigar portal routes (EP-20); `docs/ux/mockups/11-roles-and-permissions.svg` (karigar sees no prices).
- **Non-functional checks:** Security: values filtered on the server for karigars (epic section 13). Personal data: karigars never receive customer budget or spend.
- **Depends on:** EP-42-S7, EP-42-S8, EP-42-S12, EP-05-S3, EP-07-S5, EP-07-S6, EP-20-S1, EP-20-S3, EP-40-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-42-S15: System can refresh open screens when pricing or the rate changes

- **Story ID:** EP-42-S15
- **Title:** System can refresh open screens when pricing or the rate changes
- **As a:** System
- **I want:** to publish "Gold rate changed" after a new rate for today commits, and to map it and "Setting changed" for `pricingEnabled` to the reads behind the rate chip, stock cards, piece drawer, stock-out values, customer budget and the Decisions value band
- **So that:** open screens show or hide values and use the new rate without a reload (FR-42-6, FR-42-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma has `stock` open, when Sanjay Seth turns Pricing on, then the value lines appear within about 1 second without a reload, and when he turns it off they disappear the same way.
  2. Given Pricing is on and Deepak Rao has `stock-out` open with two pieces, when Sanjay enters a new rate for today, then "Gold rate changed" is published after commit and the value column, total and rate chip refresh within about 1 second.
  3. Given the rate entry transaction rolls back, when it ends, then no "Gold rate changed" event is published (EP-07-S1).
  4. Given Rajesh's connection was down when the rate changed, when it reconnects, then it catches up from the last sequence number and shows the new rate (EP-07-S7).
  5. Given Lakshmi Devi (Karigar) is connected, when either event is published, then she receives neither (EP-42-S14).
- **Rules enforced on the server:** Published only after commit, stamped with sequence number, entity id and version (EP-07-S1, EP-07-S2). "Gold rate changed" carries the date, purity and rate id, not computed values; screens refetch their reads. Delivered to Owner and Staff only (EP-07-S5).
- **Live events emitted / consumed:** emitted: "Gold rate changed" (proposed, G26). consumed: "Setting changed" (proposed, G26) and "Piece billed by one staff member" (catalogue).
- **Audit entry written:** No. The rate and switch changes are audited by EP-42-S4, EP-42-S5 and EP-42-S3.
- **Data changes:** None in the product database. Adds "Gold rate changed" to the event list and both events to the client event-to-read map (EP-08-S8).
- **UI reference:** No screen of its own. Effects show on routes `today`, `stock`, `stock-out`, `decisions`, `customers`; `docs/ux/mockups/15-value-ready.svg`.
- **Non-functional checks:** Performance: turning the switch on shows values on open screens within about 1 second (epic section 13). Concurrency: event versions let a screen ignore an older rate arriving late. Open question G26: whether "Setting changed" and "Gold rate changed" are accepted into the live event catalogue.
- **Depends on:** EP-42-S4, EP-42-S6, EP-42-S9, EP-42-S10, EP-42-S12, EP-42-S14, EP-13-S14, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S7, EP-08-S8, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- UX-SPEC §7 Q1: where does the gold rate come from: a provider, the owner each morning, or both? (EP-42-S4, S5, S7)
- Is the rate per purity (22K, 18K) or one rate converted by purity? (EP-42-S4, S7, S8, S12)
- What is the piece value formula: pure gold × rate only, or also making charges, stone value and tax? (EP-42-S8, S9, S10, S12)
- Is a piece's value fixed at tagging, or recomputed at each day's rate? (EP-42-S8, S9)
- In which unit is money stored (paise or rupees), and how is it rounded? (EP-42-S1, S8, S10)
- Is the invoice amount typed from the external billing book or computed by the app? (EP-42-S11)
- G12: is the pricing switch audited, and does the dev `PricingToggle` go? (EP-42-S2, S3)
- G13: does a stock-out record the customer, so spend can be computed? (EP-42-S13)
- Who sees values: owner only, or staff too? (EP-42-S6, S7, S9, S11, S13)
- Does the catalogue share ever show a price to customers? (No story here fills the catalogue piece card value; it stays empty as in EP-34-S12 until this is answered.)
- G26: are "Setting changed" and "Gold rate changed" accepted into the live event catalogue? (EP-42-S15)
