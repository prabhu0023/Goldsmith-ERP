# EP-11: Notifications engine

## 1. Summary

This epic decides who hears about what, and how. Many moments in the shop need a person to act: a parcel will not
weigh up and only the owner can clear it, staff are waiting at the counter for an edit, a lead nobody opened for 8
hours, a karigar three days past his date. Today the prototype stores the owner's preferences ("Who hears about a
late lead", "How it reaches me") but sends nothing. This epic builds one service that turns events into
notifications, routes them by channel (in the app, WhatsApp, email), fills templates, applies escalation (staff
first, then the owner), and tracks delivery status. Under D4, email is also a required channel for account emails:
the activation link a new user opens to set a password, and the password-reset link. These go out whatever the
owner's alert channel settings are. The email provider is an open choice (D4a).

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. Only the settings exist (`notifyChannels {whatsapp, app, email}`, `lateLeadAudience`), edited on the Decisions rules panel; nothing is sent.

## 3. Roles involved

- Owner: receives "your signature" items (parcel stopped, edit proposed, scrap request, late leads after escalation, overdue jobs); chooses how notifications reach him (WhatsApp, in the app, email) and who hears about a late lead first.
- Staff: receive their activation and password-reset emails; receive late-lead alerts first when `lateLeadAudience` is `staff_then_owner`; receive edit-applied and job-status notices relevant to them; read an in-app list.
- Karigar: receives their activation and password-reset emails, and reminders and status notices about their own jobs only.
- System: converts consumed events into notification records, picks recipients and channels, schedules escalation, retries delivery, records status.

## 4. In scope

- A notification record per recipient with kind, channel, template, variables, status.
- Recipient rules per event kind, using roles from EP-05 and the settings below.
- Channel routing: in-app, WhatsApp (handed to EP-12), email.
- Owner channel preferences from `settings.notifyChannels`.
- Late-lead audience from `settings.lateLeadAudience`: `staff_then_owner` or `owner_only`.
- Escalation: staff first, then the owner after a wait, if nobody acts.
- Templates with variables (for example batch id, grams, karigar name), shared by all channels.
- An in-app notification list per user, with unread state.
- Grouping for the owner by the kind of answer needed: your signature, someone stopped the line, running late, for information.
- Delivery status: queued, sent, delivered, read, failed (filled by EP-12 receipts for WhatsApp).
- Deduplication so one event produces one notification per recipient per channel.
- An email sender for the email channel, behind one interface so the provider (D4a, open) can be chosen later.
- Account emails (D4): activation link and password-reset link, sent to the address on the user record, always by email, never subject to `notifyChannels`, and replacing the EP-04 stub in staging and production.

## 5. Out of scope

- The WhatsApp provider, template registration and receipts (EP-12).
- The live push transport (EP-07); in-app notifications use it but do not own it.
- Detecting SLA breaches and overdue jobs (EP-10).
- The owner Decisions screen and its cards (EP-32).
- Storing and editing settings such as `leadSlaHours` and `lateLeadAudience` (EP-13); this epic reads them.
- Raising and clearing problems (EP-24).
- Wishes and broadcasts to customers (EP-33, EP-34); they use EP-12 directly with their own consent rules.
- Alerting on failed sends to operations (EP-37).
- Issuing and checking activation and reset links (EP-04); this epic only sends the emails.
- Sign-in codes: there is no OTP sign-in in v1 (D4).

## 6. Current state in the prototype

- `src/types/jewellery.ts` `Settings`: `notifyChannels: {whatsapp, app, email}`, `lateLeadAudience: 'staff_then_owner' | 'owner_only'`. Seed has WhatsApp and app on, email off, and `staff_then_owner`.
- `src/components/home/OwnerDecisions.tsx` (route `decisions`) shows the rules panel and calls `setSetting` for these keys; `setSetting` has no owner check (gap G12).
- `src/domain/leads.ts` `slaState` label says "owner told" but nobody is told.
- `src/store/selectors.ts` `ownerQueues` groups the owner's work into blocking items and late items; this is the closest model of the owner's notification grouping.
- `src/components/ui/OtpPanel.tsx` shows a simulated WhatsApp bubble for the owner edit code, the only "message" in the prototype. No email is sent anywhere in the prototype.
- No in-app notification list exists; `src/nav.ts` has no route id for a notification centre (gap G21).
- Mockup 13 groups: "NOTHING MOVES UNTIL YOU ANSWER", "RUNNING LATE · THE CLOCK TOLD ME, NOT A PERSON", "WENT THROUGH WITHOUT YOU TODAY · NO BUTTONS HERE"; rules panel "Who hears about a late lead: Staff first, then me / Only me" and "How it reaches me: WhatsApp / In the app / Email".
- `10-navigation-map.mmd`: node `NOTIF["Notification centre<br/>stoppages, decisions, late things"]` reachable from owner, staff and karigar.
- Reusable: the settings shape; `ownerQueues` grouping as the owner's categories; mockup 13 wording as template text.
- Must be rebuilt server-side: the service, recipient rules, routing, templates, escalation timers, delivery tracking, dedupe, in-app list.

## 7. Functional requirements

- FR-11-1. For each consumed event, the service creates one notification per intended recipient per enabled channel.
- FR-11-2. "Parcel stopped (mismatch or raised problem)" notifies the owner.
- FR-11-3. "Edit proposed / token sent" notifies the owner.
- FR-11-4. "Lead arrived / passed its SLA" for a passed SLA notifies staff first when `lateLeadAudience` is `staff_then_owner`, and the owner only when it is `owner_only`.
- FR-11-5. When staff were notified first and nobody acts on the lead within the escalation wait, the owner is notified.
- FR-11-6. "Karigar job status changed" notifies the karigar of that job and the staff and owner as the recipient rules say.
- FR-11-7. The owner's notifications go only to the channels enabled in `settings.notifyChannels`.
- FR-11-8. In-app notifications appear in the recipient's list and are pushed live through EP-07.
- FR-11-9. A user can mark an in-app notification read, and the unread count updates.
- FR-11-10. The owner's list groups notifications as your signature, someone stopped the line, running late, and for information.
- FR-11-11. Each notification is rendered from a template with variables, and the same template content is used for every channel.
- FR-11-12. WhatsApp notifications are handed to EP-12 and their status is updated from its receipts.
- FR-11-13. Email notifications are sent by the email sender and their status recorded.
- FR-11-14. A failed delivery is retried, and after the last retry it is marked failed and reported to EP-37.
- FR-11-15. The same event processed twice produces no duplicate notification.
- FR-11-16. A karigar never receives a notification about another karigar's job, a customer, a lead or stock.
- FR-11-17. Activation and password-reset emails from EP-04 are sent by the same email sender to the address on the user record, whatever `notifyChannels` says, and their delivery status is recorded without the link.

## 8. Business rules

- BR-11-1. One service for in-app, WhatsApp and email; templates; escalation (staff first, then owner); delivery status. [PRODUCTION-SCOPE §6 EP-11 scope]
- BR-11-2. Staff are warned about a late lead before the owner is (assumption, pending confirmation). [SCOPE-ANALYSIS App. A A3]
- BR-11-3. Owner notifications are grouped by the kind of answer they need. [SCOPE-ANALYSIS App. A decision 4; mockup 13]
- BR-11-4. Who hears about a late lead: "Staff first, then me" or "Only me". [mockup 13 rules panel]
- BR-11-5. How it reaches the owner: WhatsApp, in the app, email. [mockup 13 rules panel]
- BR-11-6. A parcel that matches never reaches the owner. [mockup 13; mockup 11]
- BR-11-7. Overdue karigars are reminded automatically. [mockup 13]
- BR-11-8. A karigar never sees prices, customers, leads or stock. [mockup 11]
- BR-11-9. The notification centre is always available to owner, staff and karigar. [mockup 10-navigation-map.mmd]
- BR-11-10. Outbound WhatsApp outside a conversation needs approved templates. [PRODUCTION-SCOPE §4 D8]
- BR-11-11. Email is a required channel for activation and password-reset links; every user has an email address. [PRODUCTION-SCOPE §4 D4; decisions/D4-sign-in.md]

## 9. Data

- Notification: id, recipient user id, kind, group (signature, stopped, late, info), source event name, entity type, entity id, template id, variables, channel (app, whatsapp, email), status (queued, sent, delivered, read, failed), created at, sent at, read at, attempts, dedupe key.
- Notification kinds include `account_activation` and `password_reset` (email only; the link is a variable that is never stored in plain text after sending).
- Template: id, kind, text with variables, per-channel variant if needed, WhatsApp template reference (EP-12).
- EscalationTimer: notification group id, escalate at (UTC), escalated flag.
- Settings read (EP-13): `notifyChannels`, `lateLeadAudience`.
- Template variables may include weights (for example "447.162 g vs 447.300 g"); weights come from records stored as integers in units of 0.0001 g and are formatted for display only.
- No money fields; no notification shows a price.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Notification | Turn a consumed event into notifications (internal) | System |
| List | My notifications | In-app list with unread count, grouped for the owner | Any signed-in user, own only |
| Update | My notification | Mark read | Recipient |
| Read | Notification delivery status | See whether a message was delivered | Owner |
| Update | Delivery status | Record sent, delivered, read, failed (internal) | System (EP-12 receipts, email sender) |
| List / Update | Templates | Maintain template text | Owner or operations (to decide) |

## 11. Live events

- Consumes: "Parcel stopped (mismatch or raised problem)" — notify the owner; pieces are frozen until he acts.
- Consumes: "Edit proposed / token sent" — notify the owner; staff are waiting at the counter.
- Consumes: "Lead arrived / passed its SLA" — notify staff of a new lead; on a passed SLA notify staff first or the owner per `lateLeadAudience`, and escalate.
- Consumes: "Karigar job status changed" — notify staff, the owner and the job's karigar as the recipient rules say.
- Emits: none of the catalogue. New in-app notifications are pushed to the recipient through EP-07 on the user channel.

## 12. Screens and UX references

- No route id exists for a notification centre in `src/nav.ts` (gap G21). The navigation map shows it for owner, staff and karigar.
- Not yet designed (MOCKUP-COVERAGE §3): notification centre for staff; per-user channel preferences.
- Mockups: `13-notifications-escalation.svg` (owner grouping, rules panel, staff "Stop the line" view), `10-navigation-map.mmd` (node NOTIF), `09-karigar-phone.svg` (karigar-side notices).
- The rules panel lives on `decisions` (EP-32, EP-13).

## 13. Non-functional requirements

- Performance: in-app notifications appear within about 1 second of the source event.
- Concurrency: dedupe key per event, recipient and channel prevents duplicates when events are redelivered.
- Security: recipients are chosen on the server with EP-05 permissions; a karigar's notifications are filtered to their own jobs.
- Security: activation and reset links are rendered into the email at send time and are not kept in the notification row, logs or error text.
- Personal data: customer names in late-lead notices (for example "Sharma wedding enquiry") go only to staff and the owner; WhatsApp copies are kept no longer than needed.
- Audit: changes to channel preferences and late-lead audience are audited by EP-13; delivery status changes are recorded on the notification, not in the audit log.
- Time: escalation waits and quiet hours (if decided) use Asia/Kolkata.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-07, EP-10, EP-08
- Downstream: EP-12, EP-24, EP-40, EP-41, EP-45 (activation email).

## 15. Epic acceptance criteria

1. Given BATCH-2026-044 is stopped on a mismatch, when the event is consumed, then the owner gets one notification in the "your signature" group on each enabled channel.
2. Given `lateLeadAudience` is `staff_then_owner`, when a lead passes its SLA, then staff are notified first and the owner only after the escalation wait if nobody acts.
3. Given `lateLeadAudience` is `owner_only`, when a lead passes its SLA, then only the owner is notified.
4. Given `notifyChannels` has email off, when the owner is notified, then no email is sent.
5. Given the same event delivered twice, when both are processed, then each recipient has one notification.
6. Given a karigar, when another karigar's job changes status, then the first karigar gets nothing.

## 16. Risks

- Risk: the owner is flooded and stops reading. Mitigation: only signature items interrupt; "for information" items are grouped and never pushed by WhatsApp unless decided.
- Risk: WhatsApp templates are not approved in time. Mitigation: in-app channel works first; WhatsApp is added per template as approvals arrive (D8).
- Risk: escalation fires although staff already acted. Mitigation: escalation checks the lead state at the moment it fires.
- Risk: the notification centre has no screen or route, so in-app notices are invisible. Mitigation: resolve G21 before EP-24 starts.
- Risk: settings can be changed by staff (G12). Mitigation: EP-13 decides who may change notification settings.
- Risk: the email provider (D4a) is not chosen before M1 ends, so new users cannot activate in production. Mitigation: choose it before EP-11-S12 starts; staging uses the EP-04 stub.

## 17. Open decisions and questions

- A3: are staff warned about a late lead before the owner, as assumed?
- D8: which WhatsApp provider sends notifications, and which notification kinds need approved templates?
- Which events notify by WhatsApp, and which only in the app?
- How long is the escalation wait from staff to owner?
- Are there quiet hours when WhatsApp notifications are held?
- G21: who owns the notification centre screen and its route id, given the navigation map shows it for all three roles?
- G12: may staff change `notifyChannels` or `lateLeadAudience`?
- Do staff and karigars get their own channel preferences, or only the owner?
- D4a: which email provider sends the account emails and email alerts? Open.

## 18. Candidate stories

1. EP-11-S1: System can store a notification per recipient and channel with a dedupe key
2. EP-11-S2: System can render a notification from a template with variables
3. EP-11-S3: System can pick recipients for each consumed event by role and setting
4. EP-11-S4: Owner can get notified when a parcel is stopped
5. EP-11-S5: Owner can get notified when an edit is proposed
6. EP-11-S6: Staff can get notified first about a late lead
7. EP-11-S7: System can escalate a late-lead notice to the owner after a wait
8. EP-11-S8: Karigar can get notified about changes and reminders on their own jobs
9. EP-11-S9: System can route owner notifications to the channels he enabled
10. EP-11-S10: User can see an in-app notification list and mark items read
11. EP-11-S11: Owner can see notifications grouped by the kind of answer needed
12. EP-11-S12: System can send notifications by email
13. EP-11-S13: System can hand WhatsApp notifications to the WhatsApp integration and record status
14. EP-11-S14: System can retry failed deliveries and report final failures
