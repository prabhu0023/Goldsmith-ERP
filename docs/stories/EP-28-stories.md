# EP-28: Leads: manual intake and inbox · stories

Epic document: [EP-28 Leads: manual intake and inbox](../epics/EP-28-leads-manual-intake-and-inbox.md)

Role note: stories where the server stores, times, checks, notifies or audits on its own use "System". Staff and the owner create and work leads; karigars never see leads, and every lead operation refuses them (epic section 13). v1 has no holds, so marking a lead lost changes no piece (BR-28-9). No amount is stored or shown on a lead. Approximate weights are integers in units of 0.0001 g and shown to 4 decimals. The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff). The seed leads are LD-2026-201 to LD-2026-213 (11 rows); the seed customer used here is Mrs Nair (CU-005, phone +91 98401 55505). Mockup 17 prints her phone as "+91 94440 22189"; these stories use the seed phone.

---

## EP-28-S1: System can store leads, items and their states

- **Story ID:** EP-28-S1
- **Title:** System can store leads, items and their states
- **As a:** System
- **I want:** the `leads` and `lead_items` tables from EP-02-S7 extended with customer id (nullable), taken by (user id), taken at, lost reason, SLA limit hours, SLA breached at and shop ID (D7), plus a `lead_attachments` table, with state limited to `needs_glance`, `opened`, `being_worked`, `converted`, `lost`
- **So that:** every lead, from the counter or from a message, is kept with its source, state, arrival time and items, and nothing a customer asks for is lost on a reload or redeploy (BR-28-1, BR-28-3, FR-28-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when a manual lead LD-2026-214 for Mrs Nair with one item is stored, then the row has source `counter`, state `opened`, `arrivedAt` from the server clock in UTC, an empty message, `customerId` CU-005 or null, and `slaLimitHours` 8.
  2. Given a lead item "Polki Choker", style "Polki", quantity 1, approximate weight 45.5 g, when it is stored, then `approxWeightG` is the integer `455000`, and an item with no weight stores null.
  3. Given a lead row with state `expired`, source `phone`, or a `takenBy` that is not a user id, when it is written, then the database rejects it.
  4. Given a lead in state `lost` with an empty `lostReason`, when it is written, then the database rejects it through a check constraint.
  5. Given the seed loader runs on an empty staging database, when it finishes, then 11 leads exist (3 `needs_glance`, 1 `opened`, 3 `being_worked`, 2 `converted`, 2 `lost`), `takenBy` names such as "Rajesh Verma" are mapped to user ids, and no column on `leads`, `lead_items` or `pieces` records a hold.
- **Rules enforced on the server:** Enum checks on source and state (EP-02-S7). `customerId` references `customers`, `takenBy` references `users`, `lead_attachments.fileId` references the EP-09 file record. A `lost` lead must carry a non-empty `lostReason`. `arrivedAt`, `takenAt` and `slaBreachedAt` are UTC. Every update goes through the version check (EP-02-S14).
- **Live events emitted / consumed:** None. Storing the tables publishes nothing; events come from EP-28-S13.
- **Audit entry written:** No. Table rules only; each state change is audited by EP-28-S14.
- **Data changes:** Migration on `leads` (EP-02-S7): adds `customerId` (nullable), changes `takenBy` from a name to a user id, adds `takenAt`, `lostReason`, `slaLimitHours`, an index on (`state`, `arrivedAt`) for the inbox, and the shop ID (EP-02-S3, D7). `slaBreachedAt` and the breach notified flag come from EP-10-S5. New `lead_attachments` (lead id, file id, position). Moves the prototype `note` reason of lost seed leads LD-2026-203 and LD-2026-204 into `lostReason`. Ports `Lead` and `LeadItem` from `src/types/jewellery.ts` into the shared package with `customerId` and user-id `takenBy`.
- **UI reference:** No screen.
- **Non-functional checks:** Time: arrival, taken and breach times stored in UTC, shown in Asia/Kolkata. Precision: approximate weight stored as integer units. Personal data: customer name and phone on a lead are personal data under the DPDP Act 2023; the `customerId` link lets an erasure reach the lead (EP-17-S13). D7 is decided: no `branchId`; leads carry the shop ID. Open question G25: no `expired` state is added until the expiry rule is decided.
- **Depends on:** EP-02-S7, EP-02-S1, EP-02-S3, EP-02-S4, EP-02-S13, EP-02-S14, EP-10-S5, EP-09-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S2: Staff can create a lead by hand at the counter

- **Story ID:** EP-28-S2
- **Title:** Staff can create a lead by hand at the counter
- **As a:** Staff
- **I want:** to press "Add a lead by hand" on `leads`, fill "Who is it?", "Phone", "What do they want?", "Needed by (if they said)" and "Anything else they said" on `lead-create`, and press "Create the lead"
- **So that:** a walk-in or a phone call becomes a lead straight away, joins the same list and starts the same 8-hour clock as a lead that came by message (FR-28-1, FR-28-2, FR-28-3, BR-28-2, BR-28-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma fills "Who is it?" with "Mrs Nair", phone "+91 98401 55505" and one item "Polki Choker", when he presses "Create the lead", then a lead `LD-2026-214` is stored at state `opened`, source `counter`, title "Mrs Nair · 1 × Polki Choker", `arrivedAt` the server time, and `takenBy` Rajesh, and he lands on `leads` where it shows "typed at the counter" and "within time · 8 h left" (epic acceptance criterion 1).
  2. Given "Who is it?" is empty or only spaces, when Rajesh presses "Create the lead", then the server refuses with "Add the customer name." and no lead is stored.
  3. Given no item line, when Rajesh presses "Create the lead", then the server refuses with "Add at least one item." and no lead is stored.
  4. Given "Needed by (if they said)" is left empty, when the lead is stored, then `neededBy` is null; given an impossible date is sent, then the server refuses it as a validation error on field `neededBy`.
  5. Given the network drops after Rajesh presses "Create the lead" and the client retries with the same idempotency key, when the retry reaches the server, then one lead exists and the response carries its id.
- **Rules enforced on the server:** Create Lead (manual) is Staff and Owner only; a Karigar is refused with `forbidden` (EP-05-S2). Name and phone are trimmed; the name must be non-empty and at least one item line is required (prototype `createLead`). State is always `opened` and source always `counter` on this operation; the client cannot set state, source, `arrivedAt` or `takenBy` (EP-03-S3). The id is the next `LD-<year>-NNN`, with the year from Asia/Kolkata. `slaLimitHours` is copied from `settings.leadSlaHours`. The insert, the EP-10-S5 SLA timer and the audit entry run in one transaction (EP-03-S6). The request carries an idempotency key (EP-03-S8).
- **Live events emitted / consumed:** Emitted after commit through EP-28-S13: "Lead arrived / passed its SLA" (arrived). Consumed: none.
- **Audit entry written:** Yes, through EP-28-S14: actor, time, entity (lead id), action `lead_created`, after (state `opened`, source `counter`, item count).
- **Data changes:** Inserts into `leads` and `lead_items`; inserts the pending SLA job row (EP-10-S5). Adds Create Lead (manual) to the shared contract. Ports `createLead` from `src/store/transitions.ts` and moves `src/components/leads/LeadCreate.tsx` (route `lead-create`) onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` right side ("Add a lead by hand", "Who is it?", "Phone", "What do they want?", "Needed by (if they said)", "This becomes a lead straight away", "Create the lead", "Cancel"), route `lead-create`; `docs/ux/mockups/16-lead-inbox.svg` ("Add a lead by hand"), route `leads`.
- **Non-functional checks:** Time: `arrivedAt` from the server clock in UTC; the device clock is never used. Performance: the new lead shows on Rajesh's inbox within about 1 second of pressing "Create the lead". Personal data: name and phone are stored only on the lead and the linked customer, never in logs. Security: name, phone and note are stored as plain text and rendered escaped.
- **Depends on:** EP-28-S1, EP-05-S2, EP-03-S2, EP-03-S3, EP-03-S4, EP-03-S6, EP-03-S7, EP-03-S8, EP-10-S5, EP-13-S4, EP-08-S5, EP-08-S6, EP-08-S7, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S3: Staff can add item lines with style, quantity and approximate weight

- **Story ID:** EP-28-S3
- **Title:** Staff can add item lines with style, quantity and approximate weight
- **As a:** Staff
- **I want:** to add, edit and remove item lines on `lead-create` with "Item", "Style", "How many" and "About, each (g)"
- **So that:** the lead says exactly what the customer wants, line by line, so each line can later be sold from stock or made by a karigar (FR-28-1, EP-30)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma adds two lines, "Temple Haram", style "Chettinad", how many 2, about 80 g each, and "Kundan Choker", style "Kundan", how many 1, no weight, when the lead is created, then two `lead_items` rows are stored in that order with `approxWeightG` `800000` and null, and route null on both.
  2. Given a line with "Item" empty, when Rajesh presses "Create the lead", then the server refuses with "Say what each line is." and no lead is stored.
  3. Given "How many" is 0, negative or 1.5, when the lead is sent, then the server refuses it as a validation error on that line's `qty` and no lead is stored.
  4. Given "About, each (g)" is "45.12345" or a negative number, when the lead is sent, then the server refuses it as a validation error on `approxWeightG`; given "45.5", then the stored value is `455000` and the lead shows "45.5000 g".
  5. Given the lead is created, when it is opened later, then each line shows its name, style, quantity and approximate weight to 4 decimals, and the title lists them as "2 × Temple Haram, 1 × Kundan Choker".
- **Rules enforced on the server:** Each line needs a non-empty trimmed name; quantity is a whole number of at least 1; approximate weight is optional, at least 0, with at most 4 decimals, converted to integer units by the EP-02-S2 helper. The route is never set here; EP-30 sets it. Lines and lead are written in the same transaction as EP-28-S2.
- **Live events emitted / consumed:** None of its own. The lines travel with the "Lead arrived / passed its SLA" event of EP-28-S2.
- **Audit entry written:** No separate entry. The `lead_created` entry of EP-28-S14 records the item count and lines.
- **Data changes:** Inserts into `lead_items` with position. Moves `src/components/leads/ItemsEditor.tsx` onto the shared contract types, with the weight sent as a decimal string and converted on the server.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` right side ("What do they want?"), route `lead-create`. The line editor fields "Item", "Style", "How many", "About, each (g)" come from `ItemsEditor.tsx`; the mockup draws a single text box, so the editor layout is not yet designed.
- **Non-functional checks:** Precision: 80 g is stored as `800000` units and shown as 80.0000 g; no float is stored. Security: each field is validated against the contract at the trust boundary (EP-03-S2).
- **Depends on:** EP-28-S2, EP-02-S2, EP-03-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S4: Staff can attach an optional photo to a manual lead

- **Story ID:** EP-28-S4
- **Title:** Staff can attach an optional photo to a manual lead
- **As a:** Staff
- **I want:** to press "Add a picture" under "Attach a photo (optional)" on `lead-create`, upload one image, and see it on the lead
- **So that:** a picture the customer shows at the counter, such as a choker in the window or a photo on their phone, stays with the lead for whoever makes or finds the piece (FR-28-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma picks a JPEG on `lead-create`, when the upload finishes, then he gets a file id from EP-09 and a thumbnail on the form; when he presses "Create the lead", then a `lead_attachments` row links that file to the new lead.
  2. Given no photo is added, when the lead is created, then it is stored with no attachment and no error.
  3. Given the file is too large or not an allowed image type, when it is uploaded, then the EP-09 refusal sentence is shown and the form keeps its other values.
  4. Given the lead has a photo, when Deepak Rao opens the lead, then the image loads through a signed, expiring link; given a karigar requests that link, then the server answers not-found.
  5. Given a file id that belongs to a piece or another lead, when it is sent with Create Lead, then the server refuses it and no lead is stored.
- **Rules enforced on the server:** Upload is Create File (EP-09-S2), Staff and Owner only; size and type are checked by EP-09-S3. Create Lead accepts at most the attachments it is sent that were uploaded by the caller and are not yet attached. File reads are checked against the lead and the caller's role (EP-09-S6).
- **Live events emitted / consumed:** None. The attachment is part of the lead created in EP-28-S2.
- **Audit entry written:** No separate entry. The `lead_created` entry records the attachment file id.
- **Data changes:** Inserts into `lead_attachments`. Adds an optional `attachmentFileIds` field to Create Lead (manual) in the shared contract.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` ("Attach a photo (optional)", "Add a picture"), route `lead-create`.
- **Non-functional checks:** Security: files are served only through signed, expiring links (EP-09-S5) and never to karigars. Personal data: a photo can show a customer; it follows the lead's retention and deletion (EP-09-S12). Performance: the thumbnail shows within about 2 seconds of the upload finishing on a shop connection.
- **Depends on:** EP-28-S2, EP-09-S2, EP-09-S3, EP-09-S4, EP-09-S5, EP-09-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S5: Staff can see a known customer matched by phone (G7)

- **Story ID:** EP-28-S5
- **Title:** Staff can see a known customer matched by phone (G7)
- **As a:** Staff
- **I want:** the form to call Find Customer by phone when I finish typing the phone on `lead-create`, show "known customer" next to the name when it matches, fill an empty "Who is it?" with the customer's name, and link the lead to that customer on save
- **So that:** a returning customer's leads join their record, and the shop does not create a second record for the same person (FR-28-4, G7)
- **Acceptance criteria (Given / When / Then):**
  1. Given Mrs Nair (CU-005) holds "+91 98401 55505", when Rajesh Verma types "98401 55505" in "Phone", then the form shows "known customer" next to "Mrs Nair", and on "Create the lead" the lead stores `customerId` CU-005 (epic acceptance criterion 2).
  2. Given no active customer holds the phone "+91 98451 20034", when Rajesh types it, then no "known customer" label shows, the lead is saved with `customerId` null, and no customer record is created.
  3. Given the phone has fewer than 10 digits, when Rajesh types it, then no match is shown and the lead can still be saved.
  4. Given the client sends a `customerId` whose phone does not match the lead's phone, when Create Lead runs, then the server ignores the sent id and links by its own phone match.
  5. Given the decided G7 rule lets two active customers share the phone, when Rajesh types it, then the form lists both and asks him to choose one; the lead links to the chosen record only.
- **Rules enforced on the server:** The match is EP-17-S10 Find Customer by phone with the EP-17-S1 normaliser; it is read only. The link is set by Create Lead on the server from its own match, never trusted from the client. A karigar calling Find Customer by phone is refused (EP-17-S12). The prototype name-only match in `LeadCreate.tsx` line 17 is replaced by the phone match, pending the G7 question.
- **Live events emitted / consumed:** None.
- **Audit entry written:** No separate entry. The `lead_created` entry records `customerId` when linked.
- **Data changes:** Sets `leads.customerId`. No new tables. Replaces the `known-customers` name datalist and `state.customers` lookup in `src/components/leads/LeadCreate.tsx` with the server read.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` ("Mrs Nair", "known customer ·", "Phone"), route `lead-create`.
- **Non-functional checks:** Performance: the match answers in under 200 ms at the server (EP-17-S10), so the label appears while Rajesh is still on the form. Personal data: the match returns only id, name, city and group; an erased customer never matches. Security: the lookup is limited by the EP-03-S11 rate-limit hook so it cannot be used to walk the customer list. Open question G7: exact or normalised phone, two matches, and phone, name or both.
- **Depends on:** EP-28-S2, EP-17-S1, EP-17-S10, EP-17-S12, EP-17-S13, EP-03-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S6: Staff can see every lead in one inbox with source and SLA

- **Story ID:** EP-28-S6
- **Title:** Staff can see every lead in one inbox with source and SLA
- **As a:** Staff
- **I want:** a List Leads read shown on `leads` as one list of leads from WhatsApp, email and the counter, oldest first, each row with source, title, arrival age or who took it, state and the SLA label from the server
- **So that:** every request a customer made sits in one place, and the oldest one waiting is always at the top (FR-28-5, BR-28-1, BR-28-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given the seed, when Rajesh Verma opens `leads`, then LD-2026-207 shows "from WhatsApp", "arrived 11 h ago" and "8 h limit passed · owner told", above LD-2026-208 at "arrived 9 h ago", above LD-2026-209 "by email" at "arrived 2 h ago" with "within time · 6 h left".
  2. Given LD-2026-210 is a counter lead being worked by Rajesh, when the list loads, then its row shows "typed at the counter", "taken 40 min ago by Rajesh" and "being worked".
  3. Given the server clock, when the list loads, then each SLA label and age comes from the server response, not from the device clock.
  4. Given 200 leads, when the list is read, then it is paged by cursor and the first page loads in under 2 seconds.
  5. Given Vijay Kumar (Karigar) calls List Leads or Read Lead, when it reaches the server, then it is refused with `forbidden`, and the `leads` route is not offered to him.
- **Rules enforced on the server:** List Leads and Read Lead are Staff and Owner only (EP-05-S2). Order is `arrivedAt` ascending. Each row carries the SLA phase, hours left and label computed on the server (EP-28-S8). Lists are paged with a cursor (EP-03-S9). Rows are limited to the caller's shop (D7).
- **Live events emitted / consumed:** Consumed through EP-28-S13: "Lead arrived / passed its SLA"; "Setting changed" (proposed, G26) to recompute labels. Emitted: none.
- **Audit entry written:** No. Reading leads changes nothing.
- **Data changes:** None in the product database. Adds List Leads and Read Lead to the shared contract. Moves `src/components/leads/LeadInbox.tsx` (route `leads`) onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("Leads", "Nothing a customer sends is ever dropped.", "Oldest first", "from WhatsApp", "by email", "typed at the counter", "8 h limit passed · owner told", "within time · 6 h left"), route `leads`.
- **Non-functional checks:** Performance: inbox loads under 2 seconds on a shop connection (epic section 13). Time: ages and labels from the server clock, shown in Asia/Kolkata. Security: karigars never see leads (mockup 11). D7 is decided: one inbox for the shop.
- **Depends on:** EP-28-S1, EP-28-S8, EP-05-S2, EP-03-S9, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S13, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S7: Staff can filter the inbox by Needs a glance, Being worked and All

- **Story ID:** EP-28-S7
- **Title:** Staff can filter the inbox by Needs a glance, Being worked and All
- **As a:** Staff
- **I want:** tabs "Needs a glance", "Being worked" and "All" on `leads`, each with a count from the server
- **So that:** I can go straight to the leads that need my eyes or my follow-up (FR-28-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given the seed, when Rajesh Verma opens `leads`, then the tabs read "Needs a glance · 3", "Being worked · 4" and "All · 11", and "Needs a glance" is selected.
  2. Given "Needs a glance" is selected, when the list loads, then it holds only `needs_glance` leads LD-2026-207, LD-2026-208 and LD-2026-209, oldest first.
  3. Given "Being worked" is selected, when the list loads, then it holds `opened` and `being_worked` leads (LD-2026-210 to LD-2026-213), oldest first.
  4. Given "All" is selected, when the list loads, then it holds every lead including `converted` and `lost` ones.
  5. Given the "Needs a glance" tab has no leads, when it is selected, then it reads "Nothing here. Every lead has been looked at."
- **Rules enforced on the server:** List Leads takes a `tab` filter of `glance`, `worked` or `all`; any other value is a validation error. Counts are computed on the server in the same read so the three numbers agree with the lists. Tab membership is `needs_glance` for glance; `opened` and `being_worked` for worked; every state for all.
- **Live events emitted / consumed:** Consumed through EP-28-S13: "Lead arrived / passed its SLA", so counts change without a refresh. Emitted: none.
- **Audit entry written:** No. Reading leads changes nothing.
- **Data changes:** None in the product database. Adds the `tab` filter and counts to List Leads in the shared contract.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("Needs a glance · 3", "Being worked · 4", "All · 11"), route `leads`.
- **Non-functional checks:** Performance: switching tabs shows the new list within 1 second when cached and under 2 seconds otherwise. D7 is decided: counts are for the shop.
- **Depends on:** EP-28-S6, EP-03-S9, EP-08-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S8: System can compute the SLA in shop hours on the server

- **Story ID:** EP-28-S8
- **Title:** System can compute the SLA in shop hours on the server
- **As a:** System
- **I want:** one shared server function that takes a lead, the current server time, `settings.leadSlaHours` and the shop-hours calendar, and returns the phase (`running`, `late`, `met`), hours elapsed, whole hours left, the due time and the label
- **So that:** every screen, the breach job and reports agree on when a lead is late, and the clock counts the hours the decided A2 rule says (FR-28-7, BR-28-4, BR-28-5, BR-28-7, BR-28-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lead just created with `leadSlaHours` 8, when the SLA is computed, then the phase is `running` and the label is "within time · 8 h left" (epic acceptance criterion 1).
  2. Given LD-2026-209 arrived 2 hours ago and is `needs_glance`, when the SLA is computed, then the label is "within time · 6 h left"; given 7 h 20 min have passed, then it is "within time · 1 h left".
  3. Given a lead `needs_glance` or `opened` past its due time, when the SLA is computed, then the phase is `late` and the label is "8 h limit passed · owner told".
  4. Given a lead in `being_worked`, `converted` or `lost`, when the SLA is computed at any time, then the phase is `met` and no late label is shown (epic acceptance criterion 4).
  5. Given A2 is decided as shop hours with Monday to Saturday 10:00 to 20:00, when a lead arrives on Monday at 18:00 Asia/Kolkata, then the due time is Tuesday 16:00 Asia/Kolkata; given A2 is decided as clock hours, then the due time is Tuesday 02:00.
- **Rules enforced on the server:** The clock runs only while state is `needs_glance` or `opened` (`slaRunning`). Hours left are rounded up to a whole hour with a minimum of 1 while running. The due time uses the current `leadSlaHours` (at least 1, EP-13-S4), so a changed setting moves the due time of running leads (EP-10-S5 criterion 3). The due-time part is the EP-10-S5 replaceable function, swapped for the EP-13-S11 shop-hours version once A2 is decided. Times are UTC inside and converted to Asia/Kolkata only for calendar rules and display.
- **Live events emitted / consumed:** Consumed: "Setting changed" (proposed, G26) from EP-13-S14 so cached SLA results are recomputed. Emitted: none.
- **Audit entry written:** No. Computing the SLA changes nothing.
- **Data changes:** None in the product database. Ports `slaRunning` and `slaState` from `src/domain/leads.ts` into the shared package, replacing clock hours with the due-time function. Reads ShopHours and Holiday from EP-13-S11 when present.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("within time · 6 h left", "8 h limit passed · owner told"), route `leads`; `docs/ux/mockups/13-notifications-escalation.svg` ("A lead is late after 8 hours", "shop hours, not clock hours"), route `decisions`.
- **Non-functional checks:** Time: all arithmetic on UTC instants; day and opening-hour boundaries from EP-10-S10 in Asia/Kolkata; tested across midnight, a Sunday and the 2026-11-09 holiday from EP-13-S11. Open decision A2: shop hours or clock hours, and what the shop hours are; criteria are written for both. Open question: whether the clock stops at "being worked" or only when the customer gets a reply; this story stops it at `being_worked`.
- **Depends on:** EP-28-S1, EP-10-S5, EP-10-S10, EP-13-S4, EP-13-S11, EP-13-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S9: System can mark a lead late and notify staff then the owner

- **Story ID:** EP-28-S9
- **Title:** System can mark a lead late and notify staff then the owner
- **As a:** System
- **I want:** the EP-10-S5 breach job to call a Mark lead late service function that re-checks the lead, sets `slaBreachedAt`, writes the audit entry and emits the passed-SLA event, which EP-11 turns into notices for the audience in `settings.lateLeadAudience`
- **So that:** a lead nobody has opened turns red in both inboxes and the right people are told, staff first and then the owner, or the owner only (FR-28-8, BR-28-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lead arrived 8 shop hours ago and is still `needs_glance` or `opened`, when the breach job runs, then `slaBreachedAt` is the due time, a `lead_late` audit entry is written, and "Lead arrived / passed its SLA" (passed) is emitted once (epic acceptance criterion 3).
  2. Given `lateLeadAudience` is `staff_then_owner`, when the passed event is consumed, then every active Staff user gets a late-lead notice first and Sanjay Seth is told after the escalation wait only if the lead is still not worked (EP-11-S6, EP-11-S7).
  3. Given `lateLeadAudience` is `owner_only`, when a lead passes its SLA, then only Sanjay is notified.
  4. Given Rajesh Verma started working the lead a second before the job ran, when the job reads the lead in its transaction, then it finds `being_worked`, marks nothing and emits nothing (epic acceptance criterion 4).
  5. Given two leads are late, when Sanjay opens `decisions`, then one card reads "2 leads nobody has opened for over 8 hours" with "Sharma wedding enquiry (11 h) · bulk chain order from Erode (9 h)" and "See leads", which opens `leads`.
- **Rules enforced on the server:** Mark lead late is callable by System only. It locks the lead row and acts only if state is `needs_glance` or `opened` and `slaBreachedAt` is empty, so a lead is marked late once (idempotency key lead id plus "sla-breach", EP-10-S4). The actor recorded is System (EP-10-S12). Who is told and when is read from settings when the event is processed (EP-11-S3). Several late leads give one Decisions card, not one per lead. The state of the lead does not change; late is a flag.
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" (passed) through EP-28-S13. Consumed: none here; EP-11-S6 consumes the event for notices.
- **Audit entry written:** Yes, through EP-28-S14: actor System, time, entity (lead id), action `lead_late`, after (`slaBreachedAt`, limit hours, audience).
- **Data changes:** Sets `leads.slaBreachedAt` and the breach notified flag (EP-10-S5 columns). Notification and EscalationTimer rows are written by EP-11. Adds Mark lead late and a Late leads summary read for `decisions` to the shared contract. The card layout on `decisions` belongs to EP-32; this story supplies its data.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg` ("RUNNING LATE · 2 · THE CLOCK TOLD ME, NOT A PERSON", "2 leads nobody has opened for over 8 hours", "See leads", "Who hears about a late lead", "Staff first, then me", "Only me"), route `decisions`; `docs/ux/mockups/16-lead-inbox.svg` ("8 h limit passed · owner told"), route `leads`.
- **Non-functional checks:** Time: the breach time is the due time in UTC, not the run time; a job delayed by downtime still records the due time (EP-10-S11). Concurrency: the row lock and state re-check stop a false breach when a lead is started at the same moment. Availability: a missed run is caught up once after a restart. Open decision A3: whether staff are warned first, by which channel and how long before the owner; the label "owner told" assumes the owner is told. Open decision A2: due time in shop or clock hours.
- **Depends on:** EP-28-S8, EP-10-S4, EP-10-S5, EP-10-S11, EP-10-S12, EP-11-S3, EP-11-S6, EP-11-S7, EP-13-S5, EP-03-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S10: Staff can start working a lead

- **Story ID:** EP-28-S10
- **Title:** Staff can start working a lead
- **As a:** Staff
- **I want:** to press "Open" on an `opened` lead in the inbox and start working it, so that the lead moves to `being_worked` with me recorded as the person who took it and the time I took it
- **So that:** the clock stops once a person has the lead, and other staff can see who is on it (FR-28-9, FR-28-10, BR-28-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-213 is `opened`, when Deepak Rao starts working it, then it is `being_worked`, `takenBy` is Deepak, `takenAt` is the server time, its SLA timer is cancelled in the same transaction, and the row shows "taken just now by Deepak" and "being worked".
  2. Given LD-2026-208 is `needs_glance`, when Rajesh Verma tries to start working it, then the server refuses with "Check and keep this lead first." and the lead is unchanged.
  3. Given Rajesh and Deepak start the same `opened` lead at the same moment, when both calls reach the server, then one records `takenBy` and the other gets the lead back showing who took it, with "taken just now by Rajesh" on his screen.
  4. Given a lead already `being_worked`, `converted` or `lost`, when start working is called, then nothing changes and no audit entry is written.
  5. Given a lead that was already marked late, when it is started, then `slaBreachedAt` stays as recorded and the row stops showing the late label.
- **Rules enforced on the server:** Start working is Staff and Owner only (EP-05-S2). The lead row is locked and the version checked (EP-02-S14). From `needs_glance` it refuses with the prototype sentence; from `opened` it moves to `being_worked`; from any other state it returns the current lead unchanged. For a manual lead whose `takenBy` is already the creator, `takenBy` is kept; otherwise it is set to the caller. Cancelling the SLA timer is EP-10-S6, in the same transaction.
- **Live events emitted / consumed:** Emitted after commit through EP-28-S13: "Lead arrived / passed its SLA" carrying the new state, so other inboxes move the row. Consumed: none.
- **Audit entry written:** Yes, through EP-28-S14: actor, time, entity (lead id), action `lead_started`, before `opened`, after `being_worked`, taken by.
- **Data changes:** Updates `leads.state`, `takenBy`, `takenAt`, `version`; cancels the pending SLA job row (EP-10-S6). Adds Start working to the shared contract. Ports `startWorkingLead` from `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("Open", "taken 40 min ago by Rajesh", "being worked"), route `leads`. The lead detail screen behind "Open" is not drawn in a mockup.
- **Non-functional checks:** Concurrency: two staff starting the same lead at once give one `takenBy`, and the other sees who took it (epic section 13). Time: `takenAt` from the server clock in UTC. Open question: whether a lead can be assigned to or claimed by one staff member, and whether another can take it over; this story keeps the first taker and offers no takeover.
- **Depends on:** EP-28-S6, EP-28-S8, EP-10-S6, EP-05-S2, EP-02-S14, EP-03-S4, EP-03-S6, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S11: Staff can mark a lead lost with a reason

- **Story ID:** EP-28-S11
- **Title:** Staff can mark a lead lost with a reason
- **As a:** Staff
- **I want:** to mark a lead lost from the lead, type why, and confirm
- **So that:** the inbox only holds leads someone can still win, and the reason is kept for later (FR-28-11, FR-28-12, BR-28-9, BR-28-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a lead whose line has TAG-8841 linked for reference, when Rajesh Verma marks it lost with "bought elsewhere", then the lead is `lost` with `lostReason` "bought elsewhere", and TAG-8841 is still `in_stock` with its version unchanged (epic acceptance criterion 5).
  2. Given LD-2026-201 is `converted`, when Deepak Rao marks it lost, then the server refuses with "A converted lead cannot be marked lost." and the lead is unchanged.
  3. Given the reason is empty or only spaces, when Rajesh confirms, then the server refuses with "Say why the lead was lost." (proposed wording) and the lead is unchanged.
  4. Given LD-2026-213 is `opened` with its SLA timer pending, when it is marked lost, then the timer is cancelled in the same transaction and the lead is never marked late.
  5. Given a lead is already `lost`, when it is marked lost again, then the server returns it unchanged and writes no second audit entry.
- **Rules enforced on the server:** Mark lost is Staff and Owner only (EP-05-S2). A converted lead is refused (prototype `markLeadLost`). The reason is trimmed and required. Allowed from `needs_glance`, `opened` and `being_worked`. No piece row is read or written, because v1 has no holds (the prototype `heldForLeadId` clearing is not ported). The lead row is version checked (EP-02-S14). The service is the EP-03-S12 reference function, extended with the reason rule, the timer cancel and the audit entry.
- **Live events emitted / consumed:** Emitted after commit through EP-28-S13: "Lead arrived / passed its SLA" carrying state `lost`, so other inboxes move the row. Consumed: none.
- **Audit entry written:** Yes, through EP-28-S14: actor, time, entity (lead id), action `lead_lost`, before (state), after `lost`, reason.
- **Data changes:** Updates `leads.state`, `lostReason`, `version`; cancels the pending SLA job row if any. Adds `reason` as a required field to Mark lost in the shared contract.
- **UI reference:** Not yet designed. The lead detail screen and its lost dialog are not drawn; `docs/ux/mockups/12-state-lifecycles.svg` shows the lead rail ending in "Lost or expired".
- **Non-functional checks:** Concurrency: two parallel mark-lost calls give one change and one unchanged result, never a lost write; a mark-lost racing a conversion (EP-30) is settled by the version check. Audit: the reason is kept in the entry. Personal data: the reason is free text and must not be used to store extra customer details; it follows the lead on erasure.
- **Depends on:** EP-28-S1, EP-28-S10, EP-03-S12, EP-10-S6, EP-05-S2, EP-02-S14, EP-22-S1, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S12: System can expire an unworked lead under the decided rule (G25)

- **Story ID:** EP-28-S12
- **Title:** System can expire an unworked lead under the decided rule (G25)
- **As a:** System
- **I want:** a scheduled job that finds leads matching the decided G25 expiry rule and closes each one as lost or expired through the same service as EP-28-S11, with System as the actor and the reason `expired`
- **So that:** the inbox does not fill with old leads nobody will close, and each closure is still traceable (FR-28-13, G25)
- **Acceptance criteria (Given / When / Then):**
  1. Given the decided rule is "unworked for N days" and a lead has been `opened` for more than N days, when the expiry job runs, then the lead is closed as the rule names, with reason `expired`, actor System and an audit entry.
  2. Given a lead in `being_worked`, `converted` or `lost`, when the expiry job runs, then it is unchanged unless the decided rule names that state.
  3. Given the job runs twice for the same lead, when both finish, then the lead is closed once and one audit entry exists (idempotency key lead id plus "expire").
  4. Given Rajesh Verma starts working a lead at the moment the job reaches it, when both commit, then exactly one wins, decided by the row lock and version check.
  5. Given G25 decides there is no automatic expiry, when this story is reviewed, then it is not built and no expiry job is registered.
- **Rules enforced on the server:** The job is registered on the EP-10 scheduler and runs on the server clock. It re-reads each lead inside its transaction and applies only the decided rule. A converted lead is never expired. It writes no piece row. Actor System (EP-10-S12).
- **Live events emitted / consumed:** Emitted after commit through EP-28-S13: "Lead arrived / passed its SLA" carrying the closed state. Consumed: none.
- **Audit entry written:** Yes, through EP-28-S14: actor System, time, entity (lead id), action `lead_lost`, before (state), after (closed state), reason `expired`.
- **Data changes:** Updates `leads.state`, `lostReason`, `version`. Adds an `expired` state by migration only if G25 decides it is separate from `lost`. Registers the expiry job and its run history (EP-10-S2).
- **UI reference:** No screen. `docs/ux/mockups/12-state-lifecycles.svg` ("Lost or expired") shows where the lead ends.
- **Non-functional checks:** Time: the age is measured from `arrivedAt` in UTC, with day boundaries in Asia/Kolkata (EP-10-S10). Availability: a missed run is caught up after downtime (EP-10-S11). Open question G25: when an unworked lead becomes "Lost or expired" and whether that is automatic; criteria are written neutrally.
- **Depends on:** EP-28-S11, EP-10-S1, EP-10-S2, EP-10-S4, EP-10-S10, EP-10-S11, EP-10-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S13: Staff can see new and late leads arrive live

- **Story ID:** EP-28-S13
- **Title:** Staff can see new and late leads arrive live
- **As a:** Staff
- **I want:** every open `leads` inbox, the `leads` rail badge and the late-leads card on `decisions` to update by themselves when a lead is created, marked late, started or closed by anyone
- **So that:** two people at the counter never work from different lists, and a late lead shows the moment the clock passes (FR-28-15)
- **Acceptance criteria (Given / When / Then):**
  1. Given Deepak Rao has `leads` open, when Rajesh Verma creates a lead for Mrs Nair, then it appears in Deepak's "Being worked" tab and "All" tab, and both counts go up by 1, within about 1 second (epic acceptance criterion 6).
  2. Given LD-2026-209 passes its SLA, when the breach job commits, then every open inbox shows "8 h limit passed · owner told" on its row and the owner's `decisions` card count goes up, within about 1 second of the commit.
  3. Given Deepak starts working LD-2026-213, when it commits, then on Rajesh's inbox the row shows "taken just now by Deepak" without a refresh.
  4. Given the `leads` rail badge, when leads change, then staff see the "Needs a glance" count and the owner sees the late count, both from the server.
  5. Given Rajesh's connection drops while a lead is created, when it returns, then the inbox shows "Reconnecting…" and then catches up from the last sequence number with the new lead; given Vijay Kumar (Karigar) is connected, then he receives no lead event.
- **Rules enforced on the server:** Events are published only after commit (EP-07-S1), stamped with sequence number, entity id and version (EP-07-S2), and routed to Staff and Owner only (EP-07-S5, EP-07-S11). The payload carries the lead id, state, version, SLA phase and source, and no phone number; screens refetch the lead to show details. Events are limited to the lead's shop (D7).
- **Live events emitted / consumed:** Emitted: "Lead arrived / passed its SLA" on create (EP-28-S2), late (EP-28-S9), start (EP-28-S10), lost (EP-28-S11) and expiry (EP-28-S12). Consumed: "Lead arrived / passed its SLA" by `leads`, the rail badge and `decisions`; "Setting changed" (proposed, G26) to recompute SLA labels.
- **Audit entry written:** No. Publishing events changes nothing.
- **Data changes:** None in the product database. Maps "Lead arrived / passed its SLA" to the List Leads, Read Lead, badge and late-leads reads in the EP-08 event map.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg`, route `leads`; `docs/ux/mockups/13-notifications-escalation.svg` ("2 leads nobody has opened for over 8 hours", rail "Leads 2"), route `decisions`.
- **Non-functional checks:** Performance: a new or late lead appears on other inboxes within about 1 second (epic section 13). Availability: reconnect and catch-up by sequence number (EP-07-S7, EP-08-S10). Security: karigars receive no lead event. Personal data: no phone number in the event payload. Open question G26: the catalogue has no separate lead-state event, so start and lost changes ride on "Lead arrived / passed its SLA" with the new state.
- **Depends on:** EP-28-S2, EP-28-S9, EP-28-S10, EP-28-S11, EP-07-S1, EP-07-S2, EP-07-S5, EP-07-S7, EP-07-S11, EP-08-S8, EP-08-S9, EP-08-S10, EP-08-S16, EP-13-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-28-S14: System can audit every lead state change

- **Story ID:** EP-28-S14
- **Title:** System can audit every lead state change
- **As a:** System
- **I want:** to write an append-only audit entry in the same transaction as each lead create (`lead_created`), start (`lead_started`), lost or expiry (`lead_lost`) and late mark (`lead_late`), with actor, role, time, lead id, before, after and reason
- **So that:** the owner can see who took each lead, when, why one was lost, and which ones the clock caught (FR-28-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma creates LD-2026-214, when it commits, then a `lead_created` entry holds actor Rajesh, role Staff, time, LD-2026-214, source `counter`, state `opened`, item count 1 and `customerId` CU-005.
  2. Given Rajesh marks a lead lost with "bought elsewhere", when it commits, then a `lead_lost` entry holds before (state), after `lost` and reason "bought elsewhere".
  3. Given the breach job marks LD-2026-209 late, when it commits, then a `lead_late` entry holds actor System, the due time and the audience `staff_then_owner`.
  4. Given the transaction rolls back, when the log is read, then no lead entry exists for it.
  5. Given Sanjay Seth filters the security log by kind group "Leads" and entity LD-2026-214, when the list loads, then its entries appear newest first; given a staff user reads the log, then it is refused (EP-06-S12).
- **Rules enforced on the server:** Entries are written through EP-06-S2 inside the operation's transaction and cannot be updated or deleted (EP-06-S1). The four kinds come from the EP-06-S7 action list (createLead, startWorkingLead, markLeadLost) plus `lead_late`, which is added here. Actor and time come from the session or System and the server clock. Entries hold the customer id, not the name or phone.
- **Live events emitted / consumed:** None. Audit writes publish nothing.
- **Audit entry written:** Yes: actor, role, time, entity (lead id), action (`lead_created`, `lead_started`, `lead_lost`, `lead_late`), before, after, reason.
- **Data changes:** Inserts into `audit_entries`. Adds `lead_late` to the audit kind list and a "Leads" kind group in the shared package; migration widens the kind check constraint if it is a database enum.
- **UI reference:** The security log screen from EP-06-S9 to EP-06-S11. No new screen.
- **Non-functional checks:** Audit: every state change, including lost with its reason, is appended (epic section 13). Personal data: entries store the customer id, not the name or phone, so an erasure (EP-17-S13) does not leave personal data in the log. Time: entry times in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-28-S2, EP-28-S9, EP-28-S10, EP-28-S11, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S6, EP-06-S7, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A2: does the 8-hour timer count shop hours or clock hours, and what are the shop hours? (EP-28-S8, S9)
- A3: are staff warned before the owner, by which channel, and how long before? (EP-28-S9)
- G7: how is a known customer matched (exact phone, normalised phone), and what if two records match? (EP-28-S5)
- G7: the prototype matches by name (`LeadCreate.tsx`), while FR-28-4, G7 and EP-17 match by phone. Should production match by phone only, by name only, or by both? (EP-28-S5)
- G25: when does an unworked lead become "Lost or expired", and is that automatic? (EP-28-S1, S12)
- Can a lead be assigned to, or claimed by, one staff member, and can another take it over (`takenBy`)? (EP-28-S10)
- Does the clock stop at "being worked", or only when the customer gets a reply? (EP-28-S8)
- D7 is decided: one shop, no branches; one inbox for the shop (EP-28-S1, S6, S7, S13).
