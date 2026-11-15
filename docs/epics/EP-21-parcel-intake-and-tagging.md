# EP-21: Parcel intake and tagging

## 1. Summary

When a karigar hands over finished work, the shop receives a parcel. Staff weigh it on a named scale (or in trays),
list what is inside, then tag each item one by one with its gross, stone and net weights and run three quality checks.
Several staff may tag one parcel at the same time. Nothing is pre-filled, because parcels are any size and no weight can
be guessed from a design. The business needs this because the tags are the gold's record: once every item is tagged and
the three weights agree with the parcel, the parcel can be released into stock (EP-23). This epic owns arrival, tagging
and quality checks; it does not decide the match.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M3 Intake loop
- Prototype status: Partial. `recordParcelArrival`, `saveTag` and `qcTick` and the screens `parcels`, `parcel-arrival`, `parcel-tag` and `parcel-qc` exist with trays and a manifest; photos are chosen from four bundled images, there is no live multi-staff tagging, and a parcel with no job is handled by a karigar and PO picker.

## 3. Roles involved

- Owner: sees parcels in progress; does not tag in the normal flow; can re-check a tag when he asks (EP-23).
- Staff: records the arrival, weighs, lists the manifest, tags each item, runs the checks, sends a tag back for re-tag, and releases a matching parcel (EP-23).
- Karigar: hands the parcel over (EP-20); not on these screens.
- System: enforces tag rules, keeps tag numbers unique, locks the parcel when stopped, shows other staff's saved tags live.

## 4. In scope

- Parcels-in list with each parcel's stage: weigh, tag, match.
- Arrival: weigh the parcel on a named scale, as one reading or as trays, with gross and stone for each.
- Manifest: a free mixed list of kinds and counts; "That is 12 items" derived.
- Parcel with no job: pick the karigar and a PO reference.
- Tag one item: tag number, HUID, name, kind, purity, size, collection, style, stone count, photos, gross, stone and net, the scale used.
- Rules on tagging: parcel weighed first, tag unique, stones not above gross, kind on the manifest, count not exceeded.
- Re-tagging clears that piece's quality check.
- Quality checks (staff stage, no QC role): scale agrees, hallmark, deductions.
- "Send this tag back to Deepak" for re-tag.
- Several staff tagging one parcel live; presence on an item (D9 aside).
- Photo upload via EP-09.
- Tray-to-piece link needed for a per-tray stop (G15).
- Hook for the parcel sheet print (G8, EP-36).

## 5. Out of scope

- The match verdict, ceiling use, release and owner clearance (EP-23).
- Scale records and ceiling formula (EP-14).
- Category, style, purity lists and tag/HUID format (EP-15).
- Photo storage (EP-09) and the karigar hand-over (EP-20).
- Reading weights from the balance and printing labels (EP-36, D9).
- Stock after release (EP-22).
- Raising and clearing problems (EP-24).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Parcel {weighings, manifest, stage 1|2|3, status, resolution, recheckPieceId, qcDone, verdict, gapNetG, ...}`, `ParcelWeighing {label, scaleId, grossG, stoneG}`, `ManifestRow {kind, count}`, `Piece`.
- `src/store/transitions.ts` `recordParcelArrival`: "Weigh the parcel first.", "Pick the scale this was weighed on.", "Enter what the parcel weighs on the scale.", "Stones cannot weigh more than the whole parcel.", "List what is inside the parcel.", "Say which karigar it came from."
- `saveTag`: "Weigh the parcel before tagging.", "`<id>` is already used on another piece.", "Stones cannot weigh more than the piece.", "`<kind>` is not on this parcel's list.", "All `<count>` `<kind>` on the list are already tagged."; a re-tag clears QC; `syncParcel` and `stampStop` update status and verdict.
- `qcTick(parcelId, pieceId)`.
- Screens: `src/components/parcels/{ParcelsList,ParcelArrival,TagItem,QcCheck,ScaleAndWeights}.tsx` and `util.ts` (`nextTagNumber`, `parcelTarget`).
- Mockup numbers: 485.5000 g gross, 38.2000 g stones, 447.3000 g pure, 12 items; item 8 of 12.
- Photos come from four bundled JPEGs in `TagItem.tsx`.
- Reusable: the transitions' rules and sentences, the forms, `ScalePicker`, `WeightField`, the stage logic.
- Must be rebuilt server-side: persistence, concurrent tagging with presence, photo upload, tray-to-piece link, uniqueness under load, audit of arrival and tags.

## 7. Functional requirements

- FR-21-1. Staff can record a parcel's arrival with at least one weighing, each on a registered scale, and a manifest of at least one row.
- FR-21-2. The server rejects a stone weight above its gross with the sentences in section 6.
- FR-21-3. Staff can weigh in trays; each tray is one weighing with its own scale.
- FR-21-4. The manifest total is derived from the rows entered.
- FR-21-5. Staff can receive a parcel that has no job by choosing the karigar and a PO reference.
- FR-21-6. The server refuses to tag before the parcel is weighed.
- FR-21-7. The server refuses a tag number used on another piece.
- FR-21-8. The server refuses a tag whose kind is not on the manifest or whose kind count is already full.
- FR-21-9. Every weight field starts empty; the server never fills a weight.
- FR-21-10. A tag records the scale it was weighed on.
- FR-21-11. Saving a tag again clears that piece's quality check.
- FR-21-12. Staff can tick the three checks per piece, and a parcel cannot be released until every piece is checked.
- FR-21-13. Staff can send a tag back for re-tag with a name.
- FR-21-14. Two staff can tag different items of one parcel at once, and each sees the other's saved tag within about a second.
- FR-21-15. If two staff open the same item, the screen shows who else has it open.
- FR-21-16. A stopped parcel accepts no new tags except the piece the owner asked to re-check.
- FR-21-17. Staff can attach photos of an item through file storage.
- FR-21-18. The system keeps the tray a piece was weighed in, to allow a per-tray stop (G15).
- FR-21-19. The system emits "Tag saved on a shared parcel" on each saved tag.

## 8. Business rules

- BR-21-1. No weight is pre-filled from a design, a category or a sibling piece. [SCOPE-ANALYSIS App. C, App. D; mockup 21]
- BR-21-2. Progress is counted in pieces, never estimated from weight. [SCOPE-ANALYSIS App. D]
- BR-21-3. The same scale is recorded per weighing. [SCOPE-ANALYSIS App. E]
- BR-21-4. The manifest takes an arbitrary mixed list. [SCOPE-ANALYSIS App. C, App. D]
- BR-21-5. Draft is short-lived: from typing a tag to passing the checks. [SCOPE-ANALYSIS App. B Q3]
- BR-21-6. Checking is a staff stage; there is no QC role. [SCOPE-ANALYSIS §6 Q1 and App. A; mockup 07]
- BR-21-7. Three checks: scale agrees, hallmark, deductions. [mockup 07]
- BR-21-8. Every piece must be checked before release. [src/store/transitions.ts releaseParcel]
- BR-21-9. A tag number is unique. [src/store/transitions.ts saveTag]
- BR-21-10. Weights are integers in units of 0.0001 g. [PRODUCTION-SCOPE §5 Precision]

## 9. Data

- Parcel: id (`BATCH-2026-NNN`), karigar id, job id (nullable), PO reference, arrived at, stage, status, resolution, verdict, gap net, loss, release fields (shared with EP-23).
- Parcel and ParcelWeighing (tray) each carry a location ID ("Main shop" in v1, set by the server; D7). Pieces tagged from the parcel get the same location ID.
- ParcelWeighing: id, parcel id, location ID, label ("Whole parcel" or "Tray 3"), scale id, gross, stone (integer, units of 0.0001 g).
- ManifestRow: id, parcel id, kind, count.
- Piece: tag id, name, kind, collection, style, purity, HUID, gross, stone, stone count, size, scale id, status, parcel id, job id, tray (nullable), tagged by, tagged at, photo ids, note; weights integer, units of 0.0001 g; value field is a nullable value socket, unused until EP-42.
- QcCheck: piece id, scale agrees, hallmark, deductions, by, at.
- Presence: parcel id, piece id, user id, last seen (short-lived).

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Parcels | Parcels-in with stage | Staff, Owner |
| Create | Parcel arrival | Weigh and list contents | Staff, Owner |
| Update | Parcel arrival | Add weighings (trays) before tagging | Staff |
| Create | Tag | Save one item's tag | Staff |
| Update | Tag | Re-tag | Staff, Owner (on re-check) |
| Update | Quality check | Tick a check | Staff |
| Update | Tag return | Send a tag back for re-tag | Staff |
| Read | Parcel | Detail with pieces, progress and verdict | Staff, Owner |
| Update | Presence | Say which item I have open | Staff |
| Reserve | Next tag number | Unique suggestion | Staff |

## 11. Live events

- Emits: "Tag saved on a shared parcel" — on each saved tag, so other staff do not duplicate it.
- Consumes: "Parcel handed over by karigar" — so intake can start.
- Consumes: "Tag saved on a shared parcel" — to show other staff's work and tags taken.
- Consumes: "Parcel stopped (mismatch or raised problem)" — to freeze the tagging form.

## 12. Screens and UX references

- Route ids: `parcels` (ParcelsList), `parcel-arrival`, `parcel-tag`, `parcel-qc`.
- Mockups: `20-parcel-arrival.svg`, `21-tag-one-item.svg`, `07-qc-check.svg` ("Send this tag back to Deepak"), `12-state-lifecycles.svg` (parcel rail), `14-match-rule-any-parcel.svg` (trays), `09-karigar-phone.svg` (hand-over source).
- Not yet designed (MOCKUP-COVERAGE §3): parcels-in list; tray entry. The prototype built both without a mockup.

## 13. Non-functional requirements

- Precision: every weight is an integer in units of 0.0001 g; the G10 unit question is settled before this epic.
- Concurrency: two staff saving the same tag number get one success and one clear refusal; a manifest count cannot be exceeded by two saves at once.
- Security: only staff and owner call these operations; karigars cannot read parcels.
- Audit: arrival, each tag change and each quality check write audit entries; the prototype audits none.
- Performance: a save and its live echo arrive within about 1 second; a 500-piece parcel list loads under 2 seconds.
- Time: arrival time stored in UTC.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-20, EP-14, EP-15, EP-09, EP-08
- Downstream: EP-22, EP-23, EP-31, EP-35, EP-36, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given a handed-over parcel, when staff record 485.5000 g gross and 38.2000 g stones on the Bench balance and list 12 items, then the parcel moves to the tag stage.
2. Given TAG-8841 exists, when staff save another piece as TAG-8841, then the server refuses.
3. Given two staff on one parcel, when one saves item 8, then the other sees it taken within about a second.
4. Given a kind counted 4 on the manifest, when staff save a fifth, then the server refuses.
5. Given a tagged piece, when staff re-tag it, then its checks are cleared.
6. Given a stopped parcel, when staff open the tag form, then it is frozen.

## 16. Risks

- Risk: concurrent tags exceed a manifest count. Mitigation: check the count inside the save transaction.
- Risk: typing errors in weights stop parcels. Mitigation: show which of the three weights breaks; direct reading in EP-36 (D9).
- Risk: huge parcels are slow to tag. Mitigation: trays and piece-count progress.
- Risk: draft pieces linger. Mitigation: show age on the list and revisit the draft rule.

## 17. Open decisions and questions

- Q5c: what are the largest and smallest parcels received?
- D9: are weights typed by hand or read from the balance?
- G14: can one hand-over carry many jobs and become one parcel?
- G15: how is a tray linked to its pieces for a per-tray stop?
- How are carats converted to grams for stones (SCOPE-ANALYSIS App. D)?
- What does presence show when two staff open the same item?
- D7 is decided: one shop, no branches ([decision record](../decisions/tenancy-and-branches.md)); a parcel belongs to the shop.
- How long may a draft piece wait before it is flagged?

## 18. Candidate stories

1. EP-21-S1: System can store parcels, weighings, manifests, pieces and checks as integer weights
2. EP-21-S2: Staff can record a parcel's arrival with scale and manifest
3. EP-21-S3: Staff can weigh a parcel in trays
4. EP-21-S4: Staff can receive a parcel with no job
5. EP-21-S5: System can enforce the tagging rules on the server
6. EP-21-S6: Staff can tag one item with nothing pre-filled
7. EP-21-S7: Staff can attach photos to a tag
8. EP-21-S8: Staff can run the three quality checks
9. EP-21-S9: Staff can send a tag back for re-tag
10. EP-21-S10: Staff can see the parcels-in list with stage
11. EP-21-S11: Staff can see another staff member's saved tag live
12. EP-21-S12: Staff can see who else has an item open
13. EP-21-S13: System can freeze tagging when a parcel stops
14. EP-21-S14: System can audit arrival, tags and checks
