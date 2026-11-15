# EP-36: Scale and printer hardware · stories

Epic document: [EP-36 Scale and printer hardware](../epics/EP-36-scale-and-printer-hardware.md)

Role note: stories where the server checks a reading or records its source, and where the counter computer talks to a device on its own, use "System". How the browser reaches a balance, printer or scanner (direct device access from the browser, or a small local program on the counter computer) is open under D9, so this file calls it "the device link" and stays neutral. Typing every weight and every tag by hand stays available on every screen. The seed scales are Bench balance (readability 0.0001 g, capacity 600 g) and Platform scale (readability 0.01 g, capacity 30,000 g). Seed staff are Rajesh Verma and Deepak Rao; the seed owner is Sanjay Seth. Labels and sheets carry no price (BR-36-8).

---

## EP-36-S1: System can store devices and link a balance to a registered scale

- **Story ID:** EP-36-S1
- **Title:** System can store devices and link a balance to a registered scale
- **As a:** System
- **I want:** a `devices` table holding each balance, label printer, sheet printer and scanner with its kind, model, counter (and branch if D7), active flag and, for a balance, the one registered scale it is linked to, plus a List Devices operation
- **So that:** every reading can be traced to one physical device and one scale in the registry, and the ceiling never uses a scale other than the one that weighed (FR-36-3, FR-36-14, BR-36-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration runs on an empty dev database, when it finishes, then `devices` exists with `id`, `kind` (`balance`, `label_printer`, `sheet_printer`, `scanner`), `model`, `counter_key`, `branch_key` (nullable), `scale_id` (nullable), `active`, `created_at` and `version`, and it can be rolled back.
  2. Given a device of kind `balance` with no `scale_id`, when it is inserted, then the database rejects it, because every balance must link to a registered scale.
  3. Given a device of kind `label_printer` with a `scale_id` set, when it is inserted, then the database rejects it, because only a balance links to a scale.
  4. Given two active balances at counter "Counter 1", one linked to Bench balance and one to Platform scale, when Rajesh Verma calls List Devices, then both are returned with the scale name, readability (1 unit, shown "0.0001 g") and capacity (6,000,000 units, shown "600.0000 g") of the linked scale.
  5. Given Mahesh Soni is signed in as Karigar, when he calls List Devices, then the server refuses it with a permission error (EP-05-S2).
- **Rules enforced on the server:** List Devices is Owner and Staff only; Karigar is refused. Check constraints: `kind` is one of the four values; `scale_id` is required for `balance` and null for every other kind; `scale_id` references `scales`. A balance may link only to an `active` scale at the time it is linked. `version` backs the EP-02-S14 stale-write check.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates storage and a read; device changes are audited in EP-36-S3.
- **Data changes:** Migration creates `devices` (columns above) with a foreign key to `scales` and an index on `counter_key`. Adds List Devices to the shared contract (EP-03-S1). No money fields.
- **UI reference:** No screen.
- **Non-functional checks:** Precision: readability and capacity are read from `scales` as integers in units of 0.0001 g and shown to 4 decimals. Security: List Devices returns no device secrets or local addresses beyond what the counter needs. Open decision D9: the `model` values and any connection fields depend on which devices the shop uses. Open decision D7: `branch_key` is only filled if the shop is multi-branch.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S4, EP-02-S14, EP-03-S1, EP-05-S2, EP-14-S1, EP-14-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S2: System can record whether each weight was read or typed

- **Story ID:** EP-36-S2
- **Title:** System can record whether each weight was read or typed
- **As a:** System
- **I want:** every weighing on a parcel and every gross and stone figure on a piece to store its source (`read` or `typed`) and the device id when it was read, set by the save operations of EP-21
- **So that:** when a parcel stops at the gate, the owner can see whether a figure came off the balance or was typed, and audits can tell a typing slip from a scale problem (FR-36-6, BR-36-1, epic section 13 Audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma saves the weighing "Whole parcel" for BATCH-2026-044 with gross 485.5000 g read from the Bench balance device and stones 38.2000 g typed, when it is read back, then `parcel_weighings` holds `4855000` with `gross_source` `read` and the device id, and `382000` with `stone_source` `typed`.
  2. Given TAG-9108 is saved with "On the scale now" 84.5000 g and "Stones, kemp, lac on this piece" 6.1000 g both read from the balance, when it is read back, then `pieces` holds `845000` and `61000`, both sources `read`, and `weight_device_id` set.
  3. Given a request that says `read` but names no device id, or names a device that is not an active balance, when it is saved, then the server refuses it as a validation error (EP-03-S2) and nothing is written.
  4. Given the migration runs on a staging copy loaded with the prototype seed, when it finishes, then every existing weighing and piece has source `typed` and a null device id.
  5. Given a saved weighing, when the EP-21-S14 audit entry for it is written, then it includes the source and device id of each figure.
- **Rules enforced on the server:** Source is one of `read` or `typed` and is required for every gross and stone figure. `read` requires a device id of an active `balance`; `typed` requires the device id to be null. A `read` figure passes exactly the same weight checks as a typed one (gross greater than 0, stones from 0 to gross, EP-21-S5). The client cannot mark a figure `read` from a device that belongs to another counter than the caller's (proposed rule).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, through the existing EP-21-S14 entries: actor, time, entity (parcel or piece id), action (`parcel_arrival_recorded`, `parcel_weighing_added`, tag save kinds), after now includes each figure's source and device id.
- **Data changes:** Migration adds `gross_source`, `stone_source` (enum `read` or `typed`, default `typed` for back-fill) and `device_id` (nullable, foreign key to `devices`) to `parcel_weighings`; adds `gross_source`, `stone_source` and `weight_device_id` to `pieces`. Updates the Create and Update Parcel arrival and Create and Update Tag contracts with the source fields.
- **UI reference:** No screen.
- **Non-functional checks:** Audit: source and device are recorded for every weight, as epic section 13 requires. Precision: the stored weight is the same integer in units of 0.0001 g whatever its source. Open decision G10: if the unit becomes finer, these columns are unaffected but the weight columns beside them change.
- **Depends on:** EP-36-S1, EP-21-S1, EP-21-S2, EP-21-S3, EP-21-S5, EP-21-S6, EP-21-S14, EP-03-S2, EP-06-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S3: Owner can set up the balance and printer for a counter

- **Story ID:** EP-36-S3
- **Title:** Owner can set up the balance and printer for a counter
- **As a:** Owner
- **I want:** a device setup panel on `scales` where I add a device, pick its kind and model, set its counter, link a balance to a registered scale, and switch a device off, through Create Device and Update Device
- **So that:** each counter knows which balance it reads and which printer it prints on, without staff choosing every time (FR-36-14, BR-36-2, epic section 13 Security)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is on `scales`, when he adds a device of kind "Balance" at "Counter 1" linked to Bench balance, then it appears in the device list for Counter 1 with "Bench balance · 0.0001 g" beside it.
  2. Given Sanjay adds a label printer and a sheet printer at Counter 1, when Rajesh Verma signs in at Counter 1, then the tag and match screens use those printers without asking him to pick.
  3. Given Sanjay switches the Counter 1 balance off, when Rajesh opens `parcel-arrival`, then no "Read from balance" control is shown and he types the weight and picks the scale as today.
  4. Given Rajesh Verma is signed in as Staff, when he calls Create Device or Update Device, then the server refuses it with a permission error and nothing changes.
  5. Given Sanjay tries to link a balance to Platform scale after it was retired (EP-14-S7), when he saves, then the server refuses it with a sentence saying the scale is retired.
- **Rules enforced on the server:** Create Device and Update Device are Owner only (EP-05-S2). The counter must be one of the counter values used for staff (EP-05-S4). A balance must link to an active scale. Version check on Update Device. The change and its audit entry share one transaction (EP-06-S2).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (device id), action (`device_added`, `device_edited`, `device_deactivated`, `device_reactivated`), before, after (kind, model, counter, linked scale id, active).
- **Data changes:** Inserts and updates `devices` (EP-36-S1). Adds Create Device and Update Device to the shared contract and the four device kinds to the audit kind list.
- **UI reference:** Not yet designed (device setup panel, epic section 12). It sits on route `scales`; the counter assignment control is EP-14-S8.
- **Non-functional checks:** Security: only the owner can register or change a device; staff and karigars are refused on the server. Audit: every device change writes an append-only entry. Open decision D9: the list of models offered and any connection setting (port, local program address) depend on the devices chosen. Open decision D7: whether a branch is picked with the counter.
- **Depends on:** EP-36-S1, EP-14-S3, EP-14-S7, EP-14-S8, EP-05-S2, EP-05-S4, EP-06-S2, EP-08-S5, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S4: Staff can read a stable weight from the balance on parcel arrival

- **Story ID:** EP-36-S4
- **Title:** Staff can read a stable weight from the balance on parcel arrival
- **As a:** Staff
- **I want:** a "Read from balance" control beside "Everything on the scale together" and "Of that, the stones, pearls, lac — anything not gold" on `parcel-arrival`, for the whole parcel and for each tray, that fills the field only once the balance reports a stable value
- **So that:** the parcel's three figures come straight off the balance and cannot carry a typing slip into the exact-match gate (FR-36-1, FR-36-4, FR-36-5, BR-36-1, BR-36-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given the Bench balance is connected at Counter 1 and BATCH-2026-044 is on it, when Rajesh Verma presses "Read from balance" and the balance reports stable 485.5000 g, then "Everything on the scale together" shows "485.5000" and "Which scale is this on?" shows "Bench balance · 0.0001 g".
  2. Given the balance is still settling, when Rajesh presses "Read from balance", then the field stays empty, the screen says the balance is settling, and it fills only when a stable value arrives (epic acceptance criterion 2).
  3. Given a parcel weighed in trays, when Rajesh reads "Tray 1" and then "Tray 2", then each tray takes its own fresh reading and "Tray 2" is never filled from the "Tray 1" value (BR-36-3).
  4. Given a reading of 612.0000 g on the Bench balance (capacity 600 g), when it fills the field, then the EP-14-S11 capacity warning is shown, as for a typed figure.
  5. Given Rajesh saves the arrival, when the server stores it, then each figure taken from the balance has source `read` and the Counter 1 balance device id, and the pure gold line reads "447.3000 g".
- **Rules enforced on the server:** All EP-21-S2 and EP-21-S3 checks apply unchanged to a read figure. The scale id of a read figure is set from the device link (EP-36-S6). A read figure is recorded with source `read` and the device id (EP-36-S2). The stable flag is checked on the counter by the device link; the server does not trust it as a weight check.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, through EP-21-S14: actor, time, entity (parcel id), action (`parcel_arrival_recorded` or `parcel_weighing_added`), after (each weighing's scale id, gross and stones in integer units, source, device id).
- **Data changes:** None in the product database beyond EP-36-S2. Adds the device link reader and the "Read from balance" control to `ParcelArrival.tsx` and `ScaleAndWeights.tsx`, on the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("WEIGH THE WHOLE PARCEL · ALL THREE FIGURES", "Which scale is this on?", "Bench balance · 0.0001 g", "Everything on the scale together", "485.5000", "38.2000", "SO THE PURE GOLD IN THIS PARCEL IS"). The "Read from balance" control and the settling state are not yet designed.
- **Non-functional checks:** Precision: the reading is converted to integer units of 0.0001 g from its text form without floating point; a value with more decimals than the scale's readability is not silently rounded (open question below). Performance: a stable reading appears in the field within 1 second of the balance settling. Open decision D9: which balances have a data output and how the browser reaches them. Open decision G10: whether the unit becomes finer.
- **Depends on:** EP-36-S1, EP-36-S2, EP-36-S3, EP-36-S6, EP-21-S2, EP-21-S3, EP-14-S11, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S5: Staff can read gross and stone weights from the balance when tagging

- **Story ID:** EP-36-S5
- **Title:** Staff can read gross and stone weights from the balance when tagging
- **As a:** Staff
- **I want:** a "Read from balance" control beside "On the scale now" and "Stones, kemp, lac on this piece" on `parcel-tag`, each taking a fresh stable reading for the piece in front of me
- **So that:** every piece carries its own weight read off the bench balance, and the 12 tags add up to the parcel without typing errors (FR-36-2, FR-36-4, FR-36-5, BR-36-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the Bench balance is connected and Rajesh Verma is on "Tag item 8 of 12" for BATCH-2026-044, when he places the haram and reads a stable 84.5000 g, then "On the scale now" shows "84.5000" and the scale is set to Bench balance (epic acceptance criterion 1).
  2. Given Rajesh then places the stones and reads 6.1000 g into "Stones, kemp, lac on this piece", when both figures are in, then "PURE GOLD IN THIS PIECE" shows "78.4000 g".
  3. Given Rajesh presses "Save tag · go to item 9", when item 9 opens, then both weight fields are empty and nothing is carried over from TAG-9108 (BR-36-3).
  4. Given the stones reading is larger than the gross reading, when Rajesh saves, then the server refuses it with the EP-21-S5 sentence, as for typed figures.
  5. Given the tag is saved, when it is read back, then `pieces` holds `845000` and `61000` with both sources `read` and the device id, and other staff on the parcel receive "Tag saved on a shared parcel" through EP-21.
- **Rules enforced on the server:** All EP-21-S5 tagging rules apply unchanged. The scale id is set from the device link (EP-36-S6). Source and device are stored per EP-36-S2. The server never fills a weight.
- **Live events emitted / consumed:** None added by this story. Saving the tag still emits "Tag saved on a shared parcel" through EP-21-S6.
- **Audit entry written:** Yes, through EP-21-S14: actor, time, entity (piece id), action (tag save), after (gross and stones in integer units, scale id, source per figure, device id).
- **Data changes:** None in the product database beyond EP-36-S2. Adds the "Read from balance" control to `TagItem.tsx` through the shared weight inputs in `ScaleAndWeights.tsx`.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Put the piece on the bench balance and read each figure off", "WHAT IT WEIGHS · ON THE SAME BENCH BALANCE", "On the scale now", "84.5000", "6.1000", "PURE GOLD IN THIS PIECE", "Save tag · go to item 9", "WHY NOTHING IS PRE-FILLED"). The read control and settling state are not yet designed.
- **Non-functional checks:** Precision: readings converted to integer units of 0.0001 g without floating point and shown to 4 decimals. Performance: a stable reading appears within 1 second of the balance settling. Open decision D9: device interface. Open decision: how a reading with more decimals than the readability is handled.
- **Depends on:** EP-36-S4, EP-36-S6, EP-21-S5, EP-21-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S6: System can set the scale id from the device that gave the reading

- **Story ID:** EP-36-S6
- **Title:** System can set the scale id from the device that gave the reading
- **As a:** System
- **I want:** the server to take the scale id of any `read` figure from the linked scale of the named balance device, ignoring any scale id the client sends for it, and to refuse a reading whose scale is not in the registry
- **So that:** the ceiling is always computed from the scale that actually weighed, and staff never retype or change the scale for a read figure (FR-36-3, FR-36-7, BR-36-2, BR-36-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the Counter 1 balance device is linked to Bench balance, when a weighing arrives marked `read` from that device with client scale id Platform scale, then the server stores Bench balance as the scale id.
  2. Given a figure is filled from the balance on `parcel-tag`, when Rajesh Verma looks at the scale picker, then it shows Bench balance and cannot be changed for that reading; clearing the reading and typing instead makes the picker editable again.
  3. Given a balance device whose linked scale was retired after linking, when a reading from it is saved, then the server refuses it with a sentence saying the scale is not in the registry (FR-36-7).
  4. Given a parcel with one weighing read on Bench balance and one typed on Platform scale, when Compute Ceiling runs (EP-14-S10), then it uses Bench balance for the first and Platform scale for the second.
- **Rules enforced on the server:** For a `read` figure the scale id comes from `devices.scale_id`, never from the request. The device must be an active `balance` and its scale `active`. A typed figure keeps the scale id the staff member picked, checked against the registry as today. The scale picked by the device updates the caller's last scale (EP-14-S9).
- **Live events emitted / consumed:** None
- **Audit entry written:** No new entry. The scale id is part of the EP-21-S14 weighing and tag entries.
- **Data changes:** None in the product database. Changes the Create and Update Parcel arrival and Create and Update Tag service functions to derive the scale id for read figures.
- **UI reference:** `docs/ux/mockups/14-match-rule-any-parcel.svg` ("Every weighing remembers which scale it was on"); picker on routes `parcel-arrival` and `parcel-tag`.
- **Non-functional checks:** Security: a client cannot pick a coarser scale for a read figure to widen the ceiling. Precision: the ceiling stays an integer sum of half-steps; G10 decides the unit. Open decision D9: one device per scale is assumed.
- **Depends on:** EP-36-S1, EP-36-S2, EP-14-S9, EP-14-S10, EP-21-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S7: Staff can fall back to typing a weight when no device is connected

- **Story ID:** EP-36-S7
- **Title:** Staff can fall back to typing a weight when no device is connected
- **As a:** Staff
- **I want:** to type any weight and pick the scale by hand on `parcel-arrival` and `parcel-tag` whenever the balance is missing, switched off or drops mid-form, without losing what I have entered
- **So that:** a broken cable or a balance with no data output never stops the shop (FR-36-8, epic section 13 Availability)
- **Acceptance criteria (Given / When / Then):**
  1. Given no balance is set up at Counter 1, when Rajesh Verma tags a piece, then he types "On the scale now" and "Stones, kemp, lac on this piece" and picks "Which scale is this piece on?" by hand, as today (epic acceptance criterion 3).
  2. Given the balance disconnects after Rajesh read the gross 84.5000 g, when he reaches the stones field, then the screen says the balance is not connected, the gross stays filled, and he can type the stones.
  3. Given Rajesh has read a figure from the balance, when he clears it and types a different one, then the figure is saved with source `typed` and no device id.
  4. Given a typed figure, when it is saved, then it passes the same server checks and the same ceiling as a read figure.
- **Rules enforced on the server:** A `typed` figure needs a scale id picked by the staff member, which must be active in the registry. All EP-21-S2, EP-21-S3 and EP-21-S5 checks apply. Source `typed` with a null device id.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, through EP-21-S14: the figure's source `typed` is recorded with the weight and scale id.
- **Data changes:** None in the product database. Keeps `ScalePicker` and `parseWeight` as the fallback path on both screens.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("Which scale is this on?"); `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag`. The "not connected" line is not yet designed.
- **Non-functional checks:** Availability: losing the device keeps the form and its typed values. Precision: typed text is converted with the EP-02-S2 helper to integer units of 0.0001 g.
- **Depends on:** EP-36-S4, EP-36-S5, EP-36-S2, EP-21-S2, EP-21-S6, EP-14-S9, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S8: Staff can print a tag label with a barcode

- **Story ID:** EP-36-S8
- **Title:** Staff can print a tag label with a barcode
- **As a:** Staff
- **I want:** to print a label for a saved piece on the counter's label printer, showing the tag number as a barcode and as text, with the other agreed fields and no price, through Read Tag label and Create Label print record
- **So that:** each piece carries a tag that a scanner can read at stock-out (FR-36-9, BR-36-6, BR-36-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-9101 is saved, when Rajesh Verma chooses to print its label, then the label shows "TAG-9101" as a barcode and as text, and no price or "₹" appears (epic acceptance criterion 4).
  2. Given the label prints, when it is scanned on `stock-out`, then the scanner returns "TAG-9101" exactly.
  3. Given the print is sent, when it completes, then a `label_prints` row exists with the piece id, Rajesh as printer, the time, the label printer device id and reprint count 0.
  4. Given the piece has no saved tag yet, when Read Tag label is called, then the server refuses it with a not-found error.
  5. Given no label printer is set up at the counter, when Rajesh opens the tag, then the print control says no printer is set up and the tag save is unaffected.
- **Rules enforced on the server:** Read Tag label and Create Label print record are Staff and Owner only. The piece must exist and have a tag number. The label content is built on the server from the piece record; it never includes value fields. The device must be an active `label_printer`. Printed by and printed at come from the session and server clock (EP-03-S3).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The print is recorded in `label_prints`; it changes no piece or stock record.
- **Data changes:** Migration creates `label_prints` (id, piece id, printed by, printed at, device id, reprint count). Adds Read Tag label and Create Label print record to the shared contract.
- **UI reference:** Not yet designed (label layout, epic section 12). The print control sits on route `parcel-tag` (`docs/ux/mockups/21-tag-one-item.svg`).
- **Non-functional checks:** Performance: a label prints within 3 seconds of saving a tag. Security: label content is built on the server so no value field can leak onto it. Open decision D9: printer model. Open decision: label fields (tag number, HUID, purity, weights) and barcode format.
- **Depends on:** EP-36-S1, EP-36-S3, EP-21-S6, EP-15-S6, EP-15-S8, EP-03-S3, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S9: Staff can reprint a tag label

- **Story ID:** EP-36-S9
- **Title:** Staff can reprint a tag label
- **As a:** Staff
- **I want:** to reprint the label of a saved piece from the tag screen or the piece drawer on `stock`, with the same content as the first label
- **So that:** a torn or lost label can be replaced without retagging the piece (FR-36-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-9101 was printed once, when Rajesh Verma reprints it, then the new label matches the first and the `label_prints` row for the reprint has reprint count 1.
  2. Given TAG-9040 is `in_stock`, when Rajesh opens it in the drawer on `stock` and reprints, then the label prints on the counter's label printer.
  3. Given the piece's HUID was changed by an applied edit (EP-25), when the label is reprinted, then it shows the current values, not the old label's.
  4. Given TAG-7914 is `billed`, when a reprint is asked, then the server refuses it with a sentence saying the piece has left stock (proposed rule).
- **Rules enforced on the server:** Staff and Owner only. The piece must have a tag number and, for a reprint, must not be `billed` or `scrapped` (proposed rule). The reprint count is the number of earlier prints for the piece, computed on the server.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The reprint is recorded in `label_prints` with its count.
- **Data changes:** Inserts into `label_prints` (EP-36-S8).
- **UI reference:** Not yet designed. Entry points: route `parcel-tag` (`docs/ux/mockups/21-tag-one-item.svg`) and the piece drawer on route `stock` (`docs/ux/mockups/03-showroom-stock.svg`).
- **Non-functional checks:** Performance: a reprint prints within 3 seconds. Open decision: label content and barcode format.
- **Depends on:** EP-36-S8, EP-22-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S10: Staff can print the parcel sheet from the match screen (G8)

- **Story ID:** EP-36-S10
- **Title:** Staff can print the parcel sheet from the match screen (G8)
- **As a:** Staff
- **I want:** "Print parcel sheet" on `parcel-match` to print a sheet with the parcel id, karigar, order, each weighing with its scale name, and every item with its tag number and three weights, through Read Parcel sheet
- **So that:** the shop has a paper record of what the parcel said and what the tags say, kept with the parcel (FR-36-11, BR-36-7, gap G8)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is on `parcel-match`, when Rajesh Verma chooses "Print parcel sheet", then a sheet prints with "BATCH-2026-044", "Mahesh Soni", "Order PO-2026-915", the weighing on Bench balance, and the 12 tags TAG-9101 to TAG-9112 each with gross, stones and pure gold (epic acceptance criterion 6).
  2. Given the sheet, when it is read, then the totals match the screen: on the scale 485.5000 g, stones 38.2000 g, pure gold 447.3000 g, and no price or "₹" appears.
  3. Given the sheet prints, when it completes, then a `parcel_sheet_prints` row exists with the parcel id, Rajesh and the time.
  4. Given Mahesh Soni is signed in as Karigar, when he calls Read Parcel sheet, then the server refuses it.
- **Rules enforced on the server:** Read Parcel sheet is Staff and Owner only. Sheet content is built on the server from the parcel, its weighings, manifest and pieces, using the same gap and total functions as the match screen (EP-23-S2). No value fields. Printed by and at come from the session and server clock.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The print is recorded in `parcel_sheet_prints`.
- **Data changes:** Migration creates `parcel_sheet_prints` (id, parcel id, printed by, printed at). Adds Read Parcel sheet to the shared contract. Adds the print action to `ParcelMatch.tsx`.
- **UI reference:** `docs/ux/mockups/04-parcel-match.svg`, route `parcel-match` ("Print parcel sheet", "BATCH-2026-044 · Mahesh Soni", "Order PO-2026-915"). The sheet layout is not yet designed.
- **Non-functional checks:** Precision: every weight on the sheet is from integer units of 0.0001 g, shown to 4 decimals. Open decision G8: what the sheet shows and whether it prints before tagging, after matching, or both. Open decision D9: sheet printer model.
- **Depends on:** EP-36-S3, EP-23-S2, EP-23-S3, EP-21-S3, EP-21-S6, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S11: Staff can scan a tag to add a piece to a stock-out

- **Story ID:** EP-36-S11
- **Title:** Staff can scan a tag to add a piece to a stock-out
- **As a:** Staff
- **I want:** to scan a tag barcode into "Scan another tag" on `stock-out` and have the piece join "WHAT IS LEAVING THE SHOWCASE" with its photo and name, through Read Piece by scanned tag
- **So that:** I add pieces from what is in my hand without typing, and I can check the scanned piece is the one I hold (FR-36-12, BR-36-6, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-9040 is `in_stock`, when Rajesh Verma scans it, then "Jadau Emerald Ring · TAG-9040 · 18K · 8H33Z9" joins the list with its photo and pure gold "12.6000 g" (epic acceptance criterion 5).
  2. Given TAG-8841 and TAG-9040 are on the list, when the screen totals them, then "LEAVING THE FLOOR" shows "54.1900 g" for 2 pieces.
  3. Given TAG-9040 is already on the list, when it is scanned again, then it stays one row and the field clears.
  4. Given the scanner is unplugged, when Rajesh types "TAG-9040" into the same field, then the piece is added the same way.
  5. Given TAG-9040 is billed by Deepak Rao on another counter while on Rajesh's list, when "Piece billed by one staff member" arrives, then the row is removed as in EP-26-S11.
- **Rules enforced on the server:** Read Piece by scanned tag is Staff and Owner only. The scanned text is trimmed, matched case-insensitively and passed as a parameter. A scan reserves nothing; every piece is re-checked at confirm (EP-26-S2), so double-sell prevention is unchanged.
- **Live events emitted / consumed:** Consumed: "Piece billed by one staff member" (through EP-26-S11). Emitted: none by this story.
- **Audit entry written:** No. A scan builds a draft list and changes nothing.
- **Data changes:** None in the product database. Read Piece by scanned tag reuses Read Piece by tag (EP-26-S4) with the photo thumbnail added.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("Scan another tag", "WHAT IS LEAVING THE SHOWCASE", "LEAVING THE FLOOR"). Showing the photo after a scan is not yet designed.
- **Non-functional checks:** Performance: a scanned tag resolves within about 1 second. Concurrency: two staff scanning the same piece both see it; only one confirm wins (EP-26-S3). Open question: whether scanning also opens a piece in stock search.
- **Depends on:** EP-36-S3, EP-26-S4, EP-26-S11, EP-22-S5, EP-09-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-36-S12: System can refuse a scanned tag that is not in stock

- **Story ID:** EP-36-S12
- **Title:** System can refuse a scanned tag that is not in stock
- **As a:** System
- **I want:** a scanned tag that is sold, scrapped, stopped, not yet released or unknown to be refused with exactly the same sentence as the same tag typed by hand
- **So that:** staff get one consistent answer whichever way they enter a tag, and a scan never adds a piece that cannot be sold (FR-36-13, epic acceptance criterion 5)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-7914 is `billed`, when Rajesh Verma scans it, then it is not added and the line reads "TAG-7914 is not in stock.", the same as typing it (epic acceptance criterion 5).
  2. Given a barcode reads "TAG-0000" and no piece has that tag, when it is scanned, then the line reads "No piece with that tag." (proposed wording, as in EP-26-S4).
  3. Given TAG-9108 is still `draft` on BATCH-2026-044, when it is scanned, then it is refused as not in stock.
  4. Given a scan returns text that is not a tag number in the decided format, when it is submitted, then it is refused as a validation error and nothing is added.
- **Rules enforced on the server:** Read Piece by scanned tag returns the piece state and the same refusal code and sentence as Read Piece by tag (EP-03-S4). Only `in_stock` pieces may join the list. The tag format check is EP-15-S6.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused scan changes nothing.
- **Data changes:** None in the product database.
- **UI reference:** `docs/ux/mockups/06-stock-out.svg`, route `stock-out` ("Scan another tag"). The refusal line is not yet designed.
- **Non-functional checks:** Security: scanned text is validated at the trust boundary like typed input (EP-03-S2).
- **Depends on:** EP-36-S11, EP-26-S3, EP-26-S4, EP-03-S2, EP-03-S4, EP-15-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D9: which balances and printers does the shop use, and which interfaces do they support? (EP-36-S1, S3, S4, S5, S6, S8, S10)
- How does the browser reach a balance or printer: direct device access from the browser, or a small local program on the counter computer? (EP-36-S3, S4, S5, S8, S10)
- What does the tag label show (tag number, HUID, purity, weights), and which barcode format? (EP-36-S8, S9, S12)
- What does the parcel sheet show, and is it printed before tagging, after matching, or both (G8)? (EP-36-S10)
- What happens to a device reading that has more decimals than the registered readability? (EP-36-S4, S5)
- G10: does the integer unit of 0.0001 g need to be finer for the ceiling, and does that change how readings are stored? (EP-36-S2, S4, S6)
- Can staff scan to open a piece in stock search, or only at stock-out? (EP-36-S11)
- Does the karigar's own bench need any device support? (EP-36-S1)
