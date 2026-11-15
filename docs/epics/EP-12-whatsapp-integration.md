# EP-12: WhatsApp integration

## 1. Summary

This epic connects the system to a real WhatsApp Business provider. Staff, karigars and customers already live on
WhatsApp. The shop needs it to send the owner's edit code (edit token), alerts, birthday wishes and broadcasts, and
to receive purchase orders and broadcast replies that become leads. Today every message is simulated: the token
appears in a fake bubble and a "reply" is made by a button. This epic covers the provider connection, template
registration, outbound sending, the inbound webhook, and delivery and read receipts. Sign-in does not use WhatsApp:
D4 decided phone number and password, with no OTP sign-in in v1. The owner edit code is a WhatsApp
authentication-template use: when the owner applies a staff edit, a one-time code goes to his registered mobile
number (EP-25).

## 2. Layer, milestone, status

- Layer: A · Platform foundation
- Milestone: M1 Platform
- Prototype status: Not built. Messages are simulated: `OtpPanel` shows a fake WhatsApp bubble, `simulateReply` in `src/store/transitions.ts` turns a broadcast reply into a lead, and wishes and broadcasts are only recorded.

## 3. Roles involved

- Owner: receives the edit token and alerts on WhatsApp; may be a sender identity for wishes.
- Staff: receive staff alerts; may be a sender identity for wishes. No sign-in message (D4).
- Karigar: receives job reminders on their own phone. No sign-in message (D4).
- System: holds provider credentials, registers templates, sends messages, verifies and processes inbound webhooks, stores receipts, handles opt-out keywords.
- Customers (not users): receive wishes, broadcasts and catalogue links if they opted in; send POs and replies.

## 4. In scope

- Connection to the provider chosen under D8, with credentials in environment configuration.
- Registration and tracking of message templates (owner edit code as an authentication template, alerts, wishes, broadcasts, catalogue share) and their approval status.
- Outbound template messages for messages outside a conversation window.
- Outbound session messages inside an open conversation window.
- An inbound webhook with signature verification, handing messages and media to the right epic (POs to EP-29, broadcast replies to EP-29, media files to EP-09).
- Delivery, read and failure receipts stored against each outbound message.
- A consent check before any message to a customer: only customers with `optedIn` true.
- Opt-out keyword handling that sets the customer's consent to off.
- One or more sender identities (numbers), as decided.
- Failures handed to EP-37 for alerting.

## 5. Out of scope

- Deciding who gets which notification and on which channel (EP-11).
- The edit-token flow (EP-25); this epic only delivers the code.
- Sign-in (EP-04): phone and password, no WhatsApp message. OTP sign-in is deferred (D4).
- The wishes queue and the two sender identities on the wishes screen (EP-33).
- Broadcast audience, preview, scheduling and tracking screens (EP-34, gap G17).
- Parsing inbound POs into lead fields and creating leads (EP-29).
- Storing media files (EP-09).
- Customer consent records and opt-out screens (EP-17, EP-39).
- Alerting on failed sends (EP-37).
- Approving edit-code requests by WhatsApp reply (EP-25, UX-SPEC §7 Q5).
- Templates in languages other than English: v1 is English only; translated templates are owned by EP-44 Localisation.

## 6. Current state in the prototype

- `src/components/ui/OtpPanel.tsx`: "Six boxes plus a simulated WhatsApp bubble showing the code the owner would receive." Used on `edit-apply`.
- `src/domain/edits.ts` `makeToken` and `formatToken` produce the token shown in the bubble, for example "480 913".
- `src/store/transitions.ts` `sendWishes` records a `WishRecord {id, at, customerId, kind, sender}` for each opted-in customer whose birthday or anniversary is today; nothing is sent.
- `sendBroadcast` records a `Broadcast` with `recipientIds` limited to `optedIn` customers and refuses pieces not `in_stock`; nothing is sent.
- `simulateReply` makes a lead with `source: 'whatsapp'`, `state: 'needs_glance'`, `confidence: 'unsure'` from a broadcast reply.
- `Customer.optedIn` in `src/types/jewellery.ts` is the only consent field.
- Mockup 05: "JGD: confirm edit to TAG-8841. Token 480 913". Mockups 16 and 17: POs "from WhatsApp". Mockup 27: "Delivered, opened, and who replied are tracked". Mockup 26: two sender identities, including "Priya (Manager)" (gap G20).
- Reusable: the `optedIn` checks in `sendWishes` and `sendBroadcast`; the message wording in the mockups as template text; `simulateReply` as the shape of an inbound reply.
- Must be rebuilt server-side: the provider client, templates, webhook, signature check, receipts, opt-out handling and secret storage.

## 7. Functional requirements

- FR-12-1. The system connects to the provider using credentials read from environment configuration only.
- FR-12-2. The system can register a template with the provider and record its approval status (pending, approved, rejected).
- FR-12-3. A send request for a template that is not approved is refused with a sentence naming the template.
- FR-12-4. The system sends a template message with variables to a phone number and records the provider message id.
- FR-12-5. Inside an open conversation window the system can send a session message without a template.
- FR-12-6. Before sending to a customer, the system checks that the customer's consent is on, and refuses otherwise.
- FR-12-7. The inbound webhook rejects any request whose provider signature does not verify.
- FR-12-8. A verified inbound message is stored once, even if the provider delivers it twice.
- FR-12-9. An inbound message that is a PO or a broadcast reply is handed to EP-29 with sender phone, text and media.
- FR-12-10. Inbound media is handed to EP-09 for storage and linked to the message.
- FR-12-11. Delivery, read and failure receipts update the status of the matching outbound message.
- FR-12-12. An inbound opt-out keyword sets that customer's consent to off and stops further customer messages.
- FR-12-13. A failed send is reported to EP-11 for retry and to EP-37 for alerting.
- FR-12-14. Owner edit code (token) values are never written to logs, the message store or the audit log in plain text.

## 8. Business rules

- BR-12-1. Scope is provider connection, template registration, outbound send, inbound webhook, and delivery and read receipts. [PRODUCTION-SCOPE §6 EP-12 scope]
- BR-12-2. Outbound messages outside a conversation need pre-approved templates, so wishes, broadcasts and the owner edit code need approval lead time. [PRODUCTION-SCOPE §4 D8]
- BR-12-3. Record consent for WhatsApp messaging and honour opt-out. [PRODUCTION-SCOPE §5 Personal data]
- BR-12-4. Only opted-in customers receive wishes and broadcasts. [src/store/transitions.ts sendWishes, sendBroadcast]
- BR-12-5. Owner edit codes (edit tokens) are never logged in plain text. [PRODUCTION-SCOPE §5 Security]
- BR-12-6. Secrets live in environment configuration. [PRODUCTION-SCOPE §5 Security]
- BR-12-7. The edit token goes to the owner's WhatsApp. [mockup 05; PRODUCTION-SCOPE §6 EP-25 scope]
- BR-12-8. Broadcast replies become leads. [mockup 27; PRODUCTION-SCOPE §6 EP-34 scope]
- BR-12-9. Unreadable POs still create a lead. [SCOPE-ANALYSIS App. H]
- BR-12-10. Delivered, opened and who replied are tracked for broadcasts. [mockup 27]
- BR-12-11. WhatsApp is not used for sign-in in v1. [PRODUCTION-SCOPE §4 D4; decisions/D4-sign-in.md]

## 9. Data

- WhatsAppTemplate: id, name, purpose (edit token, alert, wish, broadcast, catalogue), language (English in v1; EP-44 adds others), body with variables, provider template id, approval status, updated at.
- OutboundMessage: id, recipient phone, recipient type (user or customer), recipient id, sender identity, template id or session flag, variables (token variables stored as a reference only), provider message id, status (queued, sent, delivered, read, failed), failure reason, timestamps (UTC), source notification id (EP-11) or broadcast or wish id.
- InboundMessage: id, provider message id (unique), sender phone, text, media file ids (EP-09), received at, conversation window ends at, handed to (lead id), dedupe key.
- SenderIdentity: id, display name, phone number, provider account reference.
- Customer consent (EP-17, changed here by opt-out): `optedIn`, changed at, changed by (System on keyword).
- No weights are stored here; message variables that show grams come from records stored as integers in units of 0.0001 g.
- No money fields; no message carries a price until EP-42.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Create | Template | Register a template with the provider | Owner or operations (to decide) |
| List | Templates | See templates and approval status | Owner |
| Send | Template message | Send an approved template to a phone (internal) | System (EP-04, EP-11, EP-25, EP-33, EP-34) |
| Send | Session message | Reply inside an open conversation window (internal) | System |
| Receive | Inbound webhook | Accept a verified provider callback with a message or receipt | Provider only, signature verified |
| Read | Message status | See delivered, read or failed for a message | Owner; Staff for broadcasts they sent |

## 11. Live events

- Emits: none of the catalogue directly. An inbound PO or broadcast reply is handed to EP-29, which creates the lead and emits "Lead arrived / passed its SLA".
- Consumes: none. Outbound sends are requested by EP-11, EP-04, EP-25, EP-33 and EP-34 through internal calls, not through live events.

## 12. Screens and UX references

No screen of its own. Screens that depend on it: `edit-apply` (token to the owner's WhatsApp), `wishes`, `broadcast`,
`catalogue`, `leads` and `lead-review` (WhatsApp POs and replies). The sign-in screen does not use WhatsApp (D4).
Mockups: `05-edit-propose-apply.svg`, `16-lead-inbox.svg`, `17-lead-create.svg`, `26-wishes.svg`, `27-broadcast.svg`,
`28-catalogue-share.svg`.

## 13. Non-functional requirements

- Security: provider credentials only in environment configuration; webhook signature verified on every call; owner edit code values never logged or stored in plain text.
- Personal data: customer phones and message text are personal data under the DPDP Act 2023; send only to `optedIn` customers; honour opt-out at once; keep message bodies only as long as the retention rule says.
- Concurrency: inbound messages deduplicated by provider message id, so a redelivered webhook creates one lead.
- Availability and recovery: a provider outage queues outbound messages for retry (EP-11) and alerts operations (EP-37).
- Performance: the owner edit code reaches the owner's phone fast enough that the 10-minute expiry is not consumed by delivery.
- Audit: consent changes from opt-out keywords are audited with a System actor (EP-06).

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-11
- Downstream: EP-25, EP-29, EP-33, EP-37, EP-40, EP-41, EP-44.

## 15. Epic acceptance criteria

1. Given an approved `edit_token` template, when the owner applies a staff edit, then a WhatsApp message with the code reaches the owner's registered mobile number and the stored message holds no plain code.
2. Given a template still pending approval, when a send is requested, then it is refused with a sentence naming the template.
3. Given a customer with consent off, when a wish or broadcast is sent to them, then nothing is sent.
4. Given a webhook call with a bad signature, when it arrives, then it is rejected and nothing is stored.
5. Given a customer replies "STOP" (or the decided keyword), when the webhook processes it, then their consent is off and the change is audited.
6. Given a sent message, when the provider reports delivered and then read, then the message status shows read.

## 16. Risks

- Risk: template approval takes weeks and blocks the owner edit code and wishes. Mitigation: submit templates early in M1 and keep in-app channels working first. Sign-in does not depend on WhatsApp (D4).
- Risk: provider terms change (D8 says verify current Meta terms). Mitigation: keep the provider behind one internal interface so it can be swapped.
- Risk: forged webhook calls create fake leads. Mitigation: verify signatures and reject unsigned calls.
- Risk: the shop number gets blocked for spam after a large broadcast. Mitigation: send only to opted-in customers, honour opt-out, and pace broadcast sends.
- Risk: tokens leak through provider logs or request logs. Mitigation: redact variables marked secret in all logging.

## 17. Open decisions and questions

- D8: Meta Cloud API directly, or a Business Solution Provider? What is the current template approval lead time?
- D10 is decided (India region): does the WhatsApp provider also store message data in India?
- G20: how many sender numbers are there, and can "Priya (Manager)" be a sender when only three roles exist?
- UX-SPEC §7 Q5: may the owner approve an edit-code request by replying on WhatsApp?
- Which opt-out keywords are recognised, in which languages?
- G17: are broadcast delivered, opened and replied counts stored here or in EP-34?
- How long are inbound and outbound message bodies kept?

## 18. Candidate stories

1. EP-12-S1: System can connect to the WhatsApp provider with credentials from environment configuration
2. EP-12-S2: Owner can register a message template and see its approval status
3. EP-12-S3: System can send an approved template message with variables
4. EP-12-S4: System can send a session message inside an open conversation window
5. EP-12-S5: System can refuse a customer message when consent is off
6. EP-12-S6: System can verify and accept inbound webhook calls
7. EP-12-S7: System can store an inbound message once and hand it to lead intake
8. EP-12-S8: System can store inbound media through file storage
9. EP-12-S9: System can record delivery, read and failure receipts
10. EP-12-S10: System can switch off a customer's consent on an opt-out keyword
11. EP-12-S11: System can keep owner edit codes and other secret values out of logs and stored messages
12. EP-12-S12: System can report failed sends for retry and alerting
