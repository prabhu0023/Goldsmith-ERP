# EP-16: Karigar master · stories

Epic document: [EP-16 Karigar master](../epics/EP-16-karigar-master.md)

Role note: stories where the server stores, checks, computes or audits on its own use "System". Stories where a person keeps karigar records or reads the directory and scorecard use "Owner", the picker story uses "Staff", and the profile story uses "Karigar".

---

## EP-16-S1: System can store karigar records with code, phone, location, specialties, language and allowance

- **Story ID:** EP-16-S1
- **Status:** Partial: AC3 (specialties are stored as names; the reference to the EP-15 `specialties` list is not built) (FU-028, EP-15).
- **Title:** System can store karigar records with code, phone, location, specialties, language and allowance
- **As a:** System
- **I want:** the `karigars` table from EP-02-S4 extended with workshop location, status (`active` or `deactivated`), deactivated at, wastage allowance as an integer in basis points, language with default `English`, open since and version, a `karigar_specialties` child table so one karigar can hold several specialties, and a counter that hands out the next `KG-NN` code
- **So that:** each karigar is one stored record the order copy, the parcel forms, the portal and the scorecard can all point at, with an allowance that is exact and survives a reload (FR-16-2, FR-16-14, BR-16-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migrations have run, when `karigars` is inspected, then it has `id` (`KG-NN`), shop ID, `name`, `phone`, `email` (not null), `workshop_location`, `language` accepting only `Tamil`, `Hindi` or `English` with default `English`, `wastage_bp` as an integer, `status` accepting only `active` or `deactivated`, nullable `deactivated_at`, `open_since` and an integer `version` starting at 1.
  2. Given an insert with `wastage_bp` 59 or 121, or a value such as 0.7 that is not an integer, when it is written straight to the database, then the database check rejects it, and 60 to 120 (0.60% to 1.20%) are accepted (BR-16-1).
  3. Given the migrations have run, when `karigar_specialties` is inspected, then it holds `karigar_id` and `specialty_id` referencing the EP-15 `specialties` list, with one row per pair, and the single `karigars.specialty_id` column added by EP-15-S1 has been moved into it.
  4. Given the seeded karigars KG-01 Lakshmi Devi (0.7%), KG-02 Mahesh Soni (0.8%) and KG-04 Vijay Kumar (0.8%), when the migration has run, then they hold `wastage_bp` 70, 80 and 80, status `active`, and their prototype language values (Tamil, Hindi, Hindi) unchanged.
  5. Given the highest code ever issued is KG-04, when the code counter is initialised, then its next value is 5, so the next code is KG-05 and the gap at KG-03 is never filled (FR-16-2).
  6. Given 20 concurrent requests for the next code, when they finish, then 20 distinct codes are returned and the counter has moved by exactly 20.
- **Rules enforced on the server:** Database checks: `wastage_bp` between 60 and 120, status enum, language enum, name not empty. The code counter is incremented and read in one atomic statement inside a transaction (EP-03-S6); codes are never reused, even after deactivation. Codes are two digits up to KG-99 and grow to three digits after that. The account link is kept once, as `users.karigarId` with a unique index (EP-02-S3, EP-05-S13), and is not duplicated on `karigars`. No weight or money column is added to `karigars`.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. This story creates storage; changes are audited through EP-16-S13.
- **Data changes:** Migration on `karigars` (EP-02-S4) adds `workshop_location`, `status` (default `active`), `deactivated_at`, `wastage_bp` (converted from the prototype percentage), sets the `language` default to `English`, and adds `version` if missing. Migration creates `karigar_specialties` (karigar id, specialty id) and `karigar_code_counter` (next number), initialised above the highest code in use. Adds `email` (required, D4). Each table has the shop ID (EP-02-S3); `id` and `phone` are unique per shop (D7).
- **UI reference:** No screen
- **Non-functional checks:** Precision: the allowance is an integer in basis points (0.70% = 70), never a float (epic section 13). Personal data: `phone` and `workshop_location` are personal data and are returned only to the owner and to the karigar themself. Open question: whether the workshop location is free text or an address with a map pin; this story stores free text. D7 is decided: one shop; records carry the shop ID set by the server, never from the request.
- **Depends on:** EP-02-S1, EP-02-S3, EP-02-S4, EP-02-S14, EP-03-S1, EP-03-S6, EP-15-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S2: System can refuse karigar changes from anyone but the owner

- **Story ID:** EP-16-S2
- **Status:** Done
- **Title:** System can refuse karigar changes from anyone but the owner
- **As a:** System
- **I want:** Create Karigar, Update Karigar details, Update Karigar wastage, Update Karigar status and Update Karigar account link to check the caller's role on the server before validation, and to refuse every role other than owner with "Only the owner can add a karigar or change their wastage allowance."
- **So that:** the allowance every job is judged against, and the record a karigar signs in with, can only be changed by the owner (FR-16-5, BR-16-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma (Staff), when he calls Create Karigar directly with "Ravi Achari", then the server refuses with code `forbidden` and the sentence "Only the owner can add a karigar or change their wastage allowance.", and nothing is stored (epic acceptance criterion 2).
  2. Given Rajesh, when he calls Update Karigar wastage to move KG-02 Mahesh Soni from 0.8% to 1.2%, then the server refuses the same way and `wastage_bp` stays 80.
  3. Given Vijay Kumar (Karigar, KG-04), when he calls Update Karigar details on his own record to change his phone, then the server refuses with the same sentence and the record is unchanged.
  4. Given Rajesh sends a request that is also invalid, such as an empty name, when the server checks it, then he gets the role refusal, not the validation sentence.
  5. Given Rajesh calls Read Karigar scorecard for KG-02, when the server checks the role, then it refuses with `forbidden`.
  6. Given any refused request above, when `karigars` and the audit log are checked, then neither has changed for that request.
- **Rules enforced on the server:** The role check runs before validation and before any write (deny by default, EP-05-S2). The five change operations and Read Karigar scorecard are listed as owner-only in the permission matrix (EP-05-S1). List Karigars stays open to staff in its picker shape (EP-16-S8), and Read My karigar profile stays open to the karigar for their own record (EP-16-S12).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused request changes nothing.
- **Data changes:** Adds the five change operations and the scorecard read to the permission matrix as owner-only. No schema change.
- **UI reference:** No screen of its own. Routes `karigars` and `karigar-new` are on the owner rail only (EP-08-S13); the refusal sentence shows through EP-08-S5 if reached. The sentence is the one printed on `docs/ux/mockups/24-onboard-karigar.svg`.
- **Non-functional checks:** Security: hiding `karigar-new` from staff is not the control; the server check is (epic section 13).
- **Depends on:** EP-16-S1, EP-03-S3, EP-03-S4, EP-05-S1, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S3: Owner can add a karigar with the 0.6% to 1.2% allowance check

- **Story ID:** EP-16-S3
- **Status:** Partial: the specialty names are not checked against the active entries of the EP-15 list (FU-028, EP-15).
- **Title:** Owner can add a karigar with the 0.6% to 1.2% allowance check
- **As a:** Owner
- **I want:** to add a karigar on `karigar-new` with name, phone, email, workshop location, one or more specialties and a wastage allowance, through a Create Karigar operation that assigns the next `KG-NN` code and returns it
- **So that:** each artisan I issue gold to is recorded once, with the allowance their jobs will be judged against (FR-16-1, FR-16-2, FR-16-3, FR-16-4, BR-16-1, BR-16-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on `karigar-new` with KG-01, KG-02 and KG-04 stored, when he adds "Ravi Achari" with a phone, the email "ravi.achari@example.com", Temple and Kundan, and 0.9%, then the record KG-05 is stored with `wastage_bp` 90, status `active` and language `English`, the code is returned, and an audit entry records it (epic acceptance criterion 1).
  2. Given the name is empty or only spaces, when Sanjay chooses "Add this karigar", then the server refuses with "Add the karigar name." and nothing is stored.
  3. Given no specialty chip is picked, when Sanjay saves, then the server refuses with "Pick at least one thing they are best at." and nothing is stored.
  4. Given Sanjay sets the allowance to 1.5% or 0.5%, when he saves, then the server refuses with "The wastage allowance is between 0.6% and 1.2%." and nothing is stored (epic acceptance criterion 3); given 0.705%, then it is refused as a validation error because it is not a whole basis point.
  5. Given the allowance is 0.70%, when the form shows the worked example, then it reads "On a 160 g job, that means up to 1.1200 g lost", computed from 1,600,000 units × 70 ÷ 10,000 = 11,200 units, with the 4-decimal display in place of the mockup's "1.120 g".
  6. Given the same Create Karigar request is sent twice with one idempotency key after a network drop, when the server processes it, then only one karigar and one code are created.
- **Rules enforced on the server:** Owner only (EP-16-S2). Name required and trimmed. At least one specialty, each an active EP-15 specialty entry (EP-15-S4). Allowance converted to basis points and checked 60 to 120. Phone required and normalised to +91 and 10 digits. The server sets id, status, language default, open since and version; the client cannot send them. Deduplicated by idempotency key (EP-03-S8). Create, code assignment and audit run in one transaction (EP-03-S6).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_added`), after (name, phone, workshop location, specialties, wastage allowance, status). Written through EP-16-S13.
- **Data changes:** Inserts into `karigars` and `karigar_specialties`; moves `karigar_code_counter`. Adds Create Karigar to the shared contract.
- **UI reference:** `docs/ux/mockups/24-onboard-karigar.svg`, route `karigar-new` ("Add a karigar", "Name", "Code", "Phone · their job portal logs in with this", "Workshop location", "What they are best at", "ALLOWED LOSS", slider 0.6% to 1.2%, "On a 160 g job, that means", "Add this karigar", "Cancel"). The "Language for their phone" chips (தமிழ் / हिन्दी / English) are not shown in v1; EP-44 adds them.
- **Non-functional checks:** Precision: the worked example is computed from integers of 0.0001 g and basis points through the EP-02-S2 helpers, never with float percentages. Personal data: the phone entered here is shown back only to the owner. Security: the slider's client limits are a convenience; the server repeats the range check. D4 is decided: one phone per karigar (phone numbers are unique) and an email is required; an empty email is refused as a validation error.
- **Depends on:** EP-16-S1, EP-16-S2, EP-02-S2, EP-03-S4, EP-03-S7, EP-03-S8, EP-08-S5, EP-08-S7, EP-15-S4, EP-15-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S4: Owner can edit a karigar's details

- **Story ID:** EP-16-S4
- **Status:** Done
- **Title:** Owner can edit a karigar's details
- **As a:** Owner
- **I want:** to change a karigar's name, phone, workshop location and specialties through Update Karigar details, saving with the version I last read
- **So that:** the record stays correct when a karigar moves workshop, changes phone or takes up new work, without retyping the karigar (FR-16-6, BR-16-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-01 Lakshmi Devi in Kanchipuram, when Sanjay Seth changes her workshop location to "Kumbakonam" and adds the specialty Temple, then both are stored, her version goes up by one, and her code, allowance and status are unchanged.
  2. Given KG-04 Vijay Kumar is linked to a karigar user, when Sanjay changes his phone, then the linked user's phone changes in the same transaction, so the new number is his portal login (BR-16-3).
  3. Given the new phone is already used by another user, when Sanjay saves, then the server refuses with a sentence saying the phone is already used by another account, and neither record changes.
  4. Given Sanjay clears the name or removes every specialty, when he saves, then the server refuses with "Add the karigar name." or "Pick at least one thing they are best at." and nothing changes.
  5. Given another owner session saved KG-01 after Sanjay read it, when Sanjay saves with the older version, then the server refuses as a conflict and nothing changes (EP-02-S14).
  6. Given an edit request that also sends `wastage_bp`, `status` or `id`, when the contract check runs, then it is rejected as a validation error, because those fields change only through EP-16-S5, EP-16-S7 and never.
- **Rules enforced on the server:** Owner only (EP-16-S2). Same field checks as EP-16-S3. Stale version refused (EP-02-S14, EP-03-S5). A phone change on a linked karigar also updates `users.phone` under the EP-05-S5 rules (phone unique among users) in one transaction with the audit entry (EP-03-S6). A deactivated karigar can still be edited, so the record stays correct for history.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_edited`), before and after for each changed field. A phone change on the linked user is also audited by EP-05-S14. Written through EP-16-S13.
- **Data changes:** Updates `karigars` (name, phone, workshop location, version) and rewrites the karigar's `karigar_specialties` rows; may update `users.phone` and `users.version`. Adds Update Karigar details to the shared contract.
- **UI reference:** Not yet designed. The edit form is undrawn (epic section 12); it reuses the `karigar-new` fields from `docs/ux/mockups/24-onboard-karigar.svg` with the code read-only.
- **Non-functional checks:** Concurrency: version check on every save. Personal data: before and after phone values in the audit log are visible only to the owner (EP-06-S12). Open question: workshop location as free text or address with a map pin. D4 is decided: phone numbers are unique, so two karigars cannot share a workshop phone. An email change on a linked karigar also updates `users.email` under the EP-05-S5 rules.
- **Depends on:** EP-16-S1, EP-16-S2, EP-16-S3, EP-02-S14, EP-03-S5, EP-03-S6, EP-05-S5, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S5: Owner can change a karigar's wastage allowance, audited

- **Story ID:** EP-16-S5
- **Status:** Partial: AC4 (the allowance of a job already open) needs the per-job allowance of EP-19 (FU-029, EP-19).
- **Title:** Owner can change a karigar's wastage allowance, audited
- **As a:** Owner
- **I want:** a separate Update Karigar wastage operation that changes a karigar's allowance within 0.6% to 1.2% and records the old and new value, with an optional reason
- **So that:** changing the yardstick for a karigar is a deliberate, visible act, and jobs already issued keep the allowance they were issued under (FR-16-4, FR-16-7, BR-16-1, BR-16-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-02 Mahesh Soni at 0.8%, when Sanjay Seth changes his allowance to 1.0%, then `wastage_bp` becomes 100, his version goes up by one, and an audit entry records before 80 and after 100.
  2. Given Sanjay sets 1.25%, when he saves, then the server refuses with "The wastage allowance is between 0.6% and 1.2%." and `wastage_bp` stays 80.
  3. Given the allowance was changed from 0.8% to 1.0%, when a new job is issued to Mahesh afterwards, then the "allowance in force now" read used by job creation returns 100.
  4. Given Mahesh has job MO-2026-118 issued at 0.8% before the change, when its allowance is read after the change, then it follows the decided rule: either it stays 0.8% (new jobs only) or it moves to 1.0% (open jobs too), and closed jobs never change.
  5. Given Sanjay saves the same value 0.8% again, when the server checks it, then nothing changes and no audit entry is written.
- **Rules enforced on the server:** Owner only (EP-16-S2). Range 60 to 120 basis points, whole numbers only. Stale version refused (EP-02-S14). The change and its audit run in one transaction (EP-03-S6). The server exposes "allowance in force now" for job creation; EP-19 stores the allowance on each job when it is issued and applies the decided rule to open jobs. A settled job's verdict is never recomputed by an allowance change.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_wastage_changed`), before (`wastage_bp`), after (`wastage_bp`), reason if given. Written through EP-16-S13.
- **Data changes:** Updates `karigars.wastage_bp` and `karigars.version`. Adds Update Karigar wastage and the allowance-in-force read to the shared contract. The per-job allowance field is added by EP-19.
- **UI reference:** Not yet designed. The edit form with the "THE WASTAGE YOU ALLOW THEM" panel from `docs/ux/mockups/24-onboard-karigar.svg` is undrawn for an existing karigar (epic section 12).
- **Non-functional checks:** Precision: stored and compared as integer basis points. Audit: old and new allowance are always recorded, because the value changes how every future job is judged (epic section 13). Open question: whether a changed allowance applies only to jobs issued after the change or also to jobs already open (criterion 4 is written for either answer).
- **Depends on:** EP-16-S1, EP-16-S2, EP-16-S3, EP-02-S14, EP-03-S6, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S6: Owner can link a karigar to a karigar user account

- **Story ID:** EP-16-S6
- **Status:** Done
- **Title:** Owner can link a karigar to a karigar user account
- **As a:** Owner
- **I want:** from a karigar's record, to link it to a user with role `karigar` (or create that user from the karigar's name, phone and email, which sends the activation email), and to see on the record whether it is linked
- **So that:** the karigar can sign in to the portal with the phone recorded here and see only their own jobs (FR-16-10, BR-16-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-05 Ravi Achari has no account, when Sanjay Seth chooses to give him portal access, then a user with role `karigar`, Ravi's name, phone and email is created with status `pending_activation` and linked to KG-05 in one transaction, an activation email goes to Ravi (EP-04-S10), and the record shows it as linked.
  2. Given an existing karigar user with Vijay Kumar's phone and no link, when Sanjay links it to KG-04, then `users.karigarId` is KG-04, and the link uses the EP-05-S13 rules.
  3. Given KG-04 is already linked to an active user, when Sanjay links a second user to it, then the server refuses with "This karigar already has an account." (one account per karigar).
  4. Given KG-05 is deactivated, when Sanjay tries to link or create an account for him, then the server refuses with a sentence saying the karigar is deactivated.
  5. Given Rajesh Verma (Staff), when he calls Update Karigar account link, then the server refuses with "Only the owner can add a karigar or change their wastage allowance." (EP-16-S2).
- **Rules enforced on the server:** Owner only. The user side is owned by EP-05: role must be `karigar`, phone unique among the shop's users, email required, one active user per karigar record (EP-05-S4, EP-05-S13). Creating the user and setting the link happen in one transaction with both audit entries (EP-03-S6). The user's phone and email must equal the karigar's, so the login stays the phone recorded here. No password is set or emailed; the activation link comes from EP-04-S10.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_linked`), before and after user id. The user creation and `karigarId` change are audited by EP-05-S14. Written through EP-16-S13.
- **Data changes:** Updates `users.karigarId` and `users.version`; may insert into `users`. Adds Update Karigar account link to the shared contract. No column added to `karigars`.
- **UI reference:** Not yet designed. No mockup draws the link step; `docs/ux/mockups/24-onboard-karigar.svg` labels the phone "their job portal logs in with this".
- **Non-functional checks:** Security: a wrong link would show one karigar another's jobs, so the link is owner-only and audited. D4 is decided: phone and password sign-in, phone numbers unique, so two karigars cannot share one workshop phone. Open question (from EP-05-S13): whether linking happens in one step with adding the karigar.
- **Depends on:** EP-16-S1, EP-16-S2, EP-16-S3, EP-05-S4, EP-05-S13, EP-05-S14, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S7: Owner can deactivate a karigar with no open jobs

- **Story ID:** EP-16-S7
- **Status:** Partial: AC2 (gold still with the karigar) needs the EP-18 ledger; only open jobs block a deactivation today (FU-029, EP-18).
- **Title:** Owner can deactivate a karigar with no open jobs
- **As a:** Owner
- **I want:** to deactivate or reactivate a karigar through Update Karigar status, with the server refusing deactivation while the karigar has an open job or gold issued and not returned, and naming the jobs
- **So that:** a karigar who stops working for the shop is no longer offered or able to sign in, without gold being left untracked with them (FR-16-8, FR-16-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-04 Vijay Kumar has the open job MO-2026-118, when Sanjay Seth tries to deactivate him, then the server refuses with a sentence naming MO-2026-118 and nothing changes (epic acceptance criterion 4).
  2. Given a karigar with no open job but 0.4000 g of gold out on the EP-18 ledger, when Sanjay tries to deactivate them, then the server refuses with a sentence giving the gold still with them.
  3. Given KG-05 Ravi Achari has no open job and no gold out and is linked to a user, when Sanjay deactivates him, then the karigar status is `deactivated` with `deactivated_at` set, the linked user is deactivated in the same transaction, and his open portal sessions end through EP-05-S7.
  4. Given a job is being created for KG-05 at the same moment as the deactivation, when both commit, then exactly one succeeds: either the job exists and the deactivation is refused, or the karigar is deactivated and the job is refused (epic section 13 concurrency).
  5. Given KG-05 is deactivated, when Sanjay reactivates him, then the status is `active`, `deactivated_at` is cleared, and his user account stays deactivated until Sanjay reactivates it through EP-05-S8.
- **Rules enforced on the server:** Owner only (EP-16-S2). Deactivation reads open jobs and gold with the karigar inside the same transaction, holding a lock on the karigar row, and job creation (EP-19) checks the karigar's status under the same lock through the EP-16-S8 check. Status moves only between `active` and `deactivated`; deactivating an already deactivated karigar is refused. The record is never deleted. Stale version refused (EP-02-S14).
- **Live events emitted / consumed:** emitted: "User deactivated or role changed" for the linked user, through EP-05-S10.
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_deactivated` or `karigar_reactivated`), before and after status, reason if given. The linked user's deactivation is audited by EP-05-S14. Written through EP-16-S13.
- **Data changes:** Updates `karigars.status`, `karigars.deactivated_at` and `karigars.version`; may update `users.status` and end `sessions` rows. Adds Update Karigar status to the shared contract. Reads `karigar_jobs` and the metal pool ledger (EP-02-S8, EP-02-S9).
- **UI reference:** Not yet designed. The deactivate action is undrawn (epic section 12); it belongs on the karigar record opened from `karigars`.
- **Non-functional checks:** Concurrency: deactivation and a new order copy for the same karigar cannot both succeed. Precision: the gold-out figure is an integer of 0.0001 g shown to 4 decimals. Security: a deactivated karigar's sessions end within about 1 second through the live event. Open question: whether a karigar with open jobs can be deactivated once the owner takes the gold back first.
- **Depends on:** EP-16-S1, EP-16-S2, EP-16-S6, EP-02-S8, EP-02-S9, EP-02-S14, EP-05-S7, EP-05-S8, EP-05-S10, EP-04-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S8: Staff can pick only active karigars on the order copy and parcel forms

- **Story ID:** EP-16-S8
- **Status:** Partial: the picker and the active check are built but not yet used on `order-copy` and `parcel-arrival` (FU-030, EP-19, EP-21).
- **Title:** Staff can pick only active karigars on the order copy and parcel forms
- **As a:** Staff
- **I want:** a karigar picker on `order-copy` and `parcel-arrival` that lists only active karigars with name, code, specialties and allowance, and no phone, location or scorecard, plus a shared server check that refuses an inactive or unknown karigar on those forms
- **So that:** I can send work to the right karigar without seeing figures meant for the owner, and no job or parcel is recorded against someone who no longer works for the shop (FR-16-9, BR-16-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-01, KG-02, KG-04 active and KG-05 deactivated, when Rajesh Verma opens the karigar picker on `order-copy`, then it offers Lakshmi Devi · KG-01, Mahesh Soni · KG-02 and Vijay Kumar · KG-04, and not Ravi Achari.
  2. Given the picker list, when the response is inspected, then each row carries id, name, specialties and allowance (for example "Chettinad specialist · 0.7% loss") and no phone, workshop location, metal loss, days late, rating or parcel gaps.
  3. Given KG-05 was deactivated after Rajesh's picker loaded, when Rajesh sends an order copy for KG-05, then the server refuses with a sentence saying the karigar is no longer active, and nothing is stored.
  4. Given a parcel arrival names a karigar id that does not exist, when the server checks it, then it refuses with "Say which karigar it came from."
  5. Given the picker is loading or the read fails, when Rajesh opens it, then it shows the EP-08-S3 loading state or the EP-08-S4 error with "Try again".
- **Rules enforced on the server:** List Karigars returns the picker shape to `staff` and only `active` karigars (epic section 10). The shared "karigar is active" check takes a lock on the karigar row and is called inside the job-creation and parcel-arrival transactions that EP-19 and EP-21 build. A karigar caller is refused List Karigars with `forbidden`.
- **Live events emitted / consumed:** None. The picker reloads on next open; a stale choice is caught by the server check.
- **Audit entry written:** No. Picking reads data, and a refused save changes nothing.
- **Data changes:** None in the product database. Adds the picker shape of List Karigars and the shared active-karigar check to the service layer, and the karigar picker to the web app through the EP-08 cache.
- **UI reference:** `docs/ux/mockups/19-order-copy-builder.svg`, route `order-copy` ("Who makes it", "Lakshmi Devi · KG-01", "Chettinad specialist · 0.7% loss · always on time"); `docs/ux/mockups/20-parcel-arrival.svg`, route `parcel-arrival`. The "always on time" phrase is a scorecard figure and is left out until G4 says whether staff see it.
- **Non-functional checks:** Personal data: staff never receive karigar phone or workshop location. Concurrency: a deactivation and an order copy at the same moment cannot both succeed (EP-16-S7). Availability: offline, the picker shows the last cached list and sending is disabled (EP-08-S11). Open question G4: whether staff see any scorecard figure, such as "always on time".
- **Depends on:** EP-16-S1, EP-16-S7, EP-05-S2, EP-08-S1, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S11, EP-15-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S9: Owner can see the karigar directory worst first

- **Story ID:** EP-16-S9
- **Status:** Partial: gold with the karigar is summed from open jobs, not read from the EP-18 ledger (FU-029, EP-18).
- **Title:** Owner can see the karigar directory worst first
- **As a:** Owner
- **I want:** the `karigars` screen to list every karigar from the server, ordered by metal loss minus allowance from highest to lowest, with code, specialties, open jobs, gold with them in grams, allowance and status
- **So that:** the karigar costing me the most gold is at the top, and I can see at a glance who is inside their allowance (FR-16-11, BR-16-6, BR-16-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-02 Mahesh Soni at 1.42% loss against 0.8%, KG-01 Lakshmi Devi at 0.60% against 0.7% and KG-04 Vijay Kumar at 0.75% against 0.8%, when Sanjay Seth opens `karigars`, then the order is Mahesh (+62 basis points), Vijay (−5), Lakshmi (−10), and equal differences are ordered by code.
  2. Given Mahesh has 3 open jobs and 186.4000 g with him on the ledger, when his row is shown, then it reads "Kundan and Polki · 3 open jobs", gold with him "186.4000 g", and metal loss as a percentage, never as a money figure (BR-16-6).
  3. Given a karigar with no settled job yet, when the directory is shown, then metal loss reads "None yet" and the karigar is listed after those with figures.
  4. Given KG-05 is deactivated, when the directory is shown, then he is listed in a separate deactivated group with his status, not mixed into the worst-first order.
  5. Given a job status changes for Mahesh while the screen is open, when the "Karigar job status changed" event arrives, then his open job count refreshes without a reload (EP-08-S9).
  6. Given 50 karigars with scorecards, when Sanjay opens `karigars`, then the list loads in under 2 seconds.
- **Rules enforced on the server:** Owner only for the full directory shape (epic section 10); staff get only the picker shape (EP-16-S8). Order is computed on the server from integer basis points. Gold with each karigar comes from the metal pool ledger as an integer of 0.0001 g. No rating is returned until the G4 formula is decided (EP-16-S10).
- **Live events emitted / consumed:** consumed: "Karigar job status changed" and "Metal pool changed", to refresh open jobs and gold with the karigar.
- **Audit entry written:** No. Reading the directory changes nothing.
- **Data changes:** None in the product database. Adds the owner shape of List Karigars to the shared contract and moves the `karigars` screen off `useStore()` onto the EP-08 data layer.
- **UI reference:** Route `karigars` (owner rail "Karigars"). `docs/ux/mockups/08-owner-home.svg` shows the "KARIGARS, WORST FIRST" card ("Mahesh Soni · KG-02", "Kundan and Polki · 3 open jobs", "Metal loss 1.42%", "Open ledger"). The full karigar list page is not yet designed (MOCKUP-COVERAGE §3); the prototype screen is reused until the design pass.
- **Non-functional checks:** Performance: 50 karigars with scorecards under 2 seconds (epic section 13). Precision: loss and allowance compared as integers; gold shown to 4 decimals. Personal data: phone and workshop location are shown only here, to the owner. Open question G4: the period over which metal loss is measured for the ordering.
- **Depends on:** EP-16-S1, EP-16-S2, EP-16-S10, EP-02-S9, EP-07-S11, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S10: System can compute loss %, days late and last six parcel gaps from real data (G4)

- **Story ID:** EP-16-S10
- **Status:** Partial: G4 and G23 are open, so loss, days late and gaps use interim sources and `rating` is never returned (FU-029, EP-18, EP-19).
- **Title:** System can compute loss %, days late and last six parcel gaps from real data (G4)
- **As a:** System
- **I want:** a scorecard computation per karigar that derives metal loss %, days late, finished jobs and the last six parcel gold gaps from settled jobs, agreed dates and released parcels, and keeps the rating empty until its formula is decided
- **So that:** every figure the owner judges a karigar by is measured from what happened, not seeded (FR-16-12, FR-16-13, BR-16-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-02 has two settled jobs with gold issued 447.3000 g and 160.0000 g and loss 6.3000 g and 2.3000 g, when the scorecard is computed, then metal loss is (63,000 + 23,000) × 10,000 ÷ (4,473,000 + 1,600,000) = 141.6, rounded half up to 142 basis points and shown as 1.42%, computed from integers.
  2. Given three parcels released for KG-02 with gold gaps of 0.0280 g, 0.0330 g and 0.1380 g, when the owner reads the scorecard, then the last gaps are exactly those three, newest first, as integers 280, 330 and 1,380 (epic acceptance criterion 5).
  3. Given KG-02 has eight released parcels, when the scorecard is computed, then only the six most recent gaps are returned.
  4. Given a job confirmed for 17 Nov 2026 and handed over on 20 Nov 2026, when days late are computed, then that job counts 3 days late, using dates in Asia/Kolkata; a job handed over early counts 0.
  5. Given the rating formula is not decided, when the scorecard is read, then `rating` is null and no screen shows a rating.
  6. Given the migration has run, when `karigars` is inspected, then the seeded `metal_loss`, `late_days`, `rating` and `finished_jobs` columns are gone and no scorecard figure is read from them (epic acceptance criterion 6).
- **Rules enforced on the server:** Figures are computed only from stored rows: job settlement and agreed dates in `karigar_jobs` (written by EP-19), ledger entries (written by EP-18) and parcel gaps on released parcels (written by EP-23). All arithmetic is on integers of 0.0001 g and basis points, with rounding stated once (half up to whole basis points). Unsettled jobs are not counted in loss %. The cached scorecard, if kept, is recomputed in the same transaction that settles a job or releases a parcel, so it is never stale. Until EP-18, EP-19 and EP-23 exist, tests use fixture rows in those tables.
- **Live events emitted / consumed:** None. The scorecard changes when EP-19 and EP-23 settle jobs and release parcels (epic section 11).
- **Audit entry written:** No. A derived figure is not a change to shop records; the job and parcel changes behind it are audited by their own epics.
- **Data changes:** Migration drops the seeded `metal_loss`, `late_days`, `rating`, `finished_jobs` columns from `karigars` and stops reading `karigar_gap_history` as seed data; the last six gaps are read from released parcels. Migration creates `karigar_scorecards` (karigar id, metal loss bp, days late, finished jobs, last six gaps as integers of 0.0001 g, rating nullable, computed at) if a cache is used.
- **UI reference:** No screen. The figures appear on `karigars` (EP-16-S9, EP-16-S11) and on `parcel-clear` ("His last six parcels, gold gap", `docs/ux/mockups/22-owner-clear-mismatch.svg`), which EP-23 builds.
- **Non-functional checks:** Precision: percentages computed from integers, never stored floats (epic section 13). Time: day boundaries for days late in Asia/Kolkata (EP-10-S10). Open question G4: the rating formula, the period for loss % and days late, and whether days late is a sum or an average. Open question G23: whether reconciliation B is settled per job or per period, which decides what "settled job" means in criterion 1.
- **Depends on:** EP-16-S1, EP-02-S2, EP-02-S6, EP-02-S8, EP-02-S9, EP-03-S6, EP-10-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S11: Owner can see a karigar's scorecard (G4)

- **Story ID:** EP-16-S11
- **Status:** Partial: gold returned per job needs the EP-18 ledger and the EP-19 settlement fields (FU-029, EP-18, EP-19).
- **Title:** Owner can see a karigar's scorecard (G4)
- **As a:** Owner
- **I want:** to open one karigar from `karigars` and see their measured metal loss against allowance, days late, finished jobs, last six parcel gold gaps with their average, and their job ledger, read through Read Karigar scorecard
- **So that:** I judge a karigar on facts, for example whether today's 138 mg gap is like him or not (FR-16-12, FR-16-13, BR-16-6, BR-16-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given KG-02 Mahesh Soni's computed scorecard, when Sanjay Seth opens it, then it shows metal loss "1.42%" against allowance "0.80%", days late, finished jobs, and the last six gaps 0.0280 g, 0.0330 g, 0.0300 g, 0.0290 g, 0.0350 g, 0.0310 g with average 0.0310 g, as on mockup 22.
  2. Given the rating formula is not decided, when the scorecard is shown, then no rating figure appears, in place of the prototype's "x / 5" or the mockup's "3.4 / 5".
  3. Given a karigar with no released parcel, when the scorecard is shown, then the gaps area reads "None yet".
  4. Given the job ledger section, when Sanjay reads it, then each job shows its id (for example MO-2026-118), status, gold issued and returned in grams to 4 decimals, and no money figure.
  5. Given Rajesh Verma (Staff) or Vijay Kumar (Karigar) calls Read Karigar scorecard, when the server checks the role, then it refuses with `forbidden` (BR-16-9).
- **Rules enforced on the server:** Owner only (EP-16-S2). Figures come only from the EP-16-S10 computation. The rating field is omitted from the response while null. No price or cost field is in the response shape.
- **Live events emitted / consumed:** consumed: "Karigar job status changed", to refresh the job ledger section while the scorecard is open.
- **Audit entry written:** No. Reading the scorecard changes nothing.
- **Data changes:** None in the product database. Adds Read Karigar scorecard to the shared contract.
- **UI reference:** Not yet designed. The karigar ledger and scorecard page is undrawn (MOCKUP-COVERAGE §3); the prototype `karigars` ledger view is reused until the design pass. Figures match `docs/ux/mockups/22-owner-clear-mismatch.svg` ("IS THIS LIKE HIM?", "His last six parcels, gold gap") and `docs/ux/mockups/08-owner-home.svg` ("Metal loss", "Delivers", "Rating").
- **Non-functional checks:** Precision: gaps are integers of 0.0001 g shown to 4 decimals; the mockups show milligrams ("28 mg"), and the 4-decimal display applies. Security: owner-only on the server. Open question G4: rating formula, measurement period, and whether staff see any of it.
- **Depends on:** EP-16-S9, EP-16-S10, EP-16-S2, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S12: Karigar can see their own profile

- **Story ID:** EP-16-S12
- **Status:** Partial: the karigar "Me" tab that shows the profile is EP-20 (FU-031, EP-20).
- **Title:** Karigar can see their own profile
- **As a:** Karigar
- **I want:** the "Me" tab on my phone to show my own name, code, phone, workshop location, specialties, wastage allowed and finished jobs, read through Read My karigar profile
- **So that:** I can check what the shop has recorded about me and what loss I am allowed, without seeing anyone else's record (BR-16-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Vijay Kumar signed in as the karigar user linked to KG-04, when he opens "Me", then he sees "Vijay Kumar · KG-04", his phone, workshop location, specialties, "0.8% wastage allowed" and finished jobs, for example "14 delivered this year".
  2. Given the same session, when Read My karigar profile is called, then the server uses the `karigarId` on his user and accepts no karigar id from the request.
  3. Given the same session, when he calls a read for KG-02's record or scorecard, then the server returns `not_found` and no field of that record (EP-05-S3).
  4. Given the profile response, when it is inspected, then it carries no rating, no other karigar's figures, and no customer, price or stock field.
  5. Given a karigar user with no linked record, when they open "Me", then the server returns an empty profile and the screen says the account is not linked yet, with no error.
- **Rules enforced on the server:** Karigar role only, own record only, keyed from the session (EP-03-S3, EP-05-S3). Read only; changes go through the owner (EP-16-S2). The language field is not returned in v1.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reading a profile changes nothing.
- **Data changes:** None in the product database. Adds Read My karigar profile to the shared contract.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs`, "Me" tab ("Vijay Kumar · KG-04", "0.8% wastage allowed", "Finished jobs", "14 delivered this year"). The हिन्दी toggle is not shown in v1 (EP-44). The full "Me" tab is built in EP-20; this story provides its data.
- **Non-functional checks:** Security: another karigar's record returns not-found, so its existence is not revealed. Personal data: the karigar sees only their own phone and location. Open question G4: whether a karigar sees their own loss % or days late; this story shows neither.
- **Depends on:** EP-16-S1, EP-16-S6, EP-16-S10, EP-03-S3, EP-05-S3, EP-08-S2, EP-08-S12, EP-08-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-16-S13: System can audit every karigar change

- **Story ID:** EP-16-S13
- **Status:** Done
- **Title:** System can audit every karigar change
- **As a:** System
- **I want:** every add, edit, wastage change, account link, deactivation and reactivation of a karigar to write one append-only audit entry in the same transaction, with before and after values
- **So that:** the owner can see who changed a karigar's record or allowance, when, and from what to what (FR-16-15, epic section 13 audit)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth adds KG-05 Ravi Achari, when the create commits, then one entry exists with actor Sanjay, server time, entity KG-05, action `karigar_added` and the stored fields as after.
  2. Given Sanjay changes KG-02 from 0.8% to 1.0%, when it commits, then one entry exists with action `karigar_wastage_changed`, before `wastage_bp` 80 and after 100.
  3. Given an edit that fails after the karigar row was updated, when the transaction rolls back, then neither the change nor the audit entry is stored.
  4. Given a refused request, such as Rajesh Verma calling Create Karigar, when the log is checked, then no karigar entry exists for it.
  5. Given Sanjay filters the security log by entity KG-02, when the results come back, then they list the karigar entries newest first with before and after values (EP-06-S10, EP-06-S11).
- **Rules enforced on the server:** Audit entries are written in the same transaction as the change (EP-06-S2) and cannot be updated or deleted (EP-06-S1). Actor comes from the session and time from the server clock (EP-03-S3). Audit reads are owner-only (EP-06-S12).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (karigar id), action (`karigar_added`, `karigar_edited`, `karigar_wastage_changed`, `karigar_linked`, `karigar_deactivated`, `karigar_reactivated`), before, after, reason where given.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). Adds the karigar kinds to the audit kind list by migration. No other schema change.
- **UI reference:** No screen of its own. Entries show in the security log built in EP-06 (EP-06-S9, EP-06-S10, EP-06-S11).
- **Non-functional checks:** Audit: every karigar change writes an append-only entry, and a wastage change always holds old and new value. Personal data: phone values in before and after are visible only to the owner. Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-16-S3, EP-16-S4, EP-16-S5, EP-16-S6, EP-16-S7, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S7, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D4 is decided: phone and password; phone numbers are unique and every karigar has an email address (EP-16-S3, S4, S6).
- G4: how is the rating computed, over what period are loss % and days late measured, and do staff see any of it? (EP-16-S8, S9, S10, S11, S12)
- G23: is reconciliation B (gold issued vs net returned vs allowance) settled per job or per period, and where is the flag raised? (EP-16-S10)
- Does a changed wastage allowance apply only to jobs issued after the change, or also to jobs already open? (EP-16-S5)
- Can a karigar with open jobs be deactivated if the owner takes the gold back first? (EP-16-S7)
- Should the workshop location be free text or an address with a map pin? (EP-16-S1, S4)
