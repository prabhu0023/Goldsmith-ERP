# EP-21: Parcel intake and tagging · stories

Epic document: [EP-21 Parcel intake and tagging](../epics/EP-21-parcel-intake-and-tagging.md)

Role note: stories where the server checks, locks, pushes or records on its own use "System". The parcel is created by the karigar's hand-over (EP-20-S6); the match verdict, release, send-back of a whole parcel and owner re-check belong to EP-23, and raising and clearing problems to EP-24. Where those epics are not built yet, the stories here are tested with seeded stopped and re-checking parcels. No weight is ever pre-filled, and no price or value appears on these screens (the piece value socket stays empty until EP-42).

---

## EP-21-S1: System can store parcels, weighings, manifests, pieces and checks as integer weights

- **Story ID:** EP-21-S1
- **Title:** System can store parcels, weighings, manifests, pieces and checks as integer weights
- **As a:** System
- **I want:** the intake fields this epic needs on top of the EP-02 tables: a three-part quality check per piece (scale agrees, hallmark, deductions, by, at), the tray weighing a piece was weighed in, the scale and tagger on each piece, and the tag-return fields, with every weight stored as an integer in units of 0.0001 g
- **So that:** arrival, tags and checks survive a reload and a redeploy, and the gold sums are exact (BR-21-10, FR-21-10, FR-21-18)
- **Acceptance criteria (Given / When / Then):**
  1. Given a weighing "Whole parcel" on the Bench balance with gross 485.5000 g and stones 38.2000 g, when it is saved and read back, then `parcel_weighings` stores `4855000` and `382000`, and the net 447.3000 g is computed on read, not stored from the client.
  2. Given a piece TAG-9108 with gross 84.5000 g, stones 6.1000 g and scale Bench balance, weighed in "Tray 3", when it is saved, then `pieces` stores `845000`, `61000`, the scale id, the tray weighing id, `taggedBy` and `taggedAt`, and the value field stays null.
  3. Given a quality check row for TAG-9110 on BATCH-2026-043, when it is stored, then it holds `scaleAgrees`, `hallmark` and `deductions` as booleans with the user id and time, and a second row for the same parcel and piece is rejected by the EP-02-S6 unique key.
  4. Given a piece whose tray weighing id points to a weighing on another parcel, when it is written, then the database rejects it, because a tray link must name a weighing of the piece's own parcel.
  5. Given the migration runs on a staging copy loaded with the prototype seed (EP-02-S13), when it finishes, then existing pieces have a null tray link, existing QC ticks are carried over as checks with all three parts true, and the migration can be rolled back.
- **Rules enforced on the server:** Weights are integers in units of 0.0001 g with gross greater than 0 and stones from 0 up to gross (check constraints). Net is never stored from client input. The tray link is nullable and must reference a weighing of the same parcel. One quality check row per parcel and piece. `version` columns on `parcels` and `pieces` back the EP-02-S14 stale-write check.
- **Live events emitted / consumed:** None. This story only stores data.
- **Audit entry written:** No. Schema changes are tracked by the migration history (EP-02-S1); data changes are audited by EP-21-S14.
- **Data changes:** Migration adds to `parcel_qc_ticks` (or renames it `parcel_qc_checks`) the columns `scaleAgrees`, `hallmark`, `deductions`, `checkedBy`, `checkedAt`; adds to `pieces` the columns `scaleId`, `trayWeighingId` (nullable), `taggedBy`, `taggedAt`, `retagRequestedBy`, `retagRequestedAt`, `retagReason` (nullable); adds `poRef` (nullable) to `parcels` if EP-02-S6 did not. Presence is not stored here; it lives in the live channel (EP-07-S8).
- **UI reference:** No screen.
- **Non-functional checks:** Precision: every weight is an integer in units of 0.0001 g, shown to 4 decimals; gap G10 (the half-step in the ceiling) must be settled in EP-02 before this migration. Time: `arrivedAt`, `taggedAt` and `checkedAt` stored in UTC. Open question G15: the tray link shape (one tray per piece) is the proposed answer; a different answer changes this migration.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S5, EP-02-S6, EP-02-S13, EP-02-S14, EP-14-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S2: Staff can record a parcel's arrival with scale and manifest

- **Story ID:** EP-21-S2
- **Title:** Staff can record a parcel's arrival with scale and manifest
- **As a:** Staff
- **I want:** on `parcel-arrival`, to pick "Which scale is this on?", type "Everything on the scale together" and "Of that, the stones, pearls, lac — anything not gold", see "SO THE PURE GOLD IN THIS PARCEL IS", list the kinds and counts inside, and press "Open the parcel for tagging"
- **So that:** the parcel's three weights and contents are fixed before anyone tags, and every tag will be checked against them (FR-21-1, FR-21-2, FR-21-4, BR-21-3, BR-21-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given parcel BATCH-2026-044 from Mahesh Soni against MO-2026-118 has no weighings, when Rajesh Verma picks "Bench balance · 0.0001 g", types 485.5000 and 38.2000, lists Temple Haram · Chettinad, Kundan Choker, Polki Kada · pair and Meenakari Pendant with counts adding to 12, and presses "Open the parcel for tagging", then the parcel has one weighing, four manifest rows, `stage` 2, and the button reads "Start tagging · 0 of 12" (epic acceptance criterion 1).
  2. Given the weight fields, when the screen opens, then both are empty and the pure gold line shows nothing until both are typed, then "447.3000 g" with "485.5000 − 38.2000".
  3. Given Rajesh types stones 490.0000 against gross 485.5000, when he saves, then the server refuses with "Stones cannot weigh more than the whole parcel." and nothing is stored; with no scale picked it refuses with "Pick the scale this was weighed on."; with no gross, "Enter what the parcel weighs on the scale."; with no rows, "List what is inside the parcel."
  4. Given rows are added with "Add another kind of item", when the counts change, then the line "That is N items to tag in the next step" updates from the rows, and there is no field for a total (FR-21-4).
  5. Given BATCH-2026-044 is already weighed, when a second arrival request reaches the server, then it refuses with "This parcel has already been weighed." and `parcel-arrival` shows "BATCH-2026-044 is already weighed" with its saved figures.
- **Rules enforced on the server:** Staff or Owner only (EP-05-S2). At least one weighing, each on a registered, active scale (EP-14-S1) with gross greater than 0 and stones from 0 to gross. At least one manifest row with a kind from the active category list (EP-15-S4) and a count of at least 1. Allowed only on an `open` parcel with no weighings. Arrival time and actor come from the server (EP-03-S3). Parcel update, rows and audit commit together (EP-03-S6). Version check on the parcel. A weight above the scale's capacity returns the EP-14-S11 warning.
- **Live events emitted / consumed:** Consumed: "Parcel handed over by karigar" so the parcel appears ready to weigh. Emitted: none from the catalogue; the parcels-in list refreshes through the `parcel:<id>` entity channel (EP-08-S9).
- **Audit entry written:** Yes: actor, time, entity (parcel id), action (`parcel_arrival_recorded`), after (each weighing's label, scale id, gross and stones in integer units, each manifest row's kind and count).
- **Data changes:** Inserts rows into `parcel_weighings` and `parcel_manifest_rows`; updates `parcels.stage`, `poRef` and `version`. Ports `recordParcelArrival` from `src/store/transitions.ts` as a server service function and moves `ParcelArrival.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("Weigh the parcel and list what is in it", "WEIGH THE WHOLE PARCEL · ALL THREE FIGURES", "Which scale is this on?", "SAY WHAT IS INSIDE · MIXED IS FINE", "Add another kind of item", "That is 12 items to tag in the next step", "Open the parcel for tagging").
- **Non-functional checks:** Precision: weights typed to 4 decimals and converted with the EP-02-S2 helper; the pure gold line uses the same helper on client and server. Concurrency: two staff weighing the same parcel get one success and one "This parcel has already been weighed." Audit: arrival audited, which the prototype does not do. Time: arrival time in UTC, shown in Asia/Kolkata. Open decision D9: weights are typed by hand here; reading them from the balance is EP-36. Open decision D7: whether the parcel carries a branch.
- **Depends on:** EP-21-S1, EP-20-S6, EP-03-S3, EP-03-S6, EP-05-S2, EP-14-S9, EP-14-S11, EP-15-S4, EP-15-S5, EP-06-S2, EP-08-S5, EP-08-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S3: Staff can weigh a parcel in trays

- **Story ID:** EP-21-S3
- **Title:** Staff can weigh a parcel in trays
- **As a:** Staff
- **I want:** on `parcel-arrival`, to choose "Weigh it in trays", enter each tray as its own weighing with "Which scale is this tray on?", gross and stones, add or remove trays before tagging, and see the trays summed
- **So that:** a parcel too heavy for the bench balance is still weighed finely, and a gap can later be pinned to one tray (FR-21-3, BR-21-3, G15)
- **Acceptance criteria (Given / When / Then):**
  1. Given a 10 kg parcel, when Rajesh Verma enters 20 trays, each on the Bench balance, and saves, then the parcel has 20 weighings labelled "Tray 1" to "Tray 20" in that order, each with its own scale id, and the parcel totals are the sum of the trays.
  2. Given Tray 1 on the Platform scale and Tray 2 on the Bench balance, when they are saved, then each weighing keeps its own scale, and the ceiling later counts ½ × 0.01 g for Tray 1 and ½ × 0.0001 g for Tray 2 (EP-14-S10).
  3. Given Tray 14 has stones 120.0000 g against gross 95.0000 g, when Rajesh saves, then the server refuses with "Tray 14: the stones cannot weigh more than everything together." and nothing is stored.
  4. Given a weighed parcel with no tags yet, when Rajesh adds Tray 21 through Update Parcel arrival, then it is stored as one more weighing; once any tag is saved, the server refuses with "Tagging has started. Weighings can no longer change." (proposed wording).
  5. Given a tray above the scale's capacity of 600 g on the Bench balance, when it is typed, then the EP-14-S11 capacity warning shows beside that tray.
- **Rules enforced on the server:** Same checks as EP-21-S2 for each tray. Labels are assigned by the server as "Tray N" in position order. Update Parcel arrival is Staff only and allowed only while the parcel is open and has no pieces. Version check on the parcel so two staff adding trays do not overwrite each other.
- **Live events emitted / consumed:** None from the catalogue. Other screens on the parcel refresh through the `parcel:<id>` entity channel.
- **Audit entry written:** Yes: actor, time, entity (parcel id), action (`parcel_arrival_recorded` or `parcel_weighing_added`), before (weighing count), after (each tray's label, scale id, gross and stones).
- **Data changes:** Inserts `parcel_weighings` rows with position. No new tables.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3, tray entry). The rule is drawn on `docs/ux/mockups/14-match-rule-any-parcel.svg` ("The same 10 kg, in trays", "20 trays on 0.0001 g") and noted on `docs/ux/mockups/20-parcel-arrival.svg` ("A parcel too heavy for this balance is weighed in trays"); the prototype route is `parcel-arrival`.
- **Non-functional checks:** Precision: tray sums in integer units, no rounding. Performance: a 20-tray arrival saves in one request and its echo arrives within about 1 second. Open question Q5c: the largest and smallest parcels, which sets the tray limit per parcel. Open question G15: trays per piece are linked in EP-21-S6.
- **Depends on:** EP-21-S2, EP-14-S10, EP-14-S11, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S4: Staff can receive a parcel with no job

- **Story ID:** EP-21-S4
- **Title:** Staff can receive a parcel with no job
- **As a:** Staff
- **I want:** to start `parcel-arrival` without a hand-over, pick the karigar it came from and type a PO reference such as PO-2026-915, then weigh and list it as usual
- **So that:** work that arrives without a job on the system, such as an order placed by phone, still enters the gold record (FR-21-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given no hand-over, when Rajesh Verma opens a new arrival, picks Mahesh Soni, types PO-2026-915, weighs and lists it, then a new parcel BATCH-2026-NNN exists with that karigar, `jobId` empty, `poRef` "PO-2026-915", `stage` 2 and `arrivedAt` from the server clock.
  2. Given no karigar is picked, when he saves, then the server refuses with "Say which karigar it came from." and nothing is stored.
  3. Given the karigar picker, when it opens, then it lists only active karigars (EP-16-S8), and a request naming an inactive karigar is refused.
  4. Given the PO reference is left blank, when he saves, then the parcel is stored with `poRef` empty and the subtitle reads "Weigh the whole thing first, then say what is inside" with no job line.
  5. Given two arrivals saved at the same moment, when both commit, then they get two different parcel ids with no gap and no duplicate.
- **Rules enforced on the server:** Staff or Owner only. Karigar must be active. The parcel id is the next `BATCH-YYYY-NNN` from the same counter used by EP-20-S6. PO reference is trimmed and limited to 40 characters (proposed limit). All EP-21-S2 weighing and manifest rules apply. Create and audit in one transaction; deduplicated by idempotency key (EP-03-S8).
- **Live events emitted / consumed:** None from the catalogue; the hand-over event is not emitted because the karigar did not hand over. The parcels-in list refreshes through the entity channel.
- **Audit entry written:** Yes: actor, time, entity (parcel id), action (`parcel_created_without_job`), after (karigar id, PO reference, weighings, manifest).
- **Data changes:** Inserts into `parcels`, `parcel_weighings` and `parcel_manifest_rows`.
- **UI reference:** No mockup for the no-job case; the prototype adds a karigar picker and "PO-2026-915" field to `parcel-arrival` (`docs/ux/mockups/20-parcel-arrival.svg` shows the job case).
- **Non-functional checks:** Concurrency: the parcel id counter is atomic. Security: only Staff and Owner; a karigar cannot create a parcel this way. Audit: creation without a job is audited so the owner can see who brought it in.
- **Depends on:** EP-21-S2, EP-16-S8, EP-03-S7, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S5: System can enforce the tagging rules on the server

- **Story ID:** EP-21-S5
- **Title:** System can enforce the tagging rules on the server
- **As a:** System
- **I want:** every Create Tag and Update Tag to check, inside one transaction, that the parcel is weighed and not stopped or released, the tag number is free, the stones are not above the gross, the scale is registered, and the kind is on the manifest with room left
- **So that:** no bad tag reaches the gold record, even when several staff save at once (FR-21-6, FR-21-7, FR-21-8, FR-21-9, BR-21-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-045 has no weighings, when a tag is saved on it, then the server refuses with "Weigh the parcel before tagging."
  2. Given TAG-8841 is on a piece of BATCH-2026-041, when a tag TAG-8841 is saved on BATCH-2026-044, then the server refuses with "TAG-8841 is already used on another piece." (epic acceptance criterion 2).
  3. Given Polki Kada · pair has count 4 on the manifest and 4 are tagged, when a fifth is saved, then the server refuses with "All 4 Polki Kada · pair on the list are already tagged."; a kind not on the list is refused with "<kind> is not on this parcel's list." (epic acceptance criterion 4).
  4. Given 3 of 4 Kundan Choker are tagged and two staff save the fourth and a fifth at the same moment, when both requests run, then exactly one succeeds and the other is refused with the count sentence.
  5. Given a tag with stones 9.0000 g on gross 8.0000 g, gross 0, no name, no tag number or no scale, when it is saved, then the server refuses with "Stones cannot weigh more than the piece.", "Enter what the piece weighs on the scale.", "Name the piece.", "Give the piece a tag number." or "Pick the scale this piece was weighed on." respectively.
- **Rules enforced on the server:** Staff only for Create Tag; Staff, and Owner on a re-check, for Update Tag (EP-05-S2). The manifest count check and the tag number check run inside the save transaction with the parcel row locked. Tag number and HUID checks are EP-15-S7 and EP-15-S8. Purity, kind and style must be active list entries (EP-15-S4). The server never fills a weight; a missing gross is refused, not defaulted (BR-21-1). Stopped and released rules are EP-21-S13.
- **Live events emitted / consumed:** None. Refused saves emit nothing; accepted saves emit through EP-21-S6.
- **Audit entry written:** No. Refused saves store nothing; accepted saves are audited by EP-21-S14.
- **Data changes:** None beyond EP-21-S1. Ports the `saveTag` checks from `src/store/transitions.ts` as a server service function with a row lock on the parcel.
- **UI reference:** No screen. The sentences show on `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag`, through EP-08-S5.
- **Non-functional checks:** Concurrency: two staff saving the same tag number get one success and one clear refusal; a manifest count cannot be exceeded by two saves at once (epic section 13). Precision: the stones-above-gross check compares integer units.
- **Depends on:** EP-21-S1, EP-21-S2, EP-15-S4, EP-15-S7, EP-15-S8, EP-03-S4, EP-03-S6, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S6: Staff can tag one item with nothing pre-filled

- **Story ID:** EP-21-S6
- **Title:** Staff can tag one item with nothing pre-filled
- **As a:** Staff
- **I want:** "Tag item 8 of 12" on `parcel-tag` with "Kind of item" picked from the manifest, a suggested "New tag number" and HUID, name, purity, size, collection, style, stone count, the tray, and the weights "On the scale now" and "Stones, kemp, lac on this piece" typed fresh, then "Save tag · go to item 9" or "Save and stop here"
- **So that:** each piece is recorded with its own measured weight on a named scale, counted towards the parcel (FR-21-9, FR-21-10, BR-21-1, BR-21-2, BR-21-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 with 7 of 12 tagged, when Rajesh Verma opens `parcel-tag`, then the header reads "Tag item 8 of 12", "New tag number" shows the reserved TAG-9108, both weight fields are empty, and the side panel lists "STILL TO TAG" with "Temple Haram · 1 left".
  2. Given Rajesh picks Temple Haram · Chettinad, enters HUID 4T71M9, name "Chettinad Temple Nakshi Long Haram", purity 22K (916), size 28 inches, tray "Tray 3", weights 84.5000 and 6.1000 on the Bench balance, and presses "Save tag · go to item 9", then a `draft` piece TAG-9108 is stored with those values, "PURE GOLD IN THIS PIECE 78.4000 g" was shown, and the form opens item 9 with empty weights.
  3. Given the previous piece weighed 84.5000 g, when item 9 opens, then no weight field carries it over, and no weight is filled from the kind, design or a sibling (BR-21-1).
  4. Given "Save and stop here", when the tag saves, then Rajesh returns to the parcel and the progress reads "8 of 12 items tagged so far", counted in pieces, with "pure gold so far" summed from saved tags (BR-21-2).
  5. Given the tag saves, when it commits, then "Tag saved on a shared parcel" is emitted with parcel id, tag number, kind and tagger, and the parcel stage moves to 3 when the 12th tag is saved.
- **Rules enforced on the server:** All EP-21-S5 checks. The suggested tag number comes from Reserve Next tag number (EP-15-S6); a typed number is still checked. The tray must be a weighing of this parcel when the parcel was weighed in trays, and is empty otherwise. Piece status is `draft`; `taggedBy`, `taggedAt`, `jobId` and `madeById` come from the server and the parcel. Version check on the piece when it already exists. The parcel's stage and verdict are recomputed in the same transaction.
- **Live events emitted / consumed:** Emitted after commit: "Tag saved on a shared parcel" (FR-21-19). Consumed: "Tag saved on a shared parcel" to refresh progress and the STILL TO TAG count (EP-21-S11).
- **Audit entry written:** Yes: actor, time, entity (piece tag number and parcel id), action (`tag_saved`), after (kind, name, purity, HUID, gross and stones in integer units, scale id, tray).
- **Data changes:** Inserts or updates `pieces`; updates `parcels.stage`, `verdict` and `version`. Moves `TagItem.tsx` and `util.ts` `nextTagNumber` onto the EP-08 data layer and the EP-15-S6 reservation.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Tag item 8 of 12", "Kind of item", "picked from the manifest · 1 of these still to tag", "New tag number", "Hallmark HUID", "WHAT IT WEIGHS · ON THE SAME BENCH BALANCE", "On the scale now", "PURE GOLD IN THIS PIECE", "Save tag · go to item 9", "Save and stop here", "WHY NOTHING IS PRE-FILLED").
- **Non-functional checks:** Precision: weights typed to 4 decimals, stored as integer units; net computed with the shared helper. Performance: a save and its live echo arrive within about 1 second. Concurrency: see EP-21-S5. Open decision D9: weights typed by hand; reading from the balance is EP-36. Open question: how carats are converted to grams for stones (the "itemise →" link); until answered, stones are entered in grams.
- **Depends on:** EP-21-S3, EP-21-S5, EP-15-S5, EP-15-S6, EP-14-S9, EP-07-S1, EP-07-S11, EP-08-S5, EP-08-S6, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S7: Staff can attach photos to a tag

- **Story ID:** EP-21-S7
- **Title:** Staff can attach photos to a tag
- **As a:** Staff
- **I want:** the "Photo" box and "Add more angles" on `parcel-tag` to upload pictures taken at the bench through file storage and keep them on the piece in order
- **So that:** the checker and later the stock screens see the piece as it was tagged, without the four bundled images (FR-21-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is tagging TAG-9108, when he adds three photos, then each is uploaded through EP-09-S2, and the saved piece lists three photo ids in the order added.
  2. Given a 25 MB file or a PDF, when he adds it, then the upload is refused with the EP-09-S3 sentence and the tag form keeps its other values.
  3. Given TAG-9108 is saved with photos, when Deepak Rao opens it on `parcel-qc`, then "Photo at tagging" shows the first photo through a signed, expiring link (EP-09-S5).
  4. Given a tag saved with no photo, when it is opened on `parcel-qc`, then the box shows "No photo" and the save was not refused.
  5. Given the build, when it is checked, then `TagItem.tsx` no longer offers the four bundled JPEGs as photo choices.
- **Rules enforced on the server:** Photos are attached through EP-09-S7 to the piece, by Staff or Owner only. A photo id must belong to an upload by the same user that is not yet attached. Size and type limits are EP-09-S3. Karigars cannot read piece photos (EP-09-S6).
- **Live events emitted / consumed:** None of its own; the photo ids travel with "Tag saved on a shared parcel".
- **Audit entry written:** Yes, as part of the tag save: after includes the list of photo ids.
- **Data changes:** Inserts `piece_photos` rows (EP-02-S5) and file records (EP-09-S1).
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Photo", "Add more angles"); `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc` ("Photo at tagging").
- **Non-functional checks:** Performance: the thumbnail on `parcel-qc` uses the EP-09-S4 resized copy. Security: signed links only; no public URL. Availability: a failed upload shows the EP-08-S5 sentence and can be retried without losing the typed tag.
- **Depends on:** EP-21-S6, EP-09-S2, EP-09-S3, EP-09-S4, EP-09-S5, EP-09-S6, EP-09-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S8: Staff can run the three quality checks

- **Story ID:** EP-21-S8
- **Title:** Staff can run the three quality checks
- **As a:** Staff
- **I want:** on `parcel-qc`, for each tagged piece, to answer "Does the scale agree?" by typing "You re-weigh", "Is the hallmark on the piece?" and "Do the deductions look honest?", then press "Checked — on to piece 5"
- **So that:** every piece is checked by a staff member before the parcel can be matched and released, with no separate QC role (FR-21-12, BR-21-6, BR-21-7, BR-21-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-9110 "Jadau Uncut Emerald Cocktail Ring" with "Tag says 14.8500 g", when Rajesh Verma types 14.8500 in "You re-weigh", then "Matches" shows; if he types 14.8300, then "Differs by 20 mg. Send the tag back to be weighed again." shows and "Checked" stays disabled.
  2. Given all three answers are yes, when Rajesh presses "Checked — on to piece 5", then a check row with `scaleAgrees`, `hallmark` and `deductions` true, his user id and the server time is stored, the header reads "4 of 9 pieces checked", and piece 5 opens.
  3. Given a check request with any of the three parts false, when it reaches the server, then it refuses with "Confirm all three checks first." (proposed wording) and nothing is stored.
  4. Given BATCH-2026-043 has 8 of 9 pieces checked, when a release is attempted (EP-23), then it is refused with "Check every piece before releasing the parcel." (BR-21-8).
  5. Given the same check is sent twice, when the server processes it, then one check row exists and the second call returns success without change.
- **Rules enforced on the server:** Staff or Owner only; no QC role exists (BR-21-6). The piece must belong to the parcel ("<tag> is not in this parcel."). The re-weigh must equal the tag gross in integer units for "scale agrees" to be accepted. Not allowed on a stopped or released parcel (EP-21-S13). One check row per parcel and piece. The release check itself is in EP-23.
- **Live events emitted / consumed:** None from the catalogue; other screens on the parcel refresh the checked count through the `parcel:<id>` entity channel.
- **Audit entry written:** Yes: actor, time, entity (piece tag number and parcel id), action (`qc_checked`), after (scale agrees, hallmark, deductions, re-weigh in integer units).
- **Data changes:** Inserts into the quality check table (EP-21-S1). Ports `qcTick` and moves `QcCheck.tsx` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc` ("Check this piece before the parcel is matched", "THREE THINGS TO CONFIRM", "Does the scale agree?", "You re-weigh", "Is the hallmark on the piece?", "Do the deductions look honest?", "Checked — on to piece 5", "There is no separate QC manager.").
- **Non-functional checks:** Precision: the re-weigh comparison is exact in integer units. Audit: each check is audited, which the prototype does not do. Open question: the lac warning "Rings this size usually carry 0.6–0.9 g of lac" needs a stored norm per kind; until one exists, the line is not shown.
- **Depends on:** EP-21-S6, EP-21-S7, EP-05-S2, EP-03-S8, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S9: Staff can send a tag back for re-tag

- **Story ID:** EP-21-S9
- **Title:** Staff can send a tag back for re-tag
- **As a:** Staff
- **I want:** "Send this tag back to Deepak" on `parcel-qc`, with an optional reason, which marks the piece for re-tag by the person who tagged it, clears its check and opens it on `parcel-tag` for whoever picks it up
- **So that:** a piece whose weight or deductions look wrong is weighed again before the parcel is matched (FR-21-11, FR-21-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-9110 was tagged by Deepak Rao and checked, when Rajesh Verma presses "Send this tag back to Deepak" with reason "Re-weigh, scale differs by 20 mg", then the piece's check row is removed, `retagRequestedBy` is Rajesh, the reason is stored, and the checked count drops by one.
  2. Given Deepak Rao has BATCH-2026-043 open, when the send-back commits, then he sees TAG-9110 marked "Sent back by Rajesh Verma" within about a second.
  3. Given TAG-9110 is re-tagged with gross 14.8300 g, when it saves, then the re-tag fields are cleared, the piece needs checking again, and the audit shows before 14.8500 g and after 14.8300 g (epic acceptance criterion 5).
  4. Given a re-tag is opened, when `parcel-tag` loads, then the existing tag number, kind and text fields are shown, and the weight fields are empty to be read again.
  5. Given the parcel is stopped or released, when a send-back request reaches the server, then it refuses with the stopped or released sentence.
- **Rules enforced on the server:** Staff or Owner only. The piece must be `draft` and belong to the parcel. Reason is optional, trimmed, up to 300 characters (proposed limit). Any tag save on a piece clears its check (FR-21-11), whether or not it was sent back. Version check on the piece.
- **Live events emitted / consumed:** Emitted after commit: "Tag saved on a shared parcel" with a sent-back flag, so other staff see the piece reopened.
- **Audit entry written:** Yes: actor, time, entity (piece tag number and parcel id), action (`tag_sent_back`), before (checked), after (re-tag requested, reason, named tagger).
- **Data changes:** Updates `pieces.retagRequestedBy`, `retagRequestedAt`, `retagReason`, `version`; deletes the piece's check row.
- **UI reference:** `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc` ("Send this tag back to Deepak"); re-tag opens on route `parcel-tag`. The "Sent back" marker is not yet designed.
- **Non-functional checks:** Concurrency: a send-back and a check on the same piece are ordered by the piece version. Audit: before and after weights kept on the re-tag. Open question: whether the named tagger also gets a notice (EP-11) is not decided; this story shows it only on screen.
- **Depends on:** EP-21-S6, EP-21-S8, EP-07-S11, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S10: Staff can see the parcels-in list with stage

- **Story ID:** EP-21-S10
- **Title:** Staff can see the parcels-in list with stage
- **As a:** Staff
- **I want:** the "Parcels in" screen (`parcels`) to list open and stopped parcels with karigar, job or PO reference, arrival age, stage (weigh, tag, match), "N of M tagged" and the next action "Weigh it", "Keep tagging", "Match and release" or "Open"
- **So that:** the desk sees what has arrived and what to do next for each parcel (BR-21-2, BR-21-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-045 not weighed, BATCH-2026-044 with 7 of 12 tagged and BATCH-2026-043 fully tagged, when Rajesh Verma opens `parcels`, then they show "Not weighed yet" with "Weigh it", "7 of 12 tagged" with "Keep tagging", and "Match and release" respectively.
  2. Given a parcel with draft pieces older than the draft-age limit, when the list loads, then the row shows the age of its oldest draft, for example "Draft for 3 days" (proposed, epic section 16).
  3. Given a karigar hands over MO-2026-119, when the parcel is created, then it appears at the top of the list within about a second without a reload.
  4. Given a stopped parcel, when the list loads, then it shows the stopped colour and "Open", and a released parcel is not listed.
  5. Given 500 parcels exist, when the list loads, then the first page arrives in under 2 seconds and the rest load by cursor (EP-03-S9).
- **Rules enforced on the server:** List Parcels is Staff or Owner only; a karigar call is refused (EP-05-S2). Stage and tagged counts are computed on the server from weighings and pieces, never from weight. Sorted newest arrival first. Cursor paging.
- **Live events emitted / consumed:** Consumed: "Parcel handed over by karigar", "Tag saved on a shared parcel" and "Parcel stopped (mismatch or raised problem)" to refresh rows.
- **Audit entry written:** No. Reading the list changes nothing.
- **Data changes:** None in the product database. Moves `ParcelsList.tsx` onto the EP-08 data layer.
- **UI reference:** Not yet designed (MOCKUP-COVERAGE §3, parcels-in list); the prototype route is `parcels`. The rail entry "Parcels in" is on `docs/ux/mockups/20-parcel-arrival.svg`; the parcel rail colours are on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Performance: the list loads under 2 seconds. Security: karigars cannot read parcels. Time: arrival age computed from UTC and shown in Asia/Kolkata. Open question: how long a draft piece may wait before it is flagged. Open decision D7: whether the list filters by branch.
- **Depends on:** EP-21-S2, EP-20-S6, EP-03-S9, EP-05-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S11: Staff can see another staff member's saved tag live

- **Story ID:** EP-21-S11
- **Title:** Staff can see another staff member's saved tag live
- **As a:** Staff
- **I want:** when another staff member saves a tag on the parcel I am tagging, my progress, "STILL TO TAG" list and suggested next item to update within about a second
- **So that:** two of us can tag one parcel at once without tagging the same item twice (FR-21-14, FR-21-19)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma and Deepak Rao both have BATCH-2026-044 open on `parcel-tag`, when Deepak saves item 8 as the last Temple Haram, then within about a second Rajesh's panel shows "8 of 12 items tagged so far" and Temple Haram leaves "STILL TO TAG" (epic acceptance criterion 3).
  2. Given Rajesh has Temple Haram · Chettinad picked and not saved, when Deepak's save fills that kind, then Rajesh's form shows "All 4 Temple Haram · Chettinad on the list are already tagged. Pick another kind." before he saves, and a save sent anyway is refused by EP-21-S5.
  3. Given Rajesh's suggested tag number was taken by Deepak, when the event arrives, then Rajesh's form reserves a new number and shows it.
  4. Given Rajesh's connection drops while Deepak saves two tags, when it returns, then "Reconnecting…" clears and both tags appear through catch-up (EP-07-S7, EP-08-S10).
  5. Given the event, when it is inspected, then it carries parcel id, tag number, kind, tagger name and parcel version, and no weight beyond what Staff may see.
- **Rules enforced on the server:** "Tag saved on a shared parcel" is published only after the save commits (EP-07-S1) and only to Staff and Owner subscribed to the parcel (EP-07-S5). Events are stamped with sequence and version so a late event never overwrites newer data (EP-07-S2).
- **Live events emitted / consumed:** Emitted: "Tag saved on a shared parcel" (by EP-21-S6 and EP-21-S9). Consumed: "Tag saved on a shared parcel".
- **Audit entry written:** No. Pushing an event changes nothing; the save is audited by EP-21-S14.
- **Data changes:** None in the product database.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("THIS PARCEL", "items tagged so far", "STILL TO TAG", "Temple Haram · 1 left").
- **Non-functional checks:** Performance: the echo arrives within about 1 second (epic section 13). Concurrency: the final say is always the server's EP-21-S5 checks; the live update only warns early. Availability: catch-up after reconnect.
- **Depends on:** EP-21-S6, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S7, EP-07-S11, EP-07-S12, EP-08-S8, EP-08-S9, EP-08-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S12: Staff can see who else has an item open

- **Story ID:** EP-21-S12
- **Title:** Staff can see who else has an item open
- **As a:** Staff
- **I want:** the tag form to show the names of other staff who have the same item open, for example "Deepak Rao is also on item 8", and the parcel panel to show who is tagging it
- **So that:** we see a clash before both of us weigh and type the same piece (FR-21-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao has item 8 (TAG-9108) of BATCH-2026-044 open, when Rajesh Verma opens the same item, then Rajesh sees "Deepak Rao is also on item 8" and Deepak sees "Rajesh Verma is also on item 8" within about a second.
  2. Given Deepak closes the tag form or moves to item 9, when the presence update arrives, then the line disappears from Rajesh's form.
  3. Given Deepak's browser closes without leaving, when no presence update arrives for 30 seconds (proposed timeout), then his name is removed.
  4. Given both have the item open, when either saves, then the save is not blocked by presence; the EP-21-S5 checks decide.
  5. Given a karigar session, when it tries to send Update Presence, then the server refuses it.
- **Rules enforced on the server:** Update Presence is Staff or Owner only. Presence names only users with the parcel open on `parcel-tag` or `parcel-qc`. Presence is short-lived and never blocks a save.
- **Live events emitted / consumed:** None from the catalogue. Presence join, move and leave travel on the `parcel:<id>` entity channel (EP-07-S8).
- **Audit entry written:** No. Presence is not a business change.
- **Data changes:** None in the product database. Presence record kept by the channel: parcel id, piece id, user id, user name, last seen.
- **UI reference:** Not yet designed. Tag form is `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag`.
- **Non-functional checks:** Performance: presence updates within about 1 second. Personal data: only the user's name is shared, and only with other Staff and Owner. Open question: what presence shows when two staff open the same item; the wording and placement here are proposed.
- **Depends on:** EP-21-S6, EP-07-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S13: System can freeze tagging when a parcel stops

- **Story ID:** EP-21-S13
- **Title:** System can freeze tagging when a parcel stops
- **As a:** System
- **I want:** to refuse new tags, re-tags, checks and send-backs on a stopped parcel, except a re-tag of the one piece the owner asked to re-check, and to freeze the open tag and check forms live when the parcel stops
- **So that:** nothing changes on a parcel the owner must look at, and staff see that at once (FR-21-16)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 is stopped, when Rajesh Verma opens `parcel-tag`, then every field and save button is disabled and the notice reads "This parcel is stopped. Only the owner can start it again." (epic acceptance criterion 6).
  2. Given Rajesh has the tag form open, when the parcel stops through "Parcel stopped (mismatch or raised problem)", then within about a second his form freezes with the same notice and his unsaved values stay visible; on `parcel-qc` it reads "This parcel is stopped, so checks are paused."
  3. Given a tag, check or send-back request on a stopped parcel, when it reaches the server, then it refuses with "This parcel is stopped. Only the owner can start it again."; on a released parcel, "This parcel has been released."
  4. Given the owner asked to re-check TAG-9108 (parcel `resolution` `rechecking`, `recheckPieceId` TAG-9108), when Rajesh re-tags TAG-9108, then the save is accepted, and a save of any other piece is refused with the stopped sentence.
  5. Given the re-check save commits, when the server recomputes the parcel, then `resolution` and `recheckPieceId` are cleared and the parcel stays stopped or reopens as the verdict decides (EP-23).
- **Rules enforced on the server:** The stop check runs inside each save, check and send-back transaction against the locked parcel row. Only the piece named in `recheckPieceId` may be re-tagged while stopped, and only an Update Tag, not a new tag. The verdict and stop are set by EP-23 and EP-24; this story only obeys them.
- **Live events emitted / consumed:** Consumed: "Parcel stopped (mismatch or raised problem)" to freeze the form.
- **Audit entry written:** No for refused requests, which store nothing. The accepted re-check save is audited by EP-21-S14 with action `tag_rechecked`.
- **Data changes:** None beyond EP-21-S1. Ports the stopped and re-check branches of `saveTag` and the stopped check of `qcTick`.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` (frozen state not yet designed); `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc`; stopped colour on `docs/ux/mockups/12-state-lifecycles.svg`.
- **Non-functional checks:** Concurrency: a save already committed before the stop is kept; a save that reaches the lock after the stop is refused. Performance: the form freezes within about 1 second of the stop. Open question G15: a stop on one tray only, so the rest can keep moving, needs the tray link from EP-21-S1 and a rule from EP-23; until then a stop freezes the whole parcel. Until EP-23 and EP-24 exist, stops and re-checks are seeded for tests.
- **Depends on:** EP-21-S5, EP-21-S6, EP-21-S8, EP-21-S9, EP-07-S11, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-21-S14: System can audit arrival, tags and checks

- **Story ID:** EP-21-S14
- **Title:** System can audit arrival, tags and checks
- **As a:** System
- **I want:** every arrival, added weighing, parcel created without a job, tag save, re-tag, re-check, photo change, quality check and send-back to write one audit entry in the same transaction, with before and after values and weights in integer units
- **So that:** the owner can trace who weighed and tagged every piece of gold, which the prototype does not record (epic section 13 Audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma records the arrival of BATCH-2026-044, when it commits, then one entry exists with actor Rajesh Verma, server time, entity BATCH-2026-044, action `parcel_arrival_recorded` and after holding the weighing `4855000` / `382000` on the Bench balance and the four manifest rows.
  2. Given Deepak Rao re-tags TAG-9110 from 14.8500 g to 14.8300 g, when it commits, then the entry has action `tag_saved`, before gross `148500` and after gross `148300`, and notes that the check was cleared.
  3. Given a tag save fails after the piece is written but before the audit insert, when the transaction rolls back, then neither the piece nor an entry exists (EP-06-S2).
  4. Given Sanjay Seth opens the audit log filtered by entity BATCH-2026-044, when it loads, then he sees the arrival, each tag, each check and each send-back in time order (EP-06-S10).
  5. Given a Staff user, when he asks for the audit log, then the server refuses (EP-06-S12).
- **Rules enforced on the server:** The audit insert is part of each operation's transaction (EP-06-S2). Before and after values come from the server's row reads, not the request (EP-06-S3). Weights are recorded as integer units (EP-06-S5). Entries cannot be edited or deleted (EP-06-S1).
- **Live events emitted / consumed:** None.
- **Audit entry written:** Yes: actor, time, entity (parcel id and piece tag number), action (`parcel_arrival_recorded`, `parcel_weighing_added`, `parcel_created_without_job`, `tag_saved`, `tag_rechecked`, `tag_sent_back`, `qc_checked`), before, after, reason where given.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds the action kinds above to the audit kind list in the shared package.
- **UI reference:** No screen of its own. Entries are read on the EP-06 audit log screen.
- **Non-functional checks:** Audit: every intake change audited in its own transaction (epic section 13). Precision: weights in integer units of 0.0001 g. Time: entry time from the server clock in UTC.
- **Depends on:** EP-21-S2, EP-21-S3, EP-21-S4, EP-21-S6, EP-21-S7, EP-21-S8, EP-21-S9, EP-21-S13, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S5, EP-06-S7, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Q5c: what are the largest and smallest parcels received? (EP-21-S3)
- D9: are weights typed by hand or read from the balance? (EP-21-S2, S6)
- G14: can one hand-over carry many jobs and become one parcel? (EP-21-S2, S4)
- G15: how is a tray linked to its pieces for a per-tray stop? (EP-21-S1, S3, S13)
- How are carats converted to grams for stones (SCOPE-ANALYSIS App. D)? (EP-21-S6)
- What does presence show when two staff open the same item? (EP-21-S12)
- D7: does a parcel belong to a branch? (EP-21-S2, S10)
- How long may a draft piece wait before it is flagged? (EP-21-S10)
