# EP-15: Reference data

## 1. Summary

Reference data is the set of short lists every form picks from: categories (what kind of item a piece is), styles,
purities with their fineness, inclusion types (stones, kemp, lac and so on, with the unit they are weighed in), and the
format rules for tag numbers and BIS HUID codes. Today these lists are hard-coded in the front end or typed freely, so
"Temple Haram" on a manifest and "Temple haram" on a tag can disagree and stop a parcel. The business needs one owner-
maintained source for these lists, read by the server and every picker, so manifests, tags, leads and order copies use
the same words and tag numbers stay unique. This epic also holds the design master that lets a "Sold out" design be
reordered (gap G3). It never pre-fills a weight from a category.

## 2. Layer, milestone, status

- Layer: B · Master data
- Milestone: M2 Masters
- Prototype status: Partial. `PURITIES` and `nextTagNumber` exist in `src/components/parcels/util.ts`, specialties are a fixed list in `OnboardKarigar.tsx`, `CustomerGroup` and `EditableField` are type unions, and tag uniqueness is enforced in `saveTag`; categories, styles and inclusion types are typed freely and there is no owner-maintained list or design master.

## 3. Roles involved

- Owner: maintains the lists (adds, renames, retires entries) and sets the tag number and HUID format rules.
- Staff: picks from the lists on manifests, tags, leads and order copies; sees a suggested tag number and HUID.
- Karigar: sees category and style words on his job sheet; does not edit lists.
- System: validates every stored value against the lists, generates the next tag number, checks HUID format, and keeps tag numbers unique.

## 4. In scope

- Categories (item kinds) list, for example Temple Haram, Kundan Choker, Polki Kada pair, Meenakari Pendant, rings, bangles.
- Styles list: Kundan, Polki, Chettinad, Temple, Antique, Jadau, Meenakari.
- Purities list with fineness: 24K (999), 22K (916), 18K (750), 14K (585).
- Inclusion types with their unit: stones, kemp, lac, pearls, each weighed in grams or recorded in carats.
- Tag number format and generator (the prototype uses `TAG-NNNN`; mockup 03 also shows `TAG-2026-8841`).
- HUID format check (6 characters, letters and digits, for example 9X82K1).
- Tag number uniqueness across all pieces.
- Owner maintenance screens or operations for each list: add, rename, retire, reorder.
- Pickers on every form read the lists from the server.
- A design master (G3): a design record that pieces point to, so "Sold out" is a fact about a design and "Asked for 4 times since July" can be counted.
- Specialty list for karigars (shares words with styles).

## 5. Out of scope

- The reorder action "Order another from Vijay" that creates an order copy from a sold-out design (EP-19, G3).
- The showroom "Sold out" filter and count on the stock screen (EP-22).
- Tagging forms and manifests that use the lists (EP-21).
- Customer groups (EP-17 owns them; the list mismatch is G19).
- Carat-to-gram conversion inside the match gate (EP-23 uses the stored grams; the conversion rule is an open question here).
- Weight defaults by category: never built, by rule (SCOPE-ANALYSIS App. C and App. D).
- Barcode and label layout for printing the tag (EP-36).

## 6. Current state in the prototype

- `src/components/parcels/util.ts` `PURITIES = [24K (999), 22K (916), 18K (750), 14K (585)]` and `nextTagNumber(s)`: one above the highest `TAG-n` in use.
- `src/store/transitions.ts` `saveTag`: "Give the piece a tag number.", "`<id>` is already used on another piece.", "`<kind>` is not on this parcel's list.", "All `<count>` `<kind>` on the list are already tagged."; HUID is trimmed but not format-checked.
- `recordParcelArrival`: manifest rows `{kind, count}` with free-text kind; rows with empty kind or count 0 are dropped.
- `src/components/people/OnboardKarigar.tsx` `SPECIALTIES = ['Chettinad', 'Temple', 'Kundan', 'Polki', 'Antique', 'Jadau', 'Meenakari']`.
- `src/types/jewellery.ts`: `Piece {kind, collection, style, purity, huid, stoneCount}`; `EditableField = 'grossG' | 'stoneG' | 'stoneCount' | 'purity' | 'huid' | 'name'`; `CustomerGroup` union.
- `src/components/parcels/TagItem.tsx` (route `parcel-tag`) suggests the tag number; mockup 21 says "The tag number and HUID are suggested".
- No design entity; mockup 03 "Sold out · 9", "Asked for 4 times since July", "Reordered before 3 times" are seeded text.
- Reusable: the purity list and labels, `nextTagNumber` logic, the uniqueness check and its sentence, the specialty list.
- Must be rebuilt server-side: list storage and maintenance, validation of kind, style, purity and inclusion type on every write, the tag generator under concurrency, the HUID check, and the design master.

## 7. Functional requirements

- FR-15-1. The server stores categories, styles, purities, inclusion types and specialties as owner-maintained lists, each entry with a status (active or retired).
- FR-15-2. The owner can add, rename, retire and reorder an entry in any list.
- FR-15-3. A staff or karigar user who calls a list maintenance operation is refused.
- FR-15-4. Every picker on `parcel-arrival`, `parcel-tag`, `lead-create`, `order-copy` and `karigar-new` reads its options from the server lists.
- FR-15-5. The server rejects a manifest row, tag or order copy whose category, style or purity is not an active list entry; a lead item may hold a free-text style until it is routed.
- FR-15-6. Renaming an entry changes the label everywhere and keeps the stored reference.
- FR-15-7. A retired entry stays on existing records and is not offered for new ones.
- FR-15-8. Each purity entry has a label and a fineness in parts per thousand (999, 916, 750, 585).
- FR-15-9. Each inclusion type has a unit, grams or carats.
- FR-15-10. The server suggests the next tag number in the decided format and never gives the same number to two staff tagging at once.
- FR-15-11. The server rejects a tag number already used on another piece with "`<tag>` is already used on another piece."
- FR-15-12. The server checks a HUID against the decided format (6 letters and digits) and, if HUID uniqueness is confirmed, rejects one already used on another piece.
- FR-15-13. No category, style or design ever pre-fills a gross, stone or net weight.
- FR-15-14. The system supports a design master (G3): a design has a name, category, style, maker and reference images, and pieces may point to it.
- FR-15-15. The system can count, per design, pieces in stock, pieces billed and times asked for, so "Sold out" is derived when no piece of that design is in stock.

## 8. Business rules

- BR-15-1. No weight field is ever pre-filled from a design, a category or a sibling piece. [SCOPE-ANALYSIS App. C, App. D; mockup 21 "Nothing is pre-filled"]
- BR-15-2. The parcel manifest accepts an arbitrary mixed list; counts per category are derived from what is entered. [SCOPE-ANALYSIS App. C, App. D]
- BR-15-3. A tag number is used on one piece only. [src/store/transitions.ts saveTag]
- BR-15-4. A tag's kind must be on the parcel's manifest. [src/store/transitions.ts saveTag]
- BR-15-5. The tag number and HUID are suggested, not typed from scratch. [mockup 21]
- BR-15-6. "Sold out" is a catalogue fact about a design, not a piece state. [SCOPE-ANALYSIS App. A decision 1; mockup 03; gap G3]
- BR-15-7. Stones may be recorded in carats (for example "Emerald 3.100 cts"), and carats converted to grams add a little rounding. [mockup 07; SCOPE-ANALYSIS App. D]
- BR-15-8. Purities shown as "22K (916)" and "18K" / "750". [mockups 07, 21; src/components/parcels/util.ts PURITIES]

## 9. Data

- Category: id, name, status, sort order.
- Style: id, name, status, sort order.
- Purity: id, label (for example "22K"), fineness (integer parts per thousand), status.
- InclusionType: id, name (stones, kemp, lac, pearls), unit (`g` or `ct`), status.
- Specialty: id, name, status (may share the style list).
- TagFormat: pattern (for example `TAG-NNNN` or `TAG-YYYY-NNNN`), next number counter.
- HuidRule: length 6, allowed characters.
- Design (G3): id, name, category id, style id, maker karigar id (nullable), reference image ids, created at.
- Piece gets a design id (nullable) and stores category, style and purity as references.
- No weight fields are created here. Inclusion weights stay on the piece as integer, units of 0.0001 g; a carat figure, if stored, is kept alongside its gram figure.
- No money fields.

## 10. API surface

Neutral to D1: each operation can be an endpoint on an own API or a function/policy on a managed platform.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| List | Reference list (categories, styles, purities, inclusion types, specialties) | Options for pickers | Owner, Staff, Karigar (read only the words on own jobs) |
| Create | Reference entry | Add an entry | Owner |
| Update | Reference entry | Rename, reorder or retire | Owner |
| Reserve | Next tag number | Suggest and hold a unique tag number for a tagging session | Staff, Owner |
| Check | HUID | Validate format and uniqueness | Staff, Owner, System |
| Create | Design | Add a design to the master (G3) | Owner, Staff (per decision) |
| Read | Design | Design with stock and demand counts | Owner, Staff |
| Update | Design | Rename, change images, retire | Owner |

## 11. Live events

None. Lists change rarely and by owner action; pickers reload on next open. Tag uniqueness while two staff tag one parcel travels on "Tag saved on a shared parcel", which EP-21 owns.

## 12. Screens and UX references

- No screen of its own. Screens that read these lists: `parcel-arrival` (manifest kinds), `parcel-tag` (kind, style, purity, inclusions, tag number, HUID), `parcel-qc`, `lead-create` (item style), `order-copy` (purity), `karigar-new` (specialties), `stock` (style filter, "Sold out" design count).
- Mockups: `21-tag-one-item.svg` (purity "22K (916)", inclusions "stones, kemp, lac" with "itemise →", "The tag number and HUID are suggested"), `03-showroom-stock.svg` (styles, "TAG-2026-8841", HUID 9X82K1, "5 inclusions", "Sold out · Order another from Vijay"), `20-parcel-arrival.svg` (manifest kinds), `07-qc-check.svg` ("Emerald 3.100 cts").
- A list maintenance screen for the owner is not drawn in any mockup. The owner maintenance screens in section 4 read and change these lists through the shared data layer of EP-08, which is why EP-08 is upstream.

## 13. Non-functional requirements

- Concurrency: two staff asking for the next tag number at the same moment get different numbers; the generator is atomic.
- Security: list maintenance is owner-only on the server.
- Audit: adding, renaming and retiring entries write audit entries, because a renamed category changes what manifests show.
- Precision: no weights stored here; any carat-to-gram conversion rule, once decided, produces integer units of 0.0001 g.
- Performance: all lists together are small (under a few hundred rows) and load with the first screen in under 2 seconds.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-02, EP-08
- Downstream: EP-21, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given the owner adds the category "Vanki", when staff open the manifest on `parcel-arrival`, then "Vanki" is offered.
2. Given TAG-8841 exists on another parcel, when staff save a tag with TAG-8841, then the server refuses with "TAG-8841 is already used on another piece."
3. Given two staff tagging the same parcel, when both ask for a suggested tag number, then they receive different numbers.
4. Given a HUID "9X82K" (5 characters), when staff save the tag, then the server refuses it as the wrong format.
5. Given the category "Temple Haram", when staff open the tag form, then no weight field is filled in.
6. Given a design with no piece in stock, when staff open `stock`, then the design counts under "Sold out" (G3).

## 16. Risks

- Risk: free-text kinds already in seed and real data do not match the new lists. Mitigation: EP-41 maps old words to list entries during migration.
- Risk: two tag formats (`TAG-8841` and `TAG-2026-8841`) persist and break uniqueness. Mitigation: decide one format before EP-21 and migrate the other.
- Risk: the design master grows into a catalogue product. Mitigation: keep it to the fields needed for "Sold out" and reorder (G3) until decided otherwise.
- Risk: a retired category is still on an open parcel's manifest. Mitigation: retired entries stay valid on existing records.

## 17. Open decisions and questions

- Which tag number format is used: `TAG-NNNN` (prototype) or `TAG-YYYY-NNNN` (mockup 03)? Does the counter reset each year?
- What is the full HUID rule (length, characters), and must HUID be unique across all pieces?
- How are stone carats converted to grams, and to how many decimals? (SCOPE-ANALYSIS App. D "carats converted to grams add a little more")
- G3: what is a design (same name and style, or an explicit design record), who creates it, and how is "Asked for 4 times since July" counted?
- G19: should customer groups be a reference list here, and which groups (VIP Bridal, High net worth, Regular, Wholesale, Festive collector, Collectors)?
- Are specialties the same list as styles?
- Which inclusion types exist, and which are weighed in carats?

## 18. Candidate stories

1. EP-15-S1: System can store categories, styles, purities, inclusion types and specialties as lists
2. EP-15-S2: System can seed the lists from the prototype values
3. EP-15-S3: Owner can add, rename, reorder and retire a list entry
4. EP-15-S4: System can reject a stored value that is not an active list entry
5. EP-15-S5: Staff can pick categories, styles and purities from server lists on every form
6. EP-15-S6: System can generate the next tag number in the decided format without duplicates
7. EP-15-S7: System can reject a tag number used on another piece
8. EP-15-S8: System can check HUID format and uniqueness
9. EP-15-S9: System can record an inclusion's unit as grams or carats
10. EP-15-S10: Owner can keep a design master that pieces point to (G3)
11. EP-15-S11: Staff can see a design marked sold out when none is in stock (G3)
12. EP-15-S12: System can audit changes to reference lists
