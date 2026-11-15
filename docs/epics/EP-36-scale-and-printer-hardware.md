# EP-36: Scale and printer hardware

## 1. Summary

Staff today type every weight off the scale by hand, and the exact-match gate then compares those typed figures to
the last unit of 0.0001 g. One typing slip stops a parcel and sends it to the owner. This epic connects the shop's
hardware to the app: it reads the weight directly from the balance where the balance supports it, records which
scale produced the reading without staff choosing it, prints a tag label with a barcode for each piece, prints the
parcel sheet, and lets staff scan a tag at stock-out instead of typing it. Typing stays available as a fallback for
every step, so a broken cable never stops the shop.

## 2. Layer, milestone, status

- Layer: E · Hardware, scale and operations
- Milestone: M7 Production ready
- Prototype status: Not built. Weights are typed into text fields on `parcel-arrival` and `parcel-tag`, "Print parcel sheet" on mockup 04 is a label with no action, and "Scan another tag" on `stock-out` is a plain text field.

## 3. Roles involved

- Staff: places the parcel, a tray or a piece on the balance and accepts the reading; prints tag labels and the parcel sheet; scans tags at stock-out; types a figure by hand when the device is not available.
- Owner: decides which devices the shop uses (D9) and registers each balance in the scale registry (EP-14).
- Karigar: not involved.
- System: reads stable values from a connected balance, attaches the scale id to the weighing, formats labels and the parcel sheet, and accepts scanner input as a tag number.

## 4. In scope

- Read the weight directly from a balance that supports it, on parcel arrival (each weighing or tray) and on tagging (gross and stone readings).
- Record the scale id of the device that produced the reading automatically.
- Accept only a stable reading; tell staff when the balance is still settling.
- Print a tag label with a barcode for each tagged piece.
- Print the parcel sheet from the match screen (gap G8): parcel id, karigar, order, weighings with scale names, item list with tag numbers and the three weights.
- Scan a tag barcode at stock-out to add the piece to the list ("Scan another tag").
- Scan a tag barcode to open a piece in stock search, if decided.
- Fallback to typing for every weight and every tag, with the scale chosen by hand as today.
- A device setup step per counter (which balance, which printer) per D9.

## 5. Out of scope

- The scale registry, readability, capacity and the ceiling formula (EP-14).
- The match verdict and owner clearance (EP-23).
- Parcel arrival, trays, tagging and QC flows (EP-21).
- The stock-out record and its rules (EP-26).
- Tag number and HUID format rules (EP-15).
- Barcode or label content showing any price (EP-42).
- Loading the shop's real scales at launch (EP-41).

## 6. Current state in the prototype

- `src/components/parcels/ParcelArrival.tsx` (route `parcel-arrival`): one row per weighing with `scaleId`, gross and stone typed as text; `ScalePicker` "Which scale is this on?" / "Which scale is this tray on?"; rows default to `state.lastScaleId`.
- `src/components/parcels/TagItem.tsx` (route `parcel-tag`): `ScalePicker` "Which scale is this piece on?"; gross and stone typed; `scaleId` saved on the piece through `saveTag`.
- `src/components/parcels/ScaleAndWeights.tsx`: the shared scale picker and weight inputs.
- `src/domain/weights.ts` `parseWeight` turns typed text into grams; `toU` converts to integer units (`UNITS_PER_G = 100000`).
- `src/store/transitions.ts` `rememberScale` stores the last scale used; `recordParcelArrival` and `saveTag` take the typed weights.
- `src/components/stock/StockOut.tsx` (route `stock-out`): a "Scan another tag" field with "Nothing yet. Scan a tag or type it below."; a USB scanner that types into a field would already work, but nothing is built for it.
- `src/components/parcels/ParcelMatch.tsx` (route `parcel-match`): no print action; mockup 04 shows "Print parcel sheet".
- Seed scales in `src/data/seed.ts`: Bench balance 0.0001 g up to 600 g, Platform scale 0.01 g up to 30,000 g.
- Reusable: the weighing rows, scale picker as the fallback, `parseWeight`, the tag field on stock-out, the parcel and piece data a sheet or label prints.
- Must be rebuilt server-side: none of the device reading happens on the server; the server must still validate each weight, check that the scale id exists in the registry, and record whether the figure was read or typed.

## 7. Functional requirements

- FR-36-1. A staff member can take a reading from a connected balance into a weighing row on parcel arrival.
- FR-36-2. A staff member can take gross and stone readings from a connected balance on the tag screen.
- FR-36-3. A reading taken from a device fills the scale id of that device; staff cannot change it for that reading.
- FR-36-4. The app accepts a reading only when the balance reports it as stable.
- FR-36-5. A reading is never reused: each weighing and each piece takes a fresh reading.
- FR-36-6. The server records for each weighing and piece weight whether it was read from a device or typed.
- FR-36-7. The server refuses a reading whose scale id is not in the scale registry.
- FR-36-8. A staff member can type any weight and pick the scale by hand when no device is connected, as today.
- FR-36-9. A staff member can print a tag label with a barcode of the tag number for a saved piece.
- FR-36-10. A staff member can reprint a tag label.
- FR-36-11. A staff member can print the parcel sheet from the match screen (G8).
- FR-36-12. A staff member can scan a tag barcode on the stock-out screen and the piece is added to the list.
- FR-36-13. A scanned tag that is not in stock is refused with the same message as a typed tag.
- FR-36-14. The owner can set which balance and which printer each counter uses.

## 8. Business rules

- BR-36-1. Read the weight directly from the balance where the balance supports it, because it removes typing errors at the exact-match gate. [PRODUCTION-SCOPE §4 D9]
- BR-36-2. Every weighing remembers which scale it was on; staff never retype it. [mockup 14]
- BR-36-3. Nothing is pre-filled; every piece is its own weight and the scale figure is always fresh, never guessed from the last one. [mockup 21]
- BR-36-4. A parcel too heavy for the balance is weighed in trays, each tray its own weighing on its own scale. [mockup 20]
- BR-36-5. The match gate compares integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]
- BR-36-6. Staff add pieces to a stock-out by scanning or typing the tag. [mockup 06]
- BR-36-7. The parcel sheet can be printed from the match screen. [mockup 04; MOCKUP-COVERAGE §2 G8]
- BR-36-8. Labels and sheets carry no price. [SCOPE-ANALYSIS App. F; App. G]

## 9. Data

- Device: id, kind (balance, label printer, sheet printer, scanner), model, counter or branch, linked scale id for a balance, active flag.
- Weighing (EP-21): gross and stone (integer, units of 0.0001 g), scale id, source (read or typed), device id (nullable).
- Piece weights (EP-21): gross and stone (integer, units of 0.0001 g), scale id, source (read or typed), device id (nullable).
- Label print: piece id, printed by, printed at, device id, reprint count.
- Parcel sheet print: parcel id, printed by, printed at.
- No money fields.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Devices | Balances, printers and scanners set up per counter | Owner, Staff |
| Create | Device | Register a device and link a balance to a scale | Owner |
| Update | Device | Change counter, link or active flag | Owner |
| Create | Weighing reading | Save a reading with its source and device | Staff, Owner |
| Read | Tag label | Label content and barcode for one piece | Staff, Owner |
| Create | Label print record | Record a print or reprint | Staff, Owner |
| Read | Parcel sheet | Printable sheet for one parcel (G8) | Staff, Owner |
| Read | Piece by scanned tag | Resolve a scanned barcode to a piece | Staff, Owner |

## 11. Live events

- None. Device readings and prints happen on one counter. Saving a tag still emits "Tag saved on a shared parcel" through EP-21, and a scanned stock-out still emits "Piece billed by one staff member" through EP-26; this epic adds no event.

## 12. Screens and UX references

- No screen of its own. It adds device controls to `parcel-arrival`, `parcel-tag`, `parcel-match` (print parcel sheet) and `stock-out` (scan), and a device setup panel to `scales`.
- Mockups: `04-parcel-match.svg` ("Print parcel sheet", G8), `06-stock-out.svg` ("Scan another tag"), `20-parcel-arrival.svg` ("Which scale is this on? Bench balance · 0.0001 g"), `21-tag-one-item.svg` ("Put the piece on the bench balance and read each figure off"), `14-match-rule-any-parcel.svg` ("Every weighing remembers which scale it was on").
- Not yet designed: the device setup panel, the "settling" state, the label layout and the parcel sheet layout. The device setup panel and the device controls read and change data through the shared data layer of EP-08, which is why EP-08 is upstream.

## 13. Non-functional requirements

- Precision: a device reading is converted to integer units of 0.0001 g without floating point rounding; a reading with more decimals than the scale's readability is handled per the open question below, never silently rounded.
- Security: only the owner can register or change a device; a device reading still passes the same server validation as a typed one.
- Audit: each weighing and piece weight records whether it was read or typed, and the device id.
- Availability and recovery: a disconnected device falls back to typing on the same screen without losing the form.
- Performance: a stable reading appears in the field within 1 second of the balance settling; a label prints within 3 seconds of saving a tag.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-21, EP-26, EP-08
- Downstream: EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given the bench balance is connected at the counter, when Rajesh places a piece and the reading is stable, then the gross field fills with the reading to four decimals and the scale is set to Bench balance.
2. Given the balance is still settling, when Rajesh tries to take the reading, then the app waits and says the balance is settling.
3. Given no device is connected, when Rajesh tags a piece, then he types the weights and picks the scale by hand, as today.
4. Given a saved tag TAG-9101, when Rajesh prints its label, then the label shows the tag number as a barcode and text, and no price.
5. Given a stock-out in progress, when Rajesh scans TAG-9040, then the piece joins the list; when he scans a sold tag, then it is refused with the same message as typing it.
6. Given parcel BATCH-2026-044 on the match screen, when Rajesh chooses "Print parcel sheet", then a sheet prints with the weighings, scale names and every tag with its three weights.

## 16. Risks

- Risk: the shop's balances have no data output, or use a protocol the browser cannot read. Mitigation: survey the real devices first (D9) and keep typing as a full fallback.
- Risk: a device sends an unstable or truncated value that passes as a real reading. Mitigation: accept only the device's stable flag and log the source of every reading.
- Risk: a reading from a different scale than the one in the registry changes the ceiling. Mitigation: link each balance device to one registered scale and set the scale id from the link.
- Risk: printer drivers differ per counter. Mitigation: pick one label printer model and test the label in staging.
- Risk: staff trust a scanned tag without looking at the piece. Mitigation: show the piece photo and name after each scan.

## 17. Open decisions and questions

- D9: which balances and printers does the shop use, and which interfaces do they support?
- How does the browser reach a balance or printer: direct device access from the browser, or a small local program on the counter computer?
- What does the tag label show (tag number, HUID, purity, weights), and which barcode format?
- What does the parcel sheet show, and is it printed before tagging, after matching, or both (G8)?
- What happens to a device reading that has more decimals than the registered readability?
- G10: does the integer unit of 0.0001 g need to be finer for the ceiling, and does that change how readings are stored?
- Can staff scan to open a piece in stock search, or only at stock-out?
- Does the karigar's own bench need any device support?

## 18. Candidate stories

1. EP-36-S1: System can store devices and link a balance to a registered scale
2. EP-36-S2: System can record whether each weight was read or typed
3. EP-36-S3: Owner can set up the balance and printer for a counter
4. EP-36-S4: Staff can read a stable weight from the balance on parcel arrival
5. EP-36-S5: Staff can read gross and stone weights from the balance when tagging
6. EP-36-S6: System can set the scale id from the device that gave the reading
7. EP-36-S7: Staff can fall back to typing a weight when no device is connected
8. EP-36-S8: Staff can print a tag label with a barcode
9. EP-36-S9: Staff can reprint a tag label
10. EP-36-S10: Staff can print the parcel sheet from the match screen (G8)
11. EP-36-S11: Staff can scan a tag to add a piece to a stock-out
12. EP-36-S12: System can refuse a scanned tag that is not in stock
