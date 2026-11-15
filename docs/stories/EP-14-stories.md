# EP-14: Scale registry · stories

Epic document: [EP-14 Scale registry](../epics/EP-14-scale-registry.md)

Role note: stories where the server stores, checks, computes or audits on its own use "System". Stories where a person changes the registry use "Owner", and the picker stories use "Staff". Karigars are not involved in this epic.

---

## EP-14-S1: System can store scales with readability and capacity as integer weights

- **Story ID:** EP-14-S1
- **Title:** System can store scales with readability and capacity as integer weights
- **As a:** System
- **I want:** the `scales` table from EP-02-S4 extended with status (`active` or `retired`), counter key (nullable), shop ID (D7), created at, retired at and version, with readability and capacity kept as integers in units of 0.0001 g, plus a List Scales operation that returns active scales by default and all scales when asked
- **So that:** every weighing in the shop can point at one stored scale whose smallest step and heaviest load are exact and survive a reload (BR-14-1, BR-14-8, FR-14-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when the `scales` table is inspected, then `readability` and `capacity` are integer columns in units of 0.0001 g, `status` accepts only `active` or `retired`, `counter_key` and `retired_at` are nullable, and `version` starts at 1.
  2. Given a scale row with readability `1` and capacity `6000000`, when List Scales returns it, then it reads "reads to 0.0001 g · up to 600.0000 g" in grams with 4 decimals, converted by the EP-02-S2 helpers.
  3. Given an insert with readability `0`, a negative readability, capacity `0` or status `broken`, when it is written straight to the database, then the database check rejects it.
  4. Given one active and one retired scale, when Rajesh Verma (Staff) calls List Scales with no filter, then only the active scale is returned; when Sanjay Seth (Owner) calls it with "include retired", then both are returned with their status.
  5. Given Vijay Kumar (Karigar), when he calls List Scales, then the server refuses with `forbidden`.
  6. Given Sanjay Seth registers a scale with a request that also names a location id, when it is stored, then its `location_id` is the shop's default location "Main shop", set by the server, and the client value is ignored.
- **Rules enforced on the server:** List Scales is allowed for `owner` and `staff` and refused for `karigar` (EP-05-S2). Database checks: readability greater than 0, capacity greater than 0, status enum. Weights are converted only through the shared helpers (EP-02-S2), never with float arithmetic.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates storage and a read; changes are audited through EP-14-S12.
- **Data changes:** Migration on `scales` (created in EP-02-S4) adds `status` (default `active`), `counter_key` (nullable), `created_at`, `retired_at` (nullable) and `version`. Migration creates `user_scale_preference` (user id, last scale id, updated at) for EP-14-S9. Adds List Scales to the shared contract (EP-03-S1). Uses `scales.location_id` from EP-02-S4 (not null, default location "Main shop").
- **UI reference:** No screen
- **Non-functional checks:** Precision: readability and capacity are integers of 0.0001 g; the half-step ceiling unit is settled under G10, not here. Time: created at and retired at stored in UTC. D7 is decided: one shop, no branches; the table carries the shop ID (EP-02-S3) and no branch key. Open decision D9: if weights are read from the balance, the registry may later need model, port and serial number; not added in this story.
- **Depends on:** EP-02-S1, EP-02-S2, EP-02-S4, EP-02-S14, EP-03-S1, EP-03-S2, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S2: System can seed the bench balance and platform scale for dev

- **Story ID:** EP-14-S2
- **Title:** System can seed the bench balance and platform scale for dev
- **As a:** System
- **I want:** the dev and staging seed to create two active scales, "Bench balance" reading to 0.0001 g up to 600 g and "Platform scale" reading to 0.01 g up to 30 kg, with the new registry columns filled
- **So that:** parcel arrival, tagging and the ceiling can be built and demoed against the same two scales mockup 14 shows (epic section 4, seed records)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty dev database after migrations, when the seed runs, then `scales` holds "Bench balance" with readability `1` and capacity `6000000`, and "Platform scale" with readability `100` and capacity `300000000`, both `active`, version 1 and no counter key.
  2. Given the seed has already run, when it runs again, then no duplicate scales are created and existing rows are not overwritten.
  3. Given the seeded scales, when Rajesh Verma opens the scale picker on `parcel-arrival`, then it offers "Bench balance · 0.0001 g" and "Platform scale · 0.01 g".
  4. Given a production environment, when the api starts, then this seed does not run, and the real shop scales are loaded by EP-41 instead.
- **Rules enforced on the server:** The seed runs only in dev and staging (EP-02-S13), never in production. The seed matches scales by name so a rerun does not duplicate them.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Seed data is loaded by the developer's tooling, not by a person in the product.
- **Data changes:** Inserts two `scales` rows in dev and staging. No schema change.
- **UI reference:** `docs/ux/mockups/14-match-rule-any-parcel.svg` ("SET UP ONCE · THE SCALES IN THE SHOP", "Bench balance reads to 0.0001 g · up to 600 g", "Platform scale reads to 0.01 g · up to 30 kg"); the picker on `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival`.
- **Non-functional checks:** Precision: seed values are written as integers of 0.0001 g, converted from the strings "0.0001", "600", "0.01" and "30000" by the EP-02-S2 helpers. Open question: the real shop scales may differ from these values; the seed is for dev only.
- **Depends on:** EP-14-S1, EP-02-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S3: Owner can register a scale

- **Story ID:** EP-14-S3
- **Title:** Owner can register a scale
- **As a:** Owner
- **I want:** to add a scale on `scales` with a name, a smallest step in grams and a heaviest load in grams, through a Create Scale operation that returns the new id
- **So that:** each scale in the shop is named once with its smallest step, and staff never retype it (FR-14-1, FR-14-2, FR-14-3, BR-14-1, BR-14-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `scales`, when he adds "Counter 2 balance" reading 0.001 g up to 200 g, then a scale is stored with readability `10`, capacity `2000000` and status `active`, the new id is returned, it appears in the picker on `parcel-arrival`, and an audit entry records it (epic acceptance criterion 1).
  2. Given the name is empty or only spaces, when Sanjay saves, then the server refuses with "Name the scale." and nothing is stored.
  3. Given the smallest step is 0, negative or empty, when Sanjay saves, then the server refuses with "Enter the smallest step the scale reads." and nothing is stored.
  4. Given the heaviest load is 0, negative or empty, when Sanjay saves, then the server refuses with "Enter the heaviest load the scale can take, in grams." and nothing is stored.
  5. Given a smallest step with more than 4 decimals, such as 0.00005, when Sanjay saves, then the server refuses it as a validation error, because it cannot be stored in 0.0001 g units.
  6. Given the same Create Scale request is sent twice with one idempotency key after a network drop, when the server processes it, then only one scale is created.
- **Rules enforced on the server:** Owner only (EP-14-S4). Name required and trimmed. Readability and capacity parsed by the EP-02-S2 helpers and both must be greater than 0. The server sets the id, status `active`, created at and version; the client cannot send them. Deduplicated by idempotency key (EP-03-S8). Create and audit in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (scale id), action (`scale_added`), after (name, readability, capacity, status). Written through EP-14-S12.
- **Data changes:** Inserts into `scales`. Adds Create Scale to the shared contract.
- **UI reference:** Route `scales` (owner rail "Scales & rules"). The add scale form is not yet designed; the prototype `ScaleForm` fields and messages are reused until the design pass.
- **Non-functional checks:** Precision: 0.001 g is stored as `10` and read back as "0.0010 g"; no float multiplication. Security: the form's client checks are only a convenience; the server repeats them.
- **Depends on:** EP-14-S1, EP-14-S4, EP-02-S2, EP-03-S4, EP-03-S6, EP-03-S7, EP-03-S8, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S4: System can refuse scale changes from anyone but the owner

- **Story ID:** EP-14-S4
- **Title:** System can refuse scale changes from anyone but the owner
- **As a:** System
- **I want:** Create Scale, Update Scale, Update Scale status and Update Scale assignment to check the caller's role on the server before validation, and refuse every role other than owner with "Only the owner can change the scales."
- **So that:** the readability behind every match ceiling can only be changed by the owner, not by a staff member calling the operation directly (FR-14-4, BR-14-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff), when he calls Create Scale directly, then the server refuses with code `forbidden` and the sentence "Only the owner can change the scales.", and no scale is stored (epic acceptance criterion 2).
  2. Given Rajesh, when he calls Update Scale to change the Bench balance readability from 0.0001 g to 0.001 g, then the server refuses the same way and the readability stays `1`.
  3. Given Vijay Kumar (Karigar), when he calls any of the four scale change operations, then the server refuses with "Only the owner can change the scales."
  4. Given Rajesh sends a request that is also invalid, such as an empty name, when the server checks it, then he gets the role refusal, not the validation sentence.
  5. Given Rajesh is refused, when the log is checked, then no audit entry and no change to `scales` exist for that request.
- **Rules enforced on the server:** The role check runs before validation and before any write (deny by default, EP-05-S2). The four operations are listed as owner-only in the permission matrix (EP-05-S1). Update My last scale (EP-14-S9) is not a scale change and stays open to staff.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused request changes nothing.
- **Data changes:** Adds the four scale change operations to the permission matrix as owner-only. No schema change.
- **UI reference:** No screen of its own. The `scales` route is on the owner rail only (EP-08-S13); the refusal sentence shows through EP-08-S5 if reached.
- **Non-functional checks:** Security: hiding `scales` from staff is not the control; the server check is.
- **Depends on:** EP-14-S1, EP-03-S3, EP-03-S4, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S5: Owner can edit a scale's name, readability and capacity

- **Story ID:** EP-14-S5
- **Title:** Owner can edit a scale's name, readability and capacity
- **As a:** Owner
- **I want:** to open a scale on `scales` and change its name, smallest step or heaviest load, saving with the version I last read
- **So that:** a typo or a corrected readability can be fixed in one place without registering a new scale (FR-14-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth opens "Counter 2 balance" (version 1), when he renames it "Counter 2 bench balance" and saves, then the name changes, the version becomes 2, and an audit entry records before and after names.
  2. Given Sanjay changes the capacity of "Counter 2 balance" from 200 g to 220 g, when he saves, then capacity is stored as `2200000` and the next capacity warning uses 220 g.
  3. Given Sanjay changes a readability, when he saves, then the server applies the rule for open parcels from EP-14-S6 before committing.
  4. Given Sanjay clears the name or enters a smallest step of 0, when he saves, then the server refuses with "Name the scale." or "Enter the smallest step the scale reads." and nothing changes.
  5. Given another owner session saved the scale after Sanjay read it, when Sanjay saves with version 1 while the stored version is 2, then the server refuses as a conflict and nothing changes.
- **Rules enforced on the server:** Owner only (EP-14-S4). Same validation as Create Scale (EP-14-S3). Stale version refused (EP-02-S14, EP-03-S5). A retired scale may be edited only after it is reactivated (EP-14-S7). Update and audit in one transaction.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (scale id), action (`scale_edited`), before and after (name, readability, capacity). Written through EP-14-S12.
- **Data changes:** Updates `scales` name, readability, capacity, version. Adds Update Scale to the shared contract.
- **UI reference:** Route `scales`. The edit scale form is not yet designed; the prototype `ScaleForm` is reused until the design pass.
- **Non-functional checks:** Concurrency: version check on every save; a parcel evaluation running at the same moment reads either the old or the new version, never half an edit (epic section 13). Audit: a readability change alters every future ceiling, so before and after are always recorded.
- **Depends on:** EP-14-S3, EP-14-S4, EP-14-S6, EP-02-S14, EP-03-S5, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S6: System can apply the decided rule when a scale used by open parcels is edited

- **Story ID:** EP-14-S6
- **Title:** System can apply the decided rule when a scale used by open parcels is edited
- **As a:** System
- **I want:** an Update Scale that changes readability to first find the open parcels (not yet released) with weighings on that scale, and then apply one decided rule: either each weighing keeps the readability it was taken with, or the edit is refused while the scale is in use
- **So that:** correcting a readability never flips the verdict of an open parcel without anyone noticing (FR-14-5, epic section 16 risk)
- **Acceptance criteria (Given / When / Then):**
  1. Given parcel BATCH-2026-044 is open with 13 weighings on the Bench balance, when Sanjay Seth changes the Bench balance readability from 0.0001 g to 0.001 g, then the server applies the decided rule, and the result is one of the two in criteria 2 and 3.
  2. Given the decided rule is "keep the old figure", when the edit commits, then each existing weighing on BATCH-2026-044 keeps readability `1` stored on the weighing, its ceiling stays 13 × ½ × 0.0001 g, and only weighings taken after the edit use `10`.
  3. Given the decided rule is "block edits while used", when Sanjay saves, then the server refuses with a sentence naming the open parcels that use the scale, for example BATCH-2026-044, and the readability stays `1`.
  4. Given no open parcel has a weighing on the scale, when Sanjay changes its readability, then the edit commits with no further check.
  5. Given a name or capacity change only, when Sanjay saves, then this rule is not applied, because neither affects a ceiling.
- **Rules enforced on the server:** The open-parcel check and the edit run in one transaction so a weighing saved at the same moment is either counted or blocked (EP-03-S6). Which rule applies is the open question in this epic's section 17; until it is answered the server uses "block edits while used", which changes nothing that is already stored.
- **Live events emitted / consumed:** None. EP-23 recomputes verdicts when it next evaluates a parcel (epic section 11).
- **Audit entry written:** Yes when the edit commits: actor, time, entity (scale id), action (`scale_edited`), before, after, and the open parcel ids affected. No when the edit is refused.
- **Data changes:** If "keep the old figure" is chosen, migration adds `readability_at_weighing` (integer, 0.0001 g units) to the weighing rows from EP-02-S6 and to `pieces`, filled from the scale at save time. If "block edits" is chosen, no schema change.
- **UI reference:** Route `scales`. The message or confirmation for an edit on a scale in use is not yet designed.
- **Non-functional checks:** Concurrency: an edit and a parcel evaluation at the same moment use one consistent version of the scale. Audit: affected open parcels listed in the entry. Open question: when the owner edits the readability of a scale already used by open parcels, do those parcels keep the old figure or take the new one; criteria 2 and 3 are written for either answer.
- **Depends on:** EP-14-S1, EP-02-S6, EP-03-S4, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S7: Owner can retire a scale

- **Story ID:** EP-14-S7
- **Title:** Owner can retire a scale
- **As a:** Owner
- **I want:** to retire a scale that is no longer used, and reactivate it if I retired it by mistake, through Update Scale status
- **So that:** staff cannot pick a scale that has left the shop, while old pieces and parcels still show which scale they were weighed on (FR-14-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given "Counter 2 balance" is active, when Sanjay Seth retires it, then its status is `retired`, retired at is set from the server clock, and an audit entry records `active` → `retired`.
  2. Given "Counter 2 balance" is retired, when Rajesh Verma opens the scale picker on `parcel-arrival` or `parcel-tag`, then it is not offered (epic acceptance criterion 5).
  3. Given piece TAG-8841 was weighed on "Counter 2 balance" before it was retired, when Rajesh opens the piece, then it still shows "Counter 2 balance · 0.0010 g" (epic acceptance criterion 5).
  4. Given a weighing is saved with the id of a retired scale, when the server checks it, then it refuses with "Pick the scale this was weighed on." (FR-14-14).
  5. Given Sanjay reactivates "Counter 2 balance", when Rajesh next opens the picker, then it is offered again and retired at is cleared.
- **Rules enforced on the server:** Owner only (EP-14-S4). Status moves only between `active` and `retired`. A scale is never deleted, because weighings reference it. Retiring a scale used by open parcels follows the same rule as EP-14-S6 for whether existing weighings stay valid. Stale version refused.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (scale id), action (`scale_retired` or `scale_reactivated`), before and after status. Written through EP-14-S12.
- **Data changes:** Updates `scales.status`, `retired_at`, version. Adds Update Scale status to the shared contract. No delete path.
- **UI reference:** Route `scales`. The retire control is not yet designed.
- **Non-functional checks:** Concurrency: a staff member saving a weighing on the scale at the moment it is retired either succeeds before the retire or is refused after it. Audit: before and after status recorded.
- **Depends on:** EP-14-S1, EP-14-S4, EP-14-S6, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S8: Owner can assign a scale to a counter

- **Story ID:** EP-14-S8
- **Title:** Owner can assign a scale to a counter
- **As a:** Owner
- **I want:** to set which counter a scale sits at, through Update Scale assignment
- **So that:** the picker lists the scales at a staff member's own counter first and staff are less likely to pick a scale from another counter (FR-14-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth assigns "Counter 2 balance" to counter "Counter 2", when the change commits, then `counter_key` holds that counter and an audit entry records before (none) and after ("Counter 2").
  2. Given Rajesh Verma's counter (the "Which counter / branch" field, used for the counter only) is "Counter 2", when he opens the scale picker on `parcel-arrival`, then "Counter 2 balance" is listed first, followed by the other active scales.
  3. Given a staff member with no counter set, when they open the picker, then all active scales are listed in name order.
  4. Given Sanjay clears the assignment, when he saves, then `counter_key` is null and the scale is listed with the others for everyone.
  5. Given one shop and no branches (D7), when Sanjay assigns a scale, then no branch is asked for or stored.
- **Rules enforced on the server:** Owner only (EP-14-S4). The counter value must be one of the counter values used for staff (the counter part of "Which counter / branch", EP-05-S4), or null. The picker order is computed by List Scales on the server from the caller's counter. Assignment does not stop any staff member from picking any active scale until the open question is answered.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (scale id), action (`scale_assigned`), before and after counter. Written through EP-14-S12.
- **Data changes:** Updates `scales.counter_key`. If one scale may serve several counters, a migration creates `scale_assignments` (scale id, counter key, from, to) instead.
- **UI reference:** Route `scales`; picker on `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("Which scale is this on?"). The assignment control is not yet designed.
- **Non-functional checks:** D7 is decided: no branch assignment. Open question: is a scale tied to one counter, or can any staff use any scale; if tied, the picker hides scales from other counters instead of ordering them. EP-13 has no separate counter record story; the counter value comes from the counter part of the staff member's "Which counter / branch" field.
- **Depends on:** EP-14-S1, EP-14-S4, EP-05-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S9: Staff can have their last scale remembered for the session

- **Story ID:** EP-14-S9
- **Title:** Staff can have their last scale remembered for the session
- **As a:** Staff
- **I want:** the scale picker on `parcel-arrival` and `parcel-tag` to default to the scale I picked last in this session, stored on the server per user, and cleared when I sign out
- **So that:** I pick a scale once per session and do not choose it again for every weighing (FR-14-8, BR-14-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma picked the Platform scale for a tray, when he opens the next tray, then the picker defaults to "Platform scale · 0.01 g" (epic acceptance criterion 6).
  2. Given Rajesh picked the Bench balance on the shop desktop, when he opens `parcel-tag` on the shop tablet in the same signed-in session, then the picker defaults to the Bench balance, because the choice is stored on the server.
  3. Given Rajesh signs out and signs in again, when he opens the picker, then it defaults to his counter's first scale, not to the scale remembered before sign-out.
  4. Given Rajesh's remembered scale has since been retired, when he opens the picker, then it does not default to it and no retired scale is preselected.
  5. Given Update My last scale is called with an unknown scale id, when the server checks it, then it refuses with "Pick the scale this was weighed on." (FR-14-14).
- **Rules enforced on the server:** Update My last scale is allowed for `owner` and `staff`, refused for `karigar`, and writes only the caller's own row (user id from the session, EP-03-S3). The scale id must exist and be active. The row is cleared on sign-out (EP-04-S11) and session expiry (EP-04-S12). Saving a weighing in EP-21 also updates it.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Remembering a picker choice is a preference, not a change to shop records.
- **Data changes:** Upserts `user_scale_preference` (created in EP-14-S1). Adds Update My last scale to the shared contract.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("Which scale is this on?", "Bench balance · 0.0001 g"); same picker on route `parcel-tag`.
- **Non-functional checks:** Security: a user can only set their own remembered scale. Availability: if the preference cannot be read, the picker shows no default rather than a wrong one, and the picked scale name stays visible beside every weight field (epic section 16 risk).
- **Depends on:** EP-14-S1, EP-14-S7, EP-14-S8, EP-03-S3, EP-04-S11, EP-04-S12, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S10: System can compute the ceiling server-side from the registry

- **Story ID:** EP-14-S10
- **Title:** System can compute the ceiling server-side from the registry
- **As a:** System
- **I want:** one ceiling function in the shared package, `ceiling = Σ ½ × readability` over every weighing, that reads each weighing's scale from the registry, returns rows per scale with count and subtotal, the total and a plain line, and runs on the server as the authority while the client runs the same code for instant feedback
- **So that:** the exact-match gate in EP-23 uses a ceiling computed only from the scales used, never a configured tolerance, and never from parcel size, piece count or value (FR-14-9, FR-14-10, FR-14-11, BR-14-3, BR-14-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given a parcel weighed once and 12 pieces tagged, all on the Bench balance, when the server computes the ceiling, then it is 13 × ½ × 0.0001 g = 0.00065 g, the plain line reads "13 weighings × ½ × 0.0001 g", and the total is shown with the display rounding decided under G10 (epic acceptance criterion 3).
  2. Given a 10 kg parcel weighed once on the Platform scale and 300 pieces on the Bench balance, when the ceiling is computed, then it is 0.0200 g and the line shows "300 × 0.00005 + 1 × 0.005" (epic acceptance criterion 4).
  3. Given 300 pieces and 20 trays, all on the Bench balance, when the ceiling is computed, then it is 320 × ½ × 0.0001 g = 0.0160 g.
  4. Given a weighing whose scale id is not in the registry, when the server computes the ceiling, then it refuses with "Pick the scale this was weighed on." (FR-14-14).
  5. Given the client and the server compute the ceiling for the same weighings, when the results are compared, then they are identical, and EP-23 uses only the server result.
  6. Given a parcel with 500 weighings, when the server computes its ceiling, then it finishes in under 10 ms.
- **Rules enforced on the server:** The function takes only weighings and their scales; it has no tolerance input and no parameter for parcel size, piece count or value. It reads one consistent version of each scale. If EP-14-S6 chooses "keep the old figure", it uses each weighing's stored readability. Arithmetic is integer only. Compute Ceiling is readable by Owner and Staff and refused for Karigar.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The ceiling is computed, not stored.
- **Data changes:** None in the product database. Adds the ceiling function to the shared package and Compute Ceiling to the shared contract.
- **UI reference:** `docs/ux/mockups/14-match-rule-any-parcel.svg` ("THE ONLY RULE — IT HAS NO SETTINGS", "ceiling = sum of ( ½ × the scale's smallest step ) for every weighing taken", "0.0007 g", "0.0200 g", "0.0160 g"). The ceiling is shown on the gate screens built in EP-23.
- **Non-functional checks:** Precision: a half-step of 0.0001 g (0.00005 g) is not a whole number of 0.0001 g units, so the function must stay exact, for example by summing readability units and comparing 2 × gap with that sum; the stored and display unit is settled under G10. Concurrency: one version of each scale per computation. Performance: under 10 ms for 500 weighings (proposed target, to confirm). Open decision G10: the unit and display rounding of 0.00065 g (mockup 14 shows 0.0007 g).
- **Depends on:** EP-14-S1, EP-14-S6, EP-02-S2, EP-02-S6, EP-03-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S11: Staff can see a warning when a weight is above the scale's capacity

- **Story ID:** EP-14-S11
- **Title:** Staff can see a warning when a weight is above the scale's capacity
- **As a:** Staff
- **I want:** a warning beside the weight field, naming the capacity, as soon as I type a weight above the chosen scale's heaviest load, and the same warning returned by the server when the weighing is saved
- **So that:** a weight that the chosen scale could not have read is caught at the counter and the parcel is weighed in trays or on a bigger scale (FR-14-12, BR-14-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma picked the Bench balance (up to 600 g) on `parcel-arrival`, when he types 612.3400 g, then the field shows "The bench balance takes up to 600 g." straight away.
  2. Given Rajesh types 599.9999 g or exactly 600.0000 g on the Bench balance, when the field is checked, then no warning shows.
  3. Given Rajesh switches the picker to the Platform scale (up to 30 kg) with 612.3400 g typed, when the field is checked again, then the warning disappears.
  4. Given a weighing of 612.3400 g on the Bench balance is sent to the server, when the server checks it, then it returns the same warning sentence with the capacity from the registry, not from the client.
  5. Given the owner changed the Bench balance capacity to 650 g, when Rajesh next types 612.3400 g, then no warning shows.
- **Rules enforced on the server:** The capacity check compares integer 0.0001 g units (6123400 against 6000000) using the capacity stored on the scale. This story provides the check and the sentence; whether a weighing above capacity is warned and saved or refused is decided with EP-21, and until then it is a warning only.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A warning changes nothing.
- **Data changes:** None in the product database. Adds the capacity check to the shared package.
- **UI reference:** `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival` ("Which scale is this on?", "A parcel too heavy for this balance is weighed in trays"); same field on route `parcel-tag`. The warning text placement is not yet designed.
- **Non-functional checks:** Precision: compared as integers, so 600.0000 g is not over 600 g. Performance: the client check runs on each keystroke with no server call.
- **Depends on:** EP-14-S1, EP-14-S5, EP-02-S2, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-14-S12: System can audit every scale change

- **Story ID:** EP-14-S12
- **Title:** System can audit every scale change
- **As a:** System
- **I want:** every committed add, edit, retire, reactivate and assignment of a scale to write an audit entry in the same transaction, with actor, time, scale id, action and before and after values
- **So that:** the owner can see who changed a readability and when, because that change alters every future ceiling (FR-14-13, BR-14-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth adds "Counter 2 balance", when it commits, then one audit entry exists with kind `scale_added`, ref the new scale id, after {name "Counter 2 balance", readability 0.0010 g, capacity 200.0000 g, status `active`}, actor Sanjay Seth and the server time.
  2. Given Sanjay changes the Bench balance readability from 0.0001 g to 0.001 g, when it commits, then the entry has kind `scale_edited`, before readability 0.0001 g and after 0.0010 g, written as integer 0.0001 g units (1 and 10).
  3. Given Sanjay retires, reactivates or assigns a scale, when it commits, then entries with kinds `scale_retired`, `scale_reactivated` or `scale_assigned` record before and after values.
  4. Given the audit write fails, when the transaction ends, then the scale change is not saved either.
  5. Given a save whose values equal the stored values, when it is processed, then no audit entry is written and the version does not change.
  6. Given Sanjay opens the security log and filters by entity "scale", then he sees these entries newest first; Rajesh Verma (Staff) reading them gets `forbidden`.
- **Rules enforced on the server:** The change and its entry share one transaction (EP-06-S2). Before and after are recorded per field (EP-06-S3), weights as integer 0.0001 g units (EP-06-S5). Entries are append-only (EP-06-S1). Reads are Owner only (EP-06-S12).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (scale id), action (`scale_added`, `scale_edited`, `scale_retired`, `scale_reactivated`, `scale_assigned`), before, after.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds the five scale kinds to the audit kind list. No schema change.
- **UI reference:** No screen of its own. Entries show in the security log built in EP-06 (EP-06-S9, EP-06-S10, EP-06-S11).
- **Non-functional checks:** Audit: every scale change, including name-only changes, writes an append-only entry. Precision: weights in entries are integer 0.0001 g units. Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-14-S3, EP-14-S5, EP-14-S7, EP-14-S8, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S5, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Q5d: for the middle case (gap above 0 and within the ceiling), release and log, or treat as a mismatch? The prototype implements release-and-log; SCOPE-ANALYSIS App. E still lists it open. (EP-14-S10)
- G10: should the stored unit be 0.0001 g as PRODUCTION-SCOPE §5 says, or a finer unit (the prototype uses 0.00001 g), or a doubled half-step unit, so the ceiling is exact? How is 0.00065 g displayed (mockup 14 rounds it to 0.0007 g)? (EP-14-S1, S10)
- What are the exact readabilities and capacities of the real scales in the shop? (SCOPE-ANALYSIS App. E "Still genuinely open") (EP-14-S2)
- D9: will weights be typed by hand or read directly from the balance, and does that change what the registry stores (model, port, serial number)? (EP-14-S1)
- When the owner edits the readability of a scale already used by open parcels, do those parcels keep the old figure or take the new one? (EP-14-S5, S6, S7)
- Should the registry hold calibration dates and block a scale past its calibration date? (EP-14-S1, S7)
- Is a scale tied to one counter, or can any staff use any scale? (EP-14-S8, S9)
