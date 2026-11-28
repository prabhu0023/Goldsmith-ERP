# EP-12: WhatsApp integration · stories

Epic document: [EP-12 WhatsApp integration](../epics/EP-12-whatsapp-integration.md)

Role note: this is a layer A platform epic. Stories where the integration connects, sends, verifies callbacks, stores messages and receipts or handles opt-out on its own use "System". EP-12-S2 uses "Owner" because the owner registers templates and reads their status. Send Template message and Send Session message are internal operations and cannot be called from a browser session; the inbound webhook accepts only calls signed by the provider.

---

## EP-12-S1: System can connect to the WhatsApp provider with credentials from environment configuration

- **Story ID:** EP-12-S1
- **Status:** Not started
- **Title:** System can connect to the WhatsApp provider with credentials from environment configuration
- **As a:** System
- **I want:** one internal WhatsApp provider interface with a real provider client that reads its account id, access token, webhook secret, verify token and sender numbers from environment variables only, chosen by the delivery mode variable in place of a development stub that shows messages in the simulated WhatsApp bubble
- **So that:** messages can go out and come in through a real provider without secrets in the code, and the provider can be swapped later behind the same interface (FR-12-1, BR-12-6)
- **Acceptance criteria (Given / When / Then):**
  1. Given staging with the delivery mode set to `whatsapp` and all provider variables set, when the api starts, then the provider client is used for every send and the development stub is not loaded. Sign-in sends no WhatsApp message (D4).
  2. Given production with the provider access token variable missing, when the api starts, then it refuses to start and the log names the missing variable but no value of any variable.
  3. Given a commit that contains a provider access token in a file, when CI runs, then the secret scan fails the run (EP-01-S10).
  4. Given the provider is reachable, when the health check is called, then it reports the WhatsApp provider as up, and when the provider cannot be reached it reports it as down, in both cases without any credential in the response.
  5. Given the sender numbers listed in configuration, when the api starts, then each one exists as a SenderIdentity row with display name, phone number and provider account reference, and a send naming an unknown sender identity is refused.
- **Rules enforced on the server:** Provider credentials are read only from environment variables (EP-01-S6) and never written to the database, logs or responses. All provider calls go through one internal interface so the provider chosen under D8 can be replaced. The development stub is refused in production.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Connecting to the provider changes no business record.
- **Data changes:** Adds the SenderIdentity table (id, display name, phone number, provider account reference) by migration (EP-02-S1), filled from configuration. Adds the provider environment variables to each environment's configuration.
- **UI reference:** No screen
- **Non-functional checks:** Security: credentials only in environment configuration; health output carries no secret. Availability: health check shows the provider as down so EP-37 can alert. Open decision D8: Meta Cloud API directly or a Business Solution Provider; the interface is written so either fits. D10 is decided (India region); whether the WhatsApp provider also stores message data in India is open. Open question G20: how many sender numbers there are.
- **Depends on:** EP-01-S6, EP-01-S10, EP-02-S1, EP-03-S10
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S2: Owner can register a message template and see its approval status

- **Story ID:** EP-12-S2
- **Status:** Not started
- **Title:** Owner can register a message template and see its approval status
- **As a:** Owner
- **I want:** to register a WhatsApp template with a name, purpose, English body with numbered variables, and then see whether the provider has it as pending, approved or rejected
- **So that:** the owner edit code (edit token), alert, wish, broadcast and catalogue messages can be approved early, because messages outside a conversation need approved templates (FR-12-2, BR-12-2)
- **Acceptance criteria (Given / When / Then):**
  1. Given Sanjay Seth (Owner), when he calls Create Template with name `edit_token`, purpose edit token, language English and body "JGD: confirm edit to {{1}}. Token {{2}}", then it is submitted to the provider, a WhatsAppTemplate row is stored with the provider template id and approval status pending.
  2. Given the provider later reports `edit_token` as approved, when the status update is received, then the row's approval status is approved and updated at is set from the server clock.
  3. Given the provider rejects `wish_birthday`, when the status update is received, then the row's status is rejected and the provider's reason is kept on the row.
  4. Given Sanjay calls List Templates, when it returns, then he sees each template's name, purpose, language, approval status and updated at; Rajesh Verma (Staff) calling it gets `forbidden`.
  5. Given a Create Template request with a language other than English, or a body holding a price or rupee amount, when the server checks it, then it is refused with a sentence saying v1 templates are English only and carry no price.
- **Rules enforced on the server:** Create Template and List Templates are Owner only until the open question on operations access is decided (EP-05-S2). Purpose is one of edit token, alert, wish, broadcast, catalogue; the edit token is registered as an authentication template. There is no sign-in template (D4). Status is one of pending, approved, rejected and changes only from provider status updates. Language is English in v1; other languages belong to EP-44. No template carries a money field (EP-42 owns prices).
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (Owner on create, System on provider status change), time, entity (WhatsAppTemplate), action (template registered, approval status changed), before and after status.
- **Data changes:** Adds the WhatsAppTemplate table (id, name unique, purpose, language, body with variables, provider template id, approval status, rejection reason, updated at) by migration. Adds Create Template and List Templates to the shared contract (EP-03-S1).
- **UI reference:** Not yet designed
- **Non-functional checks:** Time: updated at stored in UTC. Open decision D8: template approval lead time; templates are registered early in M1 (epic section 16 risk). Open question: whether operations staff, not only the Owner, may register templates.
- **Depends on:** EP-12-S1, EP-03-S1, EP-03-S2, EP-05-S2, EP-06-S2, EP-06-S3, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S3: System can send an approved template message with variables

- **Story ID:** EP-12-S3
- **Status:** Not started
- **Title:** System can send an approved template message with variables
- **As a:** System
- **I want:** an internal Send Template message operation that takes a template name, a recipient (user or customer, with phone), a sender identity and variables, sends it through the provider and stores an OutboundMessage with the provider message id
- **So that:** the owner's edit code, alerts, wishes, broadcasts and catalogue links reach the right phone, and each send can be followed (FR-12-3, FR-12-4, BR-12-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given the approved `edit_token` template, when Sanjay Seth (Owner) applies Rajesh Verma's proposed edit to TAG-8841 (EP-25), then one message is sent to Sanjay's registered mobile number, an OutboundMessage is stored with recipient type user, the provider message id and status sent, and its stored variables hold no plain code (epic acceptance criterion 1).
  2. Given that send, when Sanjay reads it, then his WhatsApp shows "JGD: confirm edit to TAG-8841. Token" followed by the 6-digit token, as on mockup 05.
  3. Given the `wish_birthday` template is still pending, when a send is requested, then it is refused with the sentence "The WhatsApp template wish_birthday is not approved yet, so this message was not sent." and no provider call is made (epic acceptance criterion 2).
  4. Given a send request with fewer variables than the template body needs, when the server checks it, then it is refused and no message is stored as sent.
  5. Given the same send is requested twice with the same idempotency key (for example the EP-11 notification id), when both run, then the provider is called once and one OutboundMessage exists.
  6. Given a browser session of any role, when it calls Send Template message, then the server refuses it, because the operation is internal.
- **Rules enforced on the server:** Only approved templates may be sent. Send is callable only by EP-11, EP-25, EP-33 and EP-34 server code (not by sign-in, D4), never a user session (EP-05-S2). Sends are deduplicated by idempotency key (EP-03-S8). Customer recipients pass the consent check first (EP-12-S5). Grams in variables are formatted to 4 decimals from integer units of 0.0001 g (EP-02-S2). Secret variables are stored only as references (EP-12-S11).
- **Live events emitted / consumed:** None. Sends are requested by internal calls, not live events (epic section 11).
- **Audit entry written:** No. The OutboundMessage row is the send record; the business action that asked for the send is audited by its own epic.
- **Data changes:** Adds the OutboundMessage table (id, recipient phone, recipient type, recipient id, sender identity id, template id or session flag, variables with secret ones as references, provider message id unique, status queued/sent/delivered/read/failed, failure reason, created at, sent at, delivered at, read at in UTC, source notification id or broadcast id or wish id, idempotency key unique) by migration.
- **UI reference:** No screen. Message wording follows `docs/ux/mockups/05-edit-propose-apply.svg`, route `edit-apply` ("Enter the token sent to your WhatsApp").
- **Non-functional checks:** Performance: the owner edit code is handed to the provider at once, so delivery does not use up the 10-minute expiry (epic section 13). Precision: grams in variables shown to 4 decimals from integers. Concurrency: one provider call per idempotency key. Security: internal operation only. Open decision D8: provider API shape and template rules.
- **Depends on:** EP-12-S1, EP-12-S2, EP-02-S2, EP-03-S6, EP-03-S8, EP-05-S2, EP-11-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S4: System can send a session message inside an open conversation window

- **Story ID:** EP-12-S4
- **Status:** Not started
- **Title:** System can send a session message inside an open conversation window
- **As a:** System
- **I want:** an internal Send Session message operation that sends free text, without a template, to a phone whose conversation window is still open according to the latest InboundMessage's "conversation window ends at"
- **So that:** the shop can reply to a customer who has just written, without waiting for a template approval (FR-12-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given +91 90037 44120 sent a message whose conversation window ends at 18:00 tomorrow, when a session message is sent at 11:00 today, then it goes out without a template and the OutboundMessage has the session flag set and no template id.
  2. Given the window for that phone ended at 18:00 yesterday, when a session message is requested, then it is refused with the sentence "The conversation with this number has closed, so only an approved template can be sent." and no provider call is made.
  3. Given the phone belongs to a customer whose `optedIn` is false, when a session message is requested, then it is refused by the consent check (EP-12-S5).
  4. Given a browser session of any role, when it calls Send Session message, then the server refuses it, because the operation is internal.
- **Rules enforced on the server:** The window check uses "conversation window ends at" from the latest InboundMessage for that phone and the server clock (EP-03-S3). The window length comes from the provider's rules under D8. Internal callers only (EP-05-S2). Session text carries no price (EP-42 owns prices).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. The OutboundMessage row is the send record.
- **Data changes:** Inserts OutboundMessage rows with the session flag set. Reads InboundMessage "conversation window ends at".
- **UI reference:** No screen
- **Non-functional checks:** Time: window end stored and compared in UTC on the server clock. Personal data: session text is personal data kept only as long as the retention rule says. Open decision D8: the length and rules of the conversation window depend on the provider.
- **Depends on:** EP-12-S3, EP-12-S5, EP-12-S7, EP-03-S3, EP-05-S2
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S5: System can refuse a customer message when consent is off

- **Story ID:** EP-12-S5
- **Status:** Not started
- **Title:** System can refuse a customer message when consent is off
- **As a:** System
- **I want:** every template or session send to a recipient of type customer to read that customer's `optedIn` at the moment of sending and refuse the send when it is false
- **So that:** only customers who agreed get wishes, broadcasts and catalogue links, as the DPDP Act and the shop's promise require (FR-12-6, BR-12-3, BR-12-4)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra has `optedIn` true and a birthday today, when her wish is sent, then the message goes to her phone.
  2. Given a customer shown on `wishes` as "not opted in to WhatsApp · will not auto-send", when a wish is requested for them, then no provider call is made and the send returns the reason consent off (epic acceptance criterion 3).
  3. Given a broadcast to the 86 opted-in VIP Bridal customers, and one of them opts out after the broadcast is queued, when that customer's send runs, then it is refused and the other 85 are sent.
  4. Given a job reminder to Vijay Kumar (Karigar), when it is sent, then no customer consent check applies, because the recipient type is user.
- **Rules enforced on the server:** The consent check runs inside the send, on the server, for every customer recipient, using the current `optedIn` value (EP-02-S4). A refused send makes no provider call. The check cannot be skipped by a caller.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. A refused send changes no record; the consent value itself is audited where it changes (EP-12-S10, EP-17).
- **Data changes:** None in the product database. Reads Customer `optedIn`.
- **UI reference:** No screen of its own. Effects show on `docs/ux/mockups/26-wishes.svg`, route `wishes` ("not opted in to WhatsApp · will not auto-send"), and `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("86 customers · all opted in to WhatsApp").
- **Non-functional checks:** Personal data: only `optedIn` customers are messaged and an opt-out applies to the next send at once (epic section 13). Concurrency: consent read at send time, not at queue time.
- **Depends on:** EP-12-S3, EP-02-S4, EP-02-S12
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S6: System can verify and accept inbound webhook calls

- **Story ID:** EP-12-S6
- **Status:** Not started
- **Title:** System can verify and accept inbound webhook calls
- **As a:** System
- **I want:** one inbound webhook endpoint that checks the provider signature on every call against the webhook secret, answers the provider's subscription check only with the configured verify token, and hands each verified message or receipt to processing
- **So that:** only real provider callbacks become messages, receipts or leads, and forged calls cannot create fake leads (FR-12-7)
- **Acceptance criteria (Given / When / Then):**
  1. Given a call whose signature matches the body and the webhook secret, when it arrives, then it is accepted, acknowledged within the provider's timeout and passed to message or receipt processing.
  2. Given a call with a wrong signature, when it arrives, then it is rejected with an authentication error and no InboundMessage, receipt or lead is stored (epic acceptance criterion 4).
  3. Given a call with no signature header, when it arrives, then it is rejected the same way.
  4. Given the provider's subscription check with the configured verify token, when it arrives, then the challenge is answered; with any other token it is refused.
  5. Given a rejected call, when it is logged, then the log holds the time, source address and reason, and no body text or phone number.
- **Rules enforced on the server:** The signature is checked before the body is parsed or stored. The verified body is validated against the contract (EP-03-S2). The endpoint has no user session and accepts only provider-signed calls. The rate-limit hook applies (EP-03-S11). Processing after acknowledgement runs as a background job (EP-10-S1).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Rejected calls are logged for security; accepted calls are recorded as InboundMessage or receipt rows.
- **Data changes:** None in the product database from this story. Adds the webhook endpoint and the webhook secret and verify token variables.
- **UI reference:** No screen
- **Non-functional checks:** Security: signature verified on every call; unsigned calls rejected (epic section 16 risk). Personal data: rejected bodies are not logged. Open decision D8: signature method depends on the provider.
- **Depends on:** EP-12-S1, EP-03-S2, EP-03-S11, EP-10-S1
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S7: System can store an inbound message once and hand it to lead intake

- **Story ID:** EP-12-S7
- **Status:** Not started
- **Title:** System can store an inbound message once and hand it to lead intake
- **As a:** System
- **I want:** each verified inbound message stored as one InboundMessage keyed by its provider message id, with sender phone, text, received at and conversation window ends at, and then handed to the EP-29 intake interface with sender phone, text and media file ids
- **So that:** every PO or broadcast reply becomes a lead exactly once, and nothing a customer sends is dropped (FR-12-8, FR-12-9, BR-12-8, BR-12-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a verified message from +91 90037 44120 with text, when it is processed, then one InboundMessage is stored with the provider message id, sender phone, text, received at in UTC and conversation window ends at, and it is handed to lead intake.
  2. Given the provider delivers the same message id again, when it is processed, then no second InboundMessage is stored and lead intake is not called again, so one lead exists.
  3. Given two workers process the same message id at the same moment, when both commit, then one InboundMessage exists, because the provider message id is unique in the database.
  4. Given a reply to the VIP Bridal broadcast, when it is handed over, then the handoff carries the replied-to OutboundMessage id when the provider supplies it, so EP-29 can mark it a broadcast reply.
  5. Given lead intake returns the new lead id, when the handoff completes, then the InboundMessage "handed to" field holds that lead id.
  6. Given the message text is an opt-out keyword, when it is processed, then it is not handed to lead intake (EP-12-S10).
- **Rules enforced on the server:** Deduplication by the unique provider message id and dedupe key (EP-03-S8). Storage and the "handed to" update run in one transaction (EP-03-S6). Intake is an internal interface; until EP-29 exists it is a stub that records the handoff. Actions are recorded with the System actor for WhatsApp intake (EP-06-S6).
- **Live events emitted / consumed:** None from this story. EP-29 creates the lead and emits "Lead arrived / passed its SLA".
- **Audit entry written:** No. The InboundMessage row is the record of receipt; lead creation is audited by EP-29 with the System actor (EP-06-S6).
- **Data changes:** Adds the InboundMessage table (id, provider message id unique, sender phone, text, media file ids, received at, conversation window ends at, replied-to outbound message id, handed to lead id, dedupe key) by migration.
- **UI reference:** No screen of its own. Results show on `docs/ux/mockups/16-lead-inbox.svg`, route `leads` ("from WhatsApp", "Nothing a customer sends is ever dropped").
- **Non-functional checks:** Concurrency: a redelivered webhook creates one InboundMessage and one lead (epic section 13). Personal data: sender phone and text are personal data kept only as long as the retention rule says. Time: received at stored in UTC. Open question G17: whether reply counts for broadcasts are kept here or in EP-34.
- **Depends on:** EP-12-S6, EP-02-S7, EP-03-S6, EP-03-S8, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S8: System can store inbound media through file storage

- **Story ID:** EP-12-S8
- **Status:** Not started
- **Title:** System can store inbound media through file storage
- **As a:** System
- **I want:** each media item on an inbound message downloaded from the provider and handed to EP-09 Create Inbound file, with the returned file id added to the InboundMessage media file ids before the handoff to lead intake
- **So that:** a photo PO, even one the system cannot read, reaches the lead with its original image (FR-12-10, BR-12-9)
- **Acceptance criteria (Given / When / Then):**
  1. Given a verified message from +91 90037 44120 carrying one image, when it is processed, then the image is stored through EP-09, its file id is in the InboundMessage media file ids, and the handoff to lead intake includes it.
  2. Given the parser cannot read that image, when Rajesh Verma opens "A photo we could not read · +91 90037 44120" on `leads`, then he can open the original image.
  3. Given the image is over the size limit or of a type not allowed, when EP-09 refuses it, then the message is still stored and handed to lead intake with a note that the attachment was not kept.
  4. Given the provider redelivers the same message, when it is processed, then one stored file exists, because the provider message id and media id form the key.
  5. Given any browser response, when it shows the image, then it uses the EP-09 signed link and never the provider's media URL.
- **Rules enforced on the server:** Media is fetched with provider credentials on the server only. Size and type limits are EP-09's (EP-09-S3). Storage is keyed by provider message id and media id (EP-03-S8). Create Inbound file is internal (EP-09-S11).
- **Live events emitted / consumed:** None
- **Audit entry written:** No from this story. EP-09-S11 audits the PO attachment linked to the lead.
- **Data changes:** Updates InboundMessage media file ids. StoredFile and Attachment rows are written by EP-09.
- **UI reference:** `docs/ux/mockups/16-lead-inbox.svg`, route `leads` ("A photo we could not read · +91 90037 44120", "Open and read"); the screen is built in EP-28 and EP-29.
- **Non-functional checks:** Personal data: PO images carry customer names and phones and get the PO retention class (EP-09). Security: provider media URLs and credentials never reach the browser. Concurrency: redelivery stores one file.
- **Depends on:** EP-12-S7, EP-09-S3, EP-09-S5, EP-09-S11
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S9: System can record delivery, read and failure receipts

- **Story ID:** EP-12-S9
- **Status:** Not started
- **Title:** System can record delivery, read and failure receipts
- **As a:** System
- **I want:** each verified receipt matched to its OutboundMessage by provider message id, moving its status forward to delivered, read or failed with the time and any failure reason, passed on to EP-11 Update Delivery status for notification messages, and readable through Read Message status
- **So that:** the owner can see whether a token, alert or broadcast got through, and broadcasts show delivered and opened (FR-12-11, BR-12-10)
- **Acceptance criteria (Given / When / Then):**
  1. Given a sent message to Sanjay Seth, when the provider reports delivered and then read, then its status shows read with delivered at and read at set (epic acceptance criterion 6).
  2. Given the read receipt arrives before the delivered receipt, when both are applied, then the status ends as read and does not move back to delivered.
  3. Given a failed receipt with the provider's error, when it is applied, then the status is failed with the failure reason, and the failure is reported as in EP-12-S12.
  4. Given the message came from an EP-11 notification, when its status changes, then Update Delivery status is called for that notification (EP-11-S13).
  5. Given Read Message status for a broadcast message, when Rajesh Verma (Staff) who sent the broadcast calls it, then he sees the status; for a message he did not send he gets `forbidden`; Sanjay (Owner) sees any message.
  6. Given a receipt for an unknown provider message id, when it arrives, then it is ignored and logged without phone or text.
- **Rules enforced on the server:** Status only moves forward: queued, sent, delivered, read; failed is final. Receipts arrive only through the verified webhook (EP-12-S6). Read Message status is Owner for all messages and Staff for broadcasts they sent (EP-05-S2).
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Delivery status is kept on the OutboundMessage, not in the audit log.
- **Data changes:** Updates OutboundMessage status, delivered at, read at, failure reason. Adds Read Message status to the shared contract (EP-03-S1).
- **UI reference:** No screen of its own. Broadcast tracking shows on `docs/ux/mockups/27-broadcast.svg`, route `broadcast` ("Delivered, opened, and who replied are tracked"), built in EP-34.
- **Non-functional checks:** Time: receipt times stored in UTC. Concurrency: out-of-order receipts never move a status back. Open question G17: whether broadcast delivered, opened and replied counts are stored here or in EP-34; this story stores per-message status only.
- **Depends on:** EP-12-S3, EP-12-S6, EP-03-S1, EP-05-S2, EP-11-S13
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S10: System can switch off a customer's consent on an opt-out keyword

- **Story ID:** EP-12-S10
- **Status:** Not started
- **Title:** System can switch off a customer's consent on an opt-out keyword
- **As a:** System
- **I want:** an inbound message whose whole text, trimmed and in any letter case, is a configured opt-out keyword to set the matching customer's `optedIn` to false with changed at and changed by System, and to write an audit entry
- **So that:** a customer who asks to stop gets no more wishes or broadcasts from the next send onwards (FR-12-12, BR-12-3)
- **Acceptance criteria (Given / When / Then):**
  1. Given Priya Malhotra has `optedIn` true and replies "STOP", when the webhook processes it, then her `optedIn` is false, changed by is System, and an audit entry records the change (epic acceptance criterion 5).
  2. Given her consent is now off, when the 9 am wishes run reaches her, then no message is sent to her (EP-12-S5).
  3. Given a reply " stop " or "Stop", when it is processed, then it is treated as the keyword; given "please don't stop the order", then it is not, and the message goes to lead intake.
  4. Given a keyword from a phone that matches no customer, when it is processed, then the message is stored and no consent changes.
  5. Given Priya sends "STOP" a second time, when it is processed, then nothing changes and no second audit entry is written.
- **Rules enforced on the server:** Matching uses the configured keyword list, defaulting to "STOP" until decided. The consent change and its audit entry run in one transaction (EP-06-S2). Keyword messages are not handed to lead intake. Turning consent back on is owned by EP-17.
- **Live events emitted / consumed:** None
- **Audit entry written:** Yes: actor (System, WhatsApp intake), time, entity (customer), action (WhatsApp consent switched off by keyword), before `optedIn` true, after `optedIn` false, reason (keyword received, inbound message id).
- **Data changes:** Updates Customer `optedIn`, consent changed at and changed by (EP-02-S4).
- **UI reference:** No screen. The result shows on `docs/ux/mockups/26-wishes.svg`, route `wishes` ("not opted in to WhatsApp · will not auto-send").
- **Non-functional checks:** Personal data: opt-out honoured at once (epic section 13). Audit: consent change audited with a System actor (EP-06-S6). Open question: which opt-out keywords are recognised, in which languages; v1 is English only.
- **Depends on:** EP-12-S5, EP-12-S6, EP-12-S7, EP-02-S4, EP-06-S2, EP-06-S3, EP-06-S6
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S11: System can keep owner edit codes and other secret values out of logs and stored messages

- **Story ID:** EP-12-S11
- **Status:** Not started
- **Title:** System can keep owner edit codes and other secret values out of logs and stored messages
- **As a:** System
- **I want:** template variables marked secret (the owner edit code, also called the edit token) to be stored on OutboundMessage only as a reference to the token record, and redacted from request logs, provider client logs and error reports
- **So that:** a code cannot leak from our database, logs or audit log and be used to apply an edit (FR-12-14, BR-12-5)
- **Acceptance criteria (Given / When / Then):**
  1. Given the edit token "480 913" is sent to Sanjay Seth for TAG-8841, when the OutboundMessage is read back, then its variables hold TAG-8841 and a token reference, and not "480913" or "480 913".
  2. Given an edit code is sent to Sanjay Seth, when the api log, the provider client log and the audit log are searched after the send, then the 6 digits do not appear in any of them.
  3. Given the provider returns an error that echoes the request body, when the error is logged, then the secret variable is replaced by a redaction mark.
  4. Given the audit entry for the edit-token send written by EP-25, when it is read, then it holds the token reference only (EP-06-S4).
- **Rules enforced on the server:** Each template's variables are marked secret or not at registration; Edit token variables are always secret. The plain value exists only in memory between generation (EP-25) and the provider call. Logging goes through one redaction step for all provider calls.
- **Live events emitted / consumed:** None
- **Audit entry written:** No from this story. It makes sure entries written elsewhere hold a token reference only.
- **Data changes:** Adds a secret flag per variable on WhatsAppTemplate. OutboundMessage variables store references for secret variables.
- **UI reference:** No screen
- **Non-functional checks:** Security: owner edit code values never logged or stored in plain text; a test scans logs after a send for the code (epic section 16 risk). Audit: token reference only.
- **Depends on:** EP-12-S2, EP-12-S3, EP-06-S4
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## EP-12-S12: System can report failed sends for retry and alerting

- **Story ID:** EP-12-S12
- **Status:** Not started
- **Title:** System can report failed sends for retry and alerting
- **As a:** System
- **I want:** a send that the provider refuses, times out on, or later reports as failed to be marked failed with its reason, reported to EP-11 so it can retry, and after the last attempt passed to the alerting hook that EP-37 fills in
- **So that:** a provider outage does not silently lose an alert, a token or a wish, and operations hear about it (FR-12-13)
- **Acceptance criteria (Given / When / Then):**
  1. Given the provider times out on a whatsapp notice to Sanjay Seth about BATCH-2026-044, when the send ends, then the OutboundMessage is failed with reason timeout and EP-11 is told through Update Delivery status, so its retry runs (EP-11-S14).
  2. Given the retry succeeds, when it runs with the same idempotency key, then one message reaches Sanjay and the new OutboundMessage is sent.
  3. Given a send fails on the last attempt, when it ends, then the failure is handed to the alerting hook with message id, template name and error code, and no phone number, text or variables.
  4. Given a failed receipt arrives for a broadcast message (EP-12-S9), when it is applied, then it is reported the same way.
  5. Given the provider refuses because a template was rejected, when the failure is reported, then the reason names the template.
- **Rules enforced on the server:** Retries use EP-10 retry and backoff with the source id as idempotency key (EP-10-S3, EP-10-S4). Failed is a final status for that OutboundMessage. The alerting hook receives no personal data.
- **Live events emitted / consumed:** None
- **Audit entry written:** No. Failures are recorded on the OutboundMessage and passed to alerting.
- **Data changes:** Updates OutboundMessage status and failure reason.
- **UI reference:** No screen
- **Non-functional checks:** Availability: a provider outage queues messages for retry (EP-11) and alerts operations (EP-37) (epic section 13). Personal data: no phone, text or variables passed to alerting. Security: secret variables never in failure reports.
- **Depends on:** EP-12-S3, EP-12-S9, EP-10-S3, EP-10-S4, EP-11-S13, EP-11-S14
- **Definition of done:** code reviewed · tests pass · deployed to staging · acceptance criteria demoed

---

## Open questions affecting these stories

Copied from the epic's section 17. Not answered here.

- D8: Meta Cloud API directly, or a Business Solution Provider? What is the current template approval lead time? (EP-12-S1, S2, S3, S4, S6)
- D10 is decided (India region): does the WhatsApp provider also store message data in India? (EP-12-S1)
- G20: how many sender numbers are there, and can "Priya (Manager)" be a sender when only three roles exist? (EP-12-S1, S3)
- UX-SPEC §7 Q5: may the owner approve an edit-code request by replying on WhatsApp? (EP-12-S7)
- Which opt-out keywords are recognised, in which languages? (EP-12-S10)
- G17: are broadcast delivered, opened and replied counts stored here or in EP-34? (EP-12-S7, S9)
- How long are inbound and outbound message bodies kept? (EP-12-S4, S7)
