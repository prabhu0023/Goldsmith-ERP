# EP-45: Shop setup wizard · stories

Epic document: [EP-45 Shop setup wizard](../epics/EP-45-shop-setup-wizard.md)

Role note: stories where the server gates, records or audits setup on its own use "System". Stories where a person fills in a step use "Owner": the shop owner runs the whole wizard, steps 1 and 2 with the setup key before his account exists, and steps 3 to 5 signed in. Staff and karigars do not use the wizard; they are invited in step 5.

Numbering note: this epic is EP-45 so that nothing else is renumbered. It belongs to Layer B and milestone M2, and every story here depends only on stories in this epic or in lower-numbered epics.

---

## EP-45-S1: System can show the setup wizard only until setup is complete

- **Story ID:** EP-45-S1
- **Title:** System can show the setup wizard only until setup is complete
- **As a:** System
- **I want:** a Read Setup status operation, a server-side setup gate that sends every route to the wizard while the shop's `setup completed at` is empty, and a Check Setup key operation that opens steps 1 and 2 only for a caller holding the one-time setup key from environment configuration
- **So that:** a fresh installation can be set up once by the owner, nobody else can claim it, and after setup the wizard and its operations are closed for good (FR-45-1, FR-45-2, FR-45-9, BR-45-1, BR-45-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a fresh installation with no shop record, when anyone opens any route such as `stock`, then the app shows the setup wizard asking for the setup key, and Read Setup status returns `not_started` (epic acceptance criterion 1).
  2. Given the wizard, when the setup key "wrong-key" is entered, then the server refuses with "That setup key is not right." and nothing is created; given the right key, then step 1 opens.
  3. Given a fresh installation, when any feature operation other than setup status, setup key, sign-in and activation is called, then the server refuses with code `rule_refused` and "Finish shop setup first."
  4. Given setup is complete, when anyone opens the wizard route or calls Check Setup key with the right key, then the server refuses with `forbidden` and the app opens sign-in or the user's home instead (epic acceptance criterion 7).
  5. Given the setup key, when the server log, the audit log and the database are searched for it, then it does not appear.
- **Rules enforced on the server:** The gate is checked on the server on every request, not by hiding screens. The setup key comes only from environment configuration (EP-01-S6) and is compared in constant time. A successful key check gives a short-lived setup session that is valid only for steps 1 and 2 and only while setup is not complete. Once `setup completed at` is set, every setup operation returns `forbidden`, whatever key is sent.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes for each refused key and each opened setup session (through EP-45-S9): actor "setup", time, action `setup_key_refused` or `setup_session_opened`, device label. Never the key.
- **Data changes:** Migration creates `setup_progress` (shop ID, step, completed at, completed by, skipped). Reads `shops.setup completed at` (EP-02-S3). Adds Read Setup status and Check Setup key to the shared contract (EP-03-S1).
- **UI reference:** Not yet designed (setup wizard, MOCKUP-COVERAGE §3). Step layout reuses `src/components/ui/StepFrame.tsx`.
- **Non-functional checks:** Security: the gate and key are server checks; the key is never logged. Performance: Read Setup status answers fast enough for the first screen to load under 2 seconds. Open question: whether a setup key from environment configuration is the accepted guard (epic section 17).
- **Depends on:** EP-02-S3, EP-03-S1, EP-03-S2, EP-03-S4, EP-01-S6, EP-08-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S2: Owner can enter the shop details: name, address, GSTIN and logo

- **Story ID:** EP-45-S2
- **Title:** Owner can enter the shop details: name, address, GSTIN and logo
- **As a:** Owner
- **I want:** step 1 of the wizard, where I enter the shop name, the address, the GSTIN if the shop has one, and upload the shop logo
- **So that:** the one shop record exists, every later record can carry its shop ID, and screens that say "All branches" or "Main showroom" on the mockups show the shop's real name (FR-45-3, FR-45-12, BR-45-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth holds a setup session, when he enters name "JGD Jewellers", address "12 Usman Road, T. Nagar, Chennai 600017" and GSTIN "33ABCDE1234F1Z5" and saves, then exactly one shop record is stored with those values and step 1 is marked done (epic acceptance criterion 2).
  2. Given an empty name or address, when he saves, then the server returns `validation` with the field name and nothing is stored.
  3. Given GSTIN "33ABC", when he saves, then the server returns `validation` on field `gstin` with "Enter the 15-character GSTIN, or leave it empty."; given GSTIN left empty, then the shop is stored without one.
  4. Given he uploads a 400 KB PNG logo, when it is stored, then the shop record holds its file id; given a 12 MB file or a PDF, then it is refused by the EP-09 size and type rules and the shop is still saved without a logo.
  5. Given a shop record already exists, when step 1 is called again from another browser, then the server refuses with "Setup is already in progress or done." and no second shop is created (D7).
  6. Given step 1 is saved, when the `locations` table is read, then exactly one location named "Main shop" exists for the new shop, created in the same transaction as the shop record (D7).
- **Rules enforced on the server:** Callable only with a setup session while setup is not complete (EP-45-S1). Name and address are required; GSTIN is optional and, if given, must match the 15-character GSTIN format. The insert runs in one transaction with a unique guard so only one shop can exist in v1. The logo goes through EP-09 storage and its file rules. The shop ID is generated by the server.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-45-S9): actor "setup", time, entity shop, action `shop_created`, after (name, address, GSTIN, logo file id).
- **Data changes:** Inserts the one row in `shops` (EP-02-S3); updates `setup_progress` step 1. Stores the logo through EP-09. Inserts the default `locations` row "Main shop" (EP-02-S3) in the same transaction.
- **UI reference:** Not yet designed (setup wizard step 1, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Concurrency: two parallel step 1 calls create one shop. Performance: the step loads under 2 seconds on a shop connection. Open question: whether GSTIN is required (epic section 17; proposed optional).
- **Depends on:** EP-45-S1, EP-02-S3, EP-03-S2, EP-03-S6, EP-09-S1, EP-09-S3, EP-09-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S3: Owner can create the owner account and get the activation email

- **Story ID:** EP-45-S3
- **Title:** Owner can create the owner account and get the activation email
- **As a:** Owner
- **I want:** step 2 of the wizard, where I enter my name, phone and email, and then get an activation email that lets me set my own password
- **So that:** the shop has its one owner, created by the wizard and not by a developer command, and no password is ever sent to me (FR-45-4, BR-45-2, BR-45-5, BR-45-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given step 1 is done, when Sanjay Seth enters name "Sanjay Seth", phone "+91 98410 33333" and email "sanjay@jgd-jewellers.example" and saves, then EP-04-S1 creates one owner with status `pending_activation` for the shop, EP-04-S10 issues an activation link valid for 24 hours, and one email goes to that address (epic acceptance criterion 3).
  2. Given the save succeeded, when the screen updates, then it says "Check your email to set your password." with the masked address "s•••@jgd-jewellers.example" and a "Resend email" button.
  3. Given the owner has not activated, when the setup session holder taps "Resend email" or corrects the email and saves, then a new link goes out and the earlier link stops working.
  4. Given an owner already exists, when step 2 is called again, then it is refused with "The first owner has already been created." (EP-04-S1) and no user is written.
  5. Given phone "98410" or email "sanjay@", when he saves, then the server returns `validation` with the field name and nothing is created.
- **Rules enforced on the server:** Callable only with a setup session while setup is not complete and after step 1 is done. The owner is created only through EP-04-S1, with the shop ID from the shop record. The activation link is issued only through EP-04-S10 and sent by the email sender (EP-11-S12). No password is created or emailed. Resend and email correction are allowed only while the owner is `pending_activation`.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-45-S9 and EP-04-S14): actor "setup", time, entity user, action `first_owner_created`, then `activation_link_sent`, with phone and email masked.
- **Data changes:** Inserts the owner in `users` (through EP-04-S1) and a row in `password_links` (through EP-04-S10); updates `setup_progress` step 2.
- **UI reference:** Not yet designed (setup wizard step 2 and the "check your email" screen, MOCKUP-COVERAGE §3). Field labels follow `docs/ux/mockups/25-onboard-staff.svg`, plus an email field.
- **Non-functional checks:** Security: no password in any email; link single use with 24-hour expiry (EP-04-S10). Personal data: phone and email masked on screen and in audit. Open decision D4a: the email provider; staging uses the stub mailbox (EP-04-S4).
- **Depends on:** EP-45-S1, EP-45-S2, EP-04-S1, EP-04-S4, EP-04-S10, EP-11-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S4: Owner can resume setup after activating his account and signing in

- **Story ID:** EP-45-S4
- **Title:** Owner can resume setup after activating his account and signing in
- **As a:** Owner
- **I want:** after I set my password from the activation email and sign in with my phone and password, to land back in the wizard at the first unfinished step
- **So that:** steps 3 to 5 run as the real signed-in owner with his permissions, and closing the browser never loses finished steps (FR-45-5, FR-45-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given steps 1 and 2 are done and Sanjay Seth has set his password, when he signs in with "+91 98410 33333" and his password, then the app opens the wizard at step 3 instead of `decisions` (epic acceptance criterion 4).
  2. Given Sanjay finished step 3 and closed the browser, when he signs in again, then the wizard opens at step 4 with step 3's scales shown as done.
  3. Given setup is not complete, when the setup session from steps 1 and 2 is used for a step 3 call, then the server refuses, because steps 3 to 5 need the owner's own session.
  4. Given setup is not complete, when a staff user invited in step 5 activates and signs in before setup is finished, then he sees "The shop is still being set up. Try again later." and no other screen.
- **Rules enforced on the server:** Steps 3 to 5 require a session of the shop's owner (EP-05-S2). Progress is read from `setup_progress`, never from the browser. The landing route while setup is not complete is the wizard for the owner and a waiting screen for everyone else.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Resuming changes nothing; sign-in itself is audited by EP-04-S14.
- **Data changes:** None in the product database. Reads `setup_progress`.
- **UI reference:** Not yet designed (setup wizard resume and the waiting screen, MOCKUP-COVERAGE §3).
- **Non-functional checks:** Security: the setup session cannot be used past step 2. Performance: the wizard opens within 2 seconds of sign-in.
- **Depends on:** EP-45-S1, EP-45-S3, EP-04-S3, EP-04-S5, EP-04-S6, EP-05-S2, EP-08-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S5: Owner can register the shop's scales and their readability

- **Story ID:** EP-45-S5
- **Title:** Owner can register the shop's scales and their readability
- **As a:** Owner
- **I want:** step 3 of the wizard, where I add each balance in the shop with its name, its smallest step (readability) and its heaviest load
- **So that:** the exact-match rule can compute the ceiling from real readabilities from the first parcel, and staff never type a readability (FR-45-6, BR-45-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on step 3, when he adds "Bench balance" reading 0.0001 g up to 600 g, then EP-14-S3 stores a scale with readability `1` and capacity `6000000` for the shop, and it is listed on the step.
  2. Given he also adds "Platform scale" reading 0.01 g up to 30000 g, when the list shows, then both scales appear with their readability and capacity in grams to four decimals.
  3. Given no scale is registered, when he taps "Next", then the wizard refuses with "Add at least one scale." (epic acceptance criterion 5).
  4. Given a readability of 0 or more than four decimals such as 0.00005, when he saves, then the scale is refused by the EP-14 rules and nothing is stored.
  5. Given at least one scale, when he taps "Next", then step 3 is marked done.
- **Rules enforced on the server:** Owner session only, while setup is not complete (EP-45-S4). Scales are created only through EP-14 Create Scale with its validation and audit. Step 3 is done only when the shop has at least one active scale. Readability and capacity are stored as integers in units of 0.0001 g.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: each scale is audited by EP-14-S12; the step itself through EP-45-S9 with action `setup_step_done`, step 3.
- **Data changes:** Inserts into `scales` (through EP-14-S3); updates `setup_progress` step 3. Each scale carries `location_id` "Main shop", set by the server (EP-02-S4).
- **UI reference:** Not yet designed (setup wizard step 3). The rule text reuses `docs/ux/mockups/14-match-rule-any-parcel.svg`; the form follows `src/components/settings/ScalesRules.tsx` (route `scales`).
- **Non-functional checks:** Precision: readability and capacity are integers of 0.0001 g; the four-decimal display comes from the EP-02-S2 helpers. Open item: the true readabilities of the shop's scales are confirmed again at launch (EP-41-S5).
- **Depends on:** EP-45-S4, EP-14-S1, EP-14-S3, EP-14-S12, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S6: Owner can set the lead response time and opening hours

- **Story ID:** EP-45-S6
- **Title:** Owner can set the lead response time and opening hours
- **As a:** Owner
- **I want:** step 4 of the wizard, where I confirm or change the lead response time (8 hours unless I change it) and enter the shop's opening and closing times for each weekday
- **So that:** the lead timer and the shop hours are right from the first day, without hunting for the settings page (FR-45-7, BR-45-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on step 4, when the step loads, then the lead response time shows 8 hours, read from the settings row created with the shop (EP-13-S1).
  2. Given he changes it to 6 and saves, when the server checks it, then EP-13-S4 stores `leadSlaHours` 6 with an audit entry; given 0.5, then it refuses with "The lead timer must be at least 1 hour."
  3. Given he sets Monday to Saturday 10:00 to 20:00 and Sunday closed and saves, then EP-13-S11 stores seven ShopHours rows in Asia/Kolkata local time.
  4. Given a closing time before an opening time, when he saves, then it is refused as a validation error and step 4 stays not done.
  5. Given both values are saved, when he taps "Next", then step 4 is marked done.
- **Rules enforced on the server:** Owner session only, while setup is not complete. Values are written only through EP-13 Update Setting and Update Shop hours, with their validation, version check and audit. Whether the lead timer counts shop hours is still A2; the hours are stored either way.
- **Live events emitted / consumed:** emitted: "Setting changed" (proposed, G26) through EP-13-S14.
- **Audit entry written:** Yes: each change by EP-13-S3; the step itself through EP-45-S9 with action `setup_step_done`, step 4.
- **Data changes:** Updates `settings.leadSlaHours` (EP-13-S4) and inserts ShopHours rows (EP-13-S11); updates `setup_progress` step 4.
- **UI reference:** Not yet designed (setup wizard step 4). Wording reuses `docs/ux/mockups/13-notifications-escalation.svg` ("A lead is late after 8 hours").
- **Non-functional checks:** Time: opening hours are local Asia/Kolkata times, converted to UTC only when scheduling. Open decision A2: shop hours or clock hours for the lead timer.
- **Depends on:** EP-45-S4, EP-13-S1, EP-13-S4, EP-13-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S7: Owner can invite the first staff and karigars

- **Story ID:** EP-45-S7
- **Title:** Owner can invite the first staff and karigars
- **As a:** Owner
- **I want:** step 5 of the wizard, where I add my first staff and karigars with name, phone, email and role, and each gets an activation email; or skip the step and add people later
- **So that:** the people who work in the shop can sign in on day one, each with their own password (FR-45-8, BR-45-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth on step 5, when he adds Rajesh Verma, phone "+91 98410 11111", email "rajesh.verma@example.com", role Staff, then EP-05-S4 creates the user with status `pending_activation` and an activation email goes to that address.
  2. Given he adds Lakshmi Devi, phone "+91 98400 10101", email "lakshmi.devi@example.com", role Karigar, then her user account is created the same way, and the step says her karigar details (specialty, allowance) are added later on `karigars` (EP-16).
  3. Given he enters a phone already used by Rajesh, or leaves the email empty, when he saves, then the server returns `validation` on that field and no user is written.
  4. Given he picks Owner as a role, when he saves, then the server refuses with "The shop already has an owner." (EP-05-S9).
  5. Given he taps "Skip for now", when the step closes, then step 5 is marked done with the skipped flag and no user is created.
- **Rules enforced on the server:** Owner session only, while setup is not complete. Users are created only through EP-05 Create User, with its validation (phone unique within the shop, email required), the one-owner guard and audit. Roles offered are Staff and Karigar. Activation links go through EP-04-S10; no password is emailed.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: each user by EP-05-S14 (`user_added`); the step through EP-45-S9 with action `setup_step_done` or `setup_step_skipped`, step 5.
- **Data changes:** Inserts into `users` and `password_links` (through EP-05-S4 and EP-04-S10); updates `setup_progress` step 5.
- **UI reference:** Not yet designed (setup wizard step 5). Fields follow `docs/ux/mockups/25-onboard-staff.svg` (route `staff-new`), plus an email field.
- **Non-functional checks:** Personal data: phones and emails shown only to the owner and masked in audit. Concurrency: two adds with the same phone create one user (EP-05-S4).
- **Depends on:** EP-45-S4, EP-05-S4, EP-05-S9, EP-05-S14, EP-04-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S8: Owner can finish setup so the wizard is never shown again

- **Story ID:** EP-45-S8
- **Title:** Owner can finish setup so the wizard is never shown again
- **As a:** Owner
- **I want:** a "Finish setup" button on the last step that checks every required step is done, closes the wizard and takes me to my home
- **So that:** the shop starts working and the wizard can never be run again by anyone (FR-45-9, BR-45-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given steps 1 to 4 are done and step 5 is done or skipped, when Sanjay Seth taps "Finish setup", then `shops.setup completed at` is set, he lands on `decisions`, and every route now opens normally (epic acceptance criterion 6).
  2. Given step 3 has no scale, when "Finish setup" is called, then the server refuses with "Add at least one scale." and setup stays open.
  3. Given setup is finished, when Rajesh Verma, who was invited in step 5, activates and signs in, then he lands on `today`.
  4. Given setup is finished, when anyone opens the wizard route or calls any setup operation, including Finish setup again, then the server refuses with `forbidden` (epic acceptance criterion 7).
  5. Given two "Finish setup" calls at the same moment, when both are handled, then one sets the time and the other is refused; the time is never overwritten.
- **Rules enforced on the server:** Owner session only. Finish is allowed only when steps 1 to 4 are done and step 5 is done or skipped. Setting `setup completed at` is one-way: no operation clears it. After it is set, the setup gate (EP-45-S1) refuses every setup call and the setup key stops working.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes (through EP-45-S9): actor the owner, time, entity shop, action `setup_completed`.
- **Data changes:** Updates `shops.setup completed at`.
- **UI reference:** Not yet designed (setup wizard finish step).
- **Non-functional checks:** Security: setup cannot be reopened from the browser or the API. Concurrency: one-way update guarded in one transaction.
- **Depends on:** EP-45-S1, EP-45-S2, EP-45-S3, EP-45-S4, EP-45-S5, EP-45-S6, EP-45-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-45-S9: System can audit every setup step

- **Story ID:** EP-45-S9
- **Title:** System can audit every setup step
- **As a:** System
- **I want:** each setup step (shop created, first owner created, each step done or skipped, setup completed, setup session opened, setup key refused) to write an audit entry in the same transaction, with actor "setup" or the owner, time and the values stored
- **So that:** the owner can later see how and when the shop was set up and by whom, and no setup action leaves no trace (FR-45-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth finishes step 1 at 10:05 IST, when the audit log is read, then it has an entry with actor "setup", time 04:35 UTC, entity shop, action `shop_created` and the name, address and GSTIN.
  2. Given step 2, when the entry is read, then action `first_owner_created` shows the owner's name with phone and email masked, for example "+91 ••••• 33333".
  3. Given steps 3 to 5 and Finish, when the entries are read, then each has actor Sanjay Seth and action `setup_step_done`, `setup_step_skipped` or `setup_completed` with the step number.
  4. Given a step's transaction rolls back, when it ends, then no audit entry is written for it.
  5. Given any setup entry, when it is searched for the setup key or a link, then neither appears.
- **Rules enforced on the server:** The entry is written in the same transaction as the step (EP-06-S2). Actor is "setup" for steps 1 and 2 and the owner's user for later steps (EP-03-S3). Entries are append-only. Phones and emails are masked; the setup key and links are never written.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (shop, user or setup step), action, after values, step number.
- **Data changes:** Inserts into `audit_entries` (EP-02-S11). No schema change.
- **UI reference:** No screen in this story. Entries appear on the audit screen built in EP-06.
- **Non-functional checks:** Audit: every setup step has an entry. Personal data: phones and emails masked. Time: stored in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-02-S11, EP-03-S3, EP-03-S6, EP-06-S1, EP-06-S2, EP-06-S3
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- Setup key: confirm that a one-time key from environment configuration is acceptable as the guard for steps 1 and 2 (proposed). (EP-45-S1, S2, S3)
- Is GSTIN required, or optional for a shop that is not yet registered? (Proposed: optional, format-checked when given.) (EP-45-S2)
- Opening hours: are they used by the lead timer (A2: shop hours or clock hours), or only stored for display until A2 is answered? (EP-45-S6)
- Can the owner change the shop details (name, address, GSTIN, logo) after setup, and on which screen? (Proposed: on the shop settings page, EP-13; not designed.) (EP-45-S2)
- Should step 5 also create the karigar master record (specialty, allowance), or only the karigar's user account? (Proposed: account only; the record is added on `karigars`, EP-16.) (EP-45-S7)
- D4a: which email provider sends the activation emails? (EP-45-S3, S7)
