# EP-33: Wishes · stories

Epic document: [EP-33 Wishes](../epics/EP-33-wishes.md)

Role note: stories where the server stores, builds, checks, sends or audits on its own use "System"; the 9 am run acts as the System actor "Scheduler" (EP-06-S6). Stories on the `wishes` screen use "Staff", because staff work the queue and the owner can do everything staff can. Choosing the sender identities and editing the templates are Owner only. Karigars are refused every wishes operation. Wishes carry no price and no weight (BR-33-7). The seed people are Sanjay Seth (Owner) and Rajesh Verma (Staff); the seed customers are Priya Malhotra (VIP Bridal, birthday, opted in), Arjun & Kavya (High net worth, anniversary, opted in) and Ravi Shankar (Festive collector, birthday, not opted in). The mockup's second sender "Priya (Manager)" depends on G20, so the stories name the second identity neutrally.

---

## EP-33-S1: System can store wishes, templates and sender identities

- **Story ID:** EP-33-S1
- **Status:** Not started
- **Title:** System can store wishes, templates and sender identities
- **As a:** System
- **I want:** the `wishes` table from EP-02-S12 extended to hold one row per customer, occasion and year with sender identity, template version, times, provider message id, delivery status, failure reason and who sent it; a `wish_templates` table with one versioned text per occasion; and the EP-12 SenderIdentity table extended so two identities can be marked as wish senders under the owner
- **So that:** wishes, the edited message and the chosen senders survive a reload instead of living in `WishRecord` entries and on-screen text, and the one-per-year rule has a place to live (FR-33-7, FR-33-8, FR-33-9, FR-33-11, BR-33-4, BR-33-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given an empty database, when migrations run, then `wishes` has columns id, customer id, occasion (`birthday` or `anniversary`), occasion year, sender identity id, template id, template version, queued at, sent at, provider message id, delivery status (`queued`, `sent`, `delivered`, `failed`), failure reason and sent by (user id or System), with a unique constraint on (customer id, occasion, occasion year).
  2. Given migrations have run, when `wish_templates` is read, then it holds one `birthday` row at version 1 with the text "Happy birthday {name}! Warm wishes from all of us at Jai Gulab Dev. Do visit — we would love to show you something special." and one `anniversary` row at version 1, each with the approved provider template name, edited by and edited at.
  3. Given the SenderIdentity rows from EP-12-S1, when the migration runs, then each row also has a linked user id (nullable), an active flag and a wish-sender slot (1, 2 or empty), and a database check allows at most two rows with a wish-sender slot.
  4. Given a row is inserted into `wishes` with occasion `christmas`, delivery status `read`, or a customer id that does not exist, when it is written, then the database refuses it.
  5. Given the prototype seed (EP-02-S13), when it is loaded, then the existing `WS-` records become `wishes` rows with occasion year from their `at` date in Asia/Kolkata and delivery status `sent`.
- **Rules enforced on the server:** Enum checks on occasion and delivery status. Foreign keys from wishes to customers, sender identities and wish templates. The unique key (customer id, occasion, occasion year) is the store for the one-wish-per-year rule (EP-33-S10). Times are stored in UTC. The server sets id, queued at and sent by; no client field sets them. No price, amount or weight column on any of these tables (BR-33-7).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Creating tables writes no entry; changes to these rows are audited by EP-33-S13.
- **Data changes:** Migration on `wishes` (EP-02-S12) adds occasion year, sender identity id, template id, template version, queued at, sent at, provider message id, delivery status, failure reason, sent by, and the unique key. Migration creates `wish_templates` (id, occasion, text, version, provider template name, edited by, edited at) and seeds version 1 of each occasion. Migration on SenderIdentity (EP-12-S1) adds linked user id, active and wish-sender slot. Each table has the shop ID (EP-02-S3, D7).
- **UI reference:** No screen.
- **Non-functional checks:** Personal data: `wishes` holds customer ids only, never phones or dates of birth; those stay on `customers` (EP-17-S1). Time: all times in UTC. Open decision G20: whether a sender identity is tied to a user; linked user id is nullable until it is answered. D7 is decided: one shop, so sender identities and templates are per shop.
- **Depends on:** EP-02-S1, EP-02-S12, EP-02-S13, EP-12-S1, EP-17-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S2: System can build today's and tomorrow's wishes queue

- **Story ID:** EP-33-S2
- **Status:** Not started
- **Title:** System can build today's and tomorrow's wishes queue
- **As a:** System
- **I want:** a List Wishes queue operation that returns every active customer whose `dob` or `anniversary` falls today or tomorrow in Asia/Kolkata, one row per customer and occasion, found through a month-and-day index rather than a scan of every customer
- **So that:** birthdays and anniversaries come up on their own each morning, taken straight from the customer profile (FR-33-1, BR-33-1, BR-33-6, BR-33-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given it is 08:30 on 14 March in Asia/Kolkata (03:00 UTC), Priya Malhotra's `dob` is 14 March 1992, Arjun & Kavya's `anniversary` is 15 March 2015 and Ravi Shankar's `dob` is 14 March 1988, when Rajesh Verma calls List Wishes queue, then it returns 3 rows: Priya (birthday, today), Ravi (birthday, today) and Arjun & Kavya (anniversary, tomorrow), and the heading count is "COMING UP · 3".
  2. Given it is 23:45 on 13 March in Asia/Kolkata (18:15 UTC on 13 March), when the queue is read, then "today" is 13 March and "tomorrow" is 14 March, not the UTC dates.
  3. Given a customer has both a birthday and an anniversary today, when the queue is read, then two rows are returned, one per occasion.
  4. Given a customer with `status` `erased` (EP-17-S13) or with no `dob` and no `anniversary`, when the queue is read, then no row is returned for them.
  5. Given 5,000 customers on staging, when List Wishes queue is called, then it answers in under 2 seconds on a shop connection and the query plan uses the month-and-day index.
- **Rules enforced on the server:** List Wishes queue is Staff and Owner only; karigars are refused (EP-05-S2). Day and month are compared in Asia/Kolkata (EP-10-S10), ignoring the year. Not-opted-in customers are included; consent is shown by EP-33-S3 and enforced at send time by EP-33-S5. Each row carries whether a wish for that customer, occasion and year already exists.
- **Live events emitted / consumed:** None. The queue is read on load and refetched after the user's own send (EP-08-S7).
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** Migration adds an index on the month and day of `customers.dob` and of `customers.anniversary` (an expression index or stored month-day columns). Adds List Wishes queue to the shared contract (EP-03-S1). Replaces `wishesDueToday` and `isMonthDayToday` in the browser with the server read.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("COMING UP · 3", "Priya Malhotra · birthday today", "Arjun & Kavya · anniversary tomorrow", "Ravi Shankar · birthday today").
- **Non-functional checks:** Time: today and tomorrow are Asia/Kolkata dates from the server clock. Performance: under 2 seconds, indexed by month and day (epic section 13). Personal data: the response carries name, group and occasion, not the full date of birth. Open question: whether a 29 February birthday appears on 28 February or 1 March in other years; until answered, it appears only when 29 February exists.
- **Depends on:** EP-33-S1, EP-17-S1, EP-17-S13, EP-10-S10, EP-05-S2, EP-03-S1, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S3: Staff can see each customer's occasion and consent state

- **Story ID:** EP-33-S3
- **Status:** Not started
- **Title:** Staff can see each customer's occasion and consent state
- **As a:** Staff
- **I want:** each row on `wishes` to show the customer's initials, name and occasion with "today" or "tomorrow", their group, their last purchase or piece count, a consent line that matches the auto-send setting, and the one action that fits the row
- **So that:** I can see at a glance who will be wished on their own, who needs me, and why (FR-33-2, BR-33-1, BR-33-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra is opted in, her birthday is today, she last took home a Polki kada and `autoSendWishes` is true, when Rajesh Verma opens `wishes` before 09:00, then her row reads "Priya Malhotra · birthday today", "VIP Bridal · last took home a Polki kada" and "opted in · will auto-send at 9 am unless you send now", with "Send now".
  2. Given Arjun & Kavya are opted in, their anniversary is tomorrow and they have 4 pieces in their history, when the row is shown, then it reads "High net worth · 4 pieces with us" and "opted in · scheduled for 9 am tomorrow", with "Preview".
  3. Given `autoSendWishes` is false, when the same rows are shown, then Priya's line reads "opted in · auto-send is off" and Arjun & Kavya's reads "opted in · auto-send is off".
  4. Given Ravi Shankar is not opted in and his birthday is today, when the row is shown, then it reads "Festive collector" and "not opted in to WhatsApp · will not auto-send" (EP-33-S6 owns the action).
  5. Given List Wishes queue has not answered or fails, when `wishes` is shown, then the loading state (EP-08-S3) or the error with "Try again" (EP-08-S4) appears, not an empty list.
- **Rules enforced on the server:** The consent state in each row is the customer's current `optedIn` from the latest consent event (EP-17-S2), read on the server. The last purchase or piece count comes from the customer's piece history (EP-17-S9) by name and count only, never by value. The auto-send state comes from settings (EP-13-S1). The browser does not decide consent or the action.
- **Live events emitted / consumed:** None. Consumed indirectly: "Setting changed" (proposed, G26) refreshes the settings read so the consent line follows the switch (EP-13-S14).
- **Audit entry written:** No. Reads are not audited.
- **Data changes:** None in the product database. Adds group, last purchase name, piece count, consent state and action to each queue row in the shared contract. Moves `src/components/marketing/Wishes.tsx` off `useStore()` onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("VIP Bridal · last took home a Polki kada", "High net worth · 4 pieces with us", "opted in · will auto-send at 9 am unless you send now", "opted in · scheduled for 9 am tomorrow", "Festive collector", "not opted in to WhatsApp · will not auto-send"). The "auto-send is off" line follows the prototype and is not drawn on the mockup.
- **Non-functional checks:** Performance: `wishes` loads under 2 seconds on a shop connection. Personal data: consent shown is the stored state, so an opt-out recorded at the counter shows on the next load. Availability: loading, error, offline and reconnecting states (EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11). Time: "9 am" in the line follows `wishSendTime` if EP-13-S7 makes it a setting.
- **Depends on:** EP-33-S2, EP-17-S2, EP-17-S9, EP-13-S1, EP-13-S14, EP-08-S3, EP-08-S4, EP-08-S10, EP-08-S11, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S4: Staff can send a wish now to opted-in customers

- **Story ID:** EP-33-S4
- **Status:** Not started
- **Title:** Staff can send a wish now to opted-in customers
- **As a:** Staff
- **I want:** to press "Send now" on one row, or select several of today's rows and send them together, so the server creates one wish per customer and occasion and sends it through the approved WhatsApp template from the chosen sender
- **So that:** a customer gets their greeting when I choose, without waiting for 9 am (FR-33-3, FR-33-8, FR-33-10, BR-33-1, BR-33-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra is opted in with a birthday today and no wish this year, when Rajesh Verma presses "Send now" with sender slot 1 (Sanjay) selected, then one `wishes` row is created with occasion `birthday`, occasion year 2026, sent by Rajesh, delivery status `queued`, and EP-12-S3 sends the approved birthday template with {name} filled as "Priya".
  2. Given Rajesh selects Priya and Ravi Shankar (not opted in) and sends, when the server answers, then Priya's wish is sent and Ravi's result is "skipped: not opted in to WhatsApp" (EP-33-S5), and the screen shows both outcomes.
  3. Given Arjun & Kavya's anniversary is tomorrow, when a send for them is called directly, then the server refuses with "This occasion is tomorrow. It can be sent on the day." and no row is created.
  4. Given the network drops after Rajesh presses "Send now" and he retries, when the retry reaches the server with the same idempotency key, then no second wish is created or sent (EP-08-S6, EP-03-S8).
  5. Given the send succeeded, when the queue is refetched (EP-08-S7), then Priya's row shows the sent state from EP-33-S12 and "Send now" is no longer offered.
- **Rules enforced on the server:** Create Wish send is Staff and Owner only; karigars are refused (EP-05-S2). Each customer id must have an occasion today in Asia/Kolkata. Each send passes the consent check (EP-33-S5) and the one-per-year rule (EP-33-S10) in the same transaction that creates the row (EP-03-S6). The sender identity must be one of the two active wish senders (EP-33-S7). The text is the latest approved template version (EP-33-S8). Sending goes through EP-12-S3 only; the provider idempotency key is "wish" plus customer id, occasion and year.
- **Live events emitted / consumed:** None. Wishes are not in the PRODUCTION-SCOPE §1 catalogue (epic section 11).
- **Audit entry written:** Yes, by EP-33-S13: actor, time, entity (wish), action `wish_sent`, customer id, occasion, sender identity, template version.
- **Data changes:** Inserts `wishes` rows. EP-12-S3 inserts OutboundMessage rows with the wish id as source. Adds Create Wish send to the shared contract, replacing `sendWishes` in `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Send now", "SENT FROM · Sanjay (Owner)"). Selecting several rows is not yet designed.
- **Non-functional checks:** Concurrency: two staff pressing "Send now" for Priya at once create one wish (EP-33-S10). Personal data: consent is checked at the moment of sending (epic section 13). Security: role checked on the server. Open decision D8: the provider and which templates are approved; until a wish template is approved the send is refused with the EP-12-S3 sentence.
- **Depends on:** EP-33-S2, EP-33-S3, EP-33-S5, EP-33-S7, EP-33-S8, EP-33-S10, EP-12-S2, EP-12-S3, EP-03-S6, EP-03-S8, EP-05-S2, EP-08-S5, EP-08-S6, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S5: System can refuse a wish to a customer who is not opted in

- **Story ID:** EP-33-S5
- **Status:** Not started
- **Title:** System can refuse a wish to a customer who is not opted in
- **As a:** System
- **I want:** every wish send, from "Send now" or from the 9 am run, to read the customer's current consent at the moment of sending and skip the customer when it is off, with no wish row and no provider call
- **So that:** nobody who has not agreed, or who opted out after the queue was built, gets a WhatsApp message from the shop (FR-33-4, BR-33-3, BR-33-8, epic acceptance criterion 4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Ravi Shankar is not opted in and his birthday is today, when a send for him is requested, then the result is "skipped: not opted in to WhatsApp", no `wishes` row is created and no provider call is made.
  2. Given Priya Malhotra was opted in when the queue loaded at 08:30 and opted out at the counter at 08:45 (EP-17-S7), when the 9 am run reaches her, then she is skipped (epic acceptance criterion 4).
  3. Given Priya replied STOP on WhatsApp and EP-12-S10 switched her consent off, when Rajesh Verma presses "Send now" on her row from a screen loaded earlier, then she is skipped and the screen shows "Priya Malhotra is not opted in to WhatsApp, so no wish was sent." (EP-08-S5).
  4. Given Ravi opts in at the counter at 11:00 (EP-17-S6), when Rajesh sends his birthday wish at 11:05, then it is sent, because no row was created for the earlier skip.
- **Rules enforced on the server:** The check reads `optedIn` from the latest consent event (EP-17-S2) inside the send transaction, not the value in the queue. EP-12-S5 checks again at the provider boundary, so neither path can skip consent. A skip is a result, not an error, so the other customers in a multi-send still go.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. No message is sent and no wish row changes; the consent change itself is audited by EP-17-S14.
- **Data changes:** None in the product database. Reads `customers.optedIn` and `consent_events`.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("not opted in to WhatsApp · will not auto-send"). The skip sentence is not yet designed.
- **Non-functional checks:** Personal data: consent checked at send time and opt-out honoured at once (epic section 13, BR-33-8). Concurrency: an opt-out committed before the send transaction reads consent is honoured.
- **Depends on:** EP-33-S1, EP-17-S2, EP-17-S6, EP-17-S7, EP-12-S5, EP-12-S10, EP-03-S4, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S6: Staff can see "Call instead" for customers not opted in

- **Story ID:** EP-33-S6
- **Status:** Not started
- **Title:** Staff can see "Call instead" for customers not opted in
- **As a:** Staff
- **I want:** a customer who is not opted in to stay in the queue with "Call instead" in place of "Send now", opening the phone dialler with their number, and never to be selectable for a WhatsApp send
- **So that:** I can still greet them another way while the shop never messages them without consent (FR-33-5, BR-33-3, epic acceptance criterion 2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Ravi Shankar is not opted in and his birthday is today, when Rajesh Verma opens `wishes`, then his row shows "not opted in to WhatsApp · will not auto-send" and "Call instead", and no message is sent (epic acceptance criterion 2).
  2. Given the row for Ravi, when Rajesh presses "Call instead", then the device dialler opens with Ravi's stored phone, and nothing is written on the server.
  3. Given Rajesh selects several rows to send, when Ravi's row is shown, then it cannot be selected.
  4. Given a not-opted-in customer's birthday is tomorrow, when the row is shown, then it also shows "Call instead", unlike the prototype, which showed it only for today.
- **Rules enforced on the server:** The row's action is set by the server from the current consent state (EP-33-S3). The phone is returned only to Staff and Owner (EP-05-S2). Any send attempt for this customer is skipped by EP-33-S5, whatever the screen shows.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Opening the dialler writes nothing.
- **Data changes:** None in the product database. Adds the customer phone to not-opted-in queue rows only.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Ravi Shankar · birthday today", "not opted in to WhatsApp · will not auto-send", "Call instead", "A customer who is not opted in is still shown, so you can reach them another way, but they are never auto-messaged.").
- **Non-functional checks:** Personal data: the phone is shown only on rows where a call is the offered action; opted-in rows do not return it.
- **Depends on:** EP-33-S3, EP-33-S5, EP-17-S7, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S7: Owner can choose the two sender identities

- **Story ID:** EP-33-S7
- **Status:** Not started
- **Title:** Owner can choose the two sender identities
- **As a:** Owner
- **I want:** to set which two sender identities wishes come from, give each a display name, mark one as the default for the 9 am run, and see both under "SENT FROM" on `wishes`
- **So that:** wishes feel personal because they come from a known name under the owner (FR-33-8, BR-33-4, SCOPE-ANALYSIS Q9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the SenderIdentity rows from configuration, when Sanjay Seth sets slot 1 to "Sanjay (Owner)" and slot 2 to a second identity and saves, then both are stored with their slot and active flag, and "SENT FROM" on `wishes` lists the two names.
  2. Given Sanjay marks slot 1 as the default, when the 9 am run sends, then every wish that day uses slot 1 and the message shows "Sanjay".
  3. Given Rajesh Verma (Staff) calls Update Sender identities directly, when it reaches the server, then it is refused with "Only the owner can change the shop rules." and nothing changes.
  4. Given Sanjay tries to set a third slot, or names a sender identity that does not exist, when he saves, then the server refuses and the two stored slots stay as they were.
  5. Given slot 2 is made inactive, when Rajesh opens `wishes`, then only slot 1 is offered under "SENT FROM", and a send naming slot 2 is refused.
- **Rules enforced on the server:** Update Sender identities is Owner only (EP-05-S2). At most two wish-sender slots, each pointing to an existing active SenderIdentity from EP-12-S1. Exactly one default when any slot is active. Staff choose between the active slots when sending now; they cannot change them. A stale save against an older version is refused as a conflict (EP-03-S5).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor, time, entity (sender identity), action `wish_sender_changed` (new kind, added alongside those in epic section 9), before, after.
- **Data changes:** Updates SenderIdentity display name, active flag and wish-sender slot (EP-33-S1); stores the default slot. Adds Update Sender identities to the shared contract.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("SENT FROM", "Two names under the owner can be the sender.", "Sanjay (Owner)", "Priya (Manager)", "Wishes feel personal when they come from a known name."). The editing controls are not yet designed.
- **Non-functional checks:** Security: owner check on the server. Audit: every change audited. Open decision G20: who "Priya (Manager)" is when only Owner, Staff and Karigar exist, and whether an identity is tied to a user; the second slot is named neutrally until answered. Open decision D8: each identity needs a sending number the provider supports.
- **Depends on:** EP-33-S1, EP-12-S1, EP-05-S2, EP-03-S5, EP-06-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S8: Owner can edit the wish template once for all

- **Story ID:** EP-33-S8
- **Status:** Not started
- **Title:** Owner can edit the wish template once for all
- **As a:** Owner
- **I want:** to press "Edit the message", change the birthday or the anniversary text keeping {name}, and save it as a new version that every later wish uses once WhatsApp has approved it
- **So that:** I write the greeting once and it applies to all, instead of the edit vanishing on reload (FR-33-9, FR-33-10, BR-33-5, BR-33-9, epic acceptance criterion 5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the birthday template is version 1, when Sanjay Seth changes it to "Happy birthday {name}! From all of us at Jai Gulab Dev." and saves, then version 2 is stored with edited by Sanjay and the server time, and version 1 is kept.
  2. Given version 2 is approved by the provider (EP-12-S2), when the next birthday wish is sent to Priya Malhotra, then it reads "Happy birthday Priya! From all of us at Jai Gulab Dev." and the wish records template version 2 (epic acceptance criterion 5).
  3. Given version 2 is still pending approval, when a wish is sent, then it uses version 1, and the editor shows "Waiting for WhatsApp approval".
  4. Given Sanjay saves a text with no {name}, or with "{nmae}", when it reaches the server, then it is refused with "The message must contain {name} once." and nothing is stored.
  5. Given Rajesh Verma (Staff) calls Update Wish template, when it reaches the server, then it is refused and the template stays at its version.
- **Rules enforced on the server:** Update Wish template is Owner only (EP-05-S2). The text must contain {name} exactly once and no other placeholder. {name} is replaced by the customer's first name at send time. The version increases by one on each save; old versions are kept so each wish shows the text it was sent with. A send uses the latest version with provider status approved. No price or rupee placeholder is allowed (BR-33-7). English only in v1.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes, by EP-33-S13: actor, time, entity (wish template), action `wish_template_changed`, occasion, before text, after text, version.
- **Data changes:** Inserts a `wish_templates` row per version. Registers the new text through EP-12-S2 Create Template. Adds Update Wish template to the shared contract.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Edit the message", "THE BIRTHDAY MESSAGE", "Happy birthday {name}! Warm wishes from all of us at Jai Gulab Dev.", "{name} fills in per person · edit once, applies to all"). The anniversary message and the approval state are not yet designed.
- **Non-functional checks:** Security: owner check on the server. Audit: every edit audited. Open decision D8: whether an edited text needs a new provider approval, which decides how long criterion 3's wait lasts. Open question: one template per occasion or several to choose from; this story stores one per occasion.
- **Depends on:** EP-33-S1, EP-12-S2, EP-05-S2, EP-03-S4, EP-06-S2, EP-06-S3, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S9: System can send wishes automatically at 9 am

- **Story ID:** EP-33-S9
- **Status:** Not started
- **Title:** System can send wishes automatically at 9 am
- **As a:** System
- **I want:** when the EP-10-S9 job starts at 9 am Asia/Kolkata with `autoSendWishes` on, to send today's wish to every opted-in customer in the queue not already wished this year, from the default sender, as the System actor "Scheduler"
- **So that:** each morning's birthdays and anniversaries go out on WhatsApp without anyone lifting a finger (FR-33-6, BR-33-2, epic acceptance criterion 1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra is opted in with a birthday today and `autoSendWishes` is true, when 09:00 Asia/Kolkata (03:30 UTC) arrives, then one wish is sent to her from the default sender with "Priya" filled in, sent by System (epic acceptance criterion 1).
  2. Given Rajesh Verma sent Priya's wish at 08:40, when the 9 am run reaches her, then she is skipped and no second wish is sent (EP-33-S10).
  3. Given Ravi Shankar is not opted in, when the run reaches him, then he is skipped (EP-33-S5); given Arjun & Kavya's anniversary is tomorrow, then they are not sent today.
  4. Given `autoSendWishes` is false at 09:00, when the job starts, then no wish is sent and the run records 0 sends.
  5. Given the run crashes after sending 3 of 5 wishes and EP-10-S3 retries it, when the retry runs, then only the remaining 2 are sent.
- **Rules enforced on the server:** The setting is read at run time by EP-10-S9; the run key is "wishes" plus the Asia/Kolkata date (EP-10-S4). Each customer goes through the same send path as EP-33-S4: consent check (EP-33-S5), one-per-year rule (EP-33-S10), latest approved template (EP-33-S8), default sender (EP-33-S7). One customer's failure does not stop the others. A run missed by downtime runs on restart for its own date only (EP-10-S11).
- **Live events emitted / consumed:** None. The job is started by the scheduler, not by a live event.
- **Audit entry written:** Yes, by EP-33-S13: one `wish_sent` entry per wish with actor System "Scheduler", time, customer id, occasion, sender identity, template version. The run itself is recorded in the EP-10-S2 run history.
- **Data changes:** Inserts `wishes` rows with sent by System. EP-12-S3 inserts OutboundMessage rows. JobRun and JobKey rows from EP-10.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Send wishes automatically at 9 am", "On, each morning's birthdays and anniversaries go out on WhatsApp without you lifting a finger."). The switch itself is EP-13-S7.
- **Non-functional checks:** Time: 9 am Asia/Kolkata, converted to UTC by EP-10-S10. Availability: a failed run retries and never sends twice (epic section 13). Concurrency: a "Send now" racing the run creates one wish. Open question: whether 9 am is fixed or a setting (never per branch, D7); this story uses `wishSendTime` from EP-13-S7, which defaults to 09:00. Open decision G12: who may switch auto-send.
- **Depends on:** EP-10-S1, EP-10-S2, EP-10-S3, EP-10-S4, EP-10-S9, EP-10-S10, EP-10-S11, EP-10-S12, EP-13-S7, EP-06-S6, EP-33-S2, EP-33-S5, EP-33-S7, EP-33-S8, EP-33-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S10: System can send at most one wish per customer per occasion per year

- **Story ID:** EP-33-S10
- **Status:** Not started
- **Title:** System can send at most one wish per customer per occasion per year
- **As a:** System
- **I want:** every wish to claim the unique key (customer id, occasion, occasion year) inside the send transaction, so a second request for the same key, from a person or the 9 am run, sends nothing
- **So that:** a customer never gets the same greeting twice, even after a double tap, a retry or a job restart (FR-33-7, epic acceptance criterion 3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a wish was sent to Priya Malhotra for her 2026 birthday this morning, when Rajesh Verma presses "Send now" again, then no second wish is sent and the result is "already wished this year" (epic acceptance criterion 3).
  2. Given Rajesh and Deepak Rao send Priya's wish at the same moment, when both reach the server, then exactly one `wishes` row exists and one provider send is made.
  3. Given Priya was wished for her 2026 birthday, when her birthday comes in 2027, then a new wish is allowed with occasion year 2027.
  4. Given Arjun & Kavya were sent an anniversary wish this year, when a birthday wish is due for Arjun & Kavya, then it is allowed, because the occasion differs.
  5. Given a wish row is `failed`, when a retry runs (EP-33-S12), then it reuses the same row and the same provider idempotency key, and no second row is created.
- **Rules enforced on the server:** The unique key on `wishes` (EP-33-S1) is claimed in the same transaction as the row insert (EP-03-S6); a key clash returns "already wished this year", not an error. Occasion year is the Asia/Kolkata year of the occasion date. The provider send uses idempotency key "wish" plus customer id, occasion and year (EP-10-S4, EP-03-S8). This replaces the prototype's 24-hour window.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused duplicate writes no entry; the one real send is audited by EP-33-S13.
- **Data changes:** None beyond EP-33-S1. Relies on the unique key on (customer id, occasion, occasion year).
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Send now"). The "already wished this year" wording is not yet designed.
- **Non-functional checks:** Concurrency: the database constraint, not a read-then-write check, prevents duplicates. Availability: restarts and retries of the 9 am run cannot send twice (epic section 16). Time: year boundaries in Asia/Kolkata.
- **Depends on:** EP-33-S1, EP-10-S4, EP-03-S6, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S11: Staff can preview a wish as it lands

- **Story ID:** EP-33-S11
- **Status:** Not started
- **Title:** Staff can preview a wish as it lands
- **As a:** Staff
- **I want:** to press "Preview" on any queue row and see a phone frame with the message filled in for that customer, from the selected sender, using the text that would be sent now
- **So that:** I can check what the customer will read before it goes (FR-33-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given Arjun & Kavya's anniversary is tomorrow, when Rajesh Verma presses "Preview", then the phone frame shows the current approved anniversary template with {name} filled as "Arjun" and the sender "Sanjay (Owner)".
  2. Given the birthday template version 2 is pending approval and version 1 is approved, when Rajesh previews Priya Malhotra's wish, then the preview shows version 1, the text that would actually be sent.
  3. Given Rajesh switches "SENT FROM" to slot 2, when he previews again, then the frame shows the slot 2 name.
  4. Given a preview is opened, when it closes, then nothing is written on the server and no message is sent.
- **Rules enforced on the server:** Read Wish preview is Staff and Owner only (EP-05-S2). The server fills the text with the same function the send uses, so preview and message cannot differ. The preview is allowed for not-opted-in customers, but sends nothing.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A preview changes nothing.
- **Data changes:** None in the product database. Adds Read Wish preview to the shared contract; moves `fillName` from `src/components/marketing/util.tsx` to the shared package and keeps `PhonePreview` as the frame.
- **UI reference:** `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Preview", "THE BIRTHDAY MESSAGE", "Happy birthday {name}!"). The phone frame follows the prototype `PhonePreview` and is not drawn on the mockup.
- **Non-functional checks:** Personal data: the preview carries the first name only, not the phone. Performance: the preview opens under 1 second after the queue has loaded.
- **Depends on:** EP-33-S3, EP-33-S7, EP-33-S8, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S12: Staff can see delivery status and failures

- **Story ID:** EP-33-S12
- **Status:** Not started
- **Title:** Staff can see delivery status and failures
- **As a:** Staff
- **I want:** a List Sent wishes read that shows each wish sent today with its sender, time and delivery status (queued, sent, delivered, failed) and, for a failure, the provider's reason, plus the count of wishes sent today for the homes
- **So that:** I know which greetings arrived and which did not, so I can call the customer when one fails (FR-33-11, FR-33-12, epic acceptance criterion 6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra's wish was sent at 09:00 and the provider reported it delivered at 09:01, when Rajesh Verma opens `wishes`, then her row shows "sent 09:00 · delivered".
  2. Given the provider rejects the wish to Arjun & Kavya with "recipient not on WhatsApp", when the status returns through EP-12-S9, then the wish is `failed`, its row shows "failed · recipient not on WhatsApp" and the failure reason is stored (epic acceptance criterion 6).
  3. Given a wish failed with a temporary provider error, when EP-12-S12 retries it by the EP-10-S3 rule, then the same wish row moves to `sent` or stays `failed` after the last attempt, and no second row is created.
  4. Given 4 wishes were sent today, when Sanjay Seth opens `decisions`, then "Went through without you today" reads "4 wishes sent" (EP-32-S7), and the "SAY HAPPY BIRTHDAY" list on `today` no longer shows those customers (EP-31-S9).
  5. Given a wish is `delivered`, when a late receipt reports `sent`, then the status stays `delivered`.
- **Rules enforced on the server:** List Sent wishes is Staff and Owner only (EP-05-S2). Wish delivery status is copied from its OutboundMessage receipts (EP-12-S9) and only moves forward: queued, sent, delivered; failed is final for that attempt. Retries follow EP-12-S12 and EP-10-S3 with the wish idempotency key. "Today" is Asia/Kolkata (EP-10-S10).
- **Live events emitted / consumed:** None. Delivery status comes from EP-12 provider callbacks, not a live event (epic section 11); the screen shows the stored status on load and after the user's own action (EP-08-S7).
- **Audit entry written:** No. Status updates come from the provider and are kept on the wish and OutboundMessage rows; the send itself is audited by EP-33-S13.
- **Data changes:** Updates `wishes.delivery status`, sent at and failure reason from OutboundMessage. Adds List Sent wishes and the today count to the shared contract.
- **UI reference:** Not yet designed. `docs/ux/mockups/26-wishes.svg`, route `wishes`, has no sent or failed state; the count shows on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("11 pieces went out · 4 wishes sent").
- **Non-functional checks:** Time: sent and delivered times stored in UTC and shown in Asia/Kolkata. Availability: a provider outage marks wishes failed with a reason rather than losing them (EP-12-S12). Open decision: the retry rule for a failed wish (FR-33-12 "the decided rule"); until decided it is the EP-10-S3 backoff.
- **Depends on:** EP-33-S4, EP-33-S9, EP-33-S10, EP-12-S9, EP-12-S12, EP-10-S3, EP-10-S10, EP-08-S7, EP-31-S9, EP-32-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-33-S13: System can audit wishes, template edits and the auto-send switch

- **Story ID:** EP-33-S13
- **Status:** Not started
- **Title:** System can audit wishes, template edits and the auto-send switch
- **As a:** System
- **I want:** an append-only audit entry for every wish sent, every template edit and every change to the auto-send switch, written in the same transaction as the change, and the `wishes` toggle routed through the EP-13 settings update so it is checked and audited
- **So that:** the owner can see who greeted whom, from which name and with which text, and who turned auto-send on or off (FR-33-14, FR-33-15, BR-33-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma sends Priya Malhotra's birthday wish, when the send commits, then one `wish_sent` entry exists with actor Rajesh, time, entity wish id, customer id, occasion `birthday`, sender identity slot 1 and template version 1, and no phone or message text.
  2. Given the 9 am run sends 3 wishes, when it commits, then 3 `wish_sent` entries exist with actor System "Scheduler".
  3. Given Sanjay Seth saves birthday template version 2, when it commits, then one `wish_template_changed` entry holds the before text, the after text and version 2.
  4. Given Sanjay switches "Send wishes automatically at 9 am" on, when it commits, then one `setting_changed` entry reads "autoSendWishes false → true" (EP-13-S7); given Rajesh taps the switch, then the server refuses it unless G12 allows staff, and no entry is written.
  5. Given the audit store, when anyone tries to update or delete one of these entries, then it is refused (EP-06-S1).
- **Rules enforced on the server:** Entries are written in the send or edit transaction (EP-06-S2); if the audit write fails, the change rolls back. The prototype `setSetting('autoSendWishes', ...)` call without an owner check is removed; the toggle calls Update Setting (EP-13-S7). Wish entries hold ids, not personal values (EP-17-S14).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (user or System "Scheduler"), time, entity, action (`wish_sent`, `wish_template_changed`, `setting_changed`), before and after where they apply.
- **Data changes:** Adds the audit kinds `wish_sent` and `wish_template_changed` (and `wish_sender_changed` from EP-33-S7) to the `audit_entries` kind list by migration. No new table.
- **UI reference:** No screen of its own. Entries are read on the owner's audit log (EP-06-S9); the toggle is on `docs/ux/mockups/26-wishes.svg`, route `wishes` ("Send wishes automatically at 9 am").
- **Non-functional checks:** Audit: append-only, same transaction (epic section 13). Personal data: no phone, date of birth or message body in the entry. Security: the auto-send switch is checked on the server. Open decision G12: who may switch auto-send on or off.
- **Depends on:** EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S6, EP-06-S9, EP-13-S2, EP-13-S3, EP-13-S7, EP-17-S14, EP-33-S4, EP-33-S7, EP-33-S8, EP-33-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- G20: who is "Priya (Manager)" when only three roles exist, and is a sender identity tied to a user? (EP-33-S1, S7)
- D8: which provider sends wishes, and which templates are approved? (EP-33-S4, S7, S8)
- G12: who may switch auto-send on or off? (EP-33-S9, S13)
- Is 9 am fixed, or a setting? It is never per branch: one shop, no branches (D7). (EP-33-S1, S3, S9)
- Should a wish be sent on the day for a leap-day birthday (29 February) in other years? (EP-33-S2)
- Is there one template per occasion, or several to choose from? (EP-33-S8)
- Should wishes sent show on the customer's history (EP-17)? (EP-33-S12)
