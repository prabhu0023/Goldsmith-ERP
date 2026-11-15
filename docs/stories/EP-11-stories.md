# EP-11: Notifications engine · stories

Epic document: [EP-11 Notifications engine](../epics/EP-11-notifications-engine.md)

Role note: this is a layer A platform epic. Stories where the service turns events into notifications, picks recipients, routes, escalates or retries on its own use "System". Stories about what a person receives or sees use Owner, Staff or Karigar. EP-11-S10 says "User" in its candidate title because every role has the list; its "As a" field names the role used in the examples. Create Notification and Update Delivery status are internal operations and cannot be called from a browser session.

---

## EP-11-S1: System can store a notification per recipient and channel with a dedupe key

- **Story ID:** EP-11-S1
- **Title:** System can store a notification per recipient and channel with a dedupe key
- **As a:** System
- **I want:** one Notification row per recipient per channel, with kind, group, source event name, entity type and id, template id, variables, channel, status, attempts and a dedupe key built from the source event, the recipient and the channel
- **So that:** every notice has one record whose delivery can be followed, and a redelivered event never produces a second notice (FR-11-1, FR-11-15, BR-11-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the event "Parcel stopped (mismatch or raised problem)" for BATCH-2026-044 with sequence number 5120, when the service creates notices for Sanjay Seth on the app and whatsapp channels, then two Notification rows exist, each with status queued, attempts 0, group signature and entity type parcel.
  2. Given the same event with sequence number 5120 is delivered again, when it is processed, then no new row is created, because the dedupe key (event 5120, Sanjay Seth, app) and (event 5120, Sanjay Seth, whatsapp) already exist (epic acceptance criterion 5).
  3. Given two workers process event 5120 at the same moment, when both commit, then each recipient still has one row per channel, because the dedupe key is unique in the database.
  4. Given a row is created, when it is read back, then created at is a UTC time from the server clock and sent at and read at are empty.
  5. Given a browser session of any role, when it calls Create Notification, then the server refuses it, because the operation is internal.
- **Rules enforced on the server:** Create Notification is callable only from the notification service, never from a user session (EP-05-S2). The dedupe key is unique and is claimed in the same transaction that creates the row (EP-03-S6). Channel is one of app, whatsapp, email. Status is one of queued, sent, delivered, read, failed. Group is one of signature, stopped, late, info. Times come from the server clock (EP-03-S3).
- **Live events emitted / consumed:** None from this story. Event consumption per kind is in EP-11-S3 to EP-11-S8.
- **Audit entry written:** No. Notification records are operational; delivery status is kept on the notification, not in the audit log (epic section 13).
- **Data changes:** Adds the Notification table (id, recipient user id, kind, group, source event name, entity type, entity id, template id, variables, channel, status, created at, sent at, read at, attempts, dedupe key unique) with an index on recipient user id and created at, by migration (EP-02-S1).
- **UI reference:** No screen
- **Non-functional checks:** Concurrency: the unique dedupe key per event, recipient and channel stops duplicates when events are redelivered (epic section 13). Time: all times stored in UTC. Security: internal create operation unreachable from browser sessions.
- **Depends on:** EP-02-S1, EP-02-S3, EP-03-S1, EP-03-S3, EP-03-S6, EP-05-S2, EP-07-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S2: System can render a notification from a template with variables

- **Story ID:** EP-11-S2
- **Title:** System can render a notification from a template with variables
- **As a:** System
- **I want:** a Template per notification kind, with text holding named variables (for example batch id, grams, karigar name), filled from the notification's variables, with the same content used for app, WhatsApp and email
- **So that:** the owner reads the same words wherever a notice reaches him, and wording is changed in one place (FR-11-11, BR-11-1)
- **Acceptance criteria (Given / When / Then):**
  1. Given the parcel-stopped template "{batchId} will not weigh up · {shortMg} mg short" and variables batchId BATCH-2026-044 and shortMg 138, when it is rendered, then the text is "BATCH-2026-044 will not weigh up · 138 mg short", as on mockup 13.
  2. Given variables holding weights stored as integers 4471620 and 4473000 units of 0.0001 g, when the template is rendered, then they show as "447.1620 g vs 447.3000 g expected", formatted by the shared gram conversion with 4 decimals.
  3. Given the same notification is sent on app and whatsapp, when both are rendered, then the message text is identical, and the WhatsApp copy carries the template's WhatsApp template reference for EP-12.
  4. Given a template names a variable that the notification does not supply, when it is rendered, then rendering fails, the notification is marked failed with the error "missing variable", and nothing is sent.
  5. Given any template, when it is checked in tests, then it contains no price or rupee variable.
- **Rules enforced on the server:** Rendering happens on the server only. Weights are formatted for display from integer units of 0.0001 g by the shared function (EP-02-S2), never stored as text. Variables are escaped for the channel (HTML for email). No template may hold a money field. Templates are seeded by migration; who may edit them is an open question, so no edit operation is exposed in this story.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Rendering changes no record except the notification's own status on failure.
- **Data changes:** Adds the Template table (id, kind, text with variables, per-channel variant if needed, WhatsApp template reference) by migration, seeded with one template per kind used in EP-11-S4 to EP-11-S8.
- **UI reference:** No screen. Template wording follows `docs/ux/mockups/13-notifications-escalation.svg`.
- **Non-functional checks:** Precision: weights rendered from integer units of 0.0001 g to 4 decimals, no floating-point arithmetic. Security: variables escaped per channel. Open decision D8: which kinds need approved WhatsApp templates decides which templates carry a WhatsApp reference.
- **Depends on:** EP-11-S1, EP-01-S3, EP-01-S4, EP-02-S1, EP-02-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S3: System can pick recipients for each consumed event by role and setting

- **Story ID:** EP-11-S3
- **Title:** System can pick recipients for each consumed event by role and setting
- **As a:** System
- **I want:** one recipient rule per consumed event kind that picks active users by role (EP-05) and reads `settings.lateLeadAudience`, then passes each recipient to channel routing
- **So that:** the right people hear about each moment, and a karigar never hears about another karigar's job, a customer, a lead or stock (FR-11-1, FR-11-16, BR-11-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given the consumed events "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Lead arrived / passed its SLA" and "Karigar job status changed", when the service starts, then each has a registered recipient rule, and an event kind with no rule is logged and ignored.
  2. Given "Karigar job status changed" for MO-2026-118 assigned to Vijay Kumar (KG-04), when recipients are picked, then Vijay Kumar is included and Lakshmi Devi and Mahesh Soni are not (epic acceptance criterion 6).
  3. Given "Lead arrived / passed its SLA" for the Sharma wedding enquiry, when recipients are picked, then no user with role Karigar is included.
  4. Given a staff user who was deactivated, when recipients are picked, then that user is not included.
  5. Given `lateLeadAudience` is changed from `staff_then_owner` to `owner_only`, when the next passed-SLA event is processed, then the new value is used, because the setting is read at the time the event is processed.
- **Rules enforced on the server:** Recipients are chosen on the server from active users and their roles (EP-05-S1). Karigar recipients are limited to the karigar linked to the job in the event (EP-05-S3, EP-05-S13). Events are consumed only after their transaction commits (EP-07-S1). Settings are read, not written (EP-13 owns them).
- **Live events emitted / consumed:** consumed: "Parcel stopped (mismatch or raised problem)", "Edit proposed / token sent", "Lead arrived / passed its SLA", "Karigar job status changed", and the proposed "Job passed its agreed date" (README gap G26). emitted: None.
- **Audit entry written:** No. Picking recipients changes no business record.
- **Data changes:** None in the product database. Reads users, roles, karigar links and `settings.lateLeadAudience` (EP-02-S12).
- **UI reference:** No screen
- **Non-functional checks:** Security: recipients chosen on the server with EP-05 permissions; a karigar's notifications are filtered to their own jobs (epic section 13). Personal data: customer names in lead notices go only to Staff and Owner. Open decision A3: whether staff are warned before the owner; the rule reads `lateLeadAudience` either way.
- **Depends on:** EP-11-S1, EP-02-S12, EP-05-S1, EP-05-S3, EP-05-S7, EP-05-S13, EP-07-S1, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S4: Owner can get notified when a parcel is stopped

- **Story ID:** EP-11-S4
- **Title:** Owner can get notified when a parcel is stopped
- **As a:** Owner
- **I want:** a notice in the "your signature" group whenever a parcel is stopped on a mismatch or because someone raised a problem
- **So that:** I can clear or reject it quickly, because its pieces are frozen until I act, and a parcel that matches never reaches me (FR-11-2, BR-11-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given BATCH-2026-044 from Mahesh Soni is stopped on a mismatch (447.1620 g against 447.3000 g expected), when the event is consumed, then Sanjay Seth gets one notification in the signature group on each channel enabled in `notifyChannels`, reading "BATCH-2026-044 will not weigh up · 138 mg short" (epic acceptance criterion 1).
  2. Given Rajesh Verma presses "Tell the owner" on "Stop the line" for BATCH-2026-044 with the note "Parcel is 138 mg under", when the event is consumed, then Sanjay gets a notification in the stopped group that includes the note and Rajesh's name.
  3. Given three parcels match exactly and are released by staff, when their events are processed, then Sanjay gets no signature or stopped notification for them.
  4. Given the in-app channel is on, when the parcel is stopped, then the notification appears in Sanjay's list within about 1 second of the event.
  5. Given a Staff or Karigar user, when the parcel is stopped on a mismatch, then they get no notification from this rule.
- **Rules enforced on the server:** Only the "Parcel stopped (mismatch or raised problem)" event triggers this notice; the stop itself and the frozen state are owned by EP-23 and EP-24. Recipient is every active Owner (EP-11-S3). Channels follow EP-11-S9. One notice per event per recipient per channel (EP-11-S1).
- **Live events emitted / consumed:** consumed: "Parcel stopped (mismatch or raised problem)". emitted: none of the catalogue; the new in-app notification is pushed on the owner's user channel (EP-07-S4).
- **Audit entry written:** No. The stop is audited by the epic that stops the parcel; the notification is not audited (epic section 13).
- **Data changes:** Notification rows only. Seeds the parcel-stopped and line-stopped templates.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` (block "NOTHING MOVES UNTIL YOU ANSWER", card "BATCH-2026-044 will not weigh up · 138 mg short"; staff panel "Stop the line"). The in-app list itself is not yet designed (G21).
- **Non-functional checks:** Performance: in-app notice within about 1 second of the event. Precision: grams shown to 4 decimals from integer units. Concurrency: redelivered stop event gives one notice per channel.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S3, EP-07-S4, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S5: Owner can get notified when an edit is proposed

- **Story ID:** EP-11-S5
- **Title:** Owner can get notified when an edit is proposed
- **As a:** Owner
- **I want:** a notice in the "your signature" group when staff propose an edit to a tag in stock, naming the piece, the field and the proposer
- **So that:** I read the change while staff are still waiting at the counter (FR-11-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma proposes taking 40 mg off TAG-8841, when "Edit proposed / token sent" is consumed, then Sanjay Seth gets one signature-group notification per enabled channel naming Rajesh, TAG-8841 and the change.
  2. Given Deepak proposes changing the stone count on TAG-9012 a minute later, when that event is consumed, then Sanjay gets a second, separate notification for TAG-9012.
  3. Given the event carries the edit token, when the notification is stored and rendered, then neither the Notification variables nor the message text contain the token value; at most a token reference is kept.
  4. Given the edit is applied or its token expires, when Sanjay opens his list, then the notification still shows and links to the edit on `edit-apply`.
  5. Given a Staff user other than the proposer, when the edit is proposed, then they get no notification from this rule.
- **Rules enforced on the server:** Recipient is every active Owner. The token value is never written to a Notification row or a template variable (EP-06-S4 rule applied here); delivering the token itself is the edit-proposal flow's job (EP-25 through EP-12). One notice per event per recipient per channel.
- **Live events emitted / consumed:** consumed: "Edit proposed / token sent". emitted: none of the catalogue; the in-app notification is pushed on the owner's user channel (EP-07-S4).
- **Audit entry written:** No. The proposal is audited by EP-25; the notification is not audited (epic section 13).
- **Data changes:** Notification rows only. Seeds the edit-proposed template.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` (card "2 edits proposed on tags in stock", "Read them"); `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply`.
- **Non-functional checks:** Security: no token value in notifications or logs. Performance: in-app notice within about 1 second.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S3, EP-06-S4, EP-07-S4, EP-07-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S6: Staff can get notified first about a late lead

- **Story ID:** EP-11-S6
- **Title:** Staff can get notified first about a late lead
- **As a:** Staff
- **I want:** a notice when a lead passes its SLA while `lateLeadAudience` is `staff_then_owner`, before the owner hears about it
- **So that:** I can open the lead myself and the owner is only told if nobody acts (FR-11-4, BR-11-2, BR-11-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given `lateLeadAudience` is `staff_then_owner` and the Sharma wedding enquiry passes its 8-hour SLA, when the passed-SLA event is consumed, then every active Staff user, including Rajesh Verma, gets a late-group notification and Sanjay Seth gets none yet (epic acceptance criterion 2).
  2. Given the same setup, when the notices are created, then an escalation timer is scheduled for the lead (EP-11-S7).
  3. Given `lateLeadAudience` is `owner_only`, when the lead passes its SLA, then only Sanjay is notified and no Staff user gets a late-lead notice (epic acceptance criterion 3).
  4. Given a new lead arrives (not yet late), when "Lead arrived / passed its SLA" is consumed for the arrival, then Staff get an info-group notice of the new lead and the owner gets none.
  5. Given Vijay Kumar (Karigar), when any lead passes its SLA, then he gets nothing.
- **Rules enforced on the server:** The audience is read from `settings.lateLeadAudience` when the event is processed. The passed-SLA half is emitted by EP-10-S5 once per lead. Customer names in the text go only to Staff and Owner.
- **Live events emitted / consumed:** consumed: "Lead arrived / passed its SLA". emitted: none of the catalogue; in-app notices pushed on each recipient's user channel (EP-07-S4).
- **Audit entry written:** No. The lead being marked late is audited by EP-10-S5; notifications are not audited.
- **Data changes:** Notification rows; an EscalationTimer row when the audience is `staff_then_owner`. Seeds the late-lead and new-lead templates.
- **UI reference:** Not yet designed for staff (staff notification centre, MOCKUP-COVERAGE §3). Setting shown on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("Who hears about a late lead: Staff first, then me / Only me"); lead shown on `docs/ux/mockups/16-lead-inbox.svg`, route `leads`.
- **Non-functional checks:** Personal data: customer names in late-lead notices go only to Staff and Owner. Open decision A3: whether staff are warned before the owner is still to be confirmed; the criteria follow the setting. Open question: which channels staff notices use (only in the app, or also WhatsApp) and whether staff get their own channel preferences.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S3, EP-10-S5, EP-07-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S7: System can escalate a late-lead notice to the owner after a wait

- **Story ID:** EP-11-S7
- **Title:** System can escalate a late-lead notice to the owner after a wait
- **As a:** System
- **I want:** an EscalationTimer per late lead that, after the escalation wait, checks the lead's state and notifies the owner only if nobody has acted
- **So that:** a lead staff ignore still reaches the owner, and a lead staff picked up does not bother him (FR-11-5, BR-11-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Staff were notified at 17:00 that the bulk chain order from Erode is late and the escalation wait is W, when 17:00 plus W passes and the lead is still `needs_glance` or `opened`, then Sanjay Seth gets one late-group notification and the timer's escalated flag is set (epic acceptance criterion 2).
  2. Given Rajesh Verma moves the lead to `being_worked` before the wait ends, when the timer fires, then the owner is not notified, because the lead state is checked at the moment it fires.
  3. Given two scheduler workers fire the same timer, when both finish, then Sanjay has one escalation notice per channel.
  4. Given the scheduler was down when the timer was due, when it restarts, then the timer fires once on catch-up with the same state check.
  5. Given `lateLeadAudience` is `owner_only`, when a lead passes its SLA, then no escalation timer is created.
- **Rules enforced on the server:** The timer runs as a delayed job (EP-10-S1) with the idempotency key lead id plus "escalate" (EP-10-S4). The state check runs inside the job's transaction. Escalate at is stored in UTC. The wait length is a setting value read at scheduling time until decided.
- **Live events emitted / consumed:** consumed: none directly; the timer is created from the "Lead arrived / passed its SLA" notice in EP-11-S6. emitted: none of the catalogue; the owner's in-app notice is pushed on his user channel (EP-07-S4).
- **Audit entry written:** No. Escalation creates a notification only and changes no business record (epic section 13).
- **Data changes:** Adds the EscalationTimer table (notification group id, lead id, escalate at UTC, escalated flag) by migration (EP-02-S1).
- **UI reference:** No screen of its own. The result shows on `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` ("2 leads nobody has opened for over 8 hours · Sharma wedding enquiry (11 h) · bulk chain order from Erode (9 h)").
- **Non-functional checks:** Time: escalation wait measured on the server clock, stored in UTC, with any quiet hours computed in Asia/Kolkata. Concurrency: one escalation per lead. Availability: missed timers fire on restart (EP-10-S11). Open question: the length of the escalation wait is not decided; tests use a configured value.
- **Depends on:** EP-11-S6, EP-10-S1, EP-10-S4, EP-10-S6, EP-10-S11, EP-02-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S8: Karigar can get notified about changes and reminders on their own jobs

- **Story ID:** EP-11-S8
- **Title:** Karigar can get notified about changes and reminders on their own jobs
- **As a:** Karigar
- **I want:** a notice when the status of one of my jobs changes from the desk side, and a reminder when my job passes its agreed date
- **So that:** I know what the desk expects without phoning, and nobody has to chase me by hand (FR-11-6, FR-11-16, BR-11-7, BR-11-8)
- **Acceptance criteria (Given / When / Then):**
  1. Given job MO-2026-118 assigned to Vijay Kumar (KG-04) moves from `sent` to `accepted`, when "Karigar job status changed" is consumed, then Vijay gets one notification naming the job and its new status, and staff and owner get notices as the recipient rule says.
  2. Given Mahesh Soni's job is 3 days past its agreed date, when the overdue job hands over the day's reminder, then Mahesh gets one reminder for that job for that day.
  3. Given Lakshmi Devi's job changes status, when recipients are picked, then Vijay Kumar gets nothing (epic acceptance criterion 6).
  4. Given any karigar notification, when its text is rendered, then it contains no price, customer name, lead or stock detail; only the job number, piece name, due date and target weights.
  5. Given Vijay changes the status himself on `k-jobs` ("Working on it"), when the event is consumed, then he gets no notice about his own change.
- **Rules enforced on the server:** A karigar recipient is only the karigar linked to the job in the event (EP-05-S3, EP-05-S13). The actor of the change is not notified of their own action. Karigar templates may not use customer, lead, stock or money variables. One reminder per job per day, keyed by EP-10-S7.
- **Live events emitted / consumed:** consumed: "Karigar job status changed", and the proposed "Job passed its agreed date" (README gap G26). emitted: none of the catalogue; in-app notice pushed on the karigar's user channel (EP-07-S4, EP-07-S6).
- **Audit entry written:** No. The status change and overdue mark are audited where they happen (EP-06-S7, EP-10-S12).
- **Data changes:** Notification rows only. Seeds the job-status and job-overdue templates.
- **UI reference:** `docs/ux/mockups/09-karigar-phone.svg`, route `k-jobs` ("My jobs", "Due today", "Where is it now?"). A karigar notification list is not yet designed (G21).
- **Non-functional checks:** Security: karigar notices filtered to their own jobs; no prices, customers, leads or stock. Open question: which channels a karigar's notices use and whether karigars get their own channel preferences. Open question G26: "Job passed its agreed date" is proposed, not yet in the catalogue.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S3, EP-05-S3, EP-05-S13, EP-07-S4, EP-07-S6, EP-10-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S9: System can route owner notifications to the channels he enabled

- **Story ID:** EP-11-S9
- **Title:** System can route owner notifications to the channels he enabled
- **As a:** System
- **I want:** each owner recipient to get one Notification row per channel switched on in `settings.notifyChannels` (whatsapp, app, email), read when the event is processed
- **So that:** the owner is reached only the way he chose on the rules panel (FR-11-7, BR-11-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given `notifyChannels` is whatsapp on, app on, email off (the seed), when Sanjay Seth is notified that BATCH-2026-044 stopped, then a whatsapp row and an app row are created and no email row (epic acceptance criterion 4).
  2. Given Sanjay switches email on, when the next owner notification is created, then it also gets an email row.
  3. Given all three channels are off, when an owner notification is created, then an app row is still created so the item shows in his list, and nothing is sent outside the app.
  4. Given an info-group notice such as "3 parcels went live this morning without you", when it is routed, then it goes to the app only and is not pushed by WhatsApp.
  5. Given a Staff or Karigar recipient, when a notice is routed, then `notifyChannels` is not applied to them; they get the app channel.
- **Rules enforced on the server:** `notifyChannels` is read from settings (EP-02-S12) when each event is processed. Info-group items go to the app only unless decided otherwise (epic section 16 risk). Who may change `notifyChannels` is decided in EP-13 (G12).
- **Live events emitted / consumed:** None from this story. A future "Setting changed" event (README gap G26) would not be needed, because the setting is read per event.
- **Audit entry written:** No. Routing changes no business record; changes to `notifyChannels` are audited by EP-13 (EP-06-S8).
- **Data changes:** None in the product database beyond Notification rows. Reads `settings.notifyChannels`.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` (rules panel "How it reaches me: WhatsApp / In the app / Email").
- **Non-functional checks:** Audit: preference changes audited by EP-13, not here (epic section 13). Open decision D8 and open question: which events notify by WhatsApp and which only in the app; criterion 4 holds until decided. Open question: whether staff and karigars get their own channel preferences; criterion 5 assumes not.
- **Depends on:** EP-11-S1, EP-11-S3, EP-02-S12, EP-06-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S10: User can see an in-app notification list and mark items read

- **Story ID:** EP-11-S10
- **Title:** User can see an in-app notification list and mark items read
- **As a:** Staff (also Owner and Karigar, each seeing only their own)
- **I want:** a list of my in-app notifications, newest first, with an unread count, that updates live and lets me mark an item read
- **So that:** I do not miss a stoppage, decision or late item, from any screen (FR-11-8, FR-11-9, BR-11-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma has 3 unread app notifications, when he calls List My notifications, then he gets only his own rows, newest first, 50 per page with a cursor, and an unread count of 3.
  2. Given a new late-lead notice is created for Rajesh, when it commits, then it appears in his open list and the unread count goes to 4 within about 1 second, without a refresh.
  3. Given Rajesh marks one item read, when the update commits, then its status is read, read at is set, and the unread count is 3 on every device where he is signed in.
  4. Given Rajesh calls Update My notification on a notification of Sanjay Seth's, when the server checks it, then it answers `not_found` and nothing changes.
  5. Given the list cannot be loaded, when the screen shows, then it shows the loading state and then the read error with "Try again" from the data layer.
- **Rules enforced on the server:** List and Update are limited to the caller's own notifications, by recipient user id from the session (EP-03-S3). Only the recipient may mark read. Read is one-way: a read item cannot go back to unread. Pages use a cursor (EP-03-S9).
- **Live events emitted / consumed:** emitted: none of the catalogue; new notifications and read-state changes are pushed on the recipient's user channel (EP-07-S4). consumed: None.
- **Audit entry written:** No. Marking a notice read is not a business change (epic section 13).
- **Data changes:** Updates Notification status and read at. Adds List My notifications and Update My notification to the shared contract (EP-03-S1).
- **UI reference:** Not yet designed. No route id for the notification centre exists in `src/nav.ts` (G21); `docs/ux/mockups/10-navigation-map.mmd` shows node NOTIF ("Notification centre · stoppages, decisions, late things") for owner, staff and karigar.
- **Non-functional checks:** Performance: new in-app notice visible within about 1 second (epic section 13). Security: own notifications only. Open question G21: who owns the notification centre screen and its route id; the operations are built here and the screen is placed once G21 is decided.
- **Depends on:** EP-11-S1, EP-03-S1, EP-03-S3, EP-03-S9, EP-07-S4, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S11: Owner can see notifications grouped by the kind of answer needed

- **Story ID:** EP-11-S11
- **Title:** Owner can see notifications grouped by the kind of answer needed
- **As a:** Owner
- **I want:** my notification list split into four groups: your signature, someone stopped the line, running late, and for information
- **So that:** I answer what only I can answer first and skim the rest (FR-11-10, BR-11-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has the BATCH-2026-044 mismatch, the 2 edit proposals and 1 scrap request unread, when he lists his notifications grouped, then they are in the signature group with a count for that group.
  2. Given Vijay Kumar stopped his own job MO-2026-118, when the list is grouped, then that notice is in the stopped group.
  3. Given 2 late leads and 2 overdue karigar jobs, when the list is grouped, then they are in the late group, which is marked as told by the clock, not a person.
  4. Given "3 parcels went live this morning without you" and "11 pieces went out · 4 wishes sent", when the list is grouped, then they are in the info group, which has no action buttons.
  5. Given a Staff user, when they list their notifications, then they get a flat list without the owner's grouping.
- **Rules enforced on the server:** The group is set on the Notification row when it is created, from its kind, not chosen by the client. The grouped List response is returned only for the Owner role.
- **Live events emitted / consumed:** None beyond EP-11-S10; group counts update from the same user-channel pushes.
- **Audit entry written:** No. Reading the list changes nothing.
- **Data changes:** None beyond the group column from EP-11-S1. Adds a grouped option to List My notifications.
- **UI reference:** `docs/ux/mockups/13-notifications-escalation.svg`, route `decisions` (blocks "NOTHING MOVES UNTIL YOU ANSWER · 4", "RUNNING LATE · 2 · THE CLOCK TOLD ME, NOT A PERSON", "WENT THROUGH WITHOUT YOU TODAY · NO BUTTONS HERE"). The Decisions cards themselves are EP-32; the notification centre layout is not yet designed (G21).
- **Non-functional checks:** Performance: grouped list returns in under 200 ms for 200 notifications. Open question G21: where the grouped list is shown.
- **Depends on:** EP-11-S10, EP-11-S4, EP-11-S5, EP-11-S6, EP-11-S7, EP-11-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S12: System can send notifications by email

- **Story ID:** EP-11-S12
- **Title:** System can send notifications by email
- **As a:** System
- **I want:** an email sender that takes each queued email Notification, renders it from its template, sends it to the recipient's email address and records sent or failed with the time, and that also sends the EP-04 account emails (activation link and password-reset link) to the address on the user record, whatever `notifyChannels` says
- **So that:** the owner can choose email on the rules panel and actually receive mail, and every new user can activate their account and every user can reset a forgotten password in production (FR-11-13, FR-11-17, BR-11-11)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth has email switched on and an email address on his user record, when a queued email notification for BATCH-2026-044 is picked up, then one email is sent with the rendered subject and body, the row's status is sent and sent at is set.
  2. Given the mail provider rejects the message, when the attempt ends, then attempts is 1, status stays queued for retry, and the error is kept without the recipient's address in logs.
  3. Given a recipient with no email address, when an email row would be created, then no row is created and an app row still exists.
  4. Given the mail credentials, when the code and repository are checked, then they come from environment variables only and appear in no file or log.
  5. Given the same email row is picked up by two workers, when both run, then one email is sent.
  6. Given `notifyChannels.email` is off and EP-04 issues an activation link for Deepak Rao, when the account email is queued, then it is still sent to his email address with the subject "Set your JGD password", and the stored row holds no link.
  7. Given production, when EP-04 sends an activation or reset email, then this sender is used and the EP-04-S4 stub is not.
- **Rules enforced on the server:** Sends run as background jobs (EP-10-S1) keyed by notification id (EP-10-S4). Credentials come from environment variables (EP-01-S6). The email body uses the same template text as other channels (EP-11-S2), HTML-escaped.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Delivery status is recorded on the notification (epic section 13).
- **Data changes:** Updates Notification status, sent at and attempts. Reads the user's email address, which is required on every user (EP-02-S3, D4). Registers this sender as the production implementation of the EP-04-S4 account-email interface.
- **UI reference:** No screen
- **Non-functional checks:** Security: mail credentials in environment variables only. Personal data: no email addresses in logs or job error text. Concurrency: one send per row. Security: activation and reset links are rendered at send time and never stored in the row, logs or error text. Open decision D4a: the email provider is not chosen; the sender sits behind one interface.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S9, EP-01-S6, EP-02-S3, EP-10-S1, EP-10-S4, EP-04-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S13: System can hand WhatsApp notifications to the WhatsApp integration and record status

- **Story ID:** EP-11-S13
- **Title:** System can hand WhatsApp notifications to the WhatsApp integration and record status
- **As a:** System
- **I want:** queued whatsapp Notification rows handed to a WhatsApp send interface with the recipient's phone, template reference and variables, and Update Delivery status called from its receipts
- **So that:** the owner gets WhatsApp notices and anyone can see whether a message was sent, delivered, read or failed (FR-11-12, BR-11-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a queued whatsapp row for Sanjay Seth about BATCH-2026-044, when it is picked up, then it is passed once to the WhatsApp send interface with his phone, the template's WhatsApp reference and the variables, and the row's status becomes sent with sent at set.
  2. Given a receipt "delivered" and then "read" for that message, when Update Delivery status is called for each, then the row shows delivered and then read, with read at set.
  3. Given receipts arrive out of order (read before delivered), when both are applied, then the row ends as read and does not move back to delivered.
  4. Given the kind has no approved WhatsApp template, when routing creates the rows, then no whatsapp row is created and the app row still exists.
  5. Given the owner calls Read Notification delivery status for that notice, when it returns, then he sees each channel's status; a Staff or Karigar caller gets `forbidden`.
- **Rules enforced on the server:** Update Delivery status is internal and callable only by the WhatsApp integration's receipt handler and the email sender. Status only moves forward: queued, sent, delivered, read; failed is final. Until EP-12 is built, the send interface is a stub that records the call, as EP-04-S4 does for account emails. Read Notification delivery status is Owner only.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Delivery status is recorded on the notification, not in the audit log (epic section 13).
- **Data changes:** Updates Notification status, sent at, read at, attempts. Adds a provider message id column to Notification by migration. Adds Read Notification delivery status and the internal Update Delivery status to the shared contract (EP-03-S1).
- **UI reference:** No screen. Not yet designed for delivery status.
- **Non-functional checks:** Personal data: WhatsApp message copies kept no longer than needed; phone numbers not logged. Open decision D8: which WhatsApp provider is used and which kinds need approved templates. Open question: quiet hours when WhatsApp notices are held, computed in Asia/Kolkata if decided.
- **Depends on:** EP-11-S1, EP-11-S2, EP-11-S9, EP-03-S1, EP-04-S4, EP-05-S2, EP-10-S1, EP-10-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-11-S14: System can retry failed deliveries and report final failures

- **Story ID:** EP-11-S14
- **Title:** System can retry failed deliveries and report final failures
- **As a:** System
- **I want:** a failed WhatsApp or email send to be retried with backoff, and after the last attempt marked failed and passed to the alerting hook that EP-37 fills in
- **So that:** a short provider outage does not lose an alert, and a notice that never got through is visible (FR-11-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given an email send to Sanjay Seth fails on attempt 1 and succeeds on attempt 2, when it finishes, then the row's status is sent and attempts is 2.
  2. Given a WhatsApp send fails on every attempt up to the maximum, when the last attempt ends, then the row's status is failed and the failure is handed to the EP-37 alerting hook with notification id, channel and error, but no phone number or message text.
  3. Given a whatsapp row for the BATCH-2026-044 stop has failed, when Sanjay opens his in-app list, then the app notification for the same event is still there.
  4. Given a retry and a late original attempt run together, when both finish, then one message is sent, because they share the notification id as idempotency key.
  5. Given a row marked failed, when the scheduler next ticks, then it is not retried again by itself.
- **Rules enforced on the server:** Retries use the background job retry and backoff from EP-10-S3, with the notification id as the idempotency key (EP-10-S4). Max attempts per channel is set in the job definition. Failed is a final status.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Delivery attempts are recorded on the notification (epic section 13).
- **Data changes:** Updates Notification attempts and status.
- **UI reference:** No screen
- **Non-functional checks:** Availability: provider outages ridden out by retries; the app channel does not depend on them. Personal data: no phone numbers, email addresses or message text passed to alerting. Open question: retry counts and intervals are not set in the sources; tests check that each wait is longer than the last.
- **Depends on:** EP-11-S12, EP-11-S13, EP-10-S2, EP-10-S3, EP-10-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- A3: are staff warned about a late lead before the owner, as assumed? (EP-11-S3, S6, S7)
- D8: which WhatsApp provider sends notifications, and which notification kinds need approved templates? (EP-11-S2, S9, S13)
- Which events notify by WhatsApp, and which only in the app? (EP-11-S6, S9, S13)
- How long is the escalation wait from staff to owner? (EP-11-S7)
- Are there quiet hours when WhatsApp notifications are held? (EP-11-S7, S13)
- G21: who owns the notification centre screen and its route id, given the navigation map shows it for all three roles? (EP-11-S4, S8, S10, S11)
- G12: may staff change `notifyChannels` or `lateLeadAudience`? (EP-11-S9)
- Do staff and karigars get their own channel preferences, or only the owner? (EP-11-S6, S8, S9)
- D4a: which email provider sends the account emails and email alerts? (EP-11-S12)
