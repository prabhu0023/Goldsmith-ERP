# EP-15: Reference data · stories

Epic document: [EP-15 Reference data](../epics/EP-15-reference-data.md)

Role note: stories where the server stores, checks, generates or audits on its own use "System". Stories where a person maintains a list or the design master use "Owner", and the picker and sold-out stories use "Staff". Karigars only read the words on their own jobs in this epic.

---

## EP-15-S1: System can store categories, styles, purities, inclusion types and specialties as lists

- **Story ID:** EP-15-S1
- **Title:** System can store categories, styles, purities, inclusion types and specialties as lists
- **As a:** System
- **I want:** five owner-maintained list tables, `categories`, `styles`, `purities`, `inclusion_types` and `specialties`, each entry with id, name, status (`active` or `retired`), sort order, created at and version, plus a List Reference operation that returns active entries in sort order by default and all entries when asked, and references from pieces, manifest rows, order copies, lead items and karigars to these entries in place of free text
- **So that:** "Temple Haram" on a manifest and "Temple haram" on a tag are the same stored entry, and every form reads one source of words (FR-15-1, FR-15-6, FR-15-7, FR-15-8, FR-15-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when the five list tables are inspected, then each has `id`, `name`, `status` accepting only `active` or `retired`, an integer `sort_order`, `created_at` and an integer `version` starting at 1.
  2. Given the `purities` table, when it is inspected, then it also has `label` (for example "22K") and `fineness` as an integer in parts per thousand between 1 and 999, and an insert with fineness `0`, `1000` or `91.6` is rejected by the database (FR-15-8).
  3. Given the `inclusion_types` table, when it is inspected, then it also has `unit` accepting only `g` or `ct`, and an insert with unit `mg` is rejected (FR-15-9).
  4. Given the category "Temple Haram" exists, when an insert of "temple haram" or " Temple Haram " is made in `categories`, then the database rejects it, because names are unique per list after trimming and ignoring case.
  5. Given the migrations have run, when `pieces`, `parcel_manifest_rows`, `order_copies`, `lead_items` and `karigars` are inspected, then they hold `category_id`, `style_id`, `purity_id` or `specialty_id` references to the list tables where they held free text before, and `lead_items` keeps a nullable free-text style beside a nullable `style_id` (FR-15-5).
  6. Given Rajesh Verma (Staff), when he calls List Reference for styles, then active styles come back in sort order; given Sanjay Seth (Owner) asks with "include retired", then retired styles come back too with their status; given Vijay Kumar (Karigar) calls it, then he receives only entries referenced by his own jobs (EP-05-S3).
- **Rules enforced on the server:** List Reference is open to `owner` and `staff`; `karigar` reads are limited to entries on own jobs (EP-05-S3). Database checks: status enum, unit enum, fineness range, unique trimmed case-insensitive name per list. References use foreign keys so a stored record cannot point at an entry that does not exist. No entry is ever deleted, because records point at it.
- **Live events emitted / consumed:** None. Lists change rarely; pickers reload on next open (epic section 11).
- **Audit entry written:** No. This story creates storage and a read; changes are audited through EP-15-S12.
- **Data changes:** Migration creates `categories`, `styles`, `purities` (with `label`, `fineness`), `inclusion_types` (with `unit`) and `specialties`, each with the branch key if D7 is multi-branch. Migration adds `category_id`, `style_id` and `purity_id` to `pieces`, `category_id` to `parcel_manifest_rows`, `purity_id` (and `category_id`, `style_id`) to `order_copies`, nullable `style_id` to `lead_items`, and `specialty_id` to `karigars`; the old text columns are kept until EP-15-S2 (dev) and EP-41 (production) have mapped them. Adds List Reference to the shared contract (EP-03-S1).
- **UI reference:** No screen
- **Non-functional checks:** Precision: no weight fields are created here (epic section 9). Performance: all five lists together stay under a few hundred rows and load with the first screen in under 2 seconds (epic section 13). Open question: whether specialties are the same list as styles; if they are, `specialties` becomes a view over `styles` and `karigars.specialty_id` points at a style. Open decision D7: branch key only if multi-branch.
- **Depends on:** EP-02-S1, EP-02-S4, EP-02-S5, EP-02-S6, EP-02-S7, EP-02-S8, EP-02-S14, EP-03-S1, EP-03-S2, EP-05-S1, EP-05-S2, EP-05-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S2: System can seed the lists from the prototype values

- **Story ID:** EP-15-S2
- **Title:** System can seed the lists from the prototype values
- **As a:** System
- **I want:** the dev and staging seed to fill the five lists from the prototype values and map the seeded free-text kinds, styles and purities on pieces, manifest rows, order copies and karigars to the new list entries
- **So that:** parcel arrival, tagging and the pickers can be built and demoed with the same words the prototype and mockups use (epic section 4, section 6)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty dev database after migrations, when the seed runs, then `purities` holds 24K (999), 22K (916), 18K (750) and 14K (585) in that order, all `active`, taken from `PURITIES` in `src/components/parcels/util.ts`.
  2. Given the seed runs, when `styles` and `specialties` are read, then each holds Chettinad, Temple, Kundan, Polki, Antique, Jadau and Meenakari in that order, taken from `SPECIALTIES` in `src/components/people/OnboardKarigar.tsx`.
  3. Given the seed runs, when `categories` is read, then it holds every distinct kind in the prototype seed, including Temple Haram, Kundan Choker, Polki Kada, Meenakari Pendant, Temple Nakshi Ring, Kasu Mala, Jadau Emerald Ring, Antique Jhumka, Peacock Ruby Pendant and Meenakari Bangle, and `inclusion_types` holds stones, kemp, lac and pearls with a unit each.
  4. Given the seeded parcel BATCH-2026-044, when its manifest rows are read, then each row's `category_id` points at the matching category, and piece TAG-8841 has `style_id` Kundan and `purity_id` 22K.
  5. Given a seeded text value that matches no entry, such as the style "Nakshi", when the seed runs, then it adds that value as an entry and lists it in the seed output, rather than leaving the reference empty.
  6. Given the seed has already run, when it runs again, then no duplicate entries are created; given a production environment, then this seed does not run, and real lists are loaded by EP-41.
- **Rules enforced on the server:** The seed runs only in dev and staging (EP-02-S13). Entries are matched by trimmed, case-insensitive name so a rerun does not duplicate them. Mapping text to entries uses the same name match.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Seed data is loaded by the developer's tooling, not by a person in the product.
- **Data changes:** Inserts rows into the five list tables in dev and staging, and fills the new reference columns from EP-15-S1 on seeded rows. No schema change.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` (manifest kinds "Temple Haram · Chettinad", "Kundan Choker", "Polki Kada · pair", "Meenakari Pendant"); `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` (purity "22K (916)").
- **Non-functional checks:** Open question: which inclusion types exist and which are weighed in carats; the seed marks stones as `ct` and kemp, lac and pearls as `g` for dev only, to be replaced once answered. Open question: whether specialties are the same list as styles; the seed fills both with the same words either way.
- **Depends on:** EP-15-S1, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S3: Owner can add, rename, reorder and retire a list entry

- **Story ID:** EP-15-S3
- **Title:** Owner can add, rename, reorder and retire a list entry
- **As a:** Owner
- **I want:** to add an entry to any of the five lists, rename it, move it up or down, retire it and reactivate it, through Create Reference entry and Update Reference entry, saving with the version I last read
- **So that:** the shop's words are kept in one place by the owner, and a rename shows everywhere without changing what records point at (FR-15-2, FR-15-3, FR-15-6, FR-15-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth adds the category "Vanki", when it commits, then it is stored as `active` at the end of the sort order, the new id is returned, and the next time Rajesh Verma opens the manifest on `parcel-arrival`, "Vanki" is offered (epic acceptance criterion 1).
  2. Given Sanjay renames the category "Polki Kada" to "Polki Kada pair", when it commits, then piece TAG-8802 and manifest rows that point at it keep the same `category_id` and show "Polki Kada pair" on their next read (FR-15-6).
  3. Given Sanjay retires the style "Antique", when Rajesh next opens the style picker on `parcel-tag`, then "Antique" is not offered, while piece TAG-7914 still shows "Antique" (FR-15-7).
  4. Given Sanjay adds "temple haram" while "Temple Haram" exists, or saves an empty name, when the server checks it, then it refuses with a sentence naming the problem and nothing is stored.
  5. Given Sanjay adds a purity, when he leaves the fineness empty or enters 1000, then the server refuses it; given he adds an inclusion type with no unit, then the server refuses it.
  6. Given Rajesh (Staff) or Vijay Kumar (Karigar) calls Create or Update Reference entry directly, when the server checks the role, then it refuses with `forbidden` and nothing changes (FR-15-3).
  7. Given another owner session saved the entry after Sanjay read it, when Sanjay saves with the older version, then the server refuses as a conflict and nothing changes.
- **Rules enforced on the server:** Owner only, checked before validation (EP-05-S2). Name required, trimmed, unique per list ignoring case among active and retired entries. Purity needs label and fineness 1 to 999; inclusion type needs unit `g` or `ct`. Status moves only between `active` and `retired`; there is no delete. Reorder rewrites `sort_order` for the list in one transaction. Stale version refused (EP-02-S14, EP-03-S5). Create is deduplicated by idempotency key (EP-03-S8). Change and audit in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None. Pickers pick up the change on next open (epic section 11).
- **Audit entry written:** Yes: actor, time, entity (list and entry id), action (`reference_entry_added`, `reference_entry_renamed`, `reference_entry_reordered`, `reference_entry_retired`, `reference_entry_reactivated`), before, after. Written through EP-15-S12.
- **Data changes:** Inserts and updates rows in the five list tables (name, status, sort order, version). Adds Create Reference entry and Update Reference entry to the shared contract.
- **UI reference:** Not yet designed. No mockup draws a list maintenance screen for the owner (epic section 12); it is to be added to the owner rail in the design pass and uses the EP-08 data layer.
- **Non-functional checks:** Security: owner-only on the server; hiding the screen from staff is not the control. Concurrency: version check on every save; two owners reordering one list at once cannot leave two entries with the same position. Audit: a rename changes what manifests show, so before and after names are always recorded.
- **Depends on:** EP-15-S1, EP-02-S14, EP-03-S4, EP-03-S5, EP-03-S6, EP-03-S7, EP-03-S8, EP-05-S2, EP-08-S1, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S4: System can reject a stored value that is not an active list entry

- **Story ID:** EP-15-S4
- **Title:** System can reject a stored value that is not an active list entry
- **As a:** System
- **I want:** one shared server check that every new manifest row, tag and order copy names an active category, style and purity, that keeps a retired entry valid on a record that already holds it, and that lets a lead item hold free-text style until the item is routed
- **So that:** no new record can carry a word that is not on the owner's lists, and retiring an entry never breaks an open parcel (FR-15-5, FR-15-7, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given a new tag on BATCH-2026-044 whose `purity_id` points at no purity, when the shared check runs, then the server refuses it with code `validation` and a sentence naming the field, and nothing is stored.
  2. Given the style "Antique" is retired, when a new tag or order copy is saved with style "Antique", then the server refuses it with a sentence saying the style is no longer on the list.
  3. Given the category "Kasu Mala" was retired after it was put on the manifest of BATCH-2026-044, when a staff member saves a tag of kind "Kasu Mala" against that manifest row, then the check accepts it, because the entry is already on the record (epic section 16 risk).
  4. Given a lead item with free-text style "Chettinad nakshi work" and no `style_id`, when the lead is saved, then the check accepts it; when the item is routed to `make`, then the server refuses until a style entry is picked (FR-15-5).
  5. Given a request sends the free text "Temple Haram" in place of a category id, when the contract check runs, then the request is rejected as a validation error, because writes carry ids, not words.
- **Rules enforced on the server:** Writes carry list ids only (EP-03-S2). A new record needs active entries; an existing record keeps its entries even if retired, and an update that changes an entry needs an active one. The check is a shared function in the service layer, called by the manifest, tag and order copy operations that EP-19 and EP-21 build. Refusals use the EP-03-S4 code and sentence format.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused write changes nothing.
- **Data changes:** None in the product database. Adds the shared active-entry check to the service layer.
- **UI reference:** No screen of its own. The refusal sentence shows through EP-08-S5 on `parcel-arrival`, `parcel-tag`, `order-copy` and `lead-create` once those forms are built.
- **Non-functional checks:** Security: the picker only offering active entries is a convenience; the server check is the control. Concurrency: an entry retired while a tag is being saved is either accepted before the retire or refused after it, in one transaction (EP-03-S6).
- **Depends on:** EP-15-S1, EP-03-S2, EP-03-S4, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S5: Staff can pick categories, styles and purities from server lists on every form

- **Story ID:** EP-15-S5
- **Title:** Staff can pick categories, styles and purities from server lists on every form
- **As a:** Staff
- **I want:** one shared picker for each list, loaded through the EP-08 data layer from List Reference, that offers active entries in the owner's sort order, shows purities as "22K (916)", and stores the entry id
- **So that:** every form on `parcel-arrival`, `parcel-tag`, `lead-create`, `order-copy` and `karigar-new` offers the same words, and I never type a kind or purity freehand (FR-15-4, BR-15-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma opens the purity picker, when the list arrives, then it offers "24K (999)", "22K (916)", "18K (750)" and "14K (585)" in that order, and picking "22K (916)" sends the purity id, not the text (BR-15-8).
  2. Given Sanjay Seth added the category "Vanki" while Rajesh's screen was open, when Rajesh next opens the category picker, then "Vanki" is offered (epic acceptance criterion 1).
  3. Given a record holds the retired style "Antique", when Rajesh opens it for editing, then the picker shows "Antique" as the current value marked as retired, and does not offer it for any other record.
  4. Given the list is still loading, when Rajesh opens a picker, then it shows the EP-08-S3 loading state; given the read fails, then it shows the EP-08-S4 error with "Try again".
  5. Given the category picker on `parcel-tag` for BATCH-2026-044, when it is opened, then it offers only the kinds on that parcel's manifest with how many are still to tag, for example "Temple Haram · Chettinad · 1 of these still to tag" (BR-15-4).
- **Rules enforced on the server:** List Reference returns active entries in sort order; the client never adds entries. Whatever the picker sends is checked again by EP-15-S4. The forms themselves are built in EP-16, EP-19, EP-21 and EP-28, which use this picker.
- **Live events emitted / consumed:** None. Pickers reload on next open (epic section 11).
- **Audit entry written:** No. Picking an option reads data only.
- **Data changes:** None in the product database. Adds the shared category, style, purity, inclusion type and specialty pickers to the web app, each reading through the EP-08 cache.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Kind of item", "Temple Haram · Chettinad", "picked from the manifest · 1 of these still to tag", "Purity", "22K (916)"); `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("SAY WHAT IS INSIDE · MIXED IS FINE", "Add another kind of item"); routes `lead-create`, `order-copy` and `karigar-new` reuse the same pickers.
- **Non-functional checks:** Performance: the lists are cached by EP-08-S2 and load with the first screen in under 2 seconds. Availability: offline, the picker shows the last cached list read-only and saving is disabled (EP-08-S11).
- **Depends on:** EP-15-S1, EP-15-S2, EP-15-S4, EP-08-S1, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S6: System can generate the next tag number in the decided format without duplicates

- **Story ID:** EP-15-S6
- **Title:** System can generate the next tag number in the decided format without duplicates
- **As a:** System
- **I want:** a Reserve Next tag number operation backed by one counter row that is incremented atomically, formatted by the decided pattern, and never hands the same number to two callers
- **So that:** the tag number on `parcel-tag` is suggested rather than typed, and two staff tagging one parcel at the same moment never get the same number (FR-15-10, BR-15-5, epic section 13 concurrency)
- **Acceptance criteria (Given / When / Then):**
  1. Given the highest tag number in use is TAG-9107, when Rajesh Verma opens "Tag item 8 of 12" on `parcel-tag`, then "New tag number" is filled with the next number in the decided format, for example TAG-9108 (BR-15-5).
  2. Given Rajesh and Deepak Rao are tagging BATCH-2026-044, when both ask for a suggested tag number at the same moment, then they receive different numbers (epic acceptance criterion 3).
  3. Given a test that sends 50 concurrent Reserve calls, when they finish, then 50 distinct numbers are returned and the counter has moved by exactly 50.
  4. Given Rajesh was given a number and chooses "Save and stop here" without saving the tag, when the next Reserve call is made, then that number is not given to anyone else.
  5. Given the counter is created on a database that already holds pieces, when it is initialised, then it starts above the highest number in use, as `nextTagNumber` does today.
  6. Given Vijay Kumar (Karigar) calls Reserve Next tag number, when the server checks the role, then it refuses with `forbidden`.
- **Rules enforced on the server:** Reserve is allowed for `owner` and `staff` only (EP-05-S2). The counter is incremented and read in one atomic statement inside a transaction (EP-03-S6). The format pattern is stored on the server, not in the client. A suggested number is still checked for uniqueness at save time (EP-15-S7). The same Reserve request retried with one idempotency key returns the same number (EP-03-S8).
- **Live events emitted / consumed:** None. Tag progress between staff on one parcel travels on "Tag saved on a shared parcel", which EP-21 owns (epic section 11).
- **Audit entry written:** No. A suggested number is not a change to shop records until a tag is saved.
- **Data changes:** Migration creates `tag_format` (pattern, next number, year if the counter resets yearly, version), initialised from the highest number in `pieces`. Adds Reserve Next tag number to the shared contract.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("New tag number", "TAG-9108", "The tag number and HUID are suggested").
- **Non-functional checks:** Concurrency: the generator is atomic; two callers never share a number. Time: if the counter resets each year, the year is taken from the server clock in Asia/Kolkata. Open question: format `TAG-NNNN` (prototype, `nextTagNumber`) or `TAG-YYYY-NNNN` (mockup 03 "TAG-2026-8841"), and whether the counter resets each year; criteria 1 to 5 hold for either.
- **Depends on:** EP-15-S1, EP-02-S5, EP-03-S6, EP-03-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S7: System can reject a tag number used on another piece

- **Story ID:** EP-15-S7
- **Title:** System can reject a tag number used on another piece
- **As a:** System
- **I want:** every tag save to check the tag number, trimmed and upper-cased, against all pieces in every parcel and status, and refuse a used one with "`<tag>` is already used on another piece."
- **So that:** a tag number identifies exactly one piece in the shop for its whole life (FR-15-11, BR-15-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given TAG-8841 exists on a piece from BATCH-2026-041, when Rajesh Verma saves a tag on BATCH-2026-044 with TAG-8841, then the server refuses with "TAG-8841 is already used on another piece." and nothing is stored (epic acceptance criterion 2).
  2. Given Rajesh types " tag-8841 ", when the server checks it, then it is trimmed and upper-cased to TAG-8841 before the check and refused the same way.
  3. Given an empty tag number, when Rajesh saves, then the server refuses with "Give the piece a tag number."
  4. Given TAG-7914 belongs to a piece that is `billed` or `scrapped`, when a new tag is saved with TAG-7914, then the server refuses it, because a number is never reused.
  5. Given two saves with the same typed number arrive at the same moment, when both commit, then the unique index lets exactly one succeed and the other gets the same refusal sentence.
- **Rules enforced on the server:** Tag numbers are normalised (trim, upper case) and unique across all pieces by a database unique index (EP-02-S5), with the check repeated in the service so the refusal carries the sentence (EP-03-S4). A unique-index violation is mapped to the same sentence, not to a generic conflict.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused save changes nothing.
- **Data changes:** Migration normalises existing tag numbers to upper case and confirms the unique index on `pieces` tag number. No new table.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("New tag number"); the sentence shows through EP-08-S5.
- **Non-functional checks:** Concurrency: uniqueness holds under simultaneous saves through the index, not only the service check. Open question: if both `TAG-8841` and `TAG-2026-8841` exist after migration, they are different strings to this check; the format decision in EP-15-S6 settles whether one is migrated to the other (epic section 16 risk).
- **Depends on:** EP-15-S6, EP-02-S5, EP-03-S4, EP-03-S5, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S8: System can check HUID format and uniqueness

- **Story ID:** EP-15-S8
- **Title:** System can check HUID format and uniqueness
- **As a:** System
- **I want:** a Check HUID operation and the same check on every tag save, which trims and upper-cases the HUID, checks it against the stored HUID rule (6 characters, letters A to Z and digits 0 to 9), and, if HUID uniqueness is confirmed, refuses one already used on another piece
- **So that:** a mistyped hallmark code is caught at tagging, not at QC or sale (FR-15-12, BR-15-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma enters "9X82K" (5 characters), when he saves the tag, then the server refuses it as the wrong format with a sentence giving the rule, for example "A HUID is 6 letters and digits, like 9X82K1." (proposed wording), and nothing is stored (epic acceptance criterion 4).
  2. Given Rajesh enters "4t71m9 ", when the server checks it, then it is stored as 4T71M9 and accepted.
  3. Given Rajesh enters "4T71-M9" or "4T71M9X", when the server checks it, then it is refused for the wrong characters or length.
  4. Given HUID uniqueness is confirmed and 9X82K1 is on TAG-2026-8841, when Rajesh saves another piece with 9X82K1, then the server refuses with a sentence naming the piece that holds it.
  5. Given the `parcel-tag` form, when Rajesh leaves the HUID field, then the client runs the same shared check and shows the sentence straight away, and the server repeats it on save.
- **Rules enforced on the server:** The HUID rule (length, allowed characters) is stored on the server and shared with the client. Format is checked on every save and in Check HUID; uniqueness is enforced by a unique index on the normalised HUID only once confirmed. Check HUID is allowed for `owner`, `staff` and System callers, refused for `karigar`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A check or a refused save changes nothing.
- **Data changes:** Migration creates `huid_rule` (length 6, allowed characters, unique flag, version). If uniqueness is confirmed, migration adds a unique index on the normalised HUID in `pieces`. Adds Check HUID to the shared contract.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Hallmark HUID", "4T71M9"); `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("BIS hallmark", "9X82K1"); `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc` ("HUID on the tag", "8H33Z9").
- **Non-functional checks:** Security: the client check is a convenience; the server repeats it. Concurrency: if uniqueness is on, two saves with one HUID at once let only one succeed through the index. Open question: the full HUID rule and whether HUID must be unique across all pieces; criterion 4 applies only once uniqueness is confirmed. Open question: whether a HUID is required on every piece is not settled here, so an empty HUID passes this check.
- **Depends on:** EP-15-S1, EP-02-S5, EP-03-S4, EP-05-S2, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S9: System can record an inclusion's unit as grams or carats

- **Story ID:** EP-15-S9
- **Title:** System can record an inclusion's unit as grams or carats
- **As a:** System
- **I want:** itemised inclusion rows on a piece, each pointing at an inclusion type, holding its weight as an integer in units of 0.0001 g and, for types recorded in carats, the carat figure stored alongside the gram figure
- **So that:** "Emerald 3.100 cts" is kept as the karigar wrote it while the match gate still works only in grams (FR-15-9, BR-15-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the inclusion type "stones" has unit `ct`, when an inclusion "Emerald 3.100 cts" is stored on TAG-9110 with a gram figure of 0.6200 g, then the row holds carats `3100` (thousandths of a carat) and weight `6200` (0.0001 g units), and reads back as "Emerald 3.100 cts · 0.6200 g".
  2. Given the inclusion type "lac" has unit `g`, when "Lac and foil 1.150 g" is stored, then the row holds weight `11500` and no carat figure.
  3. Given a carat figure is sent for a type with unit `g`, or a type with unit `ct` is sent with no carat figure, when the server checks it, then it refuses the row as a validation error.
  4. Given a gram figure with more than 4 decimals, such as 0.62005 g, when the server checks it, then it refuses it, because it cannot be stored in 0.0001 g units.
  5. Given the piece with five inclusion rows, when it is read, then the rows come back in stored position order, matching "Weight breakdown · 5 inclusions" on `stock`.
- **Rules enforced on the server:** Inclusion type must be an active list entry for new rows (EP-15-S4). Unit `ct` requires a carat figure; unit `g` forbids one. Grams are parsed by the EP-02-S2 helpers, never by float arithmetic. Whether the rows must add up to the piece's stone weight is checked by EP-21, not here. Only the gram figure is used by the match gate (EP-23).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Inclusion rows are written as part of a tag save, audited by EP-21.
- **Data changes:** Migration creates `piece_inclusions` (piece id, position, inclusion type id, label, weight integer in 0.0001 g units, carats integer in 0.001 ct units nullable). No money fields.
- **UI reference:** `docs/ux/mockups/21-tag-one-item.svg`, route `parcel-tag` ("Stones, kemp, lac on this piece", "itemise →"); `docs/ux/mockups/07-qc-check.svg`, route `parcel-qc` ("Emerald 3.100 cts · Polki 2.400 cts", "Lac and foil 1.150 g"); `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Weight breakdown · 5 inclusions"). The itemise form is not yet designed.
- **Non-functional checks:** Precision: grams stored as integers of 0.0001 g and shown to 4 decimals; carats stored as integers of 0.001 ct. Open question: how stone carats are converted to grams and to how many decimals; until answered, the gram figure is entered with the carat figure and no conversion is done on the server; once decided, the conversion must produce integer 0.0001 g units.
- **Depends on:** EP-15-S1, EP-15-S4, EP-02-S2, EP-02-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S10: Owner can keep a design master that pieces point to (G3)

- **Story ID:** EP-15-S10
- **Title:** Owner can keep a design master that pieces point to (G3)
- **As a:** Owner
- **I want:** to create, rename and retire designs, each with a name, a category, a style, an optional maker karigar and reference images, and to set which design a piece belongs to
- **So that:** "Sold out" and "Asked for 4 times since July" can be counted per design, and EP-19 can reorder a sold-out design from its maker (FR-15-14, BR-15-6, gap G3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth creates the design "Peacock Ruby Pendant" with category Meenakari Pendant, style Antique, maker Vijay Kumar (KG-04) and one reference image, when it commits, then the design is stored as `active`, the new id is returned and the image is linked by its file id.
  2. Given piece TAG-7914 "Peacock Ruby Pendant", when Sanjay sets its design to "Peacock Ruby Pendant", then `pieces.design_id` points at the design, and the piece's own category and style are unchanged.
  3. Given a design with category "Temple Haram", when a piece of that design is tagged on `parcel-tag`, then no gross, stone or net weight is filled in from the design (FR-15-13, BR-15-1).
  4. Given Sanjay renames or retires a design, when it commits, then pieces keep their `design_id`, a retired design is not offered for new pieces, and an audit entry records before and after.
  5. Given the decided rule lets only the owner create designs, when Rajesh Verma (Staff) calls Create Design, then the server refuses with `forbidden`; Update Design is refused for staff and karigars in every case.
  6. Given a design's category or style is not an active list entry, when Sanjay saves it, then the server refuses it (EP-15-S4).
- **Rules enforced on the server:** Create Design is allowed for Owner, and for Staff only if the G3 decision allows it; Update Design is Owner only (EP-05-S2). Name required and trimmed. Category and style must be active entries; maker must be an existing karigar or empty; reference images must be file ids the caller may attach (EP-09-S6). A design has no weight fields. No design is deleted. Stale version refused; create deduplicated by idempotency key.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (design id), action (`design_added`, `design_edited`, `design_retired`, `piece_design_set`), before, after. Written through EP-15-S12.
- **Data changes:** Migration creates `designs` (id, name, category id, style id, maker karigar id nullable, status, created at, version) and `design_images` (design id, position, file id). Migration adds nullable `design_id` to `pieces` and, if G3 counts asks per design, to `lead_items`. Adds Create, Read and Update Design to the shared contract.
- **UI reference:** Not yet designed. Mockup `docs/ux/mockups/03-showroom-stock.svg`, route `stock`, shows the design's facts ("Peacock Ruby Pendant", "Made by", "Reordered before 3 times") but no design form is drawn.
- **Non-functional checks:** Precision: no weight is stored on a design (BR-15-1). Security: image links follow the EP-09 signed-link and role checks. Open question G3: what a design is (same name and style, or an explicit record), and who creates it; criteria 1 to 6 assume an explicit record. Risk: keep the design to the fields needed for "Sold out" and reorder (epic section 16).
- **Depends on:** EP-15-S1, EP-15-S4, EP-02-S4, EP-02-S5, EP-03-S6, EP-03-S7, EP-03-S8, EP-05-S2, EP-09-S1, EP-09-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S11: Staff can see a design marked sold out when none is in stock (G3)

- **Story ID:** EP-15-S11
- **Title:** Staff can see a design marked sold out when none is in stock (G3)
- **As a:** Staff
- **I want:** Read Design to return, per design, the count of pieces in stock, pieces billed and times asked for, and to derive "Sold out" when no piece of the design is in stock, plus a count of sold-out designs for the stock screen
- **So that:** "Sold out" is a fact about a design that the server computes, not a piece state someone sets (FR-15-15, BR-15-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the design "Peacock Ruby Pendant" has one piece TAG-7914 with status `billed` and no piece with status `in_stock`, when Rajesh Verma reads the design, then it returns in stock 0, billed 1 and sold out true (epic acceptance criterion 6).
  2. Given a new piece of that design is released into stock with status `in_stock`, when the design is read again, then sold out is false and in stock is 1.
  3. Given nine designs have no piece in stock, when the stock screen asks for the sold-out count, then the server returns 9, matching "Sold out · 9" on `stock`.
  4. Given the decided way of counting asks, when the design is read, then times asked for is returned, for example "Asked for 4 times since July", counted on the server from the decided source.
  5. Given a design with no pieces at all, when it is read, then it is not counted as sold out, because it has never been in stock.
  6. Given Vijay Kumar (Karigar), when he calls Read Design, then the server refuses with `forbidden`.
- **Rules enforced on the server:** Counts are computed on the server from `pieces.status` and `design_id`; no "sold out" flag is stored on a piece or a design. Read Design is Owner and Staff only (EP-05-S2). The showroom filter and its card are built in EP-22 on top of this read.
- **Live events emitted / consumed:** None in this story. EP-22 refreshes the stock counts when a piece's state changes.
- **Audit entry written:** No. This story reads and counts only.
- **Data changes:** None in the product database beyond the `design_id` columns from EP-15-S10. Adds the counts to Read Design and a Count Sold-out designs read to the shared contract.
- **UI reference:** `docs/ux/mockups/03-showroom-stock.svg`, route `stock` ("Sold out · 9", "Sold out", "Peacock Ruby Pendant", "Asked for 4 times since July", "Order another from Vijay"). The filter and the reorder action are built in EP-22 and EP-19.
- **Non-functional checks:** Performance: the sold-out count over all designs returns in under 500 ms for a shop with a few thousand pieces (proposed target, to confirm). Open question G3: how "Asked for 4 times since July" is counted (lead items pointing at a design, or name matching), and whether a design with no pieces yet can be sold out; criteria 4 and 5 are written neutrally.
- **Depends on:** EP-15-S10, EP-02-S5, EP-02-S7, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-15-S12: System can audit changes to reference lists

- **Story ID:** EP-15-S12
- **Title:** System can audit changes to reference lists
- **As a:** System
- **I want:** every add, rename, reorder, retire and reactivate of a list entry, every change to the tag format or HUID rule, and every design change to write one audit entry in the same transaction, with before and after values
- **So that:** the owner can see who renamed a category and when, because a rename changes what every manifest shows (epic section 13 audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth adds the category "Vanki", when it commits, then one audit entry exists with kind `reference_entry_added`, ref the category id, after {list "categories", name "Vanki", status `active`}, actor Sanjay Seth and the server time.
  2. Given Sanjay renames "Polki Kada" to "Polki Kada pair", when it commits, then the entry has kind `reference_entry_renamed`, before name "Polki Kada" and after name "Polki Kada pair".
  3. Given Sanjay retires, reactivates or reorders an entry, or changes a design, when it commits, then entries with kinds `reference_entry_retired`, `reference_entry_reactivated`, `reference_entry_reordered`, `design_added`, `design_edited`, `design_retired` or `piece_design_set` record before and after values.
  4. Given the audit write fails, when the transaction ends, then the list change is not saved either.
  5. Given a save whose values equal the stored values, when it is processed, then no audit entry is written and the version does not change.
  6. Given Sanjay opens the security log and filters by entity "reference list", then he sees these entries newest first; Rajesh Verma (Staff) reading them gets `forbidden`.
- **Rules enforced on the server:** The change and its entry share one transaction (EP-06-S2). Before and after are recorded per field (EP-06-S3). Entries are append-only (EP-06-S1). Reads are Owner only (EP-06-S12).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (list and entry id, or design id), action (`reference_entry_added`, `reference_entry_renamed`, `reference_entry_reordered`, `reference_entry_retired`, `reference_entry_reactivated`, `tag_format_changed`, `huid_rule_changed`, `design_added`, `design_edited`, `design_retired`, `piece_design_set`), before, after.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds the reference list and design kinds to the audit kind list by migration. No other schema change.
- **UI reference:** No screen of its own. Entries show in the security log built in EP-06 (EP-06-S9, EP-06-S10, EP-06-S11).
- **Non-functional checks:** Audit: every list change, including a reorder, writes an append-only entry. Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-15-S3, EP-15-S6, EP-15-S8, EP-15-S10, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Which tag number format is used: `TAG-NNNN` (prototype) or `TAG-YYYY-NNNN` (mockup 03)? Does the counter reset each year? (EP-15-S6, S7)
- What is the full HUID rule (length, characters), and must HUID be unique across all pieces? (EP-15-S8)
- How are stone carats converted to grams, and to how many decimals? (SCOPE-ANALYSIS App. D "carats converted to grams add a little more") (EP-15-S9)
- G3: what is a design (same name and style, or an explicit design record), who creates it, and how is "Asked for 4 times since July" counted? (EP-15-S10, S11)
- G19: should customer groups be a reference list here, and which groups (VIP Bridal, High net worth, Regular, Wholesale, Festive collector, Collectors)? (EP-15-S1)
- Are specialties the same list as styles? (EP-15-S1, S2)
- Which inclusion types exist, and which are weighed in carats? (EP-15-S2, S9)
