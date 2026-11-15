# EP-29: Leads: automatic PO intake

## 1. Summary

Many customer orders arrive as a WhatsApp line, a photographed note or an email. This epic reads those messages and
turns each one into a lead on its own, so nobody retypes it. A language model pulls out the customer, the items, the
target weights and the needed-by date, and marks each field as sure or "check this". The lead is created in a "needs a
glance" state, and a staff member confirms or fixes it in seconds beside the original message. A message that cannot
be read at all still becomes a lead, flagged in red, and its 8-hour clock starts like any other. The business needs
this so that orders are never lost in a phone and the shop answers faster.

## 2. Layer, milestone, status

- Layer: C · Core gold pipeline
- Milestone: M5 Front door
- Prototype status: Partial. The `lead-review` screen with the message beside flagged fields, `confirmLead` and "Not an order" work on seeded parsed leads, and `simulateReply` turns a broadcast reply into a lead; there is no email or WhatsApp intake, no parser, no attachment storage and no duplicate check.

## 3. Roles involved

- Staff: opens a lead that needs a glance, reads the original message, confirms or fixes the fields, keeps the lead or closes it as "Not an order".
- Owner: can do the same; sees unglanced leads that pass the SLA (EP-28, EP-32).
- Karigar: not involved.
- System: receives inbound email and WhatsApp messages, stores attachments, calls the parser, sets field confidence, creates the lead in `needs_glance` with arrival time, links a known customer by phone (G7), detects duplicates, and reports parse failures.

## 4. In scope

- Inbound email to a shop inbox, turned into a lead.
- Inbound WhatsApp message (text and image) to the shop number, turned into a lead (transport in EP-12).
- Attachment storage for photos and documents (storage in EP-09).
- Parsing to fields: customer, phone, items (name, style, quantity), target weight per item, needed-by date, with a confidence per field.
- Lead confidence: clean, unsure, unreadable.
- Unreadable messages still create a lead, flagged "please check" (App. H option A).
- Review screen: original message beside extracted fields; flagged fields marked "check this"; "Looks right — keep the lead"; "Not an order".
- Confirm moves needs_glance to opened and clears flags; a fixed field keeps the corrected value.
- "Not an order" closes the lead as lost with a reason.
- A reply to a broadcast becomes a lead in needs_glance (consumer side of EP-34).
- Customer matching by phone on arrival, linking to an existing customer (G7, with EP-17 and EP-28).
- Duplicate detection for the same message or thread.
- Monitoring of parse failures and provider errors.

## 5. Out of scope

- The inbox list, SLA clock and breach notifications (EP-28).
- WhatsApp provider set-up, webhooks and templates (EP-12).
- File storage itself (EP-09).
- Customer records and their merge rules (EP-17).
- Converting the lead (EP-30).
- Sending the broadcast that produces replies (EP-34).
- Logs, alerts and dashboards for failures (EP-37).
- Data protection review of the parser provider (EP-39).

## 6. Current state in the prototype

- `src/types/jewellery.ts`: `LeadConfidence = 'clean' | 'unsure' | 'unreadable'`; `LeadField { key, label, value, flagged }`; `Lead.message` holds the original text; `Lead.source` `whatsapp` or `email`.
- `src/store/transitions.ts`:
  - `confirmLead` refuses a lead that is not `needs_glance` ("This lead has already been opened."), applies an optional patch (customer name, phone, needed by, items), sets `opened`, `clean`, clears every flag and records `takenBy`.
  - "Not an order" calls `markLeadLost`.
  - `routeLeadItemToStock` refuses a lead that still needs a glance ("Check and keep this lead before converting it.").
  - `simulateReply` builds a `whatsapp` lead from a broadcast reply in `needs_glance`, confidence `unsure`, one flagged field "What they want".
- Parsed leads exist only in `src/data/seed.ts` (the Sharma wedding WhatsApp text; "A photo we could not read").
- Components: `src/components/leads/LeadReview.tsx` (route `lead-review`, param `leadId`), the "Please check" rows in `LeadInbox.tsx`, the reply simulator in `src/components/marketing/Broadcast.tsx`.
- `package.json` lists `@google/genai` and `.env.example` holds `GEMINI_API_KEY`, both unused.
- Reusable: the review layout, the field and confidence model, the confirm rule and sentences.
- Must be rebuilt server-side: inbound channels, attachment storage, the parser call with secrets in environment configuration, confidence thresholds, duplicate detection, customer matching, audit, monitoring.

## 7. Functional requirements

- FR-29-1. The system creates a lead in needs_glance for every inbound PO email to the configured shop inbox.
- FR-29-2. The system creates a lead in needs_glance for every inbound WhatsApp message to the shop number, following the decided rule for several messages in one thread (see §17).
- FR-29-3. The system stores every attachment through EP-09 and links it to the lead.
- FR-29-4. The system sends the message text and readable attachments to the parser and stores the fields with a confidence per field.
- FR-29-5. A field below the decided confidence threshold is flagged "check this"; the lead confidence is clean, unsure or unreadable.
- FR-29-6. A message the parser cannot read still creates a lead with confidence unreadable and the original message or image attached.
- FR-29-7. The lead arrival time is the time the message reached the shop, not the time parsing finished.
- FR-29-8. The system matches the sender's phone to a known customer and links the lead (G7); if none matches it keeps the name and phone on the lead.
- FR-29-9. A staff member can open the review screen and see the original message beside the extracted fields.
- FR-29-10. A staff member can fix any field and keep the lead; the lead moves to opened and flags clear.
- FR-29-11. The server refuses to confirm a lead that is not in needs_glance.
- FR-29-12. A staff member can close a lead as "Not an order"; it becomes lost with that reason.
- FR-29-13. The server refuses to convert a lead that still needs a glance.
- FR-29-14. The system detects a second copy of the same message (same sender, same content, within a decided window) and links it to the first lead instead of creating another.
- FR-29-15. A reply to a broadcast creates a lead in needs_glance linked to the broadcast and the customer.
- FR-29-16. Parse failures and provider errors are recorded and reported through EP-37 without the message content in logs.
- FR-29-17. Confirm and "Not an order" write audit entries.

## 8. Business rules

- BR-29-1. A PO is parsed and becomes a lead on its own; no one types it from scratch. [SCOPE-ANALYSIS App. H]
- BR-29-2. The parse is reviewed, never blindly trusted: the original message beside the fields, low-confidence fields flagged. [SCOPE-ANALYSIS App. H]
- BR-29-3. When a PO cannot be parsed confidently, always create the lead anyway, flagged "please check". [SCOPE-ANALYSIS App. H option A]
- BR-29-4. The 8-hour timer runs from arrival regardless of source. [SCOPE-ANALYSIS App. H]
- BR-29-5. A lead cannot be converted before its glance. [src/store/transitions.ts routeLeadItemToStock]
- BR-29-6. Replies to a broadcast become leads, so nothing a customer sends is lost. [mockup 27; mockup 28]
- BR-29-7. Parsing accuracy and the extraction model are decided outside the UX; the screens only show success, low confidence and failure. [SCOPE-ANALYSIS §7]
- BR-29-8. Secrets live in environment configuration, never in the repo. [PRODUCTION-SCOPE §5 Security]
- BR-29-9. Customer names and phones are personal data. [PRODUCTION-SCOPE §5 Personal data]

## 9. Data

- InboundMessage: id, channel (`email`, `whatsapp`), provider message id, thread or conversation id, sender address or phone, received at (UTC), raw text, attachment file ids, lead id, duplicate of (nullable).
- Lead (shared with EP-28): source, state `needs_glance`, confidence, message, customer id (nullable, G7), broadcast id (nullable).
- LeadField: lead id, key, label, value, confidence score, flagged, corrected value, corrected by.
- LeadItem: name, style, quantity, approximate weight (nullable integer, units of 0.0001 g).
- ParseRun: lead id, provider, model version, started at, finished at, outcome (ok, low confidence, failed), error code.
- Audit entries: `lead_confirmed`, `lead_not_an_order` (new kinds).
- No money fields.

## 10. API surface

Per D1 (decided: Option C), each operation is an endpoint on the team's own Node + TypeScript API.

| Verb | Resource | Purpose | Who may call |
| --- | --- | --- | --- |
| Receive | Inbound email | Accept a message from the shop inbox | System (mail provider) |
| Receive | Inbound WhatsApp message | Accept a message from the provider webhook | System (EP-12) |
| Run | Parse message | Extract fields with confidence | System |
| Read | Lead for review | Message, attachments and fields | Staff, Owner |
| Update | Confirm lead | Keep with optional fixes | Staff, Owner |
| Update | Not an order | Close the lead as lost | Staff, Owner |
| Read | Parse status | Failures and retries | Owner |

## 11. Live events

- Emits: "Lead arrived / passed its SLA" — when an inbound message becomes a lead (the arrival half), for the staff inbox and the owner.
- Consumes: none from the catalogue. Inbound messages come from provider webhooks, not live events.

## 12. Screens and UX references

- Route ids: `lead-review` (LeadReview, param leadId), `leads` ("Please check" and "2 fields to confirm" rows).
- Mockups: `17-lead-create.svg` left side (Sharma WhatsApp text "namaste, for sharma wedding need 2 temple haram...", fields with "sure" and "check this", "Target weight on each haram 80.000 g · check this", "Looks right — keep the lead", "Not an order"), `16-lead-inbox.svg` ("A photo we could not read · +91 90037 44120 · Open and read", "read automatically", "by email", "A message we cannot read still becomes a lead, flagged in red"), `27-broadcast.svg` and `28-catalogue-share.svg` ("replies become leads").

## 13. Non-functional requirements

- Security: provider keys (for example the existing `GEMINI_API_KEY` slot) in environment configuration; inbound webhooks verified by signature; only staff and owner read leads.
- Personal data: message text, images and phone numbers are personal data; the parser provider and its region follow D10 (India region, decided); logs hold ids, not content.
- Performance: a lead appears in the inbox within about 1 second of receipt, before parsing finishes; parsing completes within a decided time and updates the lead live.
- Availability: if the parser is down, leads are still created as unreadable and parsing is retried.
- Audit: confirm, field corrections and "Not an order" are appended with before and after values.
- Time: arrival stored in UTC from the provider's receive time.

## 14. Dependencies

- Upstream (from PRODUCTION-SCOPE): EP-12, EP-28, EP-09, EP-08
- Downstream: EP-31, EP-32, EP-34, EP-35, EP-40, EP-41.

## 15. Epic acceptance criteria

1. Given Ramesh Sharma sends "need 2 temple haram ... around 80g each ... need by 20 nov" on WhatsApp, when it reaches the shop, then a lead in needs_glance appears with customer, items, 80.000 g target and needed-by date, the weight and date flagged "check this".
2. Given a photo the parser cannot read, when it arrives, then a lead with confidence unreadable is created, the photo is attached, and its SLA starts at receipt.
3. Given a lead in needs_glance, when a staff member fixes the needed-by date and keeps it, then it is opened, flags clear, and the audit holds the old and new date.
4. Given a lead in needs_glance, when staff try to route a line to a piece or to make, then the server refuses with "Check and keep this lead before converting it."
5. Given the same email arrives twice, when the second copy is processed, then no second lead is created.
6. Given the parser provider is unavailable, when a message arrives, then a lead is still created and the failure is recorded.

## 16. Risks

- Risk: the parser invents a weight or date and staff click through. Mitigation: flag low-confidence fields, never pre-confirm, show the original beside the field.
- Risk: personal data leaves India with the parser provider. Mitigation: choose the provider with EP-39 before build, against D10 (India region, decided).
- Risk: WhatsApp template and session rules block some replies. Mitigation: decide D8 and verify current Meta terms.
- Risk: duplicates flood the inbox from forwarded messages. Mitigation: duplicate detection by provider id and thread.
- Risk: parse cost grows with image volume. Mitigation: measure per-lead cost and cap retries.

## 17. Open decisions and questions

- D8: which WhatsApp provider receives inbound messages?
- Where is the parser hosted, and does personal data leave India? D10 (India region) is decided for the system's own hosting; the parser provider must be checked against it.
- Which parser provider and model, and is the existing `@google/genai` dependency the choice?
- What confidence thresholds make a field "check this" and a lead unreadable?
- How long are attachments and raw messages kept?
- G7: how is a known customer matched by phone, and what if several match?
- How are several messages in one thread treated: one lead or several?
- Which email address or mailbox is the shop inbox?

## 18. Candidate stories

1. EP-29-S1: System can store inbound messages with channel, sender and attachments
2. EP-29-S2: System can create a lead in needs a glance from an inbound email
3. EP-29-S3: System can create a lead in needs a glance from an inbound WhatsApp message
4. EP-29-S4: System can store message attachments with the lead
5. EP-29-S5: System can parse a message into fields with a confidence each
6. EP-29-S6: System can create a flagged lead when a message cannot be read
7. EP-29-S7: System can link a lead to a known customer by phone (G7)
8. EP-29-S8: Staff can review the original message beside the extracted fields
9. EP-29-S9: Staff can fix fields and keep the lead
10. EP-29-S10: Staff can close a lead as "Not an order"
11. EP-29-S11: System can turn a broadcast reply into a lead
12. EP-29-S12: System can detect a duplicate message and link it to the first lead
13. EP-29-S13: System can retry a failed parse and report failures
14. EP-29-S14: System can audit confirm, corrections and "Not an order"
