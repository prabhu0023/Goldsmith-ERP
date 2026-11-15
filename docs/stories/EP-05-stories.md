# EP-05: Users, roles and permissions · stories

Epic document: [EP-05 Users, roles and permissions](../epics/EP-05-users-roles-and-permissions.md)

Role note: stories where the owner manages people use "Owner". Stories that describe what a signed-in person sees use Owner, Staff or Karigar. Stories where the server checks or acts on its own (permission checks, data filtering, guards, ending sessions, writing audit entries) use "System".

---

## EP-05-S1: System can define the fixed permission list for each of the three roles in the shared package

- **Story ID:** EP-05-S1
- **Title:** System can define the fixed permission list for each of the three roles in the shared package
- **As a:** System
- **I want:** one permission matrix in the shared package that maps each role (`owner`, `staff`, `karigar`) to the list of operation names that role may call, built from `ROLES` in `src/components/people/permissions.ts` and the CAN, CANNOT and NEVER SEES lists on mockup 11
- **So that:** the web screens and the api read the same list, and the permission set is fixed by role with no per-user ticks (BR-05-1, BR-05-5, FR-05-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the shared package, when the matrix is read, then it has exactly three keys `owner`, `staff` and `karigar` and no QC manager or other role (BR-05-10).
  2. Given the matrix, when the `staff` entry is checked, then it includes operations for working and converting a lead, raising an order copy, recording a parcel and its weights, tagging a piece as draft, releasing a matching parcel, raising a problem, selling from stock, proposing an edit, requesting scrap, adding a customer and sending wishes, and it excludes clear mismatch, apply edit, mark scrap, send parcel back, add user and change role (mockup 11, BR-05-4).
  3. Given the matrix, when the `owner` entry is compared with `staff`, then every staff operation is also in `owner`, plus clear mismatch, clear problem, apply edit with token, mark scrap, send parcel back, onboard staff and karigars, set lead timer and rules, and read every report (BR-05-5).
  4. Given the matrix, when the `karigar` entry is checked, then it holds only own-job operations (read own jobs, accept job, confirm due date, update status, add bench photo, mark ready, hand over, raise problem on own job) and no list operation on parcels, stock, customers, leads or prices (BR-05-6).
  5. Given a new operation is added to the shared contract (EP-03-S1) without a matrix entry, when the typecheck or the matrix test runs in CI, then it fails and names the missing operation.
- **Rules enforced on the server:** The matrix is code, not a table, and is not editable at runtime. An operation absent from every role's list is allowed to nobody (deny by default, epic section 16 risk). Raising a problem is in all three lists; starting the line again is in `owner` only (BR-05-7).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The matrix is code and changes only through a reviewed commit.
- **Data changes:** None in the product database. Adds the permission matrix module to the shared package; `ROLES` labels and `can`/`cannot` sentences move into it for display.
- **UI reference:** `docs/ux/mockups/11-roles-and-permissions.svg` (WHO DOES WHAT card) and the "SO DEEPAK, AS STAFF, WILL BE ABLE TO" card on `docs/ux/mockups/25-onboard-staff.svg`, which are drawn from this list.
- **Non-functional checks:** Security: deny by default for any operation without an entry. Open question G12: settings operations (`setSetting`) and `onboardCustomer`, `sendWishes`, `sendBroadcast` have no guard in the prototype; their matrix entries stay as listed on mockup 11 until EP-13 and EP-33 decide.
- **Depends on:** EP-01-S3, EP-01-S4, EP-03-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S2: System can refuse any operation the caller's role does not allow

- **Story ID:** EP-05-S2
- **Title:** System can refuse any operation the caller's role does not allow
- **As a:** System
- **I want:** the permission hook in the API pipeline to look up the caller's role from the session and the operation name in the matrix, and refuse the call before the service function runs if the role does not allow it
- **So that:** a staff member or karigar who calls the API directly cannot clear a mismatch or scrap a piece, whatever the screen shows (FR-05-2, FR-05-3, BR-05-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when he calls the clear-mismatch operation directly for parcel BATCH-2026-014, then the server returns code `forbidden` with the sentence "Only the owner can clear a mismatch." and the parcel is unchanged (epic acceptance criterion 1).
  2. Given the same staff session, when the apply-edit and mark-scrap operations are called directly, then each returns `forbidden` with its "Only the owner can …" sentence and no row changes (BR-05-4).
  3. Given Sanjay Seth signed in as Owner, when he calls clear-mismatch for the same parcel, then the permission hook lets it through to the service function.
  4. Given an operation name with no matrix entry, when any role calls it, then the server returns `forbidden` (deny by default).
  5. Given a request with no valid session, when any operation other than the sign-in operations is called, then the server returns `unauthenticated` before the permission check runs.
- **Rules enforced on the server:** The role comes from the session resolved in EP-03-S3, never from the request body. The check runs before the transaction opens, so a refused call writes nothing. The 12 `requireOwner` guards in `src/store/transitions.ts` (ownerSendBack, ownerRecheckTag, ownerAcceptLoss, clearProblem, ownerAgreeEdit, applyEdit, refuseEdit, ownerScrap, ownerDeclineScrap, onboardKarigar, onboardStaff, upsertScale) become matrix entries, and their sentences become the refusal text. A session whose `role at issue` differs from the user's current role is refused (EP-04-S13).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused call changes nothing; repeated refusals are reported through EP-37 and EP-39.
- **Data changes:** None in the product database. Fills in the permission hook left by EP-03.
- **UI reference:** No screen. The refusal sentence is what screens show when a call is refused.
- **Non-functional checks:** Security: every operation is checked on the server; hiding a button is not a control (BR-05-3). Performance: the check is an in-memory lookup and adds no noticeable delay; screens still load under 2 seconds.
- **Depends on:** EP-05-S1, EP-03-S3, EP-03-S5, EP-04-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S3: System can limit a karigar's reads to their own jobs

- **Story ID:** EP-05-S3
- **Title:** System can limit a karigar's reads to their own jobs
- **As a:** System
- **I want:** every read a karigar session makes to be filtered to jobs whose `karigarId` equals the `karigarId` on that user, and to the reference images of those jobs only
- **So that:** a karigar never sees another karigar's work, or any price, customer, lead or stock record (FR-05-4, BR-05-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Lakshmi Devi signed in as a karigar user linked to KG-04, when she requests a job assigned to KG-01, then the server returns `not_found` and no field of that job (epic acceptance criterion 3).
  2. Given the same session, when she lists her jobs, then only jobs with `karigarId` KG-04 are returned.
  3. Given the same session, when she requests the reference image of a KG-04 job, then it is returned; when she requests the reference image of a KG-01 job, then the server returns `not_found`.
  4. Given the same session, when she calls any list or read operation on customers, leads, stock or parcels, then the server returns `forbidden`.
  5. Given a karigar job record returned to her, when the response is inspected, then it carries no customer name, customer phone or price field.
- **Rules enforced on the server:** The filter is applied in the query on the server, not after loading. Another karigar's record is answered with `not_found`, not `forbidden`, so its existence is not revealed. A karigar user with no `karigarId` gets an empty job list. Price fields are never in the karigar response shape.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Reads change nothing.
- **Data changes:** None in the product database. Adds the karigar scope filter to the read path; jobs and images themselves come in EP-19 and EP-09.
- **UI reference:** No screen in this story. The karigar job list is EP-20 (route `k-jobs`); the NEVER SEES list is on `docs/ux/mockups/11-roles-and-permissions.svg`.
- **Non-functional checks:** Security: another karigar's job returns not-found, not the record (epic section 13). Personal data: customer data never reaches a karigar phone.
- **Depends on:** EP-05-S2, EP-02-S3, EP-02-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S4: Owner can add a user with name, phone and role

- **Story ID:** EP-05-S4
- **Title:** Owner can add a user with name, phone and role
- **As a:** Owner
- **I want:** to fill in Name, "Phone · they sign in and get OTPs here" and the role picker (Staff, Owner or Karigar) on the Add a staff member screen and press "Add this staff member"
- **So that:** the new person can sign in with their own phone and land on their role's home (FR-05-5, FR-05-6, BR-05-2, BR-05-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth signed in as Owner on route `staff-new`, when he enters Name "Deepak Rao", Phone "+91 90030 71145", picks Staff and presses "Add this staff member", then a user with role `staff` and status `active` is created and its id is returned (epic acceptance criterion 2).
  2. Given Deepak Rao was just added, when he requests a sign-in code for "+91 90030 71145" and enters it, then he is signed in and lands on route `today` (epic acceptance criterion 2).
  3. Given an active user already has phone "+91 90030 71145", when the owner adds another user with the same phone, then the server returns `validation` with field `phone` and no user is written.
  4. Given Rajesh Verma signed in as Staff, when he calls the add-user operation directly, then the server returns `forbidden` with "Only the owner can add staff or change a role." (FR-05-6).
  5. Given an empty Name or a phone of "12345", when the form is submitted, then the field shows an error and the server, if reached, returns `validation` with the field name.
- **Rules enforced on the server:** Only role `owner` may call Create User. Name is required. Phone is normalised to E.164 and must be unique among active users. Role must be one of `owner`, `staff`, `karigar`. The create runs in one transaction with its audit entry and uses an idempotency key so a double tap creates one user (EP-03-S8).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user (new id), action `user_added`, after (name, masked phone, role, branch if D7).
- **Data changes:** Inserts into `users`. Prototype `StaffMember` rows for owner and staff merge into `users`; prototype ids such as `ST-01` are kept as a reference column (epic section 16 risk). Migration adds `created at`, `deactivated at` and `version` to `users` if EP-02-S3 did not.
- **UI reference:** `docs/ux/mockups/25-onboard-staff.svg`, route `staff-new`. The add and edit user flow for all three roles is not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Personal data: the phone is personal data and shown only to the owner. Concurrency: two parallel adds with the same phone create one user. Open decision D4: if sign-in uses email, the form also needs an email field. Open decision D7: the "Which counter / branch" field is shown and stored only if multi-branch. Open question: whether two users may share one phone (karigar workshops).
- **Depends on:** EP-05-S2, EP-04-S3, EP-04-S6, EP-03-S7, EP-03-S8, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S5: Owner can edit a user's name and phone

- **Story ID:** EP-05-S5
- **Title:** Owner can edit a user's name and phone
- **As a:** Owner
- **I want:** to open a user from the directory and change their Name or Phone and save
- **So that:** a typing mistake or a new phone number does not lock the person out (FR-05-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao at version 1 with phone "+91 90030 71145", when the owner changes the phone to "+91 90030 71146" and saves, then the user row has the new phone and version 2.
  2. Given the phone changed, when Deepak next requests a sign-in code, then it works for "+91 90030 71146" and not for the old number.
  3. Given the owner saves with version 1 while another owner already saved version 2, when the server handles it, then it returns `conflict` with "Someone else changed this user. Reload and try again." and nothing changes.
  4. Given a new phone already held by another active user, when the owner saves, then the server returns `validation` with field `phone`.
  5. Given a Staff session, when it calls Update User profile, then the server returns `forbidden`.
- **Rules enforced on the server:** Only role `owner` may call Update User profile. The update checks `version` (EP-02-S14). Phone uniqueness is checked as in EP-05-S4. Role and status cannot be changed through this operation.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user, action `user_edited`, before and after (name, masked phone).
- **Data changes:** Updates `users.name`, `users.phone`, `users.version`.
- **UI reference:** Not yet designed (edit user, MOCKUP-COVERAGE §3). Fields follow `docs/ux/mockups/25-onboard-staff.svg`.
- **Non-functional checks:** Concurrency: version check stops two owners overwriting each other. Personal data: old and new phones are masked in the audit entry. Open decision D4: whether existing sessions survive a phone change if sign-in is by phone.
- **Depends on:** EP-05-S4, EP-05-S11, EP-02-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S6: Owner can change a user's role

- **Story ID:** EP-05-S6
- **Title:** Owner can change a user's role
- **As a:** Owner
- **I want:** to pick a different role (Staff, Owner or Karigar) for an existing user and save
- **So that:** a promotion or a change of job takes effect without creating a new account (FR-05-8, BR-05-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao with role `staff`, when the owner changes his role to `owner`, then the user row has role `owner`, the version goes up by 1, and "User deactivated or role changed" is emitted after commit.
  2. Given that change, when Deepak's next request arrives with his old session, then it is refused as `unauthenticated` and his next sign-in lands on route `decisions` (EP-04-S13).
  3. Given a staff user changed to `karigar`, when the change is saved without a linked Karigar record, then the server refuses with "Link this user to a karigar record first." (FR-05-15).
  4. Given a Staff session, when it calls Update User role, then the server returns `forbidden` with "Only the owner can add staff or change a role.".
  5. Given the change would leave no active owner, when it is saved, then it is refused by EP-05-S9.
- **Rules enforced on the server:** Only role `owner` may call Update User role. The new role must be one of the three. The role update, the last-owner guard, the session end (EP-04-S13) and the audit entry run in one transaction. A role change to `karigar` needs a `karigarId`; a change away from `karigar` clears it.
- **Live events emitted / consumed:** emitted: "User deactivated or role changed" (through EP-05-S10).
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user, action `role_changed`, before role, after role.
- **Data changes:** Updates `users.role`, `users.karigarId` where needed, `users.version`; ends rows in `sessions`.
- **UI reference:** Role picker on `docs/ux/mockups/25-onboard-staff.svg` ("WHAT ROLE · THIS SETS EVERYTHING ELSE"). The edit-role screen is not yet designed.
- **Non-functional checks:** Security: the old role's access ends at once. Concurrency: version check plus the last-owner guard in the same transaction. Open question: whether an owner can demote another owner.
- **Depends on:** EP-05-S4, EP-05-S9, EP-05-S10, EP-05-S13, EP-04-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S7: Owner can deactivate a user

- **Story ID:** EP-05-S7
- **Title:** Owner can deactivate a user
- **As a:** Owner
- **I want:** a "Deactivate" action on a user that stops them signing in and ends their open sessions
- **So that:** a person who leaves the shop loses access at once while their past sales and audit history stay (FR-05-9, BR-05-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is active and signed in on the shop device and his own phone, when the owner deactivates him, then his status is `deactivated`, `deactivated at` is set, and both devices return to sign-in within about 1 second once EP-07 delivers the event (epic acceptance criterion 4).
  2. Given Rajesh is deactivated, when he requests a sign-in code, then the response looks the same as for a known phone and no code is delivered (EP-04-S3).
  3. Given Rajesh is deactivated, when the directory is read, then his row is still listed with status Deactivated and his user id is still the actor on his past audit entries.
  4. Given the owner deactivates the only active owner, when it is saved, then it is refused by EP-05-S9.
  5. Given a Staff session, when it calls Update User status, then the server returns `forbidden`.
- **Rules enforced on the server:** Only role `owner` may deactivate. A user row is never deleted. Deactivation, the last-owner guard, Delete All sessions (EP-04-S13) and the audit entry run in one transaction. Deactivating an already deactivated user is refused with "This user is already deactivated.".
- **Live events emitted / consumed:** emitted: "User deactivated or role changed" (through EP-05-S10).
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user, action `user_deactivated`, before status `active`, after status `deactivated`, reason if given.
- **Data changes:** Updates `users.status`, `users.deactivated at`, `users.version`; ends rows in `sessions`.
- **UI reference:** Not yet designed (deactivate and reactivate, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: deactivation ends sessions within about 1 second through the live event (epic section 13). Time: `deactivated at` in UTC. Concurrency: a request in flight is either completed before the change or refused.
- **Depends on:** EP-05-S9, EP-05-S10, EP-05-S11, EP-04-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S8: Owner can reactivate a user

- **Story ID:** EP-05-S8
- **Title:** Owner can reactivate a user
- **As a:** Owner
- **I want:** a "Reactivate" action on a deactivated user
- **So that:** a person who returns can sign in again with their old account and history (FR-05-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma is deactivated, when the owner reactivates him, then his status is `active`, `deactivated at` is cleared and the version goes up by 1.
  2. Given Rajesh is reactivated, when he requests a code for his phone and enters it, then he is signed in and lands on route `today`.
  3. Given another active user now holds Rajesh's phone, when the owner reactivates him, then the server refuses with `validation` on field `phone` and Rajesh stays deactivated.
  4. Given an active user, when reactivate is called, then it is refused with "This user is already active.".
  5. Given a Staff session, when it calls reactivate, then the server returns `forbidden`.
- **Rules enforced on the server:** Only role `owner` may reactivate. The phone must still be unique among active users. The user keeps the role they had when deactivated. No sessions are created; the user signs in normally.
- **Live events emitted / consumed:** None. Reactivation is not in the event catalogue; the directory picks it up on reload.
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user, action `user_reactivated`, before status `deactivated`, after status `active`.
- **Data changes:** Updates `users.status`, `users.deactivated at`, `users.version`.
- **UI reference:** Not yet designed (deactivate and reactivate, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Concurrency: version check. Security: reactivation does not revive old sessions.
- **Depends on:** EP-05-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S9: System can refuse to remove the last active owner

- **Story ID:** EP-05-S9
- **Title:** System can refuse to remove the last active owner
- **As a:** System
- **I want:** a guard that counts active owners inside the same transaction as any deactivation or role change, and refuses if the result would be zero
- **So that:** the shop is never left with nobody who can manage users or clear mismatches (FR-05-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth is the only active owner, when he changes his own role to `staff`, then the server refuses with "The shop needs at least one active owner." and his role stays `owner` (epic acceptance criterion 5).
  2. Given the same, when he deactivates himself, then the same refusal is returned and nothing changes.
  3. Given two active owners, when one demotes the other, then the change is allowed if the open question on demoting another owner allows it, and the guard passes because one owner remains.
  4. Given two active owners who each try to demote the other at the same moment, when both are handled, then exactly one succeeds and the other is refused by the guard.
- **Rules enforced on the server:** The count of active owners and the update run in one transaction with a row lock or serialisable isolation, so two parallel changes cannot both pass. The guard runs on Update User role and Update User status.
- **Live events emitted / consumed:** None. A refused change emits nothing.
- **Audit entry written:** No. A refused change writes nothing.
- **Data changes:** None in the product database.
- **UI reference:** No screen. The refusal sentence shows on the edit-user screen, which is not yet designed.
- **Non-functional checks:** Concurrency: the last-owner guard runs inside the same transaction (epic section 13). Open question: can there be more than one owner, and can an owner demote another owner.
- **Depends on:** EP-03-S4, EP-03-S6, EP-02-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S10: System can end a user's sessions live when they are deactivated or re-roled

- **Story ID:** EP-05-S10
- **Title:** System can end a user's sessions live when they are deactivated or re-roled
- **As a:** System
- **I want:** deactivation and role change to call Delete All sessions (EP-04-S13) in the same transaction and to emit "User deactivated or role changed" with the user id and reason after commit
- **So that:** EP-04 ends the sessions, EP-07 drops the user's subscriptions and EP-20 signs the karigar phone out, all within about a second (FR-05-12, BR-05-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the owner deactivates Vijay Kumar, when the transaction commits, then exactly one "User deactivated or role changed" event is emitted with user id, reason `deactivated` and time.
  2. Given the transaction rolls back, when the change fails, then no event is emitted and no session ends.
  3. Given Deepak Rao's role changes, when the event is emitted, then it carries reason `role_changed` and the new role, and his sessions have `end reason` `role_changed`.
  4. Given the live channel from EP-07 is not yet built, when the event is emitted, then the user's next request is still refused as `unauthenticated` because the sessions have ended.
  5. Given the event payload, when it is inspected, then it holds no phone number or name.
- **Rules enforced on the server:** The event is emitted only after commit, never inside a transaction that may roll back. Ending sessions and the user change share one transaction. Only the server emits this event.
- **Live events emitted / consumed:** emitted: "User deactivated or role changed".
- **Audit entry written:** No separate entry. The change itself is audited in EP-05-S6 or EP-05-S7, and the session end in EP-04-S13.
- **Data changes:** Updates `sessions.ended at` and `sessions.end reason`. If events are sent through an outbox, inserts one outbox row (the outbox design belongs to EP-07).
- **UI reference:** No screen. The signed-out state is not yet designed.
- **Non-functional checks:** Security: access ends at once. Performance: open screens return to sign-in within about 1 second once EP-07 is live (PRODUCTION-SCOPE §1). Personal data: the payload carries ids only. Open decision D1: how events are emitted (own channel or managed platform realtime).
- **Depends on:** EP-04-S13, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S11: Owner can see the user directory with role and status

- **Story ID:** EP-05-S11
- **Title:** Owner can see the user directory with role and status
- **As a:** Owner
- **I want:** the `staff-directory` screen to list every user with name, phone, role and status (Active or Deactivated), with a way to open one user
- **So that:** I can see who has access and pick a person to edit, re-role, deactivate or reactivate (FR-05-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth signed in as Owner, when he opens route `staff-directory`, then every user is listed with name, phone, role (Owner, Staff or Karigar) and status, loaded from the server.
  2. Given Rajesh Verma signed in as Staff, when he opens `staff-directory` or calls List Users, then the screen is not shown in his rail and the server returns `forbidden`.
  3. Given more than one page of users, when the list is scrolled, then the next page loads with a cursor (EP-03-S9).
  4. Given the directory is loading, when the server has not answered, then a loading state shows; given the server fails, then an error message with a retry shows.
  5. Given a deactivated user, when the list is shown, then the row says Deactivated and offers Reactivate instead of Deactivate.
- **Rules enforced on the server:** Only role `owner` may call List Users. Karigar users appear with their linked karigar id. Sorting is by name.
- **Live events emitted / consumed:** consumed: "User deactivated or role changed", to update a row while the directory is open, once EP-07 delivers it.
- **Audit entry written:** No. Reading the directory changes nothing.
- **Data changes:** None in the product database.
- **UI reference:** Route `staff-directory` (`src/components/people/StaffDirectory.tsx`). The user list with status is not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Personal data: full phones are shown to the owner only (epic section 13). Performance: the directory loads under 2 seconds. Open decision D7: whether the list is filtered by branch.
- **Depends on:** EP-05-S2, EP-05-S4, EP-03-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S12: User can open an account menu that replaces the role switcher

- **Story ID:** EP-05-S12
- **Title:** User can open an account menu that replaces the role switcher
- **As a:** Staff
- **I want:** the chip at the foot of the rail to open an account menu with my name, my role and "Sign out", and nothing that lets me become someone else
- **So that:** each person acts only as themselves on a shared device (FR-05-13, BR-05-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma signed in as Staff, when he opens the account menu, then it shows "Rajesh Verma", "Staff" and a "Sign out" item, from Read Current user.
  2. Given any signed-in user, when the app is searched, then no screen offers an identity switch; `RoleChip` no longer lists other identities and `StoreProvider.switchIdentity` is removed (epic acceptance criterion 6).
  3. Given Rajesh taps "Sign out", when it completes, then his session on that device ends and the sign-in screen shows (EP-04-S11).
  4. Given Sanjay Seth signed in as Owner, when he opens the menu, then it shows "Sanjay Seth" and "Owner" with no "switch" label (the "Owner · switch" text on mockup 25 is replaced).
  5. Given Read Current user, when it is called, then it returns user id, name, role, landing route and the role's permission list from EP-05-S1, which the web uses to hide buttons.
- **Rules enforced on the server:** Read Current user returns data for the session's user only and accepts no user id parameter. The permission list sent to the web is for display; the server still checks each call (EP-05-S2).
- **Live events emitted / consumed:** consumed: "User deactivated or role changed", so the menu and screens return to sign-in when the user's own account changes.
- **Audit entry written:** No. Opening the menu changes nothing; sign-out is audited in EP-04-S11.
- **Data changes:** None in the product database. Removes `switchIdentity` and the identity list from the web.
- **UI reference:** `src/components/ui/RoleChip.tsx` at the rail foot; account menu not yet designed (MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: no identity switch reachable from any route. Performance: the menu opens without a server round trip after the first Read Current user.
- **Depends on:** EP-04-S6, EP-04-S11, EP-05-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S13: Owner can link a karigar user to a karigar record

- **Story ID:** EP-05-S13
- **Title:** Owner can link a karigar user to a karigar record
- **As a:** Owner
- **I want:** to set the `karigarId` of a user with role `karigar` to one Karigar record, such as KG-04
- **So that:** the karigar sees exactly their own jobs when they sign in on the job portal (FR-05-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given a karigar user Lakshmi Devi and Karigar record KG-04, when the owner links them, then `users.karigarId` is KG-04 and her job list shows only KG-04 jobs.
  2. Given KG-04 is already linked to another active user, when the owner links a second user to it, then the server refuses with "This karigar already has an account." unless the shared-phone question is decided otherwise.
  3. Given a user with role `staff`, when a link to a karigar record is attempted, then the server refuses with "Only a karigar user can be linked to a karigar record.".
  4. Given a Karigar record id that does not exist, when the link is saved, then the server returns `not_found`.
  5. Given a Staff session, when it calls the link operation, then the server returns `forbidden`.
- **Rules enforced on the server:** Only role `owner` may link. A karigar user links to exactly one Karigar record, and one Karigar record to at most one active user. The link uses the user's `version`. Prototype ids such as `KG-04` stay as the karigar reference.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-05-S14): actor, time, entity user, action `karigar_linked`, before and after `karigarId`.
- **Data changes:** Updates `users.karigarId` and `users.version`; uses the foreign key from `users.karigarId` to `karigars` (EP-02-S4).
- **UI reference:** Not yet designed. The karigar onboarding screen is `docs/ux/mockups/24-onboard-karigar.svg` (EP-16).
- **Non-functional checks:** Security: a wrong link would show one karigar another's jobs, so the link is owner-only and audited. Open question: whether linking happens in one step with karigar onboarding in EP-16 or in two. Open question: whether two karigars may share one phone.
- **Depends on:** EP-05-S4, EP-05-S3, EP-02-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-05-S14: System can audit every user lifecycle change

- **Story ID:** EP-05-S14
- **Title:** System can audit every user lifecycle change
- **As a:** System
- **I want:** add, edit, role change, deactivate, reactivate and karigar link to each write an audit entry with actor, time, user id, action and before and after values, in the same transaction as the change
- **So that:** the owner can later see who gave or took away whose access, and when (FR-05-16)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth adds Deepak Rao at 11:15 IST, when the audit entries are read, then one has actor Sanjay Seth, time 05:45 UTC, entity Deepak's user id, action `user_added` and after values name, role `staff` and masked phone "+91 ••••• 71145".
  2. Given Deepak's role changes from `staff` to `owner`, when the entries are read, then one has action `role_changed`, before role `staff` and after role `owner`.
  3. Given a deactivation that is refused by the last-owner guard, when the entries are read, then no entry exists for it.
  4. Given each of `user_added`, `user_edited`, `role_changed`, `user_deactivated`, `user_reactivated` and `karigar_linked`, when a test runs the operation, then exactly one entry with that action is written.
  5. Given any of these entries, when it is searched for a full phone number, then none appears.
- **Rules enforced on the server:** The entry is written in the same transaction as the change (EP-03-S6), so a rolled-back change leaves no entry. Actor and time come from `Ctx` (EP-03-S3). Entries are append-only. Phones are masked before writing.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity user, action, before, after, reason where given.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). No schema change. The audit reader screen is EP-06.
- **UI reference:** No screen in this story. Entries appear on the audit screen built in EP-06.
- **Non-functional checks:** Audit: every user lifecycle change has before and after values (epic section 13). Personal data: phones masked. Time: stored in UTC.
- **Depends on:** EP-04-S14, EP-02-S11, EP-03-S3, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D4: does the sign-in method change what the owner must enter when adding a user (phone only, or phone and email)? (EP-05-S4, S5)
- D7: is a user assigned to a branch ("Which counter / branch" on mockup 25), and does that limit what they see? (EP-05-S4, S11)
- Can there be more than one owner? Can an owner demote another owner? (EP-05-S6, S9)
- How is a karigar user linked to a Karigar record when the karigar is onboarded in EP-16: one step or two? (EP-05-S13)
- G12: who may change which setting, given `setSetting` has no owner check today? (EP-05-S1)
- Should staff ids be kept on sales for attribution (EP-43 and SCOPE-ANALYSIS Q10)? (EP-05-S4)
- Can two users share one phone (karigar workshops)? (EP-05-S4, S13)
