# EP-29: Leads: automatic PO intake · stories

Epic document: [EP-29 Leads: automatic PO intake](../epics/EP-29-leads-automatic-po-intake.md)

Role note: stories where the server receives, parses, matches, checks or audits on its own use "System". Staff and the owner review leads; karigars never see leads, and every lead operation refuses them (epic section 13). No amount is read, stored or shown on a lead. Target weights are integers in units of 0.0001 g and shown to 4 decimals, so the "80.000 g" in mockup 17 is shown as "80.0000 g". The seed people are Sanjay Seth (Owner), Rajesh Verma and Deepak Rao (Staff). The seed parsed leads are LD-2026-207 ("A photo we could not read · +91 90037 44120", `unreadable`), LD-2026-208 (Sharma wedding, `unsure`, from Ramesh Sharma) and LD-2026-209 (Bulk chain order from Sri Murugan Jewellers, `clean`, by email). Mockup 17 prints Ramesh Sharma's phone as "+91 98451 20034"; these stories use the seed phone of CU-004, "+91 98401 55504". The parser provider is not chosen (section 17; it must be checked against D10, India region, decided), so stories call it "the parser" and keep its key in environment configuration.

---

## EP-29-S1: System can store inbound messages with channel, sender and attachments

- **Story ID:** EP-29-S1
- **Title:** System can store inbound messages with channel, sender and attachments
- **As a:** System
- **I want:** the InboundMessage table from EP-12-S7 widened to hold both channels, with channel (`email`, `whatsapp`), provider message id, thread or conversation id, sender address or phone, received at, raw text, attachment file ids, lead id and duplicate of; plus a `parse_runs` table and the extra columns on `leads` and `lead_fields` that intake needs
- **So that:** every message a customer sends is kept with where it came from and which lead it became, and a parse result can be traced to the run that made it (FR-29-1, FR-29-2, FR-29-3, FR-29-7, BR-29-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given the migration has run, when a WhatsApp message from "+91 98401 55504" received at 02:14 Asia/Kolkata is stored, then the row has channel `whatsapp`, the provider message id, the conversation id, sender "+91 98401 55504", `receivedAt` 20:44 UTC of the previous day, the raw text and an empty attachment list.
  2. Given an email with two attachments, when it is stored, then the row has channel `email`, the email message id as provider message id, the thread id, the sender address and two file ids from EP-09.
  3. Given a second row with the same channel and provider message id, when it is written, then the database rejects it through a unique index on (channel, provider message id).
  4. Given a row with channel `sms`, or a `duplicateOf` that points to a missing InboundMessage, when it is written, then the database rejects it.
  5. Given a lead field "Target weight on each haram" with confidence score 0.42, when it is stored, then `lead_fields` keeps the score, `flagged` true, a null corrected value and a null corrected by; given a ParseRun with outcome `exploded`, then the database rejects it because outcome accepts only `ok`, `low_confidence` and `failed`.
- **Rules enforced on the server:** Enum checks on channel and ParseRun outcome. Unique (channel, provider message id). `leadId` references `leads`, `duplicateOf` references `inbound_messages`, attachment file ids reference EP-09 file records. `leads.broadcastId` references `broadcasts` (EP-02-S12) and is nullable. `receivedAt`, ParseRun `startedAt` and `finishedAt` are UTC. Only the System actor writes these rows; no user operation inserts an InboundMessage.
- **Live events emitted / consumed:** None. Storing rows publishes nothing; the arrival event comes from EP-29-S2 and EP-29-S3.
- **Audit entry written:** No. Table rules only. The InboundMessage row is the record of receipt; lead changes are audited by EP-29-S14.
- **Data changes:** Migration on `inbound_messages` (EP-12-S7): adds `channel`, `threadId`, `senderAddress` (email) beside sender phone, `rawText`, `duplicateOf` (nullable), renames "handed to lead id" to `leadId`, and replaces the unique provider message id with a unique (channel, provider message id). Migration on `lead_fields` (EP-02-S7): adds `confidenceScore` (0 to 1, nullable), `correctedValue` and `correctedBy` (user id). Migration on `leads`: adds `broadcastId` and `inboundMessageId` (both nullable). New `parse_runs` (id, lead id, provider, model version, started at, finished at, outcome, error code, attempt). Ports `LeadConfidence` and `LeadField` from `src/types/jewellery.ts` into the shared package with the score and correction fields.
- **UI reference:** No screen.
- **Non-functional checks:** Personal data: raw text, sender phone, sender address and attachments are personal data under the DPDP Act 2023; the retention period is an open question, applied by EP-09-S12. Time: `receivedAt` is the provider's receive time stored in UTC. Security: ParseRun stores an error code, never the provider key or the message text. Open decision D8: the WhatsApp provider sets the form of the provider message id and conversation id.
- **Depends on:** EP-12-S7, EP-02-S1, EP-02-S7, EP-02-S12, EP-09-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S2: System can create a lead in needs a glance from an inbound email

- **Story ID:** EP-29-S2
- **Title:** System can create a lead in needs a glance from an inbound email
- **As a:** System
- **I want:** an inbound email endpoint for the configured shop inbox that verifies the mail provider's call, stores one InboundMessage with channel `email`, creates a lead with source `email`, state `needs_glance` and `arrivedAt` equal to the receive time, starts its SLA timer, and then queues the parse as a background job
- **So that:** a purchase order sent by email becomes a lead on its own within about a second, nobody retypes it, and its 8-hour clock starts when it reached the shop (FR-29-1, FR-29-7, BR-29-1, BR-29-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sri Murugan Jewellers emails "Please quote and supply 40 pieces of 22K rope chain, 12 to 14 g each, delivery before the 15th." to the shop inbox, when the call is verified, then one InboundMessage and one lead are stored with source `email`, state `needs_glance` and `message` holding the email body, and the lead shows "by email" on `leads` within about 1 second.
  2. Given the mail provider received the email at 10:00:00 UTC and the parse finishes at 10:00:40 UTC, when the lead is read, then `arrivedAt` is 10:00:00 UTC and the SLA label reads "within time · 8 h left" counted from 10:00:00.
  3. Given a call with a missing or wrong provider signature, when it arrives, then it is refused, no InboundMessage or lead is stored, and the log holds the time and reason but no body text or sender address.
  4. Given an email addressed to a mailbox other than the configured shop inbox, when it arrives, then it is refused and no lead is created.
  5. Given the lead is created before parsing, when the parse job has not finished, then the lead title is the email subject (or "Email from <sender>" when the subject is empty) and the confidence is `unsure` until EP-29-S5 sets it.
- **Rules enforced on the server:** The endpoint accepts only calls signed by the mail provider with a secret from environment configuration; there is no user session. The recipient must equal the `shopInboxAddress` setting. The InboundMessage insert, lead insert and SLA timer insert (EP-10-S5) run in one transaction (EP-03-S6); the parse job is queued after commit. `arrivedAt` is the provider's receive time, never the parse finish time or the sender's Date header. `slaLimitHours` is copied from `settings.leadSlaHours` (EP-13-S4). The id is the next `LD-<year>-NNN` with the year from Asia/Kolkata. Actor is System for email intake (EP-06-S6). The rate-limit hook applies (EP-03-S11).
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" (arrived), carried to Staff and Owner by EP-28-S13. Consumed: none; the email comes from a provider callback, not a live event.
- **Audit entry written:** Yes, through EP-29-S14: actor System (email intake), time, entity (lead id), action `lead_created`, after (source `email`, state `needs_glance`, inbound message id).
- **Data changes:** Inserts into `inbound_messages`, `leads` and the pending SLA job row; queues a parse job (EP-10-S1). Adds the inbound email endpoint, the mail provider secret variable and a `shopInboxAddress` setting.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("by email", "Bulk chain order · Erode wholesaler · 40 pieces", "within time · 6 h left", "Nothing a customer sends is ever dropped."), route `leads`.
- **Non-functional checks:** Performance: the lead appears in the inbox within about 1 second of receipt, before parsing finishes (epic section 13). Time: arrival in UTC from the provider's receive time. Security: the provider signature is checked before the body is parsed; the secret lives in environment configuration (BR-29-8). Personal data: logs hold the InboundMessage id, never the body or sender address. Open question: which email address or mailbox is the shop inbox, and which mail provider delivers it.
- **Depends on:** EP-29-S1, EP-28-S1, EP-28-S8, EP-10-S1, EP-10-S5, EP-03-S2, EP-03-S6, EP-03-S11, EP-06-S6, EP-13-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S3: System can create a lead in needs a glance from an inbound WhatsApp message

- **Story ID:** EP-29-S3
- **Title:** System can create a lead in needs a glance from an inbound WhatsApp message
- **As a:** System
- **I want:** the lead intake interface that EP-12-S7 hands each stored WhatsApp message to, so it creates a lead with source `whatsapp`, state `needs_glance` and `arrivedAt` equal to the message's received at, links the InboundMessage to it, starts the SLA timer and queues the parse
- **So that:** an order sent to the shop's WhatsApp number becomes a lead on its own, with the same 8-hour clock as any other lead (FR-29-2, FR-29-7, BR-29-1, BR-29-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Ramesh Sharma sends "need 2 temple haram ... around 80g each ... need by 20 nov" to the shop number, when EP-12-S7 hands it over, then one lead is stored with source `whatsapp`, state `needs_glance`, `message` holding the text and `phone` "+91 98401 55504", and the InboundMessage `leadId` points to it (epic acceptance criterion 1, arrival part).
  2. Given the message was received at 02:14 Asia/Kolkata, when the lead is read, then `arrivedAt` is that time in UTC and the inbox row shows "from WhatsApp" with its age counted from 02:14.
  3. Given the hand-off is retried for the same InboundMessage id, when it runs again, then no second lead is created and the existing lead id is returned.
  4. Given a second message in the same conversation, when it is handed over, then it follows the decided thread rule: either it is appended to the open lead's message and no lead is created, or a new lead is created.
  5. Given the message text is an opt-out keyword, when EP-12-S10 handles it, then this interface is not called and no lead exists for it.
- **Rules enforced on the server:** Intake is internal and callable only by the System actor for WhatsApp intake (EP-06-S6), never from a user session. The idempotency key is the InboundMessage id (EP-03-S8). Lead insert, InboundMessage link and SLA timer run in one transaction (EP-03-S6); the parse job is queued after commit. `arrivedAt` is the InboundMessage `receivedAt`. Until the thread rule (section 17) is decided, each message makes its own lead, and EP-29-S12 still stops true copies.
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" (arrived), carried by EP-28-S13. Consumed: none; the message arrives through the EP-12 webhook.
- **Audit entry written:** Yes, through EP-29-S14: actor System (WhatsApp intake), time, entity (lead id), action `lead_created`, after (source `whatsapp`, state `needs_glance`, inbound message id).
- **Data changes:** Inserts into `leads` and the pending SLA job row; updates `inbound_messages.leadId`; queues a parse job. Replaces the EP-12-S7 intake stub with this interface. Adds a thread rule setting only once the section 17 question is answered.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("from WhatsApp", "Sharma wedding · 2 harams, 1 choker · read automatically", "arrived 9 h ago"), route `leads`; `docs/ux/mockups/17-lead-create.svg` ("WHAT THEY SENT ON WHATSAPP", "received 02:14, today"), route `lead-review`.
- **Non-functional checks:** Performance: the lead shows on `leads` within about 1 second of the webhook being accepted, before parsing finishes. Concurrency: two workers handing over the same message give one lead. Time: arrival in UTC from the provider's receive time. Open decision D8: which WhatsApp provider receives inbound messages. Open question: one lead or several for several messages in one thread.
- **Depends on:** EP-29-S1, EP-29-S2, EP-12-S7, EP-12-S10, EP-28-S1, EP-10-S5, EP-03-S6, EP-03-S8, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S4: System can store message attachments with the lead

- **Story ID:** EP-29-S4
- **Title:** System can store message attachments with the lead
- **As a:** System
- **I want:** each email attachment and each WhatsApp media item stored through EP-09 Create Inbound file with role PO, its file id kept on the InboundMessage, and a `lead_attachments` row linking it to the lead
- **So that:** a photographed note or a PDF order reaches the lead with its original, even when nothing in it can be read (FR-29-3, BR-29-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given a WhatsApp message from "+91 90037 44120" carrying one image, when the lead is created, then the image is stored once through EP-09, the InboundMessage lists its file id, and LD-2026-207 has one `lead_attachments` row for it.
  2. Given an email with a JPEG and a PDF, when the lead is created, then both files are stored with role PO and both appear on the lead in the order they were attached.
  3. Given an attachment over the EP-09 size limit or of a type not allowed, when intake stores it, then it is refused with a logged reason, the lead is still created, and the lead message ends with "An attachment was not kept: <file name>, too large or not an allowed type." (proposed wording).
  4. Given the provider delivers the same message twice, when both are processed, then one stored file and one `lead_attachments` row exist per attachment.
  5. Given Rajesh Verma opens the lead, when the image loads, then it comes through an EP-09 signed, expiring link; given Vijay Kumar (Karigar) requests that link, then the server answers not-found.
- **Rules enforced on the server:** Create Inbound file is internal (EP-09-S11). Size and type limits are EP-09's (EP-09-S3). The key for each file is channel, provider message id and attachment index (EP-03-S8). File reads are checked against the lead and the caller's role (EP-09-S6). Provider media URLs never reach the browser (EP-12-S8). The lead is committed first, so a slow or failed file store never stops the lead from appearing.
- **Live events emitted / consumed:** None of its own. The attachments travel with the lead whose arrival EP-29-S2 or EP-29-S3 announces.
- **Audit entry written:** Yes, by EP-09-S11: actor System (intake channel), time, entity (lead id), action PO attachment stored, after file id.
- **Data changes:** Inserts StoredFile and Attachment rows (EP-09), `lead_attachments` rows (EP-28-S1), and updates `inbound_messages` attachment file ids. Adds the email attachment path beside the EP-12-S8 WhatsApp media path.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("A photo we could not read · +91 90037 44120", "Open and read"), route `leads`; the image is shown on route `lead-review` by EP-29-S8.
- **Non-functional checks:** Personal data: PO images and documents carry names and phones and get the PO retention class; how long they are kept is an open question (EP-09-S12). Security: signed links only, never to karigars. Concurrency: redelivery stores one file. Performance: a 5 MB image does not delay the lead's appearance in the inbox.
- **Depends on:** EP-29-S2, EP-29-S3, EP-12-S8, EP-09-S3, EP-09-S5, EP-09-S6, EP-09-S11, EP-28-S1, EP-03-S8
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S5: System can parse a message into fields with a confidence each

- **Story ID:** EP-29-S5
- **Title:** System can parse a message into fields with a confidence each
- **As a:** System
- **I want:** a background parse job that sends the lead's message text and readable attachments to the parser, receives customer, phone, items (name, style, quantity), target weight per item and needed-by date, each with a confidence score, stores them as `lead_fields` and `lead_items`, flags every field below the decided threshold "check this", sets the lead confidence and records a ParseRun
- **So that:** staff start from fields already filled in and only need to look at the ones the parser was unsure about (FR-29-4, FR-29-5, BR-29-1, BR-29-2, BR-29-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 holds "namaste, for sharma wedding need 2 temple haram long chettinad type and one kundan choker. haram around 80g each, choker you suggest. need by 20 nov for engagement.", when the parse finishes, then the lead has fields Customer "Ramesh Sharma" (sure), Wants "2 × Temple Haram (Chettinad), 1 × Kundan Choker" (sure), Target weight on each haram "80.0000 g" (check this) and Needed by "20 Nov 2026" (check this) (epic acceptance criterion 1).
  2. Given that parse, when the items are stored, then `lead_items` holds "Temple Haram", style "Chettinad", quantity 2, `approxWeightG` `800000`, and "Kundan Choker", style "Kundan", quantity 1, `approxWeightG` null.
  3. Given every field is at or above the threshold, when the parse finishes, then the lead confidence is `clean` and the inbox shows "read cleanly"; given two fields below it, then confidence is `unsure` and the inbox shows "2 fields to confirm" with "Check and keep".
  4. Given the parser returns a weight of "12 to 14 g", when it is stored, then the weight field keeps that text as its value, `approxWeightG` is the midpoint `130000`, and the field is flagged "check this" whatever its score.
  5. Given the parse finishes after Rajesh Verma has already kept the lead, when the job writes, then it stores the ParseRun only and changes no field, because the lead is no longer `needs_glance`.
- **Rules enforced on the server:** The parse job is System only and runs after the lead commit (EP-10-S1). The parser key comes from environment configuration (BR-29-8). The response is validated against a fixed schema before anything is stored: unknown keys are dropped, a quantity must be a whole number of at least 1, a weight must convert to integer units through the EP-02-S2 helper, and a date must be a real calendar date; otherwise that field is stored empty and flagged. A needed-by date with no year takes the next such date on or after `arrivedAt` in Asia/Kolkata. A field is flagged when its score is below the decided threshold or its value was coerced. The job writes fields only while the lead is `needs_glance`, under the lead version check (EP-02-S14). No price or amount is extracted or stored.
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" carrying the new confidence, so open inboxes refetch the row (G26: no separate lead-updated event exists in the catalogue). Consumed: none.
- **Audit entry written:** No. The parse fills a lead nobody has kept yet, and the ParseRun row records provider, model version, times and outcome. The parsed values are kept as the "before" values for EP-29-S14 corrections.
- **Data changes:** Inserts `lead_fields`, `lead_items` and `parse_runs`; updates `leads.confidence`, `title`, `customerName`, `phone`, `neededBy` and `version`. Adds the parser client, the parse job and the field schema to the server. The existing `@google/genai` dependency and `GEMINI_API_KEY` slot are used only if that provider is chosen, and only on the server.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` left side ("WHAT THE SYSTEM PULLED OUT · FIX ANYTHING WRONG", "sure", "check this", "Target weight on each haram", "Needed by"), route `lead-review`; `docs/ux/mockups/16-lead-inbox.svg` ("2 fields to confirm", "read automatically", "read cleanly"), route `leads`.
- **Non-functional checks:** Precision: 80 g is stored as `800000` and shown as "80.0000 g"; the parser's number is never stored as a float. Performance: the parse finishes within the decided time and the lead updates live on open inboxes. Personal data: message text and images go only to the parser chosen in section 17, checked against D10 (India region, decided); logs hold lead and ParseRun ids, not content. Security: the parser key is server-side only and never in the browser bundle. Open question: where the parser is hosted and whether personal data leaves India; D10 (India region) is decided for the system's own hosting. Open questions: which parser provider and model, and the confidence thresholds.
- **Depends on:** EP-29-S1, EP-29-S2, EP-29-S3, EP-29-S4, EP-02-S2, EP-02-S14, EP-10-S1, EP-28-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S6: System can create a flagged lead when a message cannot be read

- **Story ID:** EP-29-S6
- **Title:** System can create a flagged lead when a message cannot be read
- **As a:** System
- **I want:** a parse that finds nothing usable, scores below the unreadable threshold, or cannot run at all to leave the lead in place with confidence `unreadable`, one flagged field "What they want" valued "Could not read", the original text or image attached, and the title "A photo we could not read · <phone>" or "A message we could not read · <sender>"
- **So that:** an unreadable order is never thrown away, staff see it flagged in red, and its 8-hour clock keeps running from arrival like any other (FR-29-6, BR-29-3, BR-29-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given a photo from "+91 90037 44120" that is too dark to read, when the parse returns nothing usable, then LD-2026-207 stays `needs_glance` with confidence `unreadable`, the photo attached and the field "What they want" "Could not read" flagged, and the inbox row reads "A photo we could not read · +91 90037 44120" under "Please check" with "Open and read" (epic acceptance criterion 2).
  2. Given that lead arrived at 09:00 UTC and the parse gave up at 09:03 UTC, when the SLA is read, then it is counted from 09:00 UTC, and after 8 hours the row shows "8 h limit passed · owner told" like any other lead.
  3. Given the parser provider is unavailable, when a message arrives, then the lead is still created and shown, it is marked `unreadable` after the first failed attempt, and a ParseRun with outcome `failed` and the provider error code is stored (epic acceptance criterion 6).
  4. Given a later retry under EP-29-S13 succeeds, when it finishes, then the lead's fields and confidence are replaced by the parsed result, provided the lead is still `needs_glance`.
  5. Given the sender is not a known customer, when the unreadable lead is stored, then `customerName` is "Unknown sender" and `phone` is the sender's phone, so staff can call back.
- **Rules enforced on the server:** No intake path may drop a message: lead creation does not wait on the parser and does not roll back when the parser fails. An unreadable lead can be kept only after "What they want" is filled with at least one item (EP-29-S9). The parse job cannot change a lead once a person has kept or closed it. Until the section 17 threshold is decided, a parse with no item field counts as unreadable.
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" carrying confidence `unreadable`, so the row turns red on open inboxes. Consumed: none.
- **Audit entry written:** No. The ParseRun row records the failure; the lead itself was created and audited by EP-29-S2 or EP-29-S3.
- **Data changes:** Inserts one `lead_fields` row and a `parse_runs` row; updates `leads.confidence`, `title` and `customerName`. Ports the "Please check" row rule from `src/components/leads/LeadInbox.tsx` onto the server confidence.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg` ("Please check", "A photo we could not read · +91 90037 44120", "Open and read", "A message we cannot read still becomes a lead, flagged in red. It is never thrown away"), route `leads`.
- **Non-functional checks:** Availability: if the parser is down, leads are still created as unreadable and parsing is retried (epic section 13). Time: the SLA counts from receipt, not from the parse result. Open question: the confidence threshold that makes a lead unreadable.
- **Depends on:** EP-29-S5, EP-29-S4, EP-28-S8, EP-28-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S7: System can link a lead to a known customer by phone (G7)

- **Story ID:** EP-29-S7
- **Title:** System can link a lead to a known customer by phone (G7)
- **As a:** System
- **I want:** intake to run EP-17-S10 Find Customer by phone on the WhatsApp sender's phone, or on the phone the parser found in an email, and set `leads.customerId` when it matches; when nothing matches, keep the name and phone on the lead and create no customer
- **So that:** a returning customer's orders join their record without anyone searching, and the shop does not make duplicate customers from messages (FR-29-8, G7, BR-29-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given Ramesh Sharma (CU-004) holds "+91 98401 55504", when his WhatsApp message becomes a lead, then the lead stores `customerId` CU-004 and `customerName` "Ramesh Sharma" before parsing finishes, and the Customer field shows "Ramesh Sharma" as sure.
  2. Given "+91 90037 44120" matches no active customer, when the lead is stored, then `customerId` is null, `phone` is "+91 90037 44120", and no customer record is created.
  3. Given an email from Sri Murugan Jewellers whose body gives "+91 98401 55507", when the parse finishes, then the lead links to CU-007 and the phone field is flagged "check this", because a phone read from text is less certain than a sender phone.
  4. Given the decided G7 rule allows two active customers on one phone and both match, when the lead is stored, then `customerId` stays null and the Customer field is flagged "check this", with both names offered on `lead-review`.
  5. Given a customer was erased under EP-17-S13, when a message arrives from their old phone, then no match is made.
- **Rules enforced on the server:** The match is EP-17-S10 with the EP-17-S1 normaliser, read only, run as the System actor. A WhatsApp sender phone takes priority over a phone found in text. A match never overwrites a name a person has already confirmed. Staff can change or remove the link while keeping the lead (EP-29-S9). Erased customers are excluded.
- **Live events emitted / consumed:** None of its own. The link is part of the lead whose arrival or parse result is already announced.
- **Audit entry written:** No separate entry. The `lead_created` entry records `customerId` when linked at arrival; a link changed by staff is recorded by EP-29-S14.
- **Data changes:** Sets `leads.customerId` and the Customer field confidence. No new tables.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` left side ("Customer", "Ramesh Sharma", "sure"), route `lead-review`.
- **Non-functional checks:** Performance: the match answers in under 200 ms (EP-17-S10) and does not delay the lead's appearance. Personal data: the match reads only id and name; nothing about the customer is copied to logs. Open question G7: how a known customer is matched by phone, and what happens when several match.
- **Depends on:** EP-29-S3, EP-29-S5, EP-17-S1, EP-17-S10, EP-17-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S8: Staff can review the original message beside the extracted fields

- **Story ID:** EP-29-S8
- **Title:** Staff can review the original message beside the extracted fields
- **As a:** Staff
- **I want:** to press "Check and keep" or "Open and read" on a `needs_glance` lead and open `lead-review` with the original message, its received time, sender and attachments on one side, and each extracted field marked "sure" or "check this" on the other
- **So that:** I can check what the system read against what the customer actually sent, in a few seconds, and never trust the parse blindly (FR-29-9, BR-29-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208, when Rajesh Verma opens it on `lead-review`, then the left side shows "WHAT THEY SENT ON WHATSAPP" with the full text, "— Ramesh Sharma" and "received 02:14, today · +91 98401 55504", and the right side shows "WHAT THE SYSTEM PULLED OUT · FIX ANYTHING WRONG" with Customer, Wants, Target weight on each haram and Needed by.
  2. Given that lead, when the fields load, then "Target weight on each haram 80.0000 g" and "Needed by 20 Nov 2026" carry "check this", the header reads "2 fields to confirm", and Customer and Wants carry "sure".
  3. Given LD-2026-207, when it is opened, then the photo is shown from its signed link, the header reads "Please check", and the only field is "What they want" "Could not read" with "check this".
  4. Given a lead no longer `needs_glance`, when it is opened on `lead-review`, then the screen shows "This lead has already been opened. Changes here are not saved." and the keep and "Not an order" buttons are not offered.
  5. Given Vijay Kumar (Karigar) calls Read Lead for review, when it reaches the server, then it is refused with `forbidden`; given an unknown lead id, then the screen shows "That lead was not found." with "Back to leads".
- **Rules enforced on the server:** Read Lead for review is Staff and Owner only (EP-05-S2). It returns the message, received at, sender, attachment links (EP-09-S5), fields with flagged and a confidence label, items, confidence and version. Scores are mapped to "sure" and "check this" on the server so every screen agrees. If D7 is multi-branch, reads are limited to the caller's branch.
- **Live events emitted / consumed:** Consumed: "Lead arrived / passed its SLA", so a lead kept or closed by someone else while open switches to the read-only notice, and a finished parse fills the fields. Emitted: none.
- **Audit entry written:** No. Reading a lead changes nothing.
- **Data changes:** None in the product database. Adds Read Lead for review to the shared contract. Moves `src/components/leads/LeadReview.tsx` (route `lead-review`, param `leadId`) onto the EP-08 data layer.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` left side ("CHECK WHAT THE SYSTEM READ", "Sharma wedding enquiry", "2 fields to confirm", "WHAT THEY SENT ON WHATSAPP", "received 02:14, today", "sure", "check this"), route `lead-review`; `docs/ux/mockups/16-lead-inbox.svg` ("Check and keep", "Open and read"), route `leads`.
- **Non-functional checks:** Performance: the review screen loads in under 2 seconds on a shop connection, with the image thumbnail first. Time: "received 02:14, today" is shown in Asia/Kolkata from the stored UTC time. Security: only staff and owner read leads (epic section 13); message text is rendered escaped. Open decision D7: whether reads are limited per branch.
- **Depends on:** EP-29-S5, EP-29-S6, EP-29-S4, EP-28-S6, EP-05-S2, EP-09-S5, EP-08-S2, EP-08-S3, EP-08-S4, EP-08-S9, EP-08-S17
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S9: Staff can fix fields and keep the lead

- **Story ID:** EP-29-S9
- **Title:** Staff can fix fields and keep the lead
- **As a:** Staff
- **I want:** to change any field on `lead-review` (customer name, phone, items, target weights, needed-by date) and press "Looks right — keep the lead", so the lead moves to `opened`, every flag clears, each changed field keeps my value, and I am recorded as the person who took it
- **So that:** a parsed lead becomes a real lead after a few seconds of checking, with the corrected values used from then on (FR-29-10, FR-29-11, FR-29-13, BR-29-2, BR-29-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given LD-2026-208 in `needs_glance`, when Rajesh Verma changes "Needed by" from 20 Nov 2026 to 18 Nov 2026 and presses "Looks right — keep the lead", then the lead is `opened` with confidence `clean`, every field `flagged` false, `neededBy` 18 Nov 2026 and `takenBy` Rajesh, and the needed-by field holds `correctedValue` "18 Nov 2026" and `correctedBy` Rajesh (epic acceptance criterion 3).
  2. Given a lead already `opened`, when keep is called, then the server refuses with "This lead has already been opened." and nothing changes.
  3. Given the customer name is cleared, no item line is left, or the date is not a real date, when keep is pressed, then the server refuses with "Add the customer name.", "Add at least one item the customer wants." or "The needed-by date is not a valid date." and the lead stays `needs_glance`.
  4. Given LD-2026-208 is still `needs_glance`, when Deepak Rao tries to route a line to a piece or to make (EP-30), then the server refuses with "Check and keep this lead before converting it." (epic acceptance criterion 4).
  5. Given Rajesh and Deepak press keep on the same lead at the same moment, when both reach the server, then one keep succeeds and the other gets "This lead has already been opened.", and the SLA timer keeps running because `opened` still counts.
- **Rules enforced on the server:** Confirm lead is Staff and Owner only (EP-05-S2). It is allowed only from `needs_glance`, under the lead row lock and version check (EP-02-S14); otherwise the prototype sentence is returned. The patch accepts customer name, phone, customer id, needed by and items; weights are converted to integer units with at most 4 decimals (EP-02-S2). A changed customer id must exist and not be erased. All flags clear and confidence becomes `clean`. A shared guard refuses any conversion while the lead is `needs_glance` with "Check and keep this lead before converting it."; EP-30 calls it. The SLA keeps running in `opened` (EP-28-S8). Update and audit run in one transaction (EP-03-S6).
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" carrying state `opened`, so the row leaves the Needs a glance group on every open inbox. Consumed: none.
- **Audit entry written:** Yes, through EP-29-S14: actor, time, entity (lead id), action `lead_confirmed`, before (state `needs_glance` and each changed field's parsed value), after (state `opened` and each corrected value), taken by.
- **Data changes:** Updates `leads.state`, `confidence`, `customerName`, `phone`, `customerId`, `neededBy`, `takenBy`, `takenAt` and `version`; updates `lead_fields.flagged`, `correctedValue` and `correctedBy`; replaces `lead_items` when items change. Adds Confirm lead to the shared contract. Ports `confirmLead` and the `routeLeadItemToStock` guard from `src/store/transitions.ts`.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` left side ("WHAT THE SYSTEM PULLED OUT · FIX ANYTHING WRONG", "Looks right — keep the lead"), route `lead-review`.
- **Non-functional checks:** Concurrency: two staff keeping the same lead give one keep and one refusal, never two audit entries. Precision: a corrected weight of 78.5 g is stored as `785000`. Audit: corrections are appended with before and after values (epic section 13). Time: `takenAt` from the server clock in UTC.
- **Depends on:** EP-29-S8, EP-29-S7, EP-28-S8, EP-05-S2, EP-02-S2, EP-02-S14, EP-03-S4, EP-03-S6, EP-08-S5, EP-08-S7
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S10: Staff can close a lead as "Not an order"

- **Story ID:** EP-29-S10
- **Title:** Staff can close a lead as "Not an order"
- **As a:** Staff
- **I want:** to press "Not an order" on `lead-review` for a message that is a greeting, spam or a question with nothing to make or sell, so the lead becomes `lost` with reason "Not an order" and leaves the open tabs of the inbox
- **So that:** the inbox holds only real orders, while the message itself is kept and traceable (FR-29-12, FR-29-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given a `needs_glance` lead whose message is "good morning sir", when Deepak Rao presses "Not an order", then the lead is `lost` with `lostReason` "Not an order", its SLA timer is cancelled in the same transaction, and he is returned to `leads`.
  2. Given that lead, when the "Needs a glance" tab reloads, then its count goes down by 1 and the lead appears only under "All".
  3. Given a lead already `converted`, when "Not an order" is called, then the server refuses with "A converted lead cannot be marked lost." and nothing changes.
  4. Given a lead already `lost`, when "Not an order" is called again, then it is returned unchanged and no second audit entry is written.
  5. Given the lead is closed, when Sanjay Seth reads it later, then the original message, attachments and InboundMessage are still there.
- **Rules enforced on the server:** Not an order is Staff and Owner only (EP-05-S2). It calls the EP-28-S11 Mark lost service with the fixed reason "Not an order", so the converted refusal, timer cancel and version check are the same. It is offered from `needs_glance` on `lead-review`; the service also allows `opened` and `being_worked`. No piece is read or written, because v1 has no holds. The message and attachments are not deleted; their retention follows the open retention rule.
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" carrying state `lost`, through EP-28-S13. Consumed: none.
- **Audit entry written:** Yes, through EP-29-S14: actor, time, entity (lead id), action `lead_not_an_order`, before (state), after `lost`, reason "Not an order".
- **Data changes:** Updates `leads.state`, `lostReason` and `version`; cancels the pending SLA job row. Adds Not an order to the shared contract.
- **UI reference:** `docs/ux/mockups/17-lead-create.svg` left side ("Not an order"), route `lead-review`.
- **Non-functional checks:** Concurrency: "Not an order" racing a keep on the same lead is settled by the version check; one wins and the other sees the current state. Audit: the closure is appended with its reason. Personal data: closing a lead does not erase its message; erasure is EP-17-S13.
- **Depends on:** EP-29-S8, EP-28-S11, EP-10-S6, EP-05-S2, EP-02-S14, EP-08-S5
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S11: System can turn a broadcast reply into a lead

- **Story ID:** EP-29-S11
- **Title:** System can turn a broadcast reply into a lead
- **As a:** System
- **I want:** an inbound WhatsApp message whose replied-to outbound message id belongs to a broadcast to become a lead in `needs_glance` with source `whatsapp`, `broadcastId` set, `customerId` set to the recipient and title "<customer name> · replied to the broadcast", and then go through the normal parse
- **So that:** a customer answering a broadcast or a shared catalogue is never lost, and the owner can see which broadcast brought which leads (FR-29-15, BR-29-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra (CU-002) received a broadcast to the "VIP Bridal" group, when she replies "I like the second necklace, can I see it on Saturday?", then a lead is stored with state `needs_glance`, `broadcastId` of that broadcast, `customerId` CU-002, title "Priya Malhotra · replied to the broadcast" and the reply as `message`.
  2. Given that lead, when the parse finds no confident item, then the field "What they want" holds the reply text flagged "check this" and confidence is `unsure`, as in the prototype `simulateReply`.
  3. Given the provider sends no replied-to id, when the message arrives, then the lead is created as an ordinary WhatsApp lead with `broadcastId` null, and no broadcast is guessed.
  4. Given the reply is an opt-out keyword such as "STOP", when it is handled, then EP-12-S10 switches consent off and no lead is created.
  5. Given the lead is created, when Rajesh Verma has `leads` open, then the row shows "from WhatsApp" within about 1 second and its SLA counts from the reply's received time.
- **Rules enforced on the server:** Only the System actor creates a reply lead, through the EP-29-S3 intake interface. The broadcast is found only from the replied-to OutboundMessage id the provider supplies (EP-12-S7); a broadcast id sent from any client is ignored. The customer is the broadcast recipient tied to that outbound message, and the sender phone must match that recipient, else `customerId` is left to EP-29-S7. Duplicate rules (EP-29-S12) apply as for any message. The prototype `simulateReply` in `src/components/marketing/Broadcast.tsx` is a demo tool and is removed from production builds (EP-08-S19).
- **Live events emitted / consumed:** Emitted after commit: "Lead arrived / passed its SLA" (arrived), through EP-28-S13. Consumed: none; the reply comes through the EP-12 webhook.
- **Audit entry written:** Yes, through EP-29-S14: actor System (WhatsApp intake), time, entity (lead id), action `lead_created`, after (source `whatsapp`, state `needs_glance`, broadcast id, customer id).
- **Data changes:** Inserts into `leads` with `broadcastId` and the pending SLA job row; updates `inbound_messages.leadId`. Ports `simulateReply` from `src/store/transitions.ts` into the intake path without the demo trigger.
- **UI reference:** `docs/ux/mockups/27-broadcast.svg` ("replies become leads", "A reply lands in the lead inbox (16)"), route `broadcast`; `docs/ux/mockups/28-catalogue-share.svg` ("Replies land in the lead inbox as new leads"), route `catalogue`; `docs/ux/mockups/16-lead-inbox.svg`, route `leads`.
- **Non-functional checks:** Performance: the reply lead appears in the inbox within about 1 second of the webhook being accepted. Personal data: the reply text is personal data and follows the lead's retention. Open decision D8: whether the chosen provider supplies a replied-to id. Open question G17: whether reply counts per broadcast are kept here or in EP-34.
- **Depends on:** EP-29-S3, EP-29-S5, EP-29-S7, EP-12-S7, EP-12-S10, EP-02-S12, EP-08-S19, EP-28-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S12: System can detect a duplicate message and link it to the first lead

- **Story ID:** EP-29-S12
- **Title:** System can detect a duplicate message and link it to the first lead
- **As a:** System
- **I want:** intake to check each new InboundMessage, before a lead is created, against messages from the same sender with the same normalised content (text plus attachment hashes) inside the decided window, or with the same provider message id or email Message-ID, and when one matches, set `duplicateOf` to the first message and link it to the first lead instead of creating another
- **So that:** a forwarded or resent order does not flood the inbox with copies, and no copy is thrown away either (FR-29-14)
- **Acceptance criteria (Given / When / Then):**
  1. Given the email from Sri Murugan Jewellers arrives twice with the same Message-ID, when the second copy is processed, then no second lead is created, the second InboundMessage has `duplicateOf` set to the first, and its `leadId` is LD-2026-209 (epic acceptance criterion 5).
  2. Given Ramesh Sharma sends the same text twice from "+91 98401 55504" 3 minutes apart and the window is 30 minutes, when the second arrives, then it is linked to the first lead and no new lead or SLA timer is created.
  3. Given the same text arrives from a different sender, or from the same sender outside the window, when it is processed, then a new lead is created.
  4. Given a duplicate is linked, when Rajesh Verma opens the first lead on `lead-review`, then it shows "Sent 2 times · last at <time>" (proposed wording) and the first arrival time stays the SLA start.
  5. Given two copies are processed by two workers at the same moment, when both commit, then exactly one lead exists, because the check and the lead insert run under a lock on sender and content hash.
- **Rules enforced on the server:** The duplicate check runs inside the intake transaction (EP-03-S6), under an advisory lock or unique key on (channel, sender, content hash, window bucket). A match by provider message id is always a duplicate; a match by content is a duplicate only inside the window. The window is a setting with a default of 30 minutes until the section 17 thread question decides it. A duplicate never changes the first lead's `arrivedAt`, state or fields. If the first lead is `lost` or `converted`, a later copy inside the window is still linked, not made into a new lead.
- **Live events emitted / consumed:** None for a linked duplicate, since no lead is created and no state changes. Consumed: none.
- **Audit entry written:** No. The InboundMessage row with `duplicateOf` records the link; no lead state changes.
- **Data changes:** Adds `contentHash` and an index on (channel, sender, contentHash, receivedAt) to `inbound_messages`; sets `duplicateOf` and `leadId` on copies. Adds a `duplicateWindowMinutes` setting.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg`, route `leads` (one row per order). The "Sent 2 times" note on `lead-review` is not yet designed.
- **Non-functional checks:** Concurrency: two copies at once give one lead. Personal data: the content hash is one-way and holds no text; the hash index is dropped with the message on erasure. Time: the window is measured on `receivedAt` in UTC. Open questions: how several messages in one thread are treated, and the length of the window.
- **Depends on:** EP-29-S1, EP-29-S2, EP-29-S3, EP-29-S4, EP-03-S6, EP-03-S8, EP-13-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S13: System can retry a failed parse and report failures

- **Story ID:** EP-29-S13
- **Title:** System can retry a failed parse and report failures
- **As a:** System
- **I want:** a failed parse retried with backoff by the EP-10 job runner, each attempt recorded as a ParseRun, the last failure left as `failed` with its error code, and an owner-only Parse status read that lists recent failures and retries
- **So that:** a short parser outage fixes itself, a lasting one is seen by the owner, and no message content ends up in logs (FR-29-16, BR-29-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the parser returns a timeout for LD-2026-207, when the job runs, then it is retried after the EP-10-S3 backoff, each attempt is a ParseRun with outcome `failed`, attempt number and error code, and the lead stays visible as `unreadable` throughout.
  2. Given the third attempt succeeds, when it finishes, then the lead's fields and confidence come from that run and the earlier ParseRuns remain.
  3. Given all attempts fail, when the last one ends, then the job is marked failed, the lead stays `unreadable`, and the failure appears in the Parse status read with lead id, provider, error code and time.
  4. Given Sanjay Seth opens Parse status, when it loads, then it lists the last 7 days of failed and retried parses, newest first; given Rajesh Verma calls it, then it is refused with `forbidden`.
  5. Given any failure is logged, when the log line is inspected, then it holds the lead id, ParseRun id, provider and error code, and no message text, phone number or image.
- **Rules enforced on the server:** Retries use the EP-10-S3 backoff with a capped number of attempts, so parse cost cannot grow without limit (epic section 16). A retry is skipped once the lead has left `needs_glance`. Parse status is Owner only (EP-05-S2). Errors are logged by id and code only; full monitoring and alerts are EP-37, which reads the same ParseRun rows.
- **Live events emitted / consumed:** Emitted after commit of a successful retry: "Lead arrived / passed its SLA" carrying the new confidence. Consumed: none.
- **Audit entry written:** No. ParseRun rows and the EP-10-S2 run history record attempts; no user-visible state is changed by a person.
- **Data changes:** Inserts `parse_runs` per attempt; updates `leads.confidence` and fields on success. Adds the owner-only Parse status read to the shared contract.
- **UI reference:** Not yet designed. Parse status can be shown beside recent job runs (EP-10-S13); no mockup draws it.
- **Non-functional checks:** Availability: if the parser is down, leads are still created as unreadable and parsing is retried (epic section 13). Personal data: logs hold ids, not content (FR-29-16). Performance: the retry cap and per-lead attempt count let EP-37 measure parse cost per lead.
- **Depends on:** EP-29-S5, EP-29-S6, EP-10-S2, EP-10-S3, EP-10-S13, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-29-S14: System can audit confirm, corrections and "Not an order"

- **Story ID:** EP-29-S14
- **Title:** System can audit confirm, corrections and "Not an order"
- **As a:** System
- **I want:** an append-only audit entry written in the same transaction as each intake lead create (`lead_created`), each keep (`lead_confirmed`) with every corrected field's parsed and new value, and each "Not an order" (`lead_not_an_order`), with actor, role, time, lead id, before, after and reason
- **So that:** the owner can see which leads the system made, who checked each one, what they changed from the parse, and why a message was set aside (FR-29-17)
- **Acceptance criteria (Given / When / Then):**
  1. Given Rajesh Verma keeps LD-2026-208 after changing the needed-by date, when it commits, then a `lead_confirmed` entry holds actor Rajesh, role Staff, time, LD-2026-208, before state `needs_glance` and needed by 20 Nov 2026, after state `opened` and needed by 18 Nov 2026 (epic acceptance criterion 3).
  2. Given he also changes the haram target weight from 80 g to 78.5 g, when it commits, then the same entry records before `800000` and after `785000` as integer units.
  3. Given Deepak Rao presses "Not an order", when it commits, then a `lead_not_an_order` entry holds before state, after `lost` and reason "Not an order".
  4. Given a WhatsApp message becomes a lead, when it commits, then a `lead_created` entry holds actor System (WhatsApp intake), source `whatsapp`, state `needs_glance`, the inbound message id and `customerId` when linked.
  5. Given the keep transaction rolls back, when the log is read, then no entry exists for it; given Sanjay Seth filters the security log by kind group "Leads" and entity LD-2026-208, then its entries appear newest first, and a staff user reading the log is refused (EP-06-S12).
- **Rules enforced on the server:** Entries are written through EP-06-S2 inside the operation's transaction and cannot be updated or deleted (EP-06-S1). Before and after values follow EP-06-S3; weights are integer units (EP-06-S5). Intake entries use the System actor for the channel (EP-06-S6). `lead_confirmed` and `lead_not_an_order` are added to the audit kind list in the "Leads" group from EP-28-S14. Entries hold the customer id and changed field keys, not the message text; a corrected name or phone is recorded as "changed" without the value, so erasure (EP-17-S13) leaves no personal data in the log.
- **Live events emitted / consumed:** None. Audit writes publish nothing.
- **Audit entry written:** Yes: actor, role, time, entity (lead id), action (`lead_created`, `lead_confirmed`, `lead_not_an_order`), before, after, reason.
- **Data changes:** Inserts into `audit_entries`. Adds `lead_confirmed` and `lead_not_an_order` to the audit kind list in the shared package; the migration widens the kind check constraint if it is a database enum.
- **UI reference:** The security log screen from EP-06-S9 to EP-06-S11. No new screen.
- **Non-functional checks:** Audit: confirm, field corrections and "Not an order" are appended with before and after values (epic section 13). Personal data: no message text, name or phone values in entries. Precision: weights in entries are integer units of 0.0001 g. Time: entry times in UTC, shown in Asia/Kolkata.
- **Depends on:** EP-29-S2, EP-29-S3, EP-29-S9, EP-29-S10, EP-28-S14, EP-06-S1, EP-06-S2, EP-06-S3, EP-06-S5, EP-06-S6, EP-06-S10, EP-06-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D8: which WhatsApp provider receives inbound messages? (EP-29-S1, S3, S11)
- Where is the parser hosted, and does personal data leave India? D10 (India region) is decided for the system's own hosting; the parser provider must be checked against it. (EP-29-S5)
- Which parser provider and model, and is the existing `@google/genai` dependency the choice? (EP-29-S5)
- What confidence thresholds make a field "check this" and a lead unreadable? (EP-29-S5, S6)
- How long are attachments and raw messages kept? (EP-29-S1, S4, S10)
- G7: how is a known customer matched by phone, and what if several match? (EP-29-S7)
- How are several messages in one thread treated: one lead or several? (EP-29-S3, S12)
- Which email address or mailbox is the shop inbox? (EP-29-S2)

